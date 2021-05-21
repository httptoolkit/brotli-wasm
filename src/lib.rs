use brotli;
use wasm_bindgen::prelude::*;

#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

fn set_panic_hook() {
    #[cfg(feature="console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

#[wasm_bindgen(js_name = compress)]
pub fn compress(buf: Box<[u8]>) -> Result<Box<[u8]>, JsValue> {
    set_panic_hook();
    let mut out = Vec::<u8>::new();
    let params = brotli::enc::BrotliEncoderParams::default();
    match brotli::BrotliCompress(&mut buf.as_ref(), &mut out, &params) {
        Ok(_) => (),
        Err(_) => return Err(JsValue::from_str("brotli dec failed")),
    }
    Ok(out.into_boxed_slice())
}

#[wasm_bindgen(js_name = decompress)]
pub fn decompress(buf: Box<[u8]>) -> Result<Box<[u8]>, JsValue> {
    set_panic_hook();
    let mut out = Vec::<u8>::new();
    match brotli::BrotliDecompress(&mut buf.as_ref(), &mut out) {
        Ok(_) => (),
        Err(_) => return Err(JsValue::from_str("brotli dec failed")),
    }
    Ok(out.into_boxed_slice())
}