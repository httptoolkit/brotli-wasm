// This makes importing wasm-brotli asynchronous (because of dynamic import).
// This is needed here for Webpack v4 or v5 syncWebAssembly, which don't
// allow synchronous import of WebAssembly from an entrypoint.
//
// Trap recovery: a WASM trap (RuntimeError) bricks the instance. The brotli bug that caused
// the known trap is fixed in the vendored crate; if a trap ever occurs, recover by
// re-importing this module (or re-importing "./pkg.bundler/brotli_wasm.js"), which builds a
// fresh WebAssembly instance. (The synchronous Node wrapper auto-recovers via reinit().)
module.exports = import("./pkg.bundler/brotli_wasm.js");

// In addition, we provide a default export with the same value, for compatibility
// with the pure ESM web bundle:
module.exports.default = module.exports;

// Without this, ts-loader gets annoyed by imports for the pure type. Clear ts-loader bug,
// but this is a quick & easy fix on our end:
module.exports.BrotliWasmType = undefined;