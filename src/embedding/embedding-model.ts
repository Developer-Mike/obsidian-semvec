import * as fs from "fs"
import { FileSystemAdapter, requestUrl } from "obsidian"
import * as ort from "onnxruntime-web"
import { InferenceSession } from "onnxruntime-web"
import * as path from "path"
import SemVec from "src/main"
import ModelTokenizer from "./model-tokenizer"

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

  isDownloaded(): boolean {
    return fs.existsSync(path.join(this.dir, MODEL_TOKENIZER_PATH)) &&
      fs.existsSync(path.join(this.dir, MODEL_ONNX_PATH)) &&
      fs.existsSync(path.join(this.dir, MODEL_ONNX_DATA_PATH))
  }

  async download(): Promise<boolean> {
    if (this.isDownloaded()) return true

    try {
      if (!fs.existsSync(this.dir))
        fs.mkdirSync(this.dir, { recursive: true })

      await Promise.all([
        [MODEL_TOKENIZER_PATH, this.config.sources.tokenizer],
        [MODEL_ONNX_PATH, this.config.sources.model],
        [MODEL_ONNX_DATA_PATH, this.config.sources.data],
      ].map(async ([file, url]) => fs.writeFileSync(
        path.join(this.dir, file),
        Buffer.from((await requestUrl({ url })).arrayBuffer)
      )))
    } catch (error) {
      console.error("Failed to download model:", error)
      return false
    }

    return true
  }

  private async getSession(): Promise<InferenceSession> {
    if (this.session) return this.session
    ort.env.wasm.wasmPaths = path.join(
      (this.plugin.app.vault.adapter as FileSystemAdapter).getBasePath(),
      this.plugin.manifest.dir!
    ) + "/"

    const modelBuffer = fs.readFileSync(path.join(this.dir, MODEL_ONNX_PATH))
    const modelData = fs.readFileSync(path.join(this.dir, MODEL_ONNX_DATA_PATH))
    this.session = await InferenceSession.create(modelBuffer.buffer, {
      externalData: [{ path: "model.onnx_data", data: modelData.buffer }],
    })

    return this.session
  }

  private async getTokenizer(): Promise<ModelTokenizer> {
    if (this.tokenizer) return this.tokenizer

    const data = fs.readFileSync(path.join(this.dir, MODEL_TOKENIZER_PATH), "utf-8")
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
