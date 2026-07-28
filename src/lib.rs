pub mod stream;

use brotli;
use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};

pub fn set_panic_hook() {
    #[cfg(feature="console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

#[wasm_bindgen(typescript_custom_section)]
const TS_APPEND_CONTENT: &'static str = r#"

type Options = {
    quality?: number
    customDictionary?: Uint8Array
};

type DecompressOptions = {
    customDictionary?: Uint8Array
};

export function compress(buf: Uint8Array, options?: Options): Uint8Array;
export function decompress(buf: Uint8Array, options?: DecompressOptions): Uint8Array;
"#;

#[derive(Serialize, Deserialize)]
#[serde(default)]
pub struct Options {
    pub quality: i32,
    #[serde(rename = "customDictionary")]
    pub custom_dictionary: Option<Vec<u8>>,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            quality: default_quality(),
            custom_dictionary: None,
        }
    }
}

fn default_quality() -> i32 { 11 }

#[derive(Serialize, Deserialize, Default)]
#[serde(default)]
pub struct DecompressOptions {
    #[serde(rename = "customDictionary")]
    pub custom_dictionary: Option<Vec<u8>>,
}

#[wasm_bindgen(js_name = compress, skip_typescript)]
pub fn compress(buf: Box<[u8]>, raw_options: &JsValue) -> Result<Box<[u8]>, JsValue> {
    set_panic_hook();

    let options: Options;
    if raw_options.is_undefined() {
        options = Options::default();
    } else if raw_options.is_object() {
        options = serde_wasm_bindgen::from_value(raw_options.clone())
            .map_err(|e| JsValue::from_str(&format!("Invalid options: {}", e)))?;
    } else {
        return Err(JsValue::from_str("Options is not an object"));
    }

    let mut out = Vec::<u8>::new();
    let mut params = brotli::enc::BrotliEncoderParams::default();
    params.quality = options.quality;

    let result = match &options.custom_dictionary {
        Some(dict) if !dict.is_empty() => {
            let mut input_buffer: [u8; 4096] = [0; 4096];
            let mut output_buffer: [u8; 4096] = [0; 4096];
            let mut nop_callback = |_data: &mut brotli::interface::PredictionModeContextMap<
                brotli::interface::InputReferenceMut,
            >,
                                    _cmds: &mut [brotli::interface::StaticCommand],
                                    _mb: brotli::interface::InputPair,
                                    _mfv: &mut brotli::enc::StandardAlloc| ();
            brotli::enc::BrotliCompressCustomIoCustomDict(
                &mut brotli::IoReaderWrapper(&mut buf.as_ref()),
                &mut brotli::IoWriterWrapper(&mut out),
                &mut input_buffer[..],
                &mut output_buffer[..],
                &params,
                brotli::enc::StandardAlloc::default(),
                &mut nop_callback,
                dict,
                std::io::Error::new(std::io::ErrorKind::UnexpectedEof, "Unexpected EOF"),
            )
            .map(|_| ())
        }
        _ => brotli::BrotliCompress(&mut buf.as_ref(), &mut out, &params).map(|_| ()),
    };

    match result {
        Ok(_) => Ok(out.into_boxed_slice()),
        Err(e) => Err(JsValue::from_str(&format!(
            "Brotli compress failed: {:?}", e
        ))),
    }
}

#[wasm_bindgen(js_name = decompress, skip_typescript)]
pub fn decompress(buf: Box<[u8]>, raw_options: &JsValue) -> Result<Box<[u8]>, JsValue> {
    set_panic_hook();

    let options: DecompressOptions;
    if raw_options.is_undefined() {
        options = DecompressOptions::default();
    } else if raw_options.is_object() {
        options = serde_wasm_bindgen::from_value(raw_options.clone())
            .map_err(|e| JsValue::from_str(&format!("Invalid options: {}", e)))?;
    } else {
        return Err(JsValue::from_str("Options is not an object"));
    }

    let mut out = Vec::<u8>::new();

    let result = match &options.custom_dictionary {
        Some(dict) if !dict.is_empty() => {
            let mut input_buffer: [u8; 4096] = [0; 4096];
            let mut output_buffer: [u8; 4096] = [0; 4096];
            let mut alloc_u8 = brotli::enc::StandardAlloc::default();
            let mut dict_mem = brotli::Allocator::alloc_cell(&mut alloc_u8, dict.len());
            brotli::SliceWrapperMut::slice_mut(&mut dict_mem).copy_from_slice(dict);
            brotli::BrotliDecompressCustomIoCustomDict(
                &mut brotli::IoReaderWrapper(&mut buf.as_ref()),
                &mut brotli::IoWriterWrapper(&mut out),
                &mut input_buffer[..],
                &mut output_buffer[..],
                alloc_u8,
                brotli::enc::StandardAlloc::default(),
                brotli::enc::StandardAlloc::default(),
                dict_mem,
                std::io::Error::new(std::io::ErrorKind::UnexpectedEof, "Unexpected EOF"),
            )
        }
        _ => brotli::BrotliDecompress(&mut buf.as_ref(), &mut out),
    };

    match result {
        Ok(_) => Ok(out.into_boxed_slice()),
        Err(e) => Err(JsValue::from_str(&format!(
            "Brotli decompress failed: {:?}", e
        ))),
    }
}
