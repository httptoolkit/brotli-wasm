# Brotli custom-dictionary encoder panic — root cause & fix

This documents the exact bug behind the `compress()` panic that occurred with a
`customDictionary` at qualities **5–9**, and the fix applied in the vendored `brotli` crate
(`vendor/brotli`, patched over upstream 8.0.4).

## TL;DR

When a custom LZ77 dictionary is attached, it is prepended to the encoder's ring buffer and a
`ring_buffer_break` marker is placed at the dictionary/file boundary. The q5–q9 backward-
reference search can find a match that **starts inside the dictionary and would extend past the
boundary**. Brotli truncates such a match to stop at the boundary (`br - prev_ix`). For a match
that starts on the **last byte(s)** of the dictionary this truncated length is **0 or 1**, which
is below brotli's minimum copy length of **2**. That invalid length was still emitted as a
backward reference, so [`GetCopyLengthCode`](vendor/brotli/src/enc/command.rs:91) computed
`copylen.wrapping_sub(2)` → **65534/65535**, indexing 24-entry `kCopyBase` out of bounds →
panic (`RuntimeError: unreachable` from JS).

The fix: reject dictionary-boundary matches that truncate below the minimum copy length (treat
them as "no match" → those bytes become literals), plus a defensive guard so any future leak
fails loudly instead of a far-away OOB.

## The exact bug (brotli 8.0.4)

### 1. The panic surface

`compress()` calls [`BrotliCompressCustomIoCustomDict`](src/lib.rs:82), which on the q5–q9 path
builds backward references via [`CreateBackwardReferences`](vendor/brotli/src/enc/backward_references/mod.rs:2508).
Each accepted match becomes a [`Command::init`](vendor/brotli/src/enc/command.rs:273):

```rust
old[0].init(&params.dist, insert_length, sr.len, sr.len ^ sr.len_x_code, distance_code);
//                                                ^^^^^^^^^^^^^^^^^^^^^ copylen_code
```

`init` then calls `get_length_code(insertlen, copylen_code, …)` →
[`GetCopyLengthCode`](vendor/brotli/src/enc/command.rs:91):

```rust
pub fn GetCopyLengthCode(copylen: usize) -> u16 {
    if copylen < 10usize {
        copylen.wrapping_sub(2) as u16   // copylen == 1 -> 65535, copylen == 0 -> 65534
    } …
}
```

For `copylen_code < 2` this wraps to 65534/65535. `combine_length_codes` then computes
`0x520d40i32 >> sub_offset` with a huge `sub_offset` → **`attempt to shift right with overflow`
(debug)**; in release the shift wraps and execution later hits
`kCopyBase[copycode]` ([`GetCopyBase`](vendor/brotli/src/enc/brotli_bit_stream.rs:1939)) →
**`index out of bounds: the len is 24 but the index is 65535`**. Same root cause, two surfaces.

Confirmed natively (no WASM) by [`tests/repro_dictionary_panic.rs`](tests/repro_dictionary_panic.rs:1):

```
thread 'minimized_input_all_qualities' panicked at brotli-8.0.4/src/enc/command.rs:118:53:
attempt to shift right with overflow
  …
  5: brotli::enc::command::Command::init            (command.rs:291)
  6: brotli::enc::backward_references::CreateBackwardReferences (mod.rs:2508)
```

### 2. Where the invalid length comes from

`copylen_code = sr.len ^ sr.len_x_code`. For the ring-buffer (custom-dictionary) search path
`len_x_code == 0`, so `copylen_code == sr.len`. `sr.len` is set inside the hasher's
`FindLongestMatch`, where every candidate length is passed through
[`fix_unbroken_len`](vendor/brotli/src/enc/backward_references/mod.rs:42):

```rust
fn fix_unbroken_len(unbroken_len, prev_ix, _cur_ix_masked, ring_buffer_break) -> usize {
    if let Some(br) = ring_buffer_break {
        if prev_ix < usize::from(br) && prev_ix + unbroken_len > usize::from(br) {
            return usize::from(br) - prev_ix;   // <-- can be 0 or 1!
        }
    }
    unbroken_len
}
```

`ring_buffer_break` is **only set for a custom LZ77 dictionary** (the source comment says so).
When a match starts in the dictionary (`prev_ix < br`) and would cross the boundary
(`prev_ix + unbroken_len > br`), it is truncated to `br - prev_ix`. If `prev_ix` is the **last**
byte of the dictionary, that is **1** — invalid. The 7 call sites in `FindLongestMatch`
(Struct1 / H9 / H6 variants) accepted this truncated length without re-checking it is ≥ 2.

### 3. Why only q5–q9

| quality | encoder path | affected? |
|---|---|---|
| 0–4 | fast fragment (`CompressFragment`) | no — doesn't use `FindLongestMatch`/`ring_buffer_break` |
| **5–9** | **`CreateBackwardReferences` + hash-chain `FindLongestMatch`** | **yes** |
| 10–11 | binary-tree hasher | no — its `FindLongestMatch` ignores `ring_buffer_break` |

