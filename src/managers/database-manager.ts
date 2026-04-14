import * as orama from "@orama/orama"
import { type AnyOrama, type RawData } from "@orama/orama"
import SemVec from "src/main"
import { MODELS } from "src/settings"

export type DBEntry = {
  path: string,
  startOffset: number,
  endOffset: number,
  type: string,
  content: string,
  embedding: number[]
}

const DB_FILENAME = "index.json"
const SCHEMA = {
  path: "string",
  startOffset: "number",
  endOffset: "number",
  type: "string", // e.g. "heading", "paragraph"
  content: "string"
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
    const model = MODELS[this.plugin.settings.getSetting("model")]
    console.log("[DB] Creating index with vector dimension:", model.vectorDimension)
    this.db = orama.create({ schema: { ...SCHEMA, embedding: `vector[${model.vectorDimension}]` } })
    console.log("[DB] Index created")

    const adapter = this.plugin.app.vault.adapter
    if (await adapter.exists(this.path)) {
      console.log("[DB] Loading existing index from:", this.path)
      const raw = JSON.parse(await adapter.read(this.path)) as RawData
      orama.load(this.db, raw)
      console.log("[DB] Existing index loaded")
    } else {
      console.log("[DB] No existing index file")
    }
  }

  async search(query: string, vector: number[], limit = 10) {
    console.log("[DB] Search query:", query, "vector dim:", vector.length)
    const count = await orama.count(this.db)
    console.log("[DB] Total documents in index:", count)
    
    // Try fulltext first
    const ftResults = await orama.search(this.db, {
      term: query,
      properties: "*",
      limit: 10
    })
    console.log("[DB] Fulltext hits:", ftResults.hits.length)
    
    // Try vector search
    const vecResults = await orama.search(this.db, {
      mode: "vector",
      vector: { value: vector, property: "embedding" },
      similarity: 0.1,
      limit
    })
    console.log("[DB] Vector hits:", vecResults.hits.length)
    
    // Try hybrid
    const { hits } = await orama.search(this.db, {
      mode: "hybrid",
      term: query,
      properties: "*",
      vector: { value: vector, property: "embedding" },
      similarity: 0.1,
      limit
    })
    
    console.log("[DB] Hybrid hits:", hits.length)

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


  async hasEntry(path: string, content: string): Promise<boolean> {
    const { hits } = await orama.search(this.db, {
      where: { path },
      limit: 1
    })

    return hits.length > 0
  }

  async insertEntry(entry: DBEntry) {
    console.log("[DB] Inserting entry:", entry.path, "content:", entry.content.substring(0, 30), "embedding dim:", entry.embedding.length)
    await orama.insert(this.db, { ...entry })
    this.save()
  }

  async cleanupEntriesForFile(path: string, contents: Set<string>) {
    const { hits } = await orama.search(this.db, {
      term: path,
      properties: ["path"],
      exact: true,
      limit: 1000
    })

    let removedEntries = 0
    for (const hit of hits) {
      const entry = hit.document
      if (contents.has(entry.content))
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
