import { ItemView, TFile, WorkspaceLeaf, debounce, setIcon, FileView } from "obsidian"
import * as orama from "@orama/orama"
import SemVec from "src/main"

export const VIEW_TYPE_SEMANTIC_SEARCH = "semantic-search"

export class SemanticSearchView extends ItemView {
  private plugin: SemVec
  private resultCountLimit = 20

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
    this.render()
  }

  private render() {
    const container = this.contentEl
    container.empty()
    container.addClass("semvec-search-view")

    const searchRow = container.createDiv({ cls: "semvec-search-row" })
    const inputWrapper = searchRow.createDiv({ cls: "semvec-input-wrapper" })
    const searchIcon = inputWrapper.createDiv({ cls: "semvec-search-icon" })
    setIcon(searchIcon, "search")
    const input = inputWrapper.createEl("input", {
      type: "text",
      placeholder: "Semantic search...",
      cls: "semvec-search-input"
    })
    const clearBtn = inputWrapper.createDiv({
      cls: "semvec-clear-btn",
      attr: { "aria-label": "Clear search" }
    })
    setIcon(clearBtn, "circle-x")
    clearBtn.style.display = "none"
    const select = searchRow.createEl("select", { cls: "semvec-result-count dropdown" })
    for (const count of [5, 10, 20, 50, 100]) {
      const option = select.createEl("option", { text: String(count), value: String(count) })
      if (count === this.resultCountLimit) option.selected = true
    }

    // Results container
    const resultsContainer = container.createDiv({ cls: "semvec-results" })
    const performSearch = debounce(async (query: string) => {
      await this.search(query, resultsContainer)
    }, 300, true)

    input.addEventListener("input", () => {
      const hasValue = input.value.length > 0
      clearBtn.style.display = hasValue ? "" : "none"

      if (hasValue) performSearch(input.value)
      else resultsContainer.empty()
    })

    clearBtn.addEventListener("click", () => {
      input.value = ""
      clearBtn.style.display = "none"
      resultsContainer.empty()
      input.focus()
    })

    select.addEventListener("change", () => {
      this.resultCountLimit = Number(select.value)
      if (input.value.length > 0)
        performSearch(input.value)
    })
  }

  private async search(query: string, resultsContainer: HTMLElement) {
    resultsContainer.empty()

    const model = this.plugin.models[this.plugin.settings.getSetting("model")]
    if (!model) return resultsContainer.createDiv(
      { cls: "semvec-empty", text: "Embedding model not loaded." }
    )

    let vector: number[]
    try { vector = await model.getVector(query) }
    catch {
      return resultsContainer.createDiv(
        { cls: "semvec-empty", text: "Failed to generate embedding." }
      )
    }

    const results = await this.plugin.database.search(vector, this.resultCountLimit)

    if (results.length === 0) return resultsContainer.createDiv(
      { cls: "semvec-empty", text: "No results found." }
    )

    for (const result of results) {
      const file = this.plugin.app.vault.getAbstractFileByPath(result.path)
      if (!(file instanceof TFile)) continue

      const card = resultsContainer.createDiv({ cls: "semvec-result-card" })
      card.createDiv({ cls: "semvec-result-title", text: file.basename })

      const content = await this.plugin.app.vault.cachedRead(file)
      const snippet = content.substring(
        Math.max(0, result.startOffset - 20),
        Math.min(content.length, result.endOffset + 20)
      ).trim()
      card.createDiv({ cls: "semvec-result-snippet", text: snippet })

      card.addEventListener("click", () => this.openFileAtMatch(file, {
        content,
        matches: [[result.startOffset, result.endOffset]]
      }))
    }
  }

  private async openFileAtMatch(file: TFile, match: { content: string, matches: [number, number][] }) {
    let leaf = this.plugin.app.workspace.getLeaf(false)
    if (
      !leaf || !(leaf.view instanceof FileView) ||
      !(leaf.view.file instanceof TFile) || leaf.view.file.path !== file.path
    ) {
      leaf = this.plugin.app.workspace.getLeaf(true)
      await leaf.openFile(file)
    }

    leaf.setEphemeralState({ match })
  }

  override async onClose() { }
}