And the dictionary is required: without a custom dictionary `ring_buffer_break` is `None`, so
`fix_unbroken_len` is a no-op and the truncation never happens. This matches the fuzz
observations exactly.

## The fix

### Root cause — `vendor/brotli/src/enc/backward_references/mod.rs`

1. [`fix_unbroken_len`](vendor/brotli/src/enc/backward_references/mod.rs:42) now returns **0**
   when the dictionary boundary truncates a match below
   [`BROTLI_MIN_BACKWARD_COPY_LEN`](vendor/brotli/src/enc/backward_references/mod.rs:41) (= 2).
   A length of 0 means "not a usable copy" → the bytes are emitted as literals instead. A
   straddling match of usable length (≥ 2) is still used, just clamped to the boundary.

2. All 7 call sites in `FindLongestMatch` (Struct1 / H9 / H6) now guard
   `if len >= BROTLI_MIN_BACKWARD_COPY_LEN { … accept … }` before computing a score or setting
   `out.len` / `is_match_found`. A truncated-to-invalid candidate is skipped, so a different
   valid candidate can still win and `FindLongestMatch` returns `false` (→ literals) when none
   is valid.

This is **behaviour-preserving for the no-dictionary path**: when `ring_buffer_break` is `None`,
`fix_unbroken_len` returns `unbroken_len` unchanged (always ≥ 2 there), so the new guard is
always true and compression output is byte-identical. (Verified: the existing fixture
`can compress data` → `Gw4A+KWpyubolCCjVAjmxJ4D` is unchanged, and Node `zlib` decodes the
no-dictionary output.)

### Defensive hardening — `vendor/brotli/src/enc/command.rs`

[`GetCopyLengthCode`](vendor/brotli/src/enc/command.rs:91) now `debug_assert!(copylen >= 2)` and
uses `saturating_sub(2)` instead of `wrapping_sub(2)`. So any future encoder-logic regression
that produces `copylen < 2` fails loudly at the **origin** in debug, and degrades to a
wrong-but-parseable stream (no OOB) in release — instead of the confusing far-away
`kCopyBase[65535]` panic. For all valid inputs (`copylen >= 2`) the result is identical to the
original.

`GetInsertLengthCode` needed no change: its `wrapping_sub(2)` is only reached when
`insertlen >= 6` (the `< 6` branch handles small values), so it can never underflow.

### WASM-instance poisoning — JS wrappers

A WASM trap bricks the module instance for the rest of the process. With the root-cause fix the
specific trap no longer occurs; as defence-in-depth [`index.node.js`](index.node.js:1) now wraps
`compress`/`decompress` so that catching a trap (`RuntimeError` / `unreachable`) re-instantiates
the module (cache-busted re-require) before rethrowing — the failing call still errors, but the
**next** call works again. It also exposes `reinit()` for explicit recovery. The async web/
browser bundles recover by re-awaiting `init()` / re-importing (documented in
[`index.web.js`](index.web.js:1) / [`index.browser.js`](index.browser.js:1)).

## Reproduction

Minimized from fuzzing (the trailing space in the dictionary is load-bearing):

- payload (23 B): `42ringbaznumberbar 42ba`
- dict (13 B): `ingr boolean `
- panics at **q7/8/9** (q5/6 ok on this tiny input); wider inputs widen the range to q5–q9.

```js
import { compress } from 'brotli-wasm-custom-dictionary';
const payload = new TextEncoder().encode('42ringbaznumberbar 42ba');
const dict = new TextEncoder().encode('ingr boolean '); // trailing space matters
await compress(payload, { quality: 9, customDictionary: dict }); // pre-fix: RuntimeError
```

## Regression coverage

- **Native Rust** ([`tests/repro_dictionary_panic.rs`](tests/repro_dictionary_panic.rs:1),
  `npm run test:native`): minimized input across q0–11 and q5–9, plus deterministic xorshift
  fuzz over dictionary-derived payloads at q5–9 and q0–11. Each round-trips through the brotli
  crate's own compress/decompress. **Pre-fix the minimized test panicked; post-fix all pass.**
- **WASM/TS** ([`test/brotli.spec.ts`](test/brotli.spec.ts:1), `npm run test:node`):
  "custom dictionary panic regression" block — minimized input q0–11 and q5–9, a deterministic
  fuzz at q5–9, streaming-with-dictionary at q7, a Node `zlib` ground-truth cross-check for the
  no-dictionary path, and an instance-recovery test.

## Removing the patch

`vendor/brotli` + the `[patch.crates-io]` entry in [`Cargo.toml`](Cargo.toml:1) can be removed
once an upstream `brotli` release ships the same fix. At the time of writing,
[crates.io](https://crates.io/crates/brotli) lists **8.0.4 as both newest and max-stable**, so
no upgrade was available and vendoring was required.
