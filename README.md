# brotli-wasm [![Build Status](https://github.com/httptoolkit/brotli-wasm/workflows/CI/badge.svg)](https://github.com/httptoolkit/brotli-wasm/actions) [![Available on NPM](https://img.shields.io/npm/v/brotli-wasm.svg)](https://npmjs.com/package/brotli-wasm)

> _Part of [HTTP Toolkit](https://httptoolkit.tech): powerful tools for building, testing & debugging HTTP(S)_

**A reliable compressor and decompressor for Brotli, supporting node & browsers via wasm**

Brotli is available in modern Node (12+) but not older Node or browsers. With this package, you can immediately use it everywhere.

This package contains a tiny wrapper around the compress & decompress API of the Rust [Brotli crate](https://crates.io/crates/brotli), compiled to wasm with just enough setup to make it easily usable from JavaScript.

This is battle-tested, in production use in both node & browsers as part of [HTTP Toolkit](https://httptoolkit.tech/), and includes automated build with node & browser tests to make sure.

## Getting started

```
npm install brotli-wasm
```

You should be able to import this directly into Node, as normal, or in a browser using any bundler that supports ES modules & webassembly (e.g. Webpack v4 or v5, Vite, Rollup, and most others).

For each target (node.js, commonjs bundlers & ESM bundlers) this module exports a different WASM file & setup, with a slightly different entrypoint. These entrypoints all expose a consistent default-export API, in addition to some other exports that may vary (e.g. Node exposes the brotli methods synchronously, while browsers always require an `await` due to WASM limitations).

In all builds (after waiting for the exported promise in browsers) the module exposes two core methods:

* `compress(Buffer, [options])` - compresses a buffer using Brotli, returning the compressed buffer. An optional options object can be provided. The only currently supported option is `quality`: a number between 1 and 11.
* `decompress(Buffer)` - decompresses a buffer using Brotli, returning the original raw data.

For advanced use data-streaming use cases, `CompressStream` and `DecompressStream` classes for streaming compression are also available. See [the tests](https://github.com/httptoolkit/brotli-wasm/blob/main/test/brotli.spec.ts) for example usage.

### Usage

If you want to support node & browsers with the same code, you can use the `await` browser-compatible form with the default export everywhere.

#### In node.js:

```javascript
const brotli = require('brotli-wasm');

const compressedData = brotli.compress(Buffer.from('some input'));
const decompressedData = brotli.decompress(compressedData);

console.log(Buffer.from(decompressedData).toString('utf8')); // Prints 'some input'
```

#### In browsers:

```javascript
import brotliPromise from 'brotli-wasm'; // Import the default export

const brotli = await brotliPromise; // Import is async in browsers due to wasm requirements!

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const input = 'some input';

const uncompressedData = textEncoder.encode('some input');
const compressedData = brotli.compress(uncompressedData);
const decompressedData = brotli.decompress(compressedData);

console.log(textDecoder.decode(decompressedData)); // Prints 'some input'
```

The package itself has no runtime dependencies, although if you prefer using `Buffer` over using `TextEncoder/TextDecoder` you may want a [browser Buffer polyfill](https://www.npmjs.com/package/browserify-zlib).

#### In browser with streams:

```javascript
import brotliPromise from 'brotli-wasm'; // Import the default export

const brotli = await brotliPromise; // Import is async in browsers due to wasm requirements!

const input = 'some input';

const inputStream = new ReadableStream({
    start (controller) {
        controller.enqueue(input);
        controller.close();
    }
});

const textEncoderStream = new TextEncoderStream();
const compressStream = new brotli.CompressStream();
const compressionStream = new TransformStream({
    start () {},
    transform (chunk, controller) {
        controller.enqueue(compressStream.compress(chunk, 100));
    },
    flush (controller) {
        if (compressStream.result() === brotli.BrotliStreamResult.NeedsMoreInput) {
            controller.enqueue(compressStream.compress(undefined, 100));
        }
        controller.terminate();
    }
});

const decompressStream = new brotli.DecompressStream();
const decompressionStream = new TransformStream({
    start () {},
    transform (chunk, controller) {
        controller.enqueue(decompressStream.decompress(chunk, 100));
    },
    flush (controller) {
        if (decompressStream.result() === brotli.BrotliStreamResult.NeedsMoreInput) {
            controller.enqueue(decompressStream.decompress(undefined, 100));
        }
        controller.terminate();
    }
});

const textDecoderStream = new TextDecoderStream()
const outputStream = new WritableStream({
    write (chunk) {
        output += chunk;
    }
});

let output = '';
await inputStream
    .pipeThrough(textEncoderStream)
    .pipeThrough(compressionStream)
    .pipeThrough(decompressionStream)
    .pipeThrough(textDecoderStream)
    .pipeTo(outputStream);
console.log(output); // Prints 'some input'
```

Note that `TransformStream` has become available in all browsers as of mid-2022. https://caniuse.com/mdn-api_transformstream

## Alternatives

There's a few other packages that do similar things, but I found they were all unusable and/or unmaintained:

* [brotli-dec-wasm](https://www.npmjs.com/package/brotli-dec-wasm) - decompressor only, compiled from Rust just like this package, actively maintained, but no compressor available (by design). **If you only need decompression, this package is a good choice**.
* [Brotli.js](https://www.npmjs.com/package/brotli) - hand-written JS decompressor that seems to work OK for most cases, but it crashes for some edge cases and the emscripten build of the compressor doesn't work in browsers at all. Last updated in 2017.
* [wasm-brotli](https://www.npmjs.com/package/wasm-brotli) - Compiled from Rust like this package, includes decompressor & compressor, but requires a custom async wrapper for Webpack v4 usage and isn't usable at all in Webpack v5. Last updated in 2019.
