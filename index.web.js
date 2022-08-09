// In pure ESM web bundles, you must call init() and wait for the promised result before you can
// call any module methods. To make that as easy as possible, this module directly exposes the
// init() promise result, and returns the methods at the end of the promise.
import init, * as brotliWasm from "./pkg.web/brotli_wasm";
export default init().then(() => brotliWasm);