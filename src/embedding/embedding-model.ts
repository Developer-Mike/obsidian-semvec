import { FileSystemAdapter, requestUrl } from "obsidian"
import * as ort from "onnxruntime-web"
import { InferenceSession } from "onnxruntime-web"
import * as path from "path"
import SemVec from "src/main"
import ModelTokenizer from "./model-tokenizer"

const WASM_FILENAME = "ort-wasm-simd-threaded.wasm"
const MODELS_FOLDER = "models"
const MODEL_TOKENIZER_PATH = "tokenizer.json"
const MODEL_ONNX_PATH = "model.onnx"
const MODEL_ONNX_DATA_PATH = "model.onnx_data"

export interface EmbeddingModelConfig {
  id: string
  label: string
  millionParameters: number
  sources: {
    tokenizer: string
    model: string
    data: string
  }
}

export default class EmbeddingModel {
  private plugin: SemVec
  private config: EmbeddingModelConfig
  private dir: string

  private session: InferenceSession | null = null
  private tokenizer: ModelTokenizer | null = null

  constructor(plugin: SemVec, config: EmbeddingModelConfig) {
    this.plugin = plugin
    this.config = config

    this.dir = path.join(
      (this.plugin.app.vault.adapter as FileSystemAdapter).getBasePath(), // root
      this.plugin.manifest.dir!, // .obsidian/plugins/semvec
      MODELS_FOLDER, // models
      this.config.id // e.g. embeddinggemma
    )
  }

  async isDownloaded(): Promise<boolean> {
    const promises = await Promise.all([
      path.join(this.dir, MODEL_TOKENIZER_PATH),
      path.join(this.dir, MODEL_ONNX_PATH),
      path.join(this.dir, MODEL_ONNX_DATA_PATH)
    ].map(f => this.plugin.app.vault.adapter.exists(f)))

    return !promises.some(exists => !exists)
  }

  async download(): Promise<boolean> {
    if (await this.isDownloaded()) return true

    try {
      if (!(await this.plugin.app.vault.adapter.exists(this.dir)))
        await this.plugin.app.vault.adapter.mkdir(this.dir)

      await Promise.all([
        [MODEL_TOKENIZER_PATH, this.config.sources.tokenizer],
        [MODEL_ONNX_PATH, this.config.sources.model],
        [MODEL_ONNX_DATA_PATH, this.config.sources.data],
      ].map(async ([file, url]) => this.plugin.app.vault.adapter.writeBinary(
        path.join(this.dir, file),
        Buffer.from((await requestUrl({ url })).arrayBuffer)
      )))
    } catch (error) {
      console.error("Failed to download model:", error)
      return false
    }

    return true
  }

  private async setup(): Promise<void> {
    const wasmDir = path.join(
      (this.plugin.app.vault.adapter as FileSystemAdapter).getBasePath(),
      this.plugin.manifest.dir!,
      "wasm"
    )

    // Extract bundled WASM to plugin dir on first run
    const wasmPath = path.join(wasmDir, WASM_FILENAME)
    if (
      !(await this.plugin.app.vault.adapter.exists(wasmPath)) &&
      (globalThis as any).__ORT_WASM_BASE64
    ) {
      await this.plugin.app.vault.adapter.mkdir(wasmDir)
      await this.plugin.app.vault.adapter.writeBinary(
        wasmPath,
        Buffer.from((globalThis as any).__ORT_WASM_BASE64, "base64")
      )
    }

    ort.env.wasm.wasmPaths = wasmDir + "/"
  }

  private async getSession(): Promise<InferenceSession> {
    if (this.session) return this.session
    await this.setup()

    const modelBuffer = await this.plugin.app.vault.adapter
      .readBinary(path.join(this.dir, MODEL_ONNX_PATH))
    const modelData = await this.plugin.app.vault.adapter
      .readBinary(path.join(this.dir, MODEL_ONNX_DATA_PATH))

    this.session = await InferenceSession.create(modelBuffer, {
      externalData: [{ path: "model.onnx_data", data: modelData }],
    })

    return this.session
  }

  private async getTokenizer(): Promise<ModelTokenizer> {
    if (this.tokenizer) return this.tokenizer

    const data = await this.plugin.app.vault.adapter
      .read(path.join(this.dir, MODEL_TOKENIZER_PATH))
    const json = JSON.parse(data)
    this.tokenizer = new ModelTokenizer(json)

    return this.tokenizer
  }

  async getVector(text: string): Promise<number[]> {
    const session = await this.getSession()
    const tokenizer = await this.getTokenizer()

    const tokenized = tokenizer.tokenize(`search_query: ${text}`) // FIXME: Why?
    const feed = tokenizer.feed(tokenized)
    const values = await session.run(feed)

    return tokenizer.process(tokenized, values)
  }
}
