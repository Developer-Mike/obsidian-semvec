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

    this.addCommand({
      id: "embed-sample",
      name: "Embed Sample Text",
      callback: async () => {
        const vector = await this.embedding.getVector("This is a sample text.")
        console.log(vector)
      },
    })
  }

  override async onunload() {
    await this.database.save()
  }
}
