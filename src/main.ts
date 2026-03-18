import { Plugin } from "obsidian"
import SettingsManager from "./settings"
import DatabaseManager from "./managers/database-manager"
import EmbeddingModelManager from "./managers/embedding-model-manager"

export default class SemVec extends Plugin {
  settings: SettingsManager
  database: DatabaseManager
  embedding: EmbeddingModelManager

  override async onload() {
    this.settings = new SettingsManager(this)
    await this.settings.loadSettings()
    this.settings.addSettingsTab()

    this.database = new DatabaseManager(this)
    await this.database.initialize()

    this.embedding = new EmbeddingModelManager(this)
  }

  override async onunload() {
    await this.database.save()
  }
}
