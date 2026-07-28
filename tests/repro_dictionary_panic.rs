// Regression harness for the custom-dictionary encoder panic.
//
// Why this exists: compressing certain payloads with a `customDictionary` at qualities
// 5-9 panics in the upstream `brotli` crate (8.0.4) — a `Command` whose effective copy
// length code is < 2 reaches `GetCopyLengthCode`, whose `copylen.wrapping_sub(2)`
// underflows to index 65535 into the 24-entry `kCopyBase` (`index out of bounds`).
//
// The bug is in the brotli crate, not the WASM glue, so we reproduce it *natively*: a
// Rust panic inside a `#[test]` fails the test cleanly (no process abort), which makes
// this both a reproduction tool and a permanent regression gate independent of the
// JS/browser suites.

use brotli::enc::BrotliEncoderParams;

/// Compresses `payload` with `dict` at `quality` using the same custom-dictionary entry
/// point the WASM wrapper uses (BrotliCompressCustomIoCustomDict). Mirrors
/// `src/lib.rs` so a native pass/fail here equals a WASM pass/fail there.
fn compress_with_dict(payload: &[u8], dict: &[u8], quality: i32) -> Vec<u8> {
    let mut out = Vec::new();
    let mut params = BrotliEncoderParams::default();
    params.quality = quality;

    let mut input_buffer = [0u8; 4096];
    let mut output_buffer = [0u8; 4096];
    let mut nop_callback = |_data: &mut brotli::interface::PredictionModeContextMap<
        brotli::interface::InputReferenceMut>,
        _cmds: &mut [brotli::interface::StaticCommand],
        _mb: brotli::interface::InputPair,
        _mfv: &mut brotli::enc::StandardAlloc| ();

    brotli::enc::BrotliCompressCustomIoCustomDict(
        &mut brotli::IoReaderWrapper(&mut &payload[..]),
        &mut brotli::IoWriterWrapper(&mut out),
        &mut input_buffer[..],
        &mut output_buffer[..],
        &params,
        brotli::enc::StandardAlloc::default(),
        &mut nop_callback,
        dict,
        std::io::Error::new(std::io::ErrorKind::UnexpectedEof, "Unexpected EOF"),
    )
    .expect("compress must not fail");
    out
}

/// Decompresses `compressed` with `dict` (mirrors the wrapper's decompress path).
fn decompress_with_dict(compressed: &[u8], dict: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut input_buffer = [0u8; 4096];
    let mut output_buffer = [0u8; 4096];

    let mut alloc_u8 = brotli::enc::StandardAlloc::default();
    let mut dict_mem = brotli::Allocator::alloc_cell(&mut alloc_u8, dict.len());
    brotli::SliceWrapperMut::slice_mut(&mut dict_mem).copy_from_slice(dict);

    brotli::BrotliDecompressCustomIoCustomDict(
        &mut brotli::IoReaderWrapper(&mut &compressed[..]),
        &mut brotli::IoWriterWrapper(&mut out),
        &mut input_buffer[..],
        &mut output_buffer[..],
        alloc_u8,
        brotli::enc::StandardAlloc::default(),
        brotli::enc::StandardAlloc::default(),
        dict_mem,
        std::io::Error::new(std::io::ErrorKind::UnexpectedEof, "Unexpected EOF"),
    )
    .expect("decompress must not fail");
    out
}

/// Round-trips payload+dict at `quality`; fails the test (panic) on any encoder error or
/// data mismatch. The dictionary content is load-bearing — see the minimized repro below.
fn assert_roundtrip(payload: &[u8], dict: &[u8], quality: i32) {
    let compressed = compress_with_dict(payload, dict, quality);
    let decompressed = decompress_with_dict(&compressed, dict);
    assert_eq!(
        decompressed, payload,
        "round-trip mismatch at quality {}",
        quality
    );
}

#[test]
fn minimized_input_all_qualities() {
    // Minimized from fuzzing: payload 23 B, dict 13 B (the trailing space matters).
    // Pre-fix this panics at q7/8/9 (q5/6 are ok on this tiny input).
    let payload = b"42ringbaznumberbar 42ba";
    let dict = b"ingr boolean ";

    for q in 0..=11 {
        assert_roundtrip(payload, dict, q);
    }
}

#[test]
fn minimized_input_meta_block_qualities() {
    // Directly targets the q5-q9 `BrotliBuildMetaBlock` path (the prime suspect).
    let payload = b"42ringbaznumberbar 42ba";
    let dict = b"ingr boolean ";

    for q in 5..=9 {
        assert_roundtrip(payload, dict, q);
    }
}

// --- Light deterministic fuzzing ---------------------------------------------------
//
// The minimized repros above pin one exact failing input; these property tests add breadth
// so any regression in the dictionary-straddling match handling is caught across many shapes.
// Seeded (no RNG crate) so failures are reproducible.

fn next_rand(state: &mut u64) -> u64 {
    // xorshift64: dependency-free, deterministic.
    let mut x = *state;
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    *state = x;
    x
}

fn rand_bytes(state: &mut u64, n: usize, alphabet: &[u8]) -> Vec<u8> {
    (0..n)
        .map(|_| alphabet[(next_rand(state) as usize) % alphabet.len()])
        .collect()
}

#[test]
fn property_dictionary_roundtrip_meta_block_qualities() {
    // Shared alphabet forces frequent backward references (many of which straddle the
    // custom-dictionary boundary), exercising the previously-panicking truncation path.
    let mut state: u64 = 0x1234_5678_9abc_def0;
    let alphabet = b"abcde 0123XYZingr boolean numberbar bazring";

    for _ in 0..40 {
        let dict_len = (next_rand(&mut state) as usize) % 300 + 1;
        let payload_len = (next_rand(&mut state) as usize) % 1500 + 1;
        let dict = rand_bytes(&mut state, dict_len, alphabet);
        let payload = rand_bytes(&mut state, payload_len, alphabet);
        // The fragile range:
        for q in [5, 6, 7, 8, 9] {
            assert_roundtrip(&payload, &dict, q);
        }
    }
}

#[test]
fn property_dictionary_roundtrip_all_qualities() {
    let mut state: u64 = 0x0fed_cba9_8765_4321;
    let alphabet = b"the quick brown fox number over lazy dog";

    for _ in 0..12 {
        let dict_len = (next_rand(&mut state) as usize) % 400 + 1;
        let payload_len = (next_rand(&mut state) as usize) % 800 + 1;
        let dict = rand_bytes(&mut state, dict_len, alphabet);
        let payload = rand_bytes(&mut state, payload_len, alphabet);
        for q in 0..=11 {
            assert_roundtrip(&payload, &dict, q);
        }
    }
}
