'use client'

import streamSaver from 'streamsaver'

import { BrotliCompressTransformStream } from './utils'

export default function Home() {
  const brotli = (op: string) => async () => {
    const brotliWasm = await (await import('brotli-wasm')).default
    switch (op) {
      case 'enc':
        const fileInput = document.querySelector('#file-input') as HTMLInputElement
        const file = fileInput.files![0]
        if (!file) throw new Error('No file selected')
        const inputStream = file.stream()
        const outputStream = streamSaver.createWriteStream(file.name + '.br')
        // 1KB chunks
        const transformStream = new BrotliCompressTransformStream(brotliWasm, 1024)
        inputStream.pipeThrough(transformStream).pipeTo(outputStream)
        break
      case 'dec':
        console.error('Not implemented')
        break
    }
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
          <button disabled onClick={brotli('dec')}>
            Decompress
          </button>
        </div>
      </div>
    </main>
  )
}
