import * as BrotliWasm from './pkg.node/brotli_wasm';

// Re-export the core API - although this will only work OOTB for node usage.
export * from './pkg.node/brotli_wasm';

declare const promisedValue: Promise<typeof BrotliWasm>;
export default promisedValue;

export type BrotliWasmType = typeof BrotliWasm;

import type { InitInput, InitOutput } from './pkg.web/brotli_wasm';

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* If this project's target is `cloudflare-workers`, you must use this.
* If you use web, this function will return a promise that resolves to the
* `BrotliWasm` module, which you can use directly.
* But if you use other targets, this function will return the void type.
*
* @param {InitInput | Promise<InitInput>} module_or_path
*
* @returns {Promise<InitOutput>}
*/
export function init (module_or_path?: InitInput | Promise<InitInput>): Promise<InitOutput | void>;
