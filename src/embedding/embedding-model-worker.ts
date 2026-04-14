import { requestUrl } from "obsidian"
import * as path from "path"
import SemVec from "src/main"

// Injected at build time by esbuild as a virtual module
import workerCode from "virtual:embedding-worker"

const MODELS_FOLDER = "models"
const MODEL_TOKENIZER_PATH = "tokenizer.json"
const MODEL_TOKENIZER_CONFIG_PATH = "tokenizer_config.json"
const MODEL_ONNX_PATH = "model.onnx"
const MODEL_ONNX_DATA_PATH = "model.onnx_data"

export interface EmbeddingModelConfig {
  id: string
  label: string
  millionParameters: number
  vectorDimension: number
  sources: {
    tokenizer: string
    tokenizerConfig: string
    model: string
    data: string
  }
}

export default class EmbeddingModelWorker {
  private plugin: SemVec
  private config: EmbeddingModelConfig
  private dir: string

  private worker: Worker | null = null
  private nextId = 0
  private pending = new Map<number, { resolve: (value: any) => void; reject: (reason: any) => void }>()
  private initPromise: Promise<void> | null = null

  constructor(plugin: SemVec, config: EmbeddingModelConfig) {
    this.plugin = plugin
    this.config = config

    this.dir = path.join(
      this.plugin.manifest.dir!,
      MODELS_FOLDER,
      this.config.id
    )
  }

  async isDownloaded(): Promise<boolean> {
    const promises = await Promise.all([
      path.join(this.dir, MODEL_TOKENIZER_PATH),
      path.join(this.dir, MODEL_TOKENIZER_CONFIG_PATH),
      path.join(this.dir, MODEL_ONNX_PATH),
      path.join(this.dir, MODEL_ONNX_DATA_PATH)
    ].map(f => this.plugin.app.vault.adapter.exists(f)))

    return !promises.some(exists => !exists)
  }

  async download(): Promise<boolean> {
    if (await this.isDownloaded()) return true
    console.log(`Downloading model "${this.config.label}"...`)

    try {
      if (!(await this.plugin.app.vault.adapter.exists(this.dir)))
        await this.plugin.app.vault.adapter.mkdir(this.dir)

      await Promise.all([
        [MODEL_TOKENIZER_PATH, this.config.sources.tokenizer],
        [MODEL_TOKENIZER_CONFIG_PATH, this.config.sources.tokenizerConfig],
        [MODEL_ONNX_PATH, this.config.sources.model],
        [MODEL_ONNX_DATA_PATH, this.config.sources.data],
      ].map(async ([file, url]) => this.plugin.app.vault.adapter.writeBinary(
        path.join(this.dir, file),
        Buffer.from((await requestUrl({ url })).arrayBuffer)
      ).then(() => console.log(`Downloaded ${file}`))))
    } catch (error) {
      console.error("Failed to download model:", error)
      return false
    }

    return true
  }

  private async ensureWorker(): Promise<void> {
    if (this.initPromise) return this.initPromise
    this.initPromise = this.initWorker()
    return this.initPromise
  }

  private async initWorker(): Promise<void> {
    const blob = new Blob([workerCode], { type: "application/javascript" })
    const url = URL.createObjectURL(blob)
    this.worker = new Worker(url)

    this.worker.onmessage = (e: MessageEvent) => {
      const { id, type, ...rest } = e.data
      console.log("[Embedding] Worker message:", type)

      const p = this.pending.get(id)
      if (!p) return
      this.pending.delete(id)

      if (type === "error") {
        console.error("[Embedding] Worker error:", rest.message)
        p.reject(new Error(rest.message))
      }
      else p.resolve(rest)
    }

    this.worker.onerror = (e: ErrorEvent) => {
      console.error("Embedding worker error:", e.message)

      for (const [id, p] of this.pending)
        p.reject(new Error(`Worker error: ${e.message}`))

      this.pending.clear()
    }

    const adapter = this.plugin.app.vault.adapter
    const [modelBuffer, modelData, tokenizerJson, tokenizerConfigJson] = await Promise.all([
      adapter.readBinary(path.join(this.dir, MODEL_ONNX_PATH)),
      adapter.readBinary(path.join(this.dir, MODEL_ONNX_DATA_PATH)),
      adapter.read(path.join(this.dir, MODEL_TOKENIZER_PATH)),
      adapter.read(path.join(this.dir, MODEL_TOKENIZER_CONFIG_PATH)),
    ])

    const wasmB64 = (globalThis as any).__ORT_WASM_BASE64
    let wasmBinary: ArrayBuffer
    if (wasmB64) {
      const raw = atob(wasmB64)
      const bytes = new Uint8Array(raw.length)
      for (let i = 0; i < raw.length; i++)
        bytes[i] = raw.charCodeAt(i)

      wasmBinary = bytes.buffer
    } else { throw new Error("WASM binary not found — __ORT_WASM_BASE64 not set") }

    await this.sendMessage("init", {
      wasmBinary,
      modelBuffer,
      modelData,
      tokenizerJson,
      tokenizerConfigJson,
    }, [wasmBinary, modelBuffer, modelData])
  }

  private sendMessage(type: string, data: any, transfer: Transferable[] = []): Promise<any> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker!.postMessage({ type, id, ...data }, transfer)
    })
  }

  async getVector(text: string): Promise<number[]> {
    await this.ensureWorker()

    const result = await this.sendMessage("getVector", { text })
    return result.vector
  }

  dispose(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }

    this.initPromise = null
    this.pending.clear()
  }
}
