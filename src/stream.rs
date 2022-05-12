use crate::set_panic_hook;
use brotli::enc::encode::{
    BrotliEncoderCompressStream, BrotliEncoderCreateInstance, BrotliEncoderDestroyInstance,
    BrotliEncoderIsFinished, BrotliEncoderOperation, BrotliEncoderParameter,
    BrotliEncoderSetParameter, BrotliEncoderStateStruct,
};
use brotli::enc::StandardAlloc; // Re-exported from alloc_stdlib::StandardAlloc
use brotli::{self, BrotliDecompressStream, BrotliResult, BrotliState};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[repr(i32)]
pub enum BrotliStreamResult {
    /// The stream is just initialized and no input is provided currently.
    /// `BrotliResult` uses `ResultFailure = 0`, but as we will convert `ResultFailure` to a negative actual error code,
    /// 0 is reused as no input currently.
    /// As for Brotli compressing, since offical API does not provide a way to retrieve a detailed error code, -1 is used.
    Init = 0,
    ResultSuccess = 1,
    NeedsMoreInput = 2,
    NeedsMoreOutput = 3,
}

#[wasm_bindgen]
pub struct CompressStream {
    state: BrotliEncoderStateStruct<StandardAlloc>,
    result: i32,
    total_out: usize,
    last_input_offset: usize,
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
        let mut state = BrotliEncoderCreateInstance(alloc);
        match quality {
            None => (),
            Some(quality) => {
                BrotliEncoderSetParameter(
                    &mut state,
                    BrotliEncoderParameter::BROTLI_PARAM_QUALITY,
                    quality,
                );
            }
        }
        Self {
            state,
            result: BrotliStreamResult::Init as i32,
            total_out: 0,
            last_input_offset: 0,
        }
    }

    pub fn compress(
        &mut self,
        input_opt: Option<Box<[u8]>>,
        output_size: usize,
    ) -> Result<Box<[u8]>, JsValue> {
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
                let ret = BrotliEncoderCompressStream(
                    &mut self.state,
                    op,
                    &mut available_in,
                    &input,
                    &mut input_offset,
                    &mut available_out,
                    &mut output,
                    &mut output_offset,
                    &mut Some(self.total_out),
                    &mut nop_callback,
                );
                if ret != 0 {
                    if available_in == 0 {
                        output.truncate(output_offset);
                        self.result = BrotliStreamResult::NeedsMoreInput as i32;
                        self.last_input_offset = input.len();
                        Ok(output.into_boxed_slice())
                    } else if available_out == 0 {
                        self.result = BrotliStreamResult::NeedsMoreOutput as i32;
                        self.last_input_offset = input_offset;
                        Ok(output.into_boxed_slice())
                    } else {
                        self.result = -1;
                        self.last_input_offset = 0;
                        Err(JsValue::from_str("Unexpected Brotli streaming compress: both available_in & available_out are not 0 after a successful processing"))
                    }
                } else {
                    self.result = -1;
                    self.last_input_offset = 0;
                    Err(JsValue::from_str(
                        "Brotli streaming compress failed: When processing",
                    ))
                }
            }
            None => {
                let op = BrotliEncoderOperation::BROTLI_OPERATION_FINISH;
                let input = Vec::new().into_boxed_slice();
                let mut available_in = 0;
                while BrotliEncoderIsFinished(&mut self.state) == 0 && available_out > 0 {
                    let ret = BrotliEncoderCompressStream(
                        &mut self.state,
                        op,
                        &mut available_in,
                        &input,
                        &mut input_offset,
                        &mut available_out,
                        &mut output,
                        &mut output_offset,
                        &mut Some(self.total_out),
                        &mut nop_callback,
                    );
                    if ret == 0 {
                        self.result = -1;
                        return Err(JsValue::from_str(
                            "Brotli streaming compress failed: When finishing",
                        ));
                    }
                }
                self.result = if available_out == 0 {
                    BrotliStreamResult::NeedsMoreOutput as i32
                } else {
                    output.truncate(output_offset);
                    BrotliStreamResult::ResultSuccess as i32
                };
                self.last_input_offset = 0;
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

    pub fn last_input_offset(&self) -> usize {
        self.last_input_offset
    }
}

#[wasm_bindgen]
pub struct DecompressStream {
    state: BrotliState<StandardAlloc, StandardAlloc, StandardAlloc>,
    result: i32,
    total_out: usize,
    last_input_offset: usize,
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
            last_input_offset: 0,
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
                self.last_input_offset = 0;
                Err(JsValue::from_str(&format!(
                    "Brotli streaming decompress failed: Error code {}",
                    self.result
                )))
            }
            BrotliResult::NeedsMoreOutput => {
                self.result = BrotliStreamResult::NeedsMoreOutput as i32;
                self.last_input_offset = input_offset;
                Ok(output.into_boxed_slice())
            }
            BrotliResult::ResultSuccess => {
                output.truncate(output_offset);
                self.result = BrotliStreamResult::ResultSuccess as i32;
                self.last_input_offset = input.len();
                Ok(output.into_boxed_slice())
            }
            BrotliResult::NeedsMoreInput => {
                output.truncate(output_offset);
                self.result = BrotliStreamResult::NeedsMoreInput as i32;
                self.last_input_offset = input.len();
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

    pub fn last_input_offset(&self) -> usize {
        self.last_input_offset
    }
}
