import { TextEncoder, TextDecoder } from 'text-encoding';

if (typeof global !== 'undefined' && typeof global.TextEncoder === 'undefined') {
    global.TextEncoder = TextEncoder;
    global.TextDecoder = TextDecoder;
}

let getRandomValues: typeof crypto.getRandomValues;
let btoa: typeof global.btoa;
let atob: typeof global.atob;

if (typeof process !== 'undefined' && process.versions.node) {
    // Polyfill for web APIs not present in some node versions:
    atob = global.atob || require('atob');
    btoa = global.btoa || require('btoa');

    // This is actually available as crypto.webcrypto in Node 15+, but not in older versions.
    const { Crypto } = require('@peculiar/webcrypto');
    const crypto = new Crypto();
    getRandomValues = crypto.getRandomValues.bind(crypto);
} else {
    getRandomValues = crypto.getRandomValues.bind(crypto);
    btoa = globalThis.btoa;
    atob = globalThis.atob;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const dataToBase64 = (data: Uint8Array | number[]) => btoa(String.fromCharCode(...data));
const base64ToData = (base64: string) => new Uint8Array(
    [...atob(base64)].map(c => c.charCodeAt(0))
);

import { expect } from 'chai';
import brotliPromise, { type BrotliWasmType } from '..';

describe("Brotli-wasm", () => {

    let brotli: BrotliWasmType;
    beforeEach(async () => {
        brotli = await brotliPromise;
    });

    it("can compress data", () => {
        const input = textEncoder.encode("Test input data");
        const result = brotli.compress(input);
        expect(dataToBase64(result)).to.equal('Gw4A+KWpyubolCCjVAjmxJ4D');
    });

    it("can compress data with a different quality setting", () => {
        const input = textEncoder.encode("Test input data");
        const result = brotli.compress(input, { quality: 1 });
        expect(dataToBase64(result)).to.equal('CweAVGVzdCBpbnB1dCBkYXRhAw==');
    });

    it("can decompress data", () => {
        // Generated with: echo -n '$CONTENT' | brotli --stdout - | base64
        const input = base64ToData('GxoAABypU587dC0k9ianQOgqjS32iUTcCA==');
        const result = brotli.decompress(input);
        expect(textDecoder.decode(result)).to.equal('Brotli brotli brotli brotli');
    });

    it("can compress and decompress data many times", function () {
        this.timeout(10000); // Should only take 2-4 seconds, but leave some slack

        const input = textEncoder.encode("Test input data");

        for (let i = 0; i < 500; i++) {
            const compressed = brotli.compress(input);
            expect(dataToBase64(compressed)).to.equal('Gw4A+KWpyubolCCjVAjmxJ4D');

            const decompressed = brotli.decompress(compressed);
            expect(textDecoder.decode(decompressed)).to.equal('Test input data');
        }
    });

    it("cleanly fails when options is something other than an object", () => {
        const input = textEncoder.encode("Test input data");
        expect(() =>
            brotli.compress(input, "this should not be a string" as any)
        ).to.throw('Options is not an object');
    });

    it("does not fail when options contain unknown properties", () => {
        const input = textEncoder.encode("Test input data");
        const result = brotli.compress(input, { someRandomKey: 1, quality: 5 } as any);
        expect(dataToBase64(result)).to.equal('CweAVGVzdCBpbnB1dCBkYXRhAw==');
    });

    it("does not fail when compressing with an illegal quality value", () => {
        const input = textEncoder.encode("Test input data");
        const result = brotli.compress(input, { quality: 12 });
        expect(dataToBase64(result)).to.equal('Gw4A+KWpyubolCCjVAjmxJ4D');
    });

    it("cleanly fails when decompressing garbage", () => {
        const input = textEncoder.encode("This is not brotli data, it's just a string");
        expect(() =>
            brotli.decompress(input)
        ).to.throw('Brotli decompress failed');
    });

    it("can compress & decompress back to the original result", () => {
        const input = "Some thrilling text I urgently need to compress";
        const result = textDecoder.decode(
            brotli.decompress(brotli.compress(textEncoder.encode(input)))
        );
        expect(result).to.equal(input);
    });

    it("can compress & decompress back to the original result with a different quality setting", () => {
        const input = "Some thrilling text I urgently need to compress";
        const result = textDecoder.decode(
            brotli.decompress(brotli.compress(textEncoder.encode(input), { quality: 3 }))
        );
        expect(result).to.equal(input);
    });

    it("can streamingly compress data", () => {
        const input = textEncoder.encode("Test input data");
        const input1 = input.slice(0, input.length / 2);
        const input2 = input.slice(input.length / 2);
        const stream = new brotli.CompressStream();
        const result1 = stream.compress(input1, 100);
        const output1 = result1.buf;
        expect(result1.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const result2 = stream.compress(input2, 100);
        const output2 = result2.buf;
        expect(result2.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const result3 = stream.compress(undefined, 100);
        const output3 = result3.buf;
        expect(result3.code).to.equal(brotli.BrotliStreamResultCode.ResultSuccess);
        expect(dataToBase64([...output1, ...output2, ...output3])).to.equal('Gw4A+KWpyubolCCjVAjmxJ4D');
    });

    it("can streamingly compress data with a different quality setting", () => {
        const input = textEncoder.encode("Test input data");
        const input1 = input.slice(0, input.length / 2);
        const input2 = input.slice(input.length / 2);
        const quality = 1;
        const stream = new brotli.CompressStream(quality);
        const result1 = stream.compress(input1, 100);
        const output1 = result1.buf;
        expect(result1.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const result2 = stream.compress(input2, 100);
        const output2 = result2.buf;
        expect(result2.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const result3 = stream.compress(undefined, 100);
        const output3 = result3.buf;
        expect(result3.code).to.equal(brotli.BrotliStreamResultCode.ResultSuccess);
        // It will be different from non-streaming result.
        // But it can still be decompressed back to the original string.
        let output = new Uint8Array([...output1, ...output2, ...output3]);
        expect(dataToBase64(brotli.decompress(output))).to.equal(dataToBase64(input));
    });

    it("can streamingly decompress data", () => {
        // Generated with: echo -n '$CONTENT' | brotli --stdout - | base64
        const input = base64ToData('GxoAABypU587dC0k9ianQOgqjS32iUTcCA==');
        const input1 = input.slice(0, input.length / 2);
        const input2 = input.slice(input.length / 2);
        const stream = new brotli.DecompressStream();
        const result1 = stream.decompress(input1, 100);
        const output1 = result1.buf;
        expect(result1.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const result2 = stream.decompress(input2, 100);
        const output2 = result2.buf;
        expect(result2.code).to.equal(brotli.BrotliStreamResultCode.ResultSuccess);
        expect(textDecoder.decode(new Uint8Array([...output1, ...output2]))).to.equal('Brotli brotli brotli brotli');
    });

    it("does not fail when streamingly compressing with an illegal quality value", () => {
        const input = textEncoder.encode("Test input data");
        const input1 = input.slice(0, input.length / 2);
        const input2 = input.slice(input.length / 2);
        const quality = 12;
        const stream = new brotli.CompressStream(quality);
        const result1 = stream.compress(input1, 100);
        const output1 = result1.buf;
        expect(result1.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const result2 = stream.compress(input2, 100);
        const output2 = result2.buf;
        expect(result2.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const result3 = stream.compress(undefined, 100);
        const output3 = result3.buf;
        expect(result3.code).to.equal(brotli.BrotliStreamResultCode.ResultSuccess);
        expect(dataToBase64([...output1, ...output2, ...output3])).to.equal('Gw4A+KWpyubolCCjVAjmxJ4D');
    });

    it("cleanly fails when streamingly decompressing garbage", () => {
        const input = textEncoder.encode("This is not brotli data, it's just a string");
        const stream = new brotli.DecompressStream();
        expect(() =>
            stream.decompress(input, 100)
        ).to.throw('Brotli streaming decompress failed');
    });

    it("automatically frees DecompressStream on error and prevents reuse", () => {
        const input = textEncoder.encode("This is not brotli data, it's just a string");
        const stream = new brotli.DecompressStream();

        // This should throw and automatically free the stream's internal state
        expect(() =>
            stream.decompress(input, 100)
        ).to.throw('Brotli streaming decompress failed');

        // Attempting to use the stream again should fail with a clear message
        expect(() =>
            stream.decompress(input, 100)
        ).to.throw('DecompressStream has already been freed');

        // Calling free() should be safe (no-op since internal state is already freed)
        expect(() => stream.free()).to.not.throw();
    });

    it("can streamingly compress & decompress back to the original result", () => {
        const s = "Some thrilling text I urgently need to compress";
        const encInput = textEncoder.encode(s);
        const encInput1 = encInput.slice(0, encInput.length / 2);
        const encInput2 = encInput.slice(encInput.length / 2);
        const encStream = new brotli.CompressStream();
        const encResult1 = encStream.compress(encInput1, 100);
        const encOutput1 = encResult1.buf;
        expect(encResult1.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const encResult2 = encStream.compress(encInput2, 100);
        const encOutput2 = encResult2.buf;
        expect(encResult2.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const encResult3 = encStream.compress(undefined, 100);
        const encOutput3 = encResult3.buf;
        expect(encResult3.code).to.equal(brotli.BrotliStreamResultCode.ResultSuccess);
        const encOutput = new Uint8Array([...encOutput1, ...encOutput2, ...encOutput3]);

        const decInput1 = encOutput.slice(0, encOutput.length / 2);
        const decInput2 = encOutput.slice(encOutput.length / 2);
        const decStream = new brotli.DecompressStream();
        const decResult1 = decStream.decompress(decInput1, 100);
        const decOutput1 = decResult1.buf;
        expect(decResult1.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const decResult2 = decStream.decompress(decInput2, 100);
        const decOutput2 = decResult2.buf;
        expect(decResult2.code).to.equal(brotli.BrotliStreamResultCode.ResultSuccess);
        const decOutput = new Uint8Array([...decOutput1, ...decOutput2]);

        expect(textDecoder.decode(decOutput)).to.equal(s);
    });

    it("can streamingly compress & decompress back to the original result with a different quality setting", () => {
        const s = "Some thrilling text I urgently need to compress";
        const encInput = textEncoder.encode(s);
        const encInput1 = encInput.slice(0, encInput.length / 2);
        const encInput2 = encInput.slice(encInput.length / 2);
        const quality = 3;
        const encStream = new brotli.CompressStream(quality);
        const encResult1 = encStream.compress(encInput1, 100);
        const encOutput1 = encResult1.buf;
        expect(encResult1.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const encResult2 = encStream.compress(encInput2, 100);
        const encOutput2 = encResult2.buf;
        expect(encResult2.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const encResult3 = encStream.compress(undefined, 100);
        const encOutput3 = encResult3.buf;
        expect(encResult3.code).to.equal(brotli.BrotliStreamResultCode.ResultSuccess);
        const encOutput = new Uint8Array([...encOutput1, ...encOutput2, ...encOutput3]);

        const decInput1 = encOutput.slice(0, encOutput.length / 2);
        const decInput2 = encOutput.slice(encOutput.length / 2);
        const decStream = new brotli.DecompressStream();
        const decResult1 = decStream.decompress(decInput1, 100);
        const decOutput1 = decResult1.buf;
        expect(decResult1.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const decResult2 = decStream.decompress(decInput2, 100);
        const decOutput2 = decResult2.buf;
        expect(decResult2.code).to.equal(brotli.BrotliStreamResultCode.ResultSuccess);
        const decOutput = new Uint8Array([...decOutput1, ...decOutput2]);

        expect(textDecoder.decode(decOutput)).to.equal(s);
    });

    it("streaming compressing can handle needing more output when action is process", function () {
        this.timeout(10000);
        // The input should be more than about 1.6MB with enough randomness
        // to make the compressor ask for more output space when the action is PROCESS
        const input = generateRandomBytes(1600000);
        const stream = new brotli.CompressStream();
        const result1 = stream.compress(input, 1);
        const output1 = result1.buf;
        expect(result1.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreOutput);
        const result2 = stream.compress(input.slice(result1.input_offset), 1500000);
        const output2 = result2.buf;
        expect(result2.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const result3 = stream.compress(undefined, 1640000);
        const output3 = result3.buf;
        expect(result3.code).to.equal(brotli.BrotliStreamResultCode.ResultSuccess);
        const output = new Uint8Array([...output1, ...output2, ...output3]);

        expect([...brotli.decompress(output)]).to.deep.equal([...input]);
    });

    it("streaming compressing can handle needing more output when action is finish", () => {
        const input = textEncoder.encode('Some thrilling text I urgently need to compress');
        const stream = new brotli.CompressStream();
        const result1 = stream.compress(input, 1);
        const output1 = result1.buf;
        expect(result1.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const result2 = stream.compress(undefined, 1);
        const output2 = result2.buf;
        expect(result2.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreOutput);
        const result3 = stream.compress(undefined, 100);
        const output3 = result3.buf;
        expect(result3.code).to.equal(brotli.BrotliStreamResultCode.ResultSuccess);
        const output = new Uint8Array([...output1, ...output2, ...output3]);
        expect(dataToBase64(brotli.decompress(output))).to.equal(dataToBase64(input));
    });

    it("streaming decompressing can handle needing more output", () => {
        const input = base64ToData('GxoAABypU587dC0k9ianQOgqjS32iUTcCA==');
        const stream = new brotli.DecompressStream();
        const result1 = stream.decompress(input, 1);
        const output1 = result1.buf;
        expect(result1.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreOutput);
        const result2 = stream.decompress(input.slice(result1.input_offset), 100);
        const output2 = result2.buf;
        expect(result2.code).to.equal(brotli.BrotliStreamResultCode.ResultSuccess);
        expect(textDecoder.decode(new Uint8Array([...output1, ...output2]))).to.equal('Brotli brotli brotli brotli');
    });

    const areStreamsAvailable = !!globalThis.TransformStream;

    it("can streamingly compress & decompress back to the original result with web streams", async function () {
        if (!areStreamsAvailable) return this.skip();

        // This is very similar to the streaming example in the README, but with reduced buffer sizes to
        // try and ensure it catches any issues:

        let input = "";
        for (let i = 0; i < 1000; i++) {
            input += `${i}: Brotli brotli brotli brotli `;
        }

        const inputStream = new ReadableStream({
            start(controller) {
                controller.enqueue(input);
                controller.close();
            }
        });

        const textEncoderStream = new TextEncoderStream();

        const compressStream = new brotli.CompressStream();
        const compressionStream = new TransformStream({
            transform(chunk, controller) {
                let resultCode;
                let inputOffset = 0;
                do {
                    const input = chunk.slice(inputOffset);
                    const result = compressStream.compress(input, 10);
                    controller.enqueue(result.buf);
                    resultCode = result.code;
                    inputOffset += result.input_offset;
                } while (resultCode === brotli.BrotliStreamResultCode.NeedsMoreOutput);
                if (resultCode !== brotli.BrotliStreamResultCode.NeedsMoreInput) {
                    controller.error(`Brotli compression failed when transforming with code ${resultCode}`);
                }
            },
            flush(controller) {
                let resultCode;
                do {
                    const result = compressStream.compress(undefined, 10);
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
                do {
                    const input = chunk.slice(inputOffset);
                    const result = decompressStream.decompress(input, 100);
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

        expect(output).to.equal(input);
  });
});

describe("Brotli-wasm custom dictionaries", () => {

    let brotli: BrotliWasmType;
    beforeEach(async () => {
        brotli = await brotliPromise;
    });

    // A dictionary and payload that share long phrases, so the dictionary actually helps.
    // The same strings are used for the reference CLI fixtures below.
    const sentences: string[] = [];
    for (let i = 0; i < 12; i++) {
        sentences.push(`Record number ${i}: the quick brown fox number ${i} jumps over the lazy dog while packing box ${i} with jugs.`);
    }
    const dictionary = textEncoder.encode(sentences.join('\n') + '\n');
    const payload = textEncoder.encode(
        [sentences[0], sentences[3], sentences[7], sentences[11], sentences[5]].join('\n') + '\n'
    );
    const payloadString = textDecoder.decode(payload);

    [1, 5, 9, 11].forEach((quality) => {
        it(`can compress & decompress with a custom dictionary at quality ${quality}`, () => {
            const compressed = brotli.compress(payload, { quality, customDictionary: dictionary });
            const decompressed = brotli.decompress(compressed, { customDictionary: dictionary });
            expect(textDecoder.decode(decompressed)).to.equal(payloadString);
        });
    });

    it("produces different & smaller output with a custom dictionary", () => {
        // Regression test: previously customDictionary was silently ignored,
        // resulting in byte-identical output.
        const withDict = brotli.compress(payload, { quality: 11, customDictionary: dictionary });
        const withoutDict = brotli.compress(payload, { quality: 11 });
        expect(dataToBase64(withDict)).to.not.equal(dataToBase64(withoutDict));
        expect(withDict.length).to.be.lessThan(withoutDict.length);
    });

    it("can decompress data compressed by the reference C brotli with a dictionary", () => {
        // Generated with: brotli -q 11 -w 22 -D dict.txt -c payload.txt | base64
        // (reference C brotli 1.2.0, raw dictionary semantics; dict.txt & payload.txt
        // contain the dictionary & payload strings defined above)
        const input = base64ToData('G/sB6CUACrDAmsgoaYl5lR+8M+sD+JMA');
        const result = brotli.decompress(input, { customDictionary: dictionary });
        expect(textDecoder.decode(result)).to.equal(payloadString);
    });

    it("cleanly fails when decompressing dictionary-compressed data without the dictionary", () => {
        const compressed = brotli.compress(payload, { quality: 11, customDictionary: dictionary });
        expect(() => brotli.decompress(compressed)).to.throw('Brotli decompress failed');
    });

    it("cleanly fails when decompressing with the wrong dictionary", () => {
        const wrongDictionary = textEncoder.encode(
            'completely unrelated dictionary content that just happens to be padded........'
                .repeat(15).slice(0, dictionary.length)
        );
        const compressed = brotli.compress(payload, { quality: 11, customDictionary: dictionary });
        expect(() =>
            brotli.decompress(compressed, { customDictionary: wrongDictionary })
        ).to.throw('Brotli decompress failed');
    });

    it("can streamingly compress & decompress with a custom dictionary", () => {
        const compressStream = new brotli.CompressStream(11, dictionary);
        const result1 = compressStream.compress(payload, 4096);
        expect(result1.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const result2 = compressStream.compress(undefined, 4096);
        expect(result2.code).to.equal(brotli.BrotliStreamResultCode.ResultSuccess);
        const compressed = new Uint8Array([...result1.buf, ...result2.buf]);

        const decompressStream = new brotli.DecompressStream(dictionary);
        const result3 = decompressStream.decompress(compressed, 4096);
        expect(result3.code).to.equal(brotli.BrotliStreamResultCode.ResultSuccess);
        expect(textDecoder.decode(result3.buf)).to.equal(payloadString);
    });

    it("can mix one-shot & streaming (de)compression with a custom dictionary", () => {
        const oneShot = brotli.compress(payload, { quality: 11, customDictionary: dictionary });

        // One-shot compress -> streaming decompress:
        const decompressStream = new brotli.DecompressStream(dictionary);
        const result1 = decompressStream.decompress(oneShot, 4096);
        expect(result1.code).to.equal(brotli.BrotliStreamResultCode.ResultSuccess);
        expect(textDecoder.decode(result1.buf)).to.equal(payloadString);

        // Streaming compress -> one-shot decompress:
        const compressStream = new brotli.CompressStream(11, dictionary);
        const result2 = compressStream.compress(payload, 4096);
        const result3 = compressStream.compress(undefined, 4096);
        const streamCompressed = new Uint8Array([...result2.buf, ...result3.buf]);
        expect(textDecoder.decode(
            brotli.decompress(streamCompressed, { customDictionary: dictionary })
        )).to.equal(payloadString);
    });
});

// Regression coverage for the custom-dictionary encoder panic fixed in brotli 8.0.4
// (vendored patch). See brotli_bugfix.md: a backward reference straddling the custom-
// dictionary boundary was truncated below brotli's minimum copy length (2), yielding an
// invalid command whose copy length code underflowed to 65535 (panic). These tests pin the
// fixed behaviour so any regression fails loudly instead of crashing.
describe("Brotli-wasm custom dictionary panic regression", () => {

    let brotli: BrotliWasmType;
    beforeEach(async () => {
        brotli = await brotliPromise;
    });

    // Minimized from fuzzing. The trailing space in the dictionary is load-bearing: it is
    // what makes a dictionary-region match straddle the dictionary boundary.
    const MIN_PAYLOAD = textEncoder.encode('42ringbaznumberbar 42ba');
    const MIN_DICT = textEncoder.encode('ingr boolean ');

    it("does not panic on the minimized input at any quality (q0-q11)", () => {
        for (const q of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
            const compressed = brotli.compress(MIN_PAYLOAD, { quality: q, customDictionary: MIN_DICT });
            const decompressed = brotli.decompress(compressed, { customDictionary: MIN_DICT });
            expect([...decompressed]).to.deep.equal([...MIN_PAYLOAD]);
        }
    });

    it("does not panic on the minimized input in the q5-q9 meta-block range", () => {
        // Directly targets the `BrotliBuildMetaBlock` / `CreateBackwardReferences` path
        // that prepends the custom dictionary to the ring buffer.
        for (const q of [5, 6, 7, 8, 9]) {
            const compressed = brotli.compress(MIN_PAYLOAD, { quality: q, customDictionary: MIN_DICT });
            expect([...brotli.decompress(compressed, { customDictionary: MIN_DICT })])
                .to.deep.equal([...MIN_PAYLOAD]);
        }
    });

    // Deterministic xorshift32 PRNG (no dependencies) so any failure is reproducible.
    function makeRng(seed: number): () => number {
        let s = seed >>> 0;
        return () => {
            s ^= s << 13; s >>>= 0;
            s ^= s >>> 17;
            s ^= s << 5; s >>>= 0;
            return s;
        };
    }
    function randBytes(rng: () => number, n: number, alphabet: Uint8Array): Uint8Array {
        const out = new Uint8Array(n);
        for (let i = 0; i < n; i++) out[i] = alphabet[rng() % alphabet.length];
        return out;
    }

    it("round-trips many dictionary payloads at q5-q9 (deterministic fuzz)", function () {
        this.timeout(30000); // q9 over many payloads is heavier; leave slack
        const rng = makeRng(0x1234abcd);
        // Shared alphabet so backward references frequently straddle the dictionary boundary.
        const alphabet = textEncoder.encode('abcde 0123XYZingr boolean numberbar bazring');
        for (let i = 0; i < 25; i++) {
            const dict = randBytes(rng, 1 + rng() % 300, alphabet);
            const payload = randBytes(rng, 1 + rng() % 1200, alphabet);
            for (const q of [5, 6, 7, 8, 9]) {
                const compressed = brotli.compress(payload, { quality: q, customDictionary: dict });
                expect([...brotli.decompress(compressed, { customDictionary: dict })])
                    .to.deep.equal([...payload]);
            }
        }
    });

    it("streaming compress with a dictionary at q7 round-trips", () => {
        const stream = new brotli.CompressStream(7, MIN_DICT);
        const r1 = stream.compress(MIN_PAYLOAD, 4096);
        expect(r1.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const r2 = stream.compress(undefined, 4096);
        expect(r2.code).to.equal(brotli.BrotliStreamResultCode.ResultSuccess);
        const compressed = new Uint8Array([...r1.buf, ...r2.buf]);
        expect([...brotli.decompress(compressed, { customDictionary: MIN_DICT })])
            .to.deep.equal([...MIN_PAYLOAD]);
    });

    // Ground-truth cross-check (Node only): the fix must not change standard (no-dictionary)
    // brotli output, which Node's zlib must still be able to decode. (Node zlib does not expose
    // brotli dictionaries, so the dictionary path itself is validated by the round-trips above
    // and the native Rust harness in tests/.)
    const isNode = typeof process !== 'undefined' && !!process.versions.node;
    it("no-dictionary output is decodable by Node zlib (ground truth)", function () {
        if (!isNode) return this.skip();
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const zlib = require('zlib');
        const payload = textEncoder.encode(
            'Some thrilling text I urgently need to compress, repeated for size. '.repeat(10)
        );
        for (const q of [5, 7, 9, 11]) {
            const compressed = brotli.compress(payload, { quality: q });
            const decoded = zlib.brotliDecompressSync(compressed);
            expect([...decoded]).to.deep.equal([...payload]);
        }
    });
});

// Verifies the node wrapper's trap-recovery hardening: a WASM trap must not permanently
// poison the process. The original bug that caused the trap is fixed, so this locks in that
// the recovery mechanism (reinit() — which is the exact code path the wrapper runs
// automatically after catching a trap) keeps producing a healthy instance.
describe("Brotli-wasm instance recovery (poisoning hardening)", () => {

    let brotli: BrotliWasmType;
    beforeEach(async () => {
        brotli = await brotliPromise;
    });

    const isNode = typeof process !== 'undefined' && !!process.versions.node;

    it("exposes reinit() and stays functional across re-initializations", function () {
        // web/browser bundles are async and recover by re-awaiting init() / re-importing.
        if (!isNode) return this.skip();
        const nodeBrotli = brotli as unknown as { reinit?: () => void };
        expect(nodeBrotli.reinit).to.be.a('function');

        const input = textEncoder.encode("Test input data");
        // Deterministic q11 output is stable across fresh WebAssembly instances:
        const before = dataToBase64(brotli.compress(input));
        // reinit() swaps in a brand-new instance — the same loadFresh() the wrapper calls
        // automatically after catching a trap. Repeating it several times proves the process
        // is not poisoned (each subsequent call works and stays byte-identical).
        for (let i = 0; i < 3; i++) {
            nodeBrotli.reinit!();
            expect(dataToBase64(brotli.compress(input))).to.equal(before);
        }
    });
});

function generateRandomBytes(size: number) {
    const resultArray = new Uint8Array(size);
    let generatedSize = 0;

    // We can only generate 65535 bytes at a time, so we loop up to size:
    while (generatedSize < size) {
        const sizeToGenerate = Math.min(size - generatedSize, 65535);
        const stepResultArray = new Uint8Array(sizeToGenerate);

        getRandomValues(stepResultArray);

        resultArray.set(stepResultArray, generatedSize);
        generatedSize += sizeToGenerate;
    }

    return resultArray;
}
