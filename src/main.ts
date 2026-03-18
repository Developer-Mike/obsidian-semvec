import { Plugin } from "obsidian"
import SettingsManager from "./settings"
import DatabaseManager from "./managers/database-manager"

export default class SemVer extends Plugin {
  settings: SettingsManager
  database: DatabaseManager

  override async onload() {
    this.settings = new SettingsManager(this)
    await this.settings.loadSettings()
    this.settings.addSettingsTab()

    this.database = new DatabaseManager(this)
    await this.database.initialize()
  }

  override async onunload() {
    await this.database.save()
  }
}
