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

    it("can decompress data", () => {
        // Generated with: echo -n '$CONTENT' | brotli --stdout - | base64
        const input = Buffer.from('GxoAABypU587dC0k9ianQOgqjS32iUTcCA==', 'base64');
        const result = brotli.decompress(input);
        expect(Buffer.from(result).toString('utf8')).to.equal('Brotli brotli brotli brotli');
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
});