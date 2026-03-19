import { TFile } from "obsidian"
import SemVec from "src/main"
import crypto from "crypto"

export default class IndexerManager {
  plugin: SemVec

  constructor(plugin: SemVec) {
    this.plugin = plugin
    this.addListeners()
  }

  private addListeners() {
    this.plugin.registerEvent(this.plugin.app.metadataCache.on(
      "changed",
      this.index.bind(this)
    ))

    this.plugin.registerEvent(this.plugin.app.vault.on(
      "rename",
      async (file, oldPath) => {
        if (!(file instanceof TFile)) return
        await this.plugin.database.onFileMoved(oldPath, file.path)
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
    for (const section of sections) {
      const sectionContent = content.substring(
        section.position.start.offset,
        section.position.end.offset
      )

      const sectionHash = crypto.createHash('md5')
        .update(sectionContent).digest('hex')
      contentHashes.add(sectionHash)

      if (await this.plugin.database.hasEntry(file.path, sectionHash))
        continue // Already indexed

      const embedding = await this.plugin.models.embeddinggemma.getVector(sectionContent)
      await this.plugin.database.insertEntry({
        path: file.path,
        startOffset: section.position.start.offset,
        endOffset: section.position.end.offset,
        type: section.type,
        contentHash: sectionHash,
        embedding
      })

      console.debug(`Indexed section in ${file.path} [${section.position.start.offset}, ${section.position.end.offset}] with hash ${sectionHash}`)
    }

    await this.plugin.database.cleanupEntriesForFile(file.path, contentHashes)
  }
}
