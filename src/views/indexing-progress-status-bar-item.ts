import { debounce } from "obsidian"
import SemVec from "src/main"

export class IndexingProgressStatusBarItem {
  private plugin: SemVec
  private contentEl: HTMLElement
  private progressEl: HTMLSpanElement
  private update: () => void

  constructor(plugin: SemVec) {
    this.plugin = plugin
    this.contentEl = this.plugin.addStatusBarItem()
    this.progressEl = this.contentEl.createEl("span")

    this.update = debounce(this.render.bind(this), 500)
    this.render()

    this.plugin.registerEvent(this.plugin.app.metadataCache.on(
      "semvec:indexing-progress" as any,
      () => this.update()
    ))
  }

  private render() {
    if (this.plugin.indexer.queue === 0)
      return this.contentEl.style.display = "none"

    this.contentEl.style.display = "block"
    this.progressEl.setText(`Vectorizing (${this.plugin.indexer.progress} / ${this.plugin.indexer.progress + this.plugin.indexer.queue})`)
  }
}
