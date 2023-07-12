'use client'

import streamSaver from 'streamsaver'

import { BrotliCompressTransformStream, BrotliDecompressTransformStream } from './utils'

export default function Home() {
  const brotli = (op: string) => async () => {
    const brotliWasm = await (await import('brotli-wasm')).default
    const fileInput = document.querySelector('#file-input') as HTMLInputElement
    const file = fileInput.files![0]
    if (!file) throw new Error('No file selected')
    const inputStream = file.stream()
    let transformStream = null
    let outputFilename = null
    switch (op) {
      case 'enc':
        // 1KB chunks
        transformStream = new BrotliCompressTransformStream(brotliWasm, 1024)
        outputFilename = file.name + '.br'
        break
      case 'dec':
        transformStream = new BrotliDecompressTransformStream(brotliWasm, 1024)
        outputFilename = file.name.match(/\.br$/) ? file.name.slice(0, -3) : file.name + '.debr'
        break
      default:
        throw new Error('Invalid operation')
    }
    const outputStream = streamSaver.createWriteStream(outputFilename)
    inputStream.pipeThrough(transformStream).pipeTo(outputStream)
  }

  return (
    <main>
      <h1>TransformStream example</h1>
      <div>
        <input type="file" id="file-input" />
        <div>
          <button onClick={brotli('enc')}>Compress</button>
        </div>
        <div>
          <button onClick={brotli('dec')}>Decompress</button>
        </div>
      </div>
    </main>
  )
}
