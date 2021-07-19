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
});
