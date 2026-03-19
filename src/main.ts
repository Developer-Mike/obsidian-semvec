import { Plugin } from "obsidian"
import EMBEDDINGGEMMA from "./embedding/configs/embeddinggemma"
import EmbeddingModel from "./embedding/embedding-model"
import DatabaseManager from "./managers/database-manager"
import IndexerManager from "./managers/indexer-manager"
import SettingsManager from "./settings"
import { SemanticSearchView, VIEW_TYPE_SEMANTIC_SEARCH } from "./views/semantic-search-view"

export default class SemVec extends Plugin {
  settings: SettingsManager
  database: DatabaseManager
  models: Record<string, EmbeddingModel> = {}
  indexer: IndexerManager

  override async onload() {
    this.settings = new SettingsManager(this)
    await this.settings.loadSettings()
    this.settings.addSettingsTab()

    this.database = new DatabaseManager(this)
    await this.database.initialize()

    this.indexer = new IndexerManager(this)

    SemanticSearchView.register(this)
    this.addRibbonIcon('dice', 'Activate view', () => {
      this.app.workspace.getLeftLeaf(false)?.setViewState({
        type: VIEW_TYPE_SEMANTIC_SEARCH,
        active: true
      })
    })

    // DEBUG
    this.models.embeddinggemma = new EmbeddingModel(this, EMBEDDINGGEMMA)
    await this.models.embeddinggemma.download()

    /*const vector = await this.models.embeddinggemma.getVector("This is a sample text.")
    console.log(vector)*/
  }

  override async onunload() {
    await this.database.save()
  }
}
