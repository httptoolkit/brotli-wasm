use crate::set_panic_hook;
use brotli::enc::encode::{
    BrotliEncoderDestroyInstance, BrotliEncoderOperation, BrotliEncoderParameter,
    BrotliEncoderStateStruct,
};
use brotli::enc::StandardAlloc; // Re-exported from alloc_stdlib::StandardAlloc
use brotli::{self, BrotliDecompressStream, BrotliResult, BrotliState};
use wasm_bindgen::prelude::*;

/// Returned by every successful (de)compression.
//
// Use `getter_with_clone` because `buf` does not implement `Copy`.
#[wasm_bindgen(getter_with_clone)]
pub struct BrotliStreamResult {
    /// Result code.
    ///
    /// See [`BrotliStreamResultCode`] for available values.
    ///
    /// When error, the error code is not passed here but rather goes to `Err`.
    pub code: BrotliStreamResultCode,
    /// Output buffer
    pub buf: Box<[u8]>,
    /// Consumed bytes of the input buffer
    pub input_offset: usize,
}

#[wasm_bindgen]
/// Same as [`brotli::BrotliResult`] except [`brotli::BrotliResult::ResultFailure`].
///
/// Always `> 0`.
///
/// `ResultFailure` is removed
/// because we will convert the failure to an actual negative error code (if available) and pass it elsewhere.
#[repr(usize)]
#[derive(Copy, Clone)]
pub enum BrotliStreamResultCode {
    ResultSuccess = 1,
    NeedsMoreInput = 2,
    NeedsMoreOutput = 3,
}

#[wasm_bindgen]
pub struct CompressStream {
    state: BrotliEncoderStateStruct<StandardAlloc>,
    total_out: usize,
}

impl Drop for CompressStream {
    fn drop(&mut self) {
        BrotliEncoderDestroyInstance(&mut self.state);
    }
}

#[wasm_bindgen]
impl CompressStream {
    #[wasm_bindgen(constructor)]
    pub fn new(quality: Option<u32>) -> CompressStream {
        set_panic_hook();
        let alloc = StandardAlloc::default();
        let mut state = BrotliEncoderStateStruct::new(alloc);
        match quality {
            None => (),
            Some(quality) => {
                state.set_parameter(BrotliEncoderParameter::BROTLI_PARAM_QUALITY, quality);
            }
        }
        Self {
            state,
            total_out: 0,
        }
    }

    pub fn compress(
        &mut self,
        input_opt: Option<Box<[u8]>>,
        output_size: usize,
    ) -> Result<BrotliStreamResult, JsError> {
        let mut nop_callback = |_data: &mut brotli::interface::PredictionModeContextMap<
            brotli::interface::InputReferenceMut,
        >,
                                _cmds: &mut [brotli::interface::StaticCommand],
                                _mb: brotli::interface::InputPair,
                                _mfv: &mut StandardAlloc| ();
        let mut output = vec![0; output_size];
        let mut input_offset = 0;
        let mut available_out = output_size;
        let mut output_offset = 0;
        match input_opt {
            Some(input) => {
                let op = BrotliEncoderOperation::BROTLI_OPERATION_PROCESS;
                let mut available_in = input.len();
                // `BrotliEncoderCompressStream` does not return a `BrotliResult` but returns a boolean,
                // which is different from `BrotliDecompressStream`.
                // But the requirement for input/output buf is common so we reused `BrotliStreamResult` to report it.
                if self.state.compress_stream(
                    op,
                    &mut available_in,
                    &input,
                    &mut input_offset,
                    &mut available_out,
                    &mut output,
                    &mut output_offset,
                    &mut Some(self.total_out),
                    &mut nop_callback,
                ) {
                    if available_in == 0 {
                        output.truncate(output_offset);
                        Ok(BrotliStreamResult {
                            code: BrotliStreamResultCode::NeedsMoreInput,
                            buf: output.into_boxed_slice(),
                            input_offset,
                        })
                    } else if available_out == 0 {
                        Ok(BrotliStreamResult {
                            code: BrotliStreamResultCode::NeedsMoreOutput,
                            buf: output.into_boxed_slice(),
                            input_offset,
                        })
                    } else {
                        Err(JsError::new("Unexpected Brotli streaming compress: both available_in & available_out are not 0 after a successful processing"))
                    }
                } else {
                    Err(JsError::new(
                        "Brotli streaming compress failed: When processing",
                    ))
                }
            }
            None => {
                let op = BrotliEncoderOperation::BROTLI_OPERATION_FINISH;
                let input = Vec::new().into_boxed_slice();
                let mut available_in = 0;
                while !self.state.is_finished() && available_out > 0 {
                    if !self.state.compress_stream(
                        op,
                        &mut available_in,
                        &input,
                        &mut input_offset,
                        &mut available_out,
                        &mut output,
                        &mut output_offset,
                        &mut Some(self.total_out),
                        &mut nop_callback,
                    ) {
                        return Err(JsError::new(
                            "Brotli streaming compress failed: When finishing",
                        ));
                    }
                }
                if available_out == 0 {
                    Ok(BrotliStreamResult {
                        code: BrotliStreamResultCode::NeedsMoreOutput,
                        buf: output.into_boxed_slice(),
                        input_offset,
                    })
                } else {
                    output.truncate(output_offset);
                    Ok(BrotliStreamResult {
                        code: BrotliStreamResultCode::ResultSuccess,
                        buf: output.into_boxed_slice(),
                        input_offset,
                    })
                }
            }
        }
    }

    pub fn total_out(&self) -> usize {
        self.total_out
    }
}

#[wasm_bindgen]
pub struct DecompressStream {
    state: BrotliState<StandardAlloc, StandardAlloc, StandardAlloc>,
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
            total_out: 0,
        }
    }

    pub fn decompress(
        &mut self,
        input: Box<[u8]>,
        output_size: usize,
    ) -> Result<BrotliStreamResult, JsError> {
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
                let err_code = self.state.error_code as i32;
                Err(JsError::new(&format!(
                    "Brotli streaming decompress failed: Error code {}",
                    err_code
                )))
            }
            BrotliResult::NeedsMoreOutput => Ok(BrotliStreamResult {
                code: BrotliStreamResultCode::NeedsMoreOutput,
                buf: output.into_boxed_slice(),
                input_offset,
            }),
            BrotliResult::ResultSuccess => {
                output.truncate(output_offset);
                Ok(BrotliStreamResult {
                    code: BrotliStreamResultCode::ResultSuccess,
                    buf: output.into_boxed_slice(),
                    input_offset,
                })
            }
            BrotliResult::NeedsMoreInput => {
                output.truncate(output_offset);
                Ok(BrotliStreamResult {
                    code: BrotliStreamResultCode::NeedsMoreInput,
                    buf: output.into_boxed_slice(),
                    input_offset,
                })
            }
        }
    }

    pub fn total_out(&self) -> usize {
        self.total_out
    }
}
