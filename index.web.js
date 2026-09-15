// In pure ESM web bundles, you must call init() and wait for the promised result before you can
// call any module methods. To make that as easy as possible, this module directly exposes the
// init() promise result, and returns the methods at the end of the promise.
// https://github.com/WICG/import-maps?tab=readme-ov-file#extension-less-imports
// For usage with an importmap, it's convenient to add the ".js" extension here, because browsers
// don't try to guess the file extension.
//
// Trap recovery: a WASM trap (RuntimeError) bricks the instance. The brotli bug that caused the
// known trap is fixed in the vendored crate, so this should not occur; if it ever does, recover
// by re-instantiating — call `await init()` again (or re-import this module), which builds a
// fresh WebAssembly instance via the wasm-bindgen web glue.
import init, * as brotliWasm from "./pkg.web/brotli_wasm.js";
export default init().then(() => brotliWasm);