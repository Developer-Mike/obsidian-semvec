/**
 * Main -> Worker:
 *  { type: "init", id, wasmBinary, modelBuffer, modelData, tokenizerJson }
 *  { type: "getVector", id, text }
 *
 * Worker -> Main:
 *   { type: "ready", id }
 *   { type: "vector", id, vector }
 *   { type: "error", id, message }
 */

import * as ort from "onnxruntime-web"
import { InferenceSession } from "onnxruntime-web"
import ModelTokenizer from "./model-tokenizer"

let session: InferenceSession | null = null
let tokenizer: ModelTokenizer | null = null

async function handleInit(data: any): Promise<void> {
  const { wasmBinary, modelBuffer, modelData, tokenizerJson } = data

  const env = ort.env as any
  env.wasm.numThreads = 1
  env.wasm.wasmBinary = wasmBinary

  tokenizer = new ModelTokenizer(JSON.parse(tokenizerJson))
  session = await InferenceSession.create(
    new Uint8Array(modelBuffer),
    { externalData: [{ path: "model.onnx_data", data: new Uint8Array(modelData) }] }
  )
}

async function getVector(text: string): Promise<number[]> {
  if (!session || !tokenizer)
    throw new Error("Worker not initialized")

  const tokenized = tokenizer.tokenize(text)
  const feed = tokenizer.feed(tokenized)
  const values = await session.run(feed)

  return tokenizer.process(tokenized, values)
}

const ctx = globalThis as unknown as Worker
ctx.onmessage = async (e: MessageEvent) => {
  const { type, id } = e.data

  try {
    switch (type) {
      case "init":
        await handleInit(e.data)
        ctx.postMessage({ type: "ready", id })
        break

      case "getVector":
        const vector = await getVector(e.data.text)
        ctx.postMessage({ type: "vector", id, vector })
        break

      default:
        ctx.postMessage({ type: "error", id, message: `Unknown message type: ${type}` })
    }
  } catch (err: any) {
    ctx.postMessage({ type: "error", id, message: err?.message ?? String(err) })
  }
}
