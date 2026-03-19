import { Plugin } from "obsidian"
import EMBEDDINGGEMMA from "./embedding/configs/embeddinggemma"
import EmbeddingModelWorker from "./embedding/embedding-model-worker"
import DatabaseManager from "./managers/database-manager"
import IndexerManager from "./managers/indexer-manager"
import SettingsManager from "./settings"
import { SemanticSearchView } from "./views/semantic-search-view"

export default class SemVec extends Plugin {
  settings: SettingsManager
  database: DatabaseManager
  models: Record<string, EmbeddingModelWorker> = {}
  indexer: IndexerManager

  override async onload() {
    this.settings = new SettingsManager(this)
    await this.settings.loadSettings()
    this.settings.addSettingsTab()

    this.database = new DatabaseManager(this)
    await this.database.initialize()

    this.indexer = new IndexerManager(this)

    SemanticSearchView.register(this)

    // DEBUG
    this.models.embeddinggemma = new EmbeddingModelWorker(this, EMBEDDINGGEMMA)
    await this.models.embeddinggemma.download()
  }

  override async onunload() {
    for (const model of Object.values(this.models))
      model.dispose()

    await this.database.save()
  }
}
