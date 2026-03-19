import * as orama from "@orama/orama"
import { type AnyOrama, type RawData } from "@orama/orama"
import SemVec from "src/main"

const DB_FILENAME = "index.json"
const SCHEMA = {
  id: "string",
  path: "string",
  startOffset: "number",
  endOffset: "number",
  type: "string", // e.g. "heading", "paragraph"
  contentHash: "string", // MD5 hash of the content for change detection
  embedding: "vector[768]"
} as const

export default class DatabaseManager {
  private plugin: SemVec
  private isSaving = false
  db: AnyOrama

  constructor(plugin: SemVec) {
    this.plugin = plugin
  }

  private get path(): string {
    return `${this.plugin.manifest.dir}/${DB_FILENAME}`
  }

  async initialize() {
    this.db = orama.create({ schema: SCHEMA })

    const adapter = this.plugin.app.vault.adapter
    if (await adapter.exists(this.path)) {
      const raw = JSON.parse(await adapter.read(this.path)) as RawData
      orama.load(this.db, raw)
    }
  }

  private getId(path: string, startOffset: number, endOffset: number): string {
    return `${path}:${startOffset}-${endOffset}`
  }

  async onFileMoved(oldPath: string, newPath: string) {
    const { hits } = await orama.search(this.db, {
      where: { path: oldPath },
      limit: 1000
    })

    for (const hit of hits) {
      const entry = hit.document
      await orama.remove(this.db, hit.id);

      const newId = this.getId(newPath, entry.startOffset, entry.endOffset)
      await orama.insert(this.db, { ...entry, id: newId, path: newPath })
      console.debug(`Updated entry ${hit.id} to new path ${newPath}.`)
    }

    this.save()
  }


  async hasEntry(path: string, contentHash: string): Promise<boolean> {
    const { hits } = await orama.search(this.db, {
      where: { path, contentHash },
      limit: 1
    })

    return hits.length > 0
  }

  async insertEntry(entry: {
    path: string,
    startOffset: number,
    endOffset: number,
    type: string,
    contentHash: string,
    embedding: number[]
  }) {
    const id = this.getId(entry.path, entry.startOffset, entry.endOffset)
    await orama.insert(this.db, { id, ...entry })

    this.save()
  }

  async cleanupEntriesForFile(path: string, contentHashes: Set<string>) {
    const { hits } = await orama.search(this.db, {
      where: { path },
      limit: 1000
    })

    for (const hit of hits) {
      const entry = hit.document
      if (contentHashes.has(entry.contentHash))
        continue

      await orama.remove(this.db, hit.id)
      console.debug(`Deleted entry ${hit.id} for file ${path} due to missing content hash.`)
    }

    this.save()
  }

  async save() {
    if (this.isSaving) return
    this.isSaving = true

    const raw = orama.save(this.db)
    await this.plugin.app.vault.adapter.write(this.path, JSON.stringify(raw))

    this.isSaving = false
  }
}
