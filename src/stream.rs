use crate::set_panic_hook;
use brotli::enc::StandardAlloc; // Re-exported from alloc_stdlib::StandardAlloc
use brotli::{BrotliDecompressStream, BrotliResult, BrotliState};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[repr(i32)]
pub enum BrotliStreamResult {
    /// The stream is just initialized and no input is provided currently.
    /// `BrotliResult` uses `ResultFailure = 0`, but as we will convert `ResultFailure` to a negative actual error code,
    /// 0 is reused as no input currently.
    Init = 0,
    ResultSuccess = 1,
    NeedsMoreInput = 2,
    NeedsMoreOutput = 3,
}

#[wasm_bindgen]
pub struct CompressStream {}

#[wasm_bindgen]
impl CompressStream {}

#[wasm_bindgen]
pub struct DecompressStream {
    state: BrotliState<StandardAlloc, StandardAlloc, StandardAlloc>,
    result: i32,
    total_out: usize,
}

#[wasm_bindgen]
impl DecompressStream {
    #[allow(clippy::new_without_default)]
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        set_panic_hook();
        let alloc = StandardAlloc::default();
        Self {
            state: BrotliState::new(alloc, alloc, alloc),
            result: BrotliStreamResult::Init as i32,
            total_out: 0,
        }
    }

    pub fn decompress(
        &mut self,
        input: Box<[u8]>,
        output_size: usize,
    ) -> Result<Box<[u8]>, JsValue> {
        let mut output = vec![0; output_size];
        let mut available_in = input.len();
        let mut input_offset = 0;
        let mut available_out = output_size;
        let mut output_offset = 0;
        match BrotliDecompressStream(
            &mut available_in,
            &mut input_offset,
            &input,
            &mut available_out,
            &mut output_offset,
            &mut output,
            &mut self.total_out,
            &mut self.state,
        ) {
            BrotliResult::ResultFailure => {
                // It should be a negative error code
                self.result = self.state.error_code as i32;
                Err(JsValue::from_str(&format!(
                    "Brotli streaming decompress failed: Error code {}",
                    self.result
                )))
            }
            BrotliResult::NeedsMoreOutput => {
                self.result = BrotliStreamResult::NeedsMoreOutput as i32;
                Ok(output.into_boxed_slice())
            }
            BrotliResult::ResultSuccess => {
                output.truncate(output_offset);
                self.result = BrotliStreamResult::ResultSuccess as i32;
                Ok(output.into_boxed_slice())
            }
            BrotliResult::NeedsMoreInput => {
                output.truncate(output_offset);
                self.result = BrotliStreamResult::NeedsMoreInput as i32;
                Ok(output.into_boxed_slice())
            }
        }
    }

    pub fn total_out(&self) -> usize {
        self.total_out
    }

    pub fn result(&self) -> i32 {
        self.result
    }
}
