import { create, save as saveOrama, load as loadOrama, type AnyOrama, type RawData } from "@orama/orama"
import SemVec from "src/main"

const DB_FILENAME = "index.json"
const SCHEMA = {
  id: "string",
  path: "string",
  heading: "string",
  content: "string",
  embedding: "vector[768]",
  lastModified: "number",
} as const

export default class DatabaseManager {
  private plugin: SemVec
  db: AnyOrama

  constructor(plugin: SemVec) {
    this.plugin = plugin
  }

  private get dbPath(): string {
    return `${this.plugin.manifest.dir}/${DB_FILENAME}`
  }

  async initialize() {
    this.db = create({ schema: SCHEMA })

    const adapter = this.plugin.app.vault.adapter
    if (await adapter.exists(this.dbPath)) {
      const raw = JSON.parse(await adapter.read(this.dbPath)) as RawData
      loadOrama(this.db, raw)
    }
  }

  async save() {
    const raw = saveOrama(this.db)
    await this.plugin.app.vault.adapter.write(this.dbPath, JSON.stringify(raw))
  }
}
