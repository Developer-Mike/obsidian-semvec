import { TFile } from "obsidian"
import SemVec from "src/main"

export default class IndexerManager {
  private plugin: SemVec

  private _progress = 0
  get progress() { return this._progress }
  private _queue = 0
  get queue() { return this._queue }

  constructor(plugin: SemVec) {
    this.plugin = plugin
    this.addListeners()
  }

  private addListeners() {
    this.plugin.registerEvent(this.plugin.app.metadataCache.on(
      "changed",
      async file => {
        this.plugin.app.metadataCache.trigger("semvec:indexing-progress")

        this._queue++
        await this.index(file)
        this._progress++
        this._queue--

        if (this._queue === 0)
          this._progress = 0

        this.plugin.app.metadataCache.trigger("semvec:indexing-progress")
      }
    ))

    this.plugin.registerEvent(this.plugin.app.vault.on(
      "rename",
      async (file, oldPath) => {
        if (!(file instanceof TFile)) return

        const movedIndexesCount = await this.plugin.database.onFileMoved(oldPath, file.path)
        console.debug(`Moved ${file.name}'s indexes (${movedIndexesCount})`)
      }
    ))

    this.plugin.registerEvent(this.plugin.app.vault.on(
      "delete",
      async (file) => {
        if (!(file instanceof TFile)) return
        await this.plugin.database.cleanupEntriesForFile(file.path, new Set())
      }
    ))
  }

  private async index(file: TFile) {
    const metadata = this.plugin.app.metadataCache.getFileCache(file)
    if (!metadata) return

    const content = await this.plugin.app.vault.cachedRead(file)

    const sections = metadata.sections || []
    const contents = new Set<string>()
    let newIndexedFragments = 0
    for (const section of sections) {
      if (!["heading", "paragraph", "list", "table"].includes(section.type))
        continue // Only index headings and paragraphs for now

      const sectionContent = content.substring(
        section.position.start.offset,
        section.position.end.offset
      )

      const fragments = sectionContent.split("\n")
      for (const fragment of fragments) {
        const fragmentStartOffset = section.position.start.offset +
          fragments.slice(0, fragments.indexOf(fragment))
          .reduce((sum, f) => sum + f.length + 1, 0)
        const fragmentEndOffset = fragmentStartOffset + fragment.length

        contents.add(fragment)
        if (await this.plugin.database.hasEntry(file.path, fragment))
          continue // Already indexed

        const model = this.plugin.models[this.plugin.settings.getSetting("model")]
        const embedding = await model.getVector(sectionContent)
        await this.plugin.database.insertEntry({
          path: file.path,
          startOffset: fragmentStartOffset,
          endOffset: fragmentEndOffset,
          type: section.type,
          content: fragment,
          embedding
        })
        newIndexedFragments++
      }
    }

    const cleanedUpFragments = await this.plugin.database.cleanupEntriesForFile(file.path, contents)
    console.debug(`Indexed ${file.name}: +${newIndexedFragments} -${cleanedUpFragments}`)
  }
}
