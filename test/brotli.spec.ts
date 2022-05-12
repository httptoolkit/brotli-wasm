import { expect } from 'chai';
import * as brotliPromise from '..';

describe("Brotli-wasm", () => {

    let brotli: typeof import('..');
    beforeEach(async () => {
        brotli = await brotliPromise;
    });

    it("can compress data", () => {
        const input = Buffer.from("Test input data");
        const result = brotli.compress(input);
        expect(Buffer.from(result).toString('base64')).to.equal('Gw4A+KWpyubolCCjVAjmxJ4D');
    });

    it("can compress data with a different quality setting", () => {
        const input = Buffer.from("Test input data");
        const result = brotli.compress(input, { quality: 1 });
        expect(Buffer.from(result).toString('base64')).to.equal('CweAVGVzdCBpbnB1dCBkYXRhAw==');
    });

    it("can decompress data", () => {
        // Generated with: echo -n '$CONTENT' | brotli --stdout - | base64
        const input = Buffer.from('GxoAABypU587dC0k9ianQOgqjS32iUTcCA==', 'base64');
        const result = brotli.decompress(input);
        expect(Buffer.from(result).toString('utf8')).to.equal('Brotli brotli brotli brotli');
    });

    it("cleanly fails when options is something other than an object", () => {
        const input = Buffer.from("Test input data");
        expect(() =>
            brotli.compress(input, "this should not be a string" as any)
        ).to.throw('Options is not an object');
    });

    it("does not fail when options contain unknown properties", () => {
        const input = Buffer.from("Test input data");
        const result = brotli.compress(input, { someRandomKey: 1, quality: 5 } as any);
        expect(Buffer.from(result).toString('base64')).to.equal('CweAVGVzdCBpbnB1dCBkYXRhAw==');
    });

    it("does not fail when compressing with an illegal quality value", () => {
        const input = Buffer.from("Test input data");
        const result = brotli.compress(input, { quality: 12 });
        expect(Buffer.from(result).toString('base64')).to.equal('Gw4A+KWpyubolCCjVAjmxJ4D');
    });

    it("cleanly fails when decompressing garbage", () => {
        const input = Buffer.from("This is not brotli data, it's just a string");
        expect(() =>
            brotli.decompress(input)
        ).to.throw('Brotli decompress failed');
    });

    it("can compress & decompress back to the original result", () => {
        const input = "Some thrilling text I urgently need to compress";
        const result = Buffer.from(
            brotli.decompress(brotli.compress(Buffer.from(input)))
        ).toString('utf8');
        expect(result).to.equal(input);
    });

    it("can compress & decompress back to the original result with a different quality setting", () => {
        const input = "Some thrilling text I urgently need to compress";
        const result = Buffer.from(
            brotli.decompress(brotli.compress(Buffer.from(input), { quality: 3 }))
        ).toString('utf8');
        expect(result).to.equal(input);
    });

    it("can streamingly compress data", () => {
        const input = Buffer.from("Test input data");
        const input1 = input.slice(0, input.length / 2);
        const input2 = input.slice(input.length / 2);
        const stream = new brotli.CompressStream();
        const output1 = stream.compress(input1, 100);
        expect(stream.result()).to.equal(brotli.BrotliStreamResult.NeedsMoreInput);
        const output2 = stream.compress(input2, 100);
        expect(stream.result()).to.equal(brotli.BrotliStreamResult.NeedsMoreInput);
        const output3 = stream.compress(undefined, 100);
        expect(stream.result()).to.equal(brotli.BrotliStreamResult.ResultSuccess);
        expect(Buffer.concat([output1, output2, output3]).toString('base64')).to.equal('Gw4A+KWpyubolCCjVAjmxJ4D');
    });

    it("can streamingly compress data with a different quality setting", () => {
        const input = Buffer.from("Test input data");
        const input1 = input.slice(0, input.length / 2);
        const input2 = input.slice(input.length / 2);
        const quality = 1;
        const stream = new brotli.CompressStream(quality);
        const output1 = stream.compress(input1, 100);
        expect(stream.result()).to.equal(brotli.BrotliStreamResult.NeedsMoreInput);
        const output2 = stream.compress(input2, 100);
        expect(stream.result()).to.equal(brotli.BrotliStreamResult.NeedsMoreInput);
        const output3 = stream.compress(undefined, 100);
        expect(stream.result()).to.equal(brotli.BrotliStreamResult.ResultSuccess);
        // It will be different from non-streaming result.
        // But it can still be decompressed back to the original string.
        let output = Buffer.concat([output1, output2, output3]);
        expect(Buffer.from(brotli.decompress(output)).toString('base64')).to.equal(input.toString('base64'));
    });

    it("can streamingly decompress data", () => {
        // Generated with: echo -n '$CONTENT' | brotli --stdout - | base64
        const input = Buffer.from('GxoAABypU587dC0k9ianQOgqjS32iUTcCA==', 'base64');
        const input1 = input.slice(0, input.length / 2);
        const input2 = input.slice(input.length / 2);
        const stream = new brotli.DecompressStream();
        const output1 = stream.decompress(input1, 100);
        expect(stream.result()).to.equal(brotli.BrotliStreamResult.NeedsMoreInput);
        const output2 = stream.decompress(input2, 100);
        expect(stream.result()).to.equal(brotli.BrotliStreamResult.ResultSuccess);
        expect(Buffer.concat([output1, output2]).toString('utf8')).to.equal('Brotli brotli brotli brotli');
    });

    it("does not fail when streamingly compressing with an illegal quality value", () => {
        const input = Buffer.from("Test input data");
        const input1 = input.slice(0, input.length / 2);
        const input2 = input.slice(input.length / 2);
        const quality = 12;
        const stream = new brotli.CompressStream(quality);
        const output1 = stream.compress(input1, 100);
        expect(stream.result()).to.equal(brotli.BrotliStreamResult.NeedsMoreInput);
        const output2 = stream.compress(input2, 100);
        expect(stream.result()).to.equal(brotli.BrotliStreamResult.NeedsMoreInput);
        const output3 = stream.compress(undefined, 100);
        expect(stream.result()).to.equal(brotli.BrotliStreamResult.ResultSuccess);
        expect(Buffer.concat([output1, output2, output3]).toString('base64')).to.equal('Gw4A+KWpyubolCCjVAjmxJ4D');
    });

    it("cleanly fails when streamingly decompressing garbage", () => {
        const input = Buffer.from("This is not brotli data, it's just a string");
        const stream = new brotli.DecompressStream();
        expect(() =>
            stream.decompress(input, 100)
        ).to.throw('Brotli streaming decompress failed');
        expect(stream.result()).to.lt(0);
    });

    it("can streamingly compress & decompress back to the original result", () => {
        const s = "Some thrilling text I urgently need to compress";
        const encInput = Buffer.from(s);
        const encInput1 = encInput.slice(0, encInput.length / 2);
        const encInput2 = encInput.slice(encInput.length / 2);
        const encStream = new brotli.CompressStream();
        const encOutput1 = encStream.compress(encInput1, 100);
        expect(encStream.result()).to.equal(brotli.BrotliStreamResult.NeedsMoreInput);
        const encOutput2 = encStream.compress(encInput2, 100);
        expect(encStream.result()).to.equal(brotli.BrotliStreamResult.NeedsMoreInput);
        const encOutput3 = encStream.compress(undefined, 100);
        expect(encStream.result()).to.equal(brotli.BrotliStreamResult.ResultSuccess);
        const encOutput = Buffer.concat([encOutput1, encOutput2, encOutput3]);

        const decInput1 = encOutput.slice(0, encOutput.length / 2);
        const decInput2 = encOutput.slice(encOutput.length / 2);
        const decStream = new brotli.DecompressStream();
        const decOutput1 = decStream.decompress(decInput1, 100);
        expect(decStream.result()).to.equal(brotli.BrotliStreamResult.NeedsMoreInput);
        const decOutput2 = decStream.decompress(decInput2, 100);
        expect(decStream.result()).to.equal(brotli.BrotliStreamResult.ResultSuccess);
        const decOutput = Buffer.concat([decOutput1, decOutput2]);

        expect(decOutput.toString('utf8')).to.equal(s);
    });

    it("can streamingly compress & decompress back to the original result with a different quality setting", () => {
        const s = "Some thrilling text I urgently need to compress";
        const encInput = Buffer.from(s);
        const encInput1 = encInput.slice(0, encInput.length / 2);
        const encInput2 = encInput.slice(encInput.length / 2);
        const quality = 3;
        const encStream = new brotli.CompressStream(quality);
        const encOutput1 = encStream.compress(encInput1, 100);
        expect(encStream.result()).to.equal(brotli.BrotliStreamResult.NeedsMoreInput);
        const encOutput2 = encStream.compress(encInput2, 100);
        expect(encStream.result()).to.equal(brotli.BrotliStreamResult.NeedsMoreInput);
        const encOutput3 = encStream.compress(undefined, 100);
        expect(encStream.result()).to.equal(brotli.BrotliStreamResult.ResultSuccess);
        const encOutput = Buffer.concat([encOutput1, encOutput2, encOutput3]);

        const decInput1 = encOutput.slice(0, encOutput.length / 2);
        const decInput2 = encOutput.slice(encOutput.length / 2);
        const decStream = new brotli.DecompressStream();
        const decOutput1 = decStream.decompress(decInput1, 100);
        expect(decStream.result()).to.equal(brotli.BrotliStreamResult.NeedsMoreInput);
        const decOutput2 = decStream.decompress(decInput2, 100);
        expect(decStream.result()).to.equal(brotli.BrotliStreamResult.ResultSuccess);
        const decOutput = Buffer.concat([decOutput1, decOutput2]);

        expect(decOutput.toString('utf8')).to.equal(s);
    });

    it("streaming compressing can handle needing more output when action is process", () => {
        // The input should be more than about 1.6MB with enough randomness
        // to make the compressor ask for more output space when the action is PROCESS
        const input = genRandBytes(1600000);
        const stream = new brotli.CompressStream();
        const output1 = stream.compress(input, 1);
        expect(stream.result()).to.equal(brotli.BrotliStreamResult.NeedsMoreOutput);
        const output2 = stream.compress(input.slice(stream.last_input_offset()), 1500000);
        expect(stream.result()).to.equal(brotli.BrotliStreamResult.NeedsMoreInput);
        const output3 = stream.compress(undefined, 1640000);
        expect(stream.result()).to.equal(brotli.BrotliStreamResult.ResultSuccess);
        const output = Buffer.concat([output1, output2, output3]);
        expect(Buffer.from(brotli.decompress(output)).toString('base64')).to.equal(input.toString('base64'));
    });

    it("streaming decompressing can handle needing more output", () => {
        const input = Buffer.from('GxoAABypU587dC0k9ianQOgqjS32iUTcCA==', 'base64');
        const stream = new brotli.DecompressStream();
        const output1 = stream.decompress(input, 1);
        expect(stream.result()).to.equal(brotli.BrotliStreamResult.NeedsMoreOutput);
        const output2 = stream.decompress(input.slice(stream.last_input_offset()), 100);
        expect(stream.result()).to.equal(brotli.BrotliStreamResult.ResultSuccess);
        expect(Buffer.concat([output1, output2]).toString('utf8')).to.equal('Brotli brotli brotli brotli');
    });
});

/**
 * Generate random bytes for tests
 * @param size Must be a multiple of 4
 */
function genRandBytes(size: number) {
    const buf = [] as number[];
    for (let i = 0; i < size / 4; i++) {
        const rand = Math.floor(Math.random() * Math.pow(2, 32));
        buf.push((rand >> 0) & 0xff);
        buf.push((rand >> 8) & 0xff);
        buf.push((rand >> 16) & 0xff);
        buf.push((rand >> 24) & 0xff);
    }
    return Buffer.from(buf);
}
