// The web version needs to be explicitly initiated, but we want the API to be the same
// as the bundler version, so we write this small wrapper to make it work.
import init, * as brotliWasm from "./pkg.web/brotli_wasm";

export default initOpts => init(initOpts).then(() => brotliWasm);