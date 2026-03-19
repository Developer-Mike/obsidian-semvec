import { Plugin } from "obsidian"
import EMBEDDINGGEMMA from "./embedding/configs/embeddinggemma"
import EmbeddingModelWorker from "./embedding/embedding-model-worker"
import DatabaseManager from "./managers/database-manager"
import IndexerManager from "./managers/indexer-manager"
import SettingsManager, { MODELS } from "./settings"
import { IndexingProgressStatusBarItem } from "./views/indexing-progress-status-bar-item"
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
    new IndexingProgressStatusBarItem(this)

    // DEBUG
    const model = this.settings.getSetting("model")
    this.models[model] = new EmbeddingModelWorker(this, MODELS[model])
    await this.models[model].download()
  }

  override async onunload() {
    for (const model of Object.values(this.models))
      model.dispose()

    await this.database.save()
  }
}
