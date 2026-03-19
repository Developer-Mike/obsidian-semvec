import { TFile } from "obsidian"
import SemVec from "src/main"
import crypto from "crypto"

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
    const contentHashes = new Set<string>()
    let newIndexedSections = 0
    for (const section of sections) {
      if (!["heading", "paragraph", "list", "table"].includes(section.type))
        continue // Only index headings and paragraphs for now

      const sectionContent = content.substring(
        section.position.start.offset,
        section.position.end.offset
      )

      const sectionHash = crypto.createHash('md5')
        .update(sectionContent).digest('hex')
      contentHashes.add(sectionHash)

      if (await this.plugin.database.hasEntry(file.path, sectionHash))
        continue // Already indexed

      const model = this.plugin.models[this.plugin.settings.getSetting("model")]
      const embedding = await model.getVector(sectionContent)
      await this.plugin.database.insertEntry({
        path: file.path,
        startOffset: section.position.start.offset,
        endOffset: section.position.end.offset,
        type: section.type,
        contentHash: sectionHash,
        embedding
      })
      newIndexedSections++
    }

    const cleanedUpSections = await this.plugin.database.cleanupEntriesForFile(file.path, contentHashes)

    console.debug(`Indexed ${file.name}: +${newIndexedSections} -${cleanedUpSections}`)
  }
}
