# brotli-wasm [![Build Status](https://github.com/httptoolkit/brotli-wasm/workflows/CI/badge.svg)](https://github.com/httptoolkit/brotli-wasm/actions) [![Available on NPM](https://img.shields.io/npm/v/brotli-wasm.svg)](https://npmjs.com/package/brotli-wasm)

> _Fork of [httptoolkit/brotli-wasm](https://github.com/httptoolkit/brotli-wasm), published as
> [`@kyr0/brotli-wasm`](https://npmjs.com/package/@kyr0/brotli-wasm), adding custom dictionary
> support for compression & decompression (one-shot and streaming) and vendoring the Brotli crate to fix several issues, including issues with custom dictionaries._

**A reliable compressor and decompressor for Brotli, supporting node & browsers via wasm**

Brotli is available in modern Node (12+) but not older Node or browsers. With this package, you can immediately use it everywhere.

This package contains a tiny wrapper around the compress & decompress API of the Rust [Brotli crate](https://crates.io/crates/brotli), compiled to wasm with just enough setup to make it easily usable from JavaScript.

This is battle-tested, in production use in both node & browsers as part of [HTTP Toolkit](https://httptoolkit.tech/), and includes automated build with node & browser tests to make sure.

## Getting started

```
npm install brotli-wasm-custom-dictionary
```

You should be able to import this directly into Node, as normal, or in a browser using any bundler that supports ES modules & webassembly (e.g. Webpack v4 or v5, Vite, Rollup, and most others).

For each target (node.js, commonjs bundlers & ESM bundlers) this module exports a different WASM file & setup, with a slightly different entrypoint. These entrypoints all expose a consistent default-export API, in addition to some other exports that may vary (e.g. Node exposes the brotli methods synchronously, while browsers always require an `await` due to WASM limitations).

In all builds (after waiting for the exported promise in browsers) the module exposes two core methods:

* `compress(Buffer, [options])` - compresses a buffer using Brotli, returning the compressed buffer. An optional options object can be provided. The supported options are `quality`: a number between 1 and 11, and `customDictionary`: a `Uint8Array` to use as a raw (LZ77) dictionary.
* `decompress(Buffer, [options])` - decompresses a buffer using Brotli, returning the original raw data. An optional options object can be provided; the supported option is `customDictionary`: a `Uint8Array` holding the same raw dictionary that was used for compression.

For advanced use data-streaming use cases, `CompressStream` and `DecompressStream` classes for streaming compression are also available. Both constructors accept an optional custom dictionary too (`new CompressStream(quality?, customDictionary?)`, `new DecompressStream(customDictionary?)`). See [the tests](https://github.com/kyr0/brotli-wasm/blob/main/test/brotli.spec.ts) for example usage.

### Custom dictionaries

A custom dictionary lets the compressor reference common phrases from data you already have
(e.g. previous similar documents), dramatically shrinking output for small, similar payloads:

```javascript
const compressed = brotli.compress(payload, { quality: 11, customDictionary: dictionary });
const decompressed = brotli.decompress(compressed, { customDictionary: dictionary });
```

This uses raw (LZ77) dictionary semantics, exactly like the reference C encoder's
`BrotliEncoderAttachPreparedDictionary(..., BROTLI_SHARED_DICTIONARY_RAW, ...)`, i.e. the
`brotli` CLI's `-D FILE` flag. The dictionary is **not** embedded in the compressed stream;
the decoder must attach the identical dictionary, and decompression fails loudly without it.

One constraint: the usable dictionary size is limited by the stream's window size — at most
`2^lgwin - 16` bytes (the tail of an oversized dictionary is used). This package encodes with
the default window (`lgwin = 22`, i.e. dictionaries up to ~4 MiB are fully usable). Streams
produced by the reference CLI are decodable as long as the same constraint holds — note that
the CLI auto-selects a small window for small inputs unless you pass `-w` explicitly
(e.g. `brotli -q 11 -w 22 -D dict.txt -c payload.txt`).

**Quality support:** custom dictionaries work at **every quality (0–11)**. Builds that bundle
the upstream `brotli` crate 8.0.4 could panic (`RuntimeError: unreachable`) at qualities 5–9
for certain payload/dictionary pairs: a backward reference straddling the custom-dictionary
boundary was truncated below brotli's minimum copy length (2). This is fixed via a small
vendored patch to the brotli crate (see [`brotli_bugfix.md`](./brotli_bugfix.md) for the exact
root cause and fix). Regression tests now exercise dictionaries across qualities 0–11, both
natively (Rust) and through the WASM API.

### Usage

If you want to support node & browsers with the same code, you can use the `await` browser-compatible form with the default export everywhere.

#### In node.js:

```javascript
const brotli = require('@kyr0/brotli-wasm');

const compressedData = brotli.compress(Buffer.from('some input'));
const decompressedData = brotli.decompress(compressedData);

console.log(Buffer.from(decompressedData).toString('utf8')); // Prints 'some input'
```

#### In browsers:

```javascript
import brotliPromise from '@kyr0/brotli-wasm'; // Import the default export

const brotli = await brotliPromise; // Import is async in browsers due to wasm requirements!

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const input = 'some input';

const uncompressedData = textEncoder.encode(input);
const compressedData = brotli.compress(uncompressedData);
const decompressedData = brotli.decompress(compressedData);

console.log(textDecoder.decode(decompressedData)); // Prints 'some input'
```

You can also load it from a CDN like so:
```javascript
const brotli = await import("https://unpkg.com/@kyr0/brotli-wasm@3.1.0/index.web.js?module").then(m => m.default);
```

The package itself has no runtime dependencies, although if you prefer using `Buffer` over using `TextEncoder/TextDecoder` you may want a [browser Buffer polyfill](https://www.npmjs.com/package/browserify-zlib).

##### Using an importmap

If you've installed `@kyr0/brotli-wasm` as an NPM package, you can load it from your `node_modules` subfolder:

```html
<!-- index.html -->
<!DOCTYPE html>
<html lang="en">
    <head></head>
    <body>
        <script type="importmap">
            {
                "imports": {
                    "brotli-wasm": "/node_modules/@kyr0/brotli-wasm/index.web.js"
                }
            }
        </script>
        <script type="module" src="/main.js"></script>
    </body>
</html>
```

```javascript
// main.js
import brotliPromise from '@kyr0/brotli-wasm';
const brotli = await brotliPromise;

const input = 'some input';
const uncompressedData = new TextEncoder().encode(input);
const compressedData = brotli.compress(uncompressedData);
const decompressedData = brotli.decompress(compressedData);
console.log(new TextDecoder().decode(decompressedData)); // Prints 'some input'
```

#### In browser with streams:

```javascript
import brotliPromise from '@kyr0/brotli-wasm'; // Import the default export

const brotli = await brotliPromise; // Import is async in browsers due to wasm requirements!

const input = 'some input';

// Get a stream for your input:
const inputStream = new ReadableStream({
    start(controller) {
        controller.enqueue(input);
        controller.close();
    }
});

// Convert the streaming data to Uint8Arrays, if necessary:
const textEncoderStream = new TextEncoderStream();

// You can use whatever stream chunking size you like here, depending on your use case:
const OUTPUT_SIZE = 100;

// Create a stream to incrementally compress the data as it streams:
const compressStream = new brotli.CompressStream();
const compressionStream = new TransformStream({
    transform(chunk, controller) {
        let resultCode;
        let inputOffset = 0;

        // Compress this chunk, producing up to OUTPUT_SIZE output bytes at a time, until the
        // entire input has been compressed.

        do {
            const input = chunk.slice(inputOffset);
            const result = compressStream.compress(input, OUTPUT_SIZE);
            controller.enqueue(result.buf);
            resultCode = result.code;
            inputOffset += result.input_offset;
        } while (resultCode === brotli.BrotliStreamResultCode.NeedsMoreOutput);
        if (resultCode !== brotli.BrotliStreamResultCode.NeedsMoreInput) {
            controller.error(`Brotli compression failed when transforming with code ${resultCode}`);
        }
    },
    flush(controller) {
        // Once the chunks are finished, flush any remaining data (again in repeated fixed-output
        // chunks) to finish the stream:
        let resultCode;
        do {
            const result = compressStream.compress(undefined, OUTPUT_SIZE);
            controller.enqueue(result.buf);
            resultCode = result.code;
        } while (resultCode === brotli.BrotliStreamResultCode.NeedsMoreOutput)
        if (resultCode !== brotli.BrotliStreamResultCode.ResultSuccess) {
            controller.error(`Brotli compression failed when flushing with code ${resultCode}`);
        }
        controller.terminate();
    }
});

const decompressStream = new brotli.DecompressStream();
const decompressionStream = new TransformStream({
    transform(chunk, controller) {
        let resultCode;
        let inputOffset = 0;

        // Decompress this chunk, producing up to OUTPUT_SIZE output bytes at a time, until the
        // entire input has been decompressed.

        do {
            const input = chunk.slice(inputOffset);
            const result = decompressStream.decompress(input, OUTPUT_SIZE);
            controller.enqueue(result.buf);
            resultCode = result.code;
            inputOffset += result.input_offset;
        } while (resultCode === brotli.BrotliStreamResultCode.NeedsMoreOutput);
        if (
            resultCode !== brotli.BrotliStreamResultCode.NeedsMoreInput &&
            resultCode !== brotli.BrotliStreamResultCode.ResultSuccess
        ) {
            controller.error(`Brotli decompression failed with code ${resultCode}`)
        }
    },
    flush(controller) {
        controller.terminate();
    }
});

const textDecoderStream = new TextDecoderStream();

let output = '';
const outputStream = new WritableStream({
    write(chunk) {
        output += chunk;
    }
});

await inputStream
    .pipeThrough(textEncoderStream)
    .pipeThrough(compressionStream)
    .pipeThrough(decompressionStream)
    .pipeThrough(textDecoderStream)
    .pipeTo(outputStream);
console.log(output); // Prints 'some input'
```

Note that `TransformStream` has become available in all browsers as of mid-2022: https://caniuse.com/mdn-api_transformstream. It's also been available in Node.js (experimentally) since v16.5.0.

This is a simplified demo example - you may well want to tweak the specific stream buffer sizes for compression/decompression to your use case, to reuse buffers, or explore further optimizations if you're interested in these streaming use cases.

## Alternatives

There's a few other packages that do similar things, but I found they were all unusable and/or unmaintained:

* [brotli-dec-wasm](https://www.npmjs.com/package/brotli-dec-wasm) - decompressor only, compiled from Rust just like this package, actively maintained, but no compressor available (by design). **If you only need decompression, this package is a good choice**.
* [Brotli.js](https://www.npmjs.com/package/brotli) - hand-written JS decompressor that seems to work OK for most cases, but it crashes for some edge cases and the emscripten build of the compressor doesn't work in browsers at all. Last updated in 2017.
* [wasm-brotli](https://www.npmjs.com/package/wasm-brotli) - Compiled from Rust like this package, includes decompressor & compressor, but requires a custom async wrapper for Webpack v4 usage and isn't usable at all in Webpack v5. Last updated in 2019.
