import { ItemView, WorkspaceLeaf } from "obsidian"
import SemVec from "src/main"

export const VIEW_TYPE_SEMANTIC_SEARCH = "semantic-search"

export class SemanticSearchView extends ItemView {
  private plugin: SemVec

  static register(plugin: SemVec) {
    plugin.registerView(
      VIEW_TYPE_SEMANTIC_SEARCH,
      (leaf) => new SemanticSearchView(plugin, leaf)
    )

    plugin.addRibbonIcon('scan-search', 'Open Semantic Search', () => {
      const views = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_SEMANTIC_SEARCH)
      if (views.length > 0) {
        plugin.app.workspace.setActiveLeaf(views[0])
        return
      }

      plugin.app.workspace.getLeftLeaf(false)?.setViewState({
        type: VIEW_TYPE_SEMANTIC_SEARCH,
        active: true
      })
    })
  }

  constructor(plugin: SemVec, leaf: WorkspaceLeaf) {
    super(leaf)
    this.plugin = plugin
  }

  getViewType() { return VIEW_TYPE_SEMANTIC_SEARCH }
  getDisplayText() { return "Semantic Search" }
  getIcon() { return "scan-search" }

  override async onOpen() {
    const container = this.contentEl
    container.empty()

    container.createEl("h4", { text: "Example view" })
  }

  override async onClose() { }
}
