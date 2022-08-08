import { InitInput, InitOutput } from './pkg.web/brotli_wasm';
import * as BrotliTypes from './pkg.web/brotli_wasm';
export default function init(
    module_or_path?: InitInput | Promise<InitInput>
): Promise<typeof BrotliTypes>;
