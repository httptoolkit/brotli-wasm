// In Node, the WASM module is loaded synchronously via the wasm-bindgen glue. A WASM trap
// (e.g. an encoder panic surfaced as `RuntimeError: unreachable`) leaves the module instance
// permanently unusable, so one bad input would otherwise DoS every subsequent call in the
// process. The brotli bug that originally caused this is fixed in the vendored crate, but we
// harden the wrapper: any trap re-instantiates the module (cache-busted re-require) before
// rethrowing, so the failing call still reports its error while the *next* call works again.
const path = require('path');
const wasmRelPath = './pkg.node/brotli_wasm';

/**
 * Load (or reload) the wasm-bindgen Node glue, creating a brand-new WebAssembly instance.
 * Why this exists: a trapped instance cannot be reused, so we drop the cached glue module
 * (and its sibling files under pkg.node) and re-require it to get a fresh instance + glue.
 */
function loadFresh() {
    const pkgDir = path.dirname(require.resolve(wasmRelPath));
    for (const key of Object.keys(require.cache)) {
        if (key === pkgDir || key.startsWith(pkgDir + path.sep)) {
            delete require.cache[key];
        }
    }
    return require(wasmRelPath);
}

let active = loadFresh();

/** True when an error looks like a WASM trap (the cases that poison the instance). */
function isTrapError(err) {
    return (
        (typeof WebAssembly !== 'undefined' && err instanceof WebAssembly.RuntimeError) ||
        !!(err && /RuntimeError|unreachable/.test(String((err && err.message) || err)))
    );
}

/** Re-instantiate the WASM module; call after a trap to recover the process's encoder. */
function reinit() {
    active = loadFresh();
}

// Invoke `active[method]`; on a trap, swap in a fresh instance for future calls, then rethrow.
// This also lazily recovers from traps caused elsewhere (e.g. inside streaming classes),
// because the next wrapped (de)compress call re-instantiates the poisoned `active`.
function callRecovering(method, args) {
    try {
        return active[method](...args);
    } catch (err) {
        if (isTrapError(err)) active = loadFresh();
        throw err;
    }
}

const wrapper = {
    reinit,
    compress: (...args) => callRecovering('compress', args),
    decompress: (...args) => callRecovering('decompress', args),
};

// Re-export everything else (CompressStream, DecompressStream, BrotliStreamResultCode, ...)
// by reference, read live from the current instance so a post-trap reinit is transparent.
for (const k of Object.keys(active)) {
    if (!(k in wrapper)) {
        Object.defineProperty(wrapper, k, { get: () => active[k], enumerable: true });
    }
}

module.exports = wrapper;
// Match the pure ESM web bundle: a default export that resolves to the API.
module.exports.default = Promise.resolve(wrapper);
