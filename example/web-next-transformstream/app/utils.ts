// The structure is from the MDN docs: https://developer.mozilla.org/en-US/docs/Web/API/TransformStream

import type { CompressStream, BrotliWasmType } from 'brotli-wasm'

interface BrotliCompressTransformer extends Transformer<Uint8Array, Uint8Array> {
  brotliWasm: BrotliWasmType
  outputSize: number
  stream: CompressStream
}

const brotliCompressTransformerBuilder: (
  brotliWasm: BrotliWasmType,
  outputSize: number,
  quality?: number
) => BrotliCompressTransformer = (brotliWasm, outputSize, quality) => ({
  brotliWasm,
  outputSize,
  stream: new brotliWasm.CompressStream(quality),
  start() {},
  transform(chunk, controller) {
    do {
      const inputOffset = this.stream.last_input_offset()
      const input = chunk.slice(inputOffset)
      const output = this.stream.compress(input, this.outputSize)
      controller.enqueue(output)
    } while (this.stream.result() === brotliWasm.BrotliStreamResult.NeedsMoreOutput)
    if (this.stream.result() !== brotliWasm.BrotliStreamResult.NeedsMoreInput) {
      controller.error(`Brotli compression failed when transforming with error code ${this.stream.result()}`)
    }
  },
  flush(controller) {
    do {
      const output = this.stream.compress(undefined, this.outputSize)
      controller.enqueue(output)
    } while (this.stream.result() === brotliWasm.BrotliStreamResult.NeedsMoreOutput)
    if (this.stream.result() !== brotliWasm.BrotliStreamResult.ResultSuccess) {
      controller.error(`Brotli compression failed when flushing with error code ${this.stream.result()}`)
    }
  },
})

export class BrotliCompressTransformStream extends TransformStream<Uint8Array, Uint8Array> {
  constructor(brotliWasm: BrotliWasmType, outputSize: number, quality?: number) {
    super(brotliCompressTransformerBuilder(brotliWasm, outputSize, quality))
  }
}
