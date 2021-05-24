// This makes importing wasm-brotli asynchronous (because of dynamic import).
// This is needed here for Webpack v4 or v5 syncWebAssembly, which don't
// allow synchronous import of WebAssembly from an entrypoint.
module.exports = import("./pkg.bundler/brotli_wasm.js");

// We don't want to do this for _all_ usage, because dynamic import isn't
// supported in older node versions.