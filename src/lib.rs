use brotli;
use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};

#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

fn set_panic_hook() {
    #[cfg(feature="console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

#[wasm_bindgen(typescript_custom_section)]
const TS_APPEND_CONTENT: &'static str = r#"

type Options = {
    quality?: number
};

export function compress(buf: Uint8Array, options?: Options): Uint8Array;
"#;

#[derive(Serialize, Deserialize)]
pub struct Options {
    #[serde(default = "default_quality")]
    pub quality: i32
}

fn default_quality() -> i32 { 11 }

#[wasm_bindgen(js_name = compress, skip_typescript)]
pub fn compress(buf: Box<[u8]>, raw_options: &JsValue) -> Result<Box<[u8]>, JsValue> {
    set_panic_hook();

    let options: Options;
    if raw_options.is_undefined() {
        options = serde_json::from_str("{}").unwrap();
    } else if raw_options.is_object() {
        options = raw_options.into_serde().unwrap();
    } else {
        return Err(JsValue::from_str("Options is not an object"));
    }
    
    let mut out = Vec::<u8>::new();
    let mut params = brotli::enc::BrotliEncoderParams::default();
    params.quality = options.quality;

    match brotli::BrotliCompress(&mut buf.as_ref(), &mut out, &params) {
        Ok(_) => (),
        Err(e) => return Err(JsValue::from_str(&format!(
            "Brotli compress failed: {:?}", e
        ))),
    }

    Ok(out.into_boxed_slice())
}

#[wasm_bindgen(js_name = decompress)]
pub fn decompress(buf: Box<[u8]>) -> Result<Box<[u8]>, JsValue> {
    set_panic_hook();
    let mut out = Vec::<u8>::new();

    match brotli::BrotliDecompress(&mut buf.as_ref(), &mut out) {
        Ok(_) => (),
        Err(e) => return Err(JsValue::from_str(&format!(
            "Brotli decompress failed: {:?}", e
        ))),
    }

    Ok(out.into_boxed_slice())
}