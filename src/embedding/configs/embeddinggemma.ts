import { EmbeddingModelConfig } from "../embedding-model-worker"

const EMBEDDINGGEMMA: EmbeddingModelConfig = {
  id: "embeddinggemma",
  label: "EmbeddingGemma",
  millionParameters: 300,
  vectorDimension: 768,
  sources: {
    tokenizer: "https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX/resolve/main/tokenizer.json",
    tokenizerConfig: "https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX/resolve/main/tokenizer_config.json",
    model: "https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX/resolve/main/onnx/model.onnx",
    data: "https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX/resolve/main/onnx/model.onnx_data",
  },
}

export default EMBEDDINGGEMMA
