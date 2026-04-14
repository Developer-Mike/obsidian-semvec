import { EmbeddingModelConfig } from "../embedding-model-worker"

const QWEN3: EmbeddingModelConfig = {
  id: "qwen3",
  label: "Qwen3 Embedding",
  millionParameters: 600,
  vectorDimension: 1024,
  sources: {
    tokenizer: "https://huggingface.co/onnx-community/Qwen3-Embedding-0.6B-ONNX/resolve/main/tokenizer.json",
    tokenizerConfig: "https://huggingface.co/onnx-community/Qwen3-Embedding-0.6B-ONNX/resolve/main/tokenizer_config.json",
    model: "https://huggingface.co/onnx-community/Qwen3-Embedding-0.6B-ONNX/resolve/main/onnx/model.onnx",
    data: "https://huggingface.co/onnx-community/Qwen3-Embedding-0.6B-ONNX/resolve/main/onnx/model.onnx_data",
  }
}

export default QWEN3
