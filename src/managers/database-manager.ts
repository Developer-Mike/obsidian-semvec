import * as orama from "@orama/orama"
import { type AnyOrama, type RawData } from "@orama/orama"
import SemVec from "src/main"

export type DBEntry = {
  path: string,
  startOffset: number,
  endOffset: number,
  type: string,
  contentHash: string,
  embedding: number[]
}

const DB_FILENAME = "index.json"
const SCHEMA = {
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

  async search(query: string, vector: number[], limit = 10) {
    const { hits } = await orama.search(this.db, {
      mode: "vector",
      vector: { value: vector, property: "embedding" },
      limit
    })

    return hits.map(hit => hit.document as unknown as DBEntry)
  }

  async onFileMoved(oldPath: string, newPath: string) {
    const { hits } = await orama.search(this.db, {
      where: { path: oldPath },
      limit: 1000
    })

    for (const hit of hits)
      await orama.update(this.db, hit.id, { path: newPath })

    this.save()
    return hits.length
  }


  async hasEntry(path: string, contentHash: string): Promise<boolean> {
    const { hits } = await orama.search(this.db, {
      where: { path, contentHash },
      limit: 1
    })

    return hits.length > 0
  }

  async insertEntry(entry: DBEntry) {
    await orama.insert(this.db, { ...entry })
    this.save()
  }

  async cleanupEntriesForFile(path: string, contentHashes: Set<string>) {
    const { hits } = await orama.search(this.db, {
      term: path,
      properties: ["path"],
      exact: true,
      limit: 1000
    })

    let removedEntries = 0
    for (const hit of hits) {
      const entry = hit.document
      if (contentHashes.has(entry.contentHash))
        continue

      await orama.remove(this.db, hit.id)
      removedEntries++
    }

    this.save()
    return removedEntries
  }

  async save() {
    if (this.isSaving) return
    this.isSaving = true

    const raw = orama.save(this.db)
    await this.plugin.app.vault.adapter.write(this.path, JSON.stringify(raw))

    this.isSaving = false
  }
}
