# Changelog

All notable progress, decisions, and TODOs for **JRRD_MIDIFY** are logged
here, in reverse-chronological order (newest first). This file is the
single source of truth for anyone (human or AI) picking up this project —
read the latest entry's "Next steps" section to know where to resume.

---

## [Unreleased] — Step 3: Basic Pitch model integration (not started)

Proposed next step — requires user confirmation before implementation, per
the project's step-by-step-with-confirmation workflow. See "Next steps"
under Step 2 below for the detailed plan.

---

## [Step 2] — 2026-11-02: Audio decoding, resampling & waveform preview

**Status:** ✅ Complete

### What was built

- [js/modules/audio-decode.js](./js/modules/audio-decode.js) — pure
  (no-DOM) helpers:
  - `decodeAudioFile(file)` — decodes an MP3/WAV `File` into a Web Audio API
    `AudioBuffer` via `AudioContext.decodeAudioData` (promise/callback dual
    API normalized for older Safari).
  - `resampleToMono(audioBuffer, targetSampleRate = 22050)` — downmixes to
    mono and resamples to 22050 Hz using `OfflineAudioContext` (the exact
    sample rate Spotify's Basic Pitch model requires — see Step 3 plan
    below), letting the browser's native resampler do the heavy lifting.
  - `decodeAndPrepare(file)` — convenience wrapper returning the original
    `AudioBuffer`, the mono 22050 Hz `Float32Array`, and metadata (duration,
    original sample rate, channel count, mono sample count) for the UI.
- [js/modules/waveform.js](./js/modules/waveform.js) — pure peak computation
  (`computePeaks`, channel-averaged min/max per pixel bucket) and canvas
  rendering (`drawWaveform`), DPR-aware for crisp rendering on high-density
  displays.
- [js/app.js](./js/app.js) updated: after a file passes validation, it is
  automatically decoded. A "decode generation" counter guards against race
  conditions (e.g. a slow decode finishing after the user already swapped to
  or removed a different file). Decode failures (corrupt/unsupported audio)
  show an inline error distinct from the import-validation error, instead of
  crashing.
- [index.html](./index.html) / [css/style.css](./css/style.css) — added a
  waveform `<canvas>` and a decode-status line inside the file card.
- The resampled 22050 Hz mono buffer is computed and stored in memory
  (`decodedAudio` in `app.js`) but not consumed yet — it's prepared for
  Step 3's model inference, keeping this step scoped to decode + visualize
  only, as agreed.

### Key decisions

- Resampling uses the browser's own `OfflineAudioContext` rather than a
  hand-rolled resampler — it is correct (band-limited, avoids aliasing) and
  requires no extra dependency.
- Waveform is rendered from the *original* decoded `AudioBuffer` (not the
  downsampled mono copy) so the preview reflects the true source audio;
  channels are averaged only for the visual, not for analysis.
- `decodeAudioFile` always closes its temporary `AudioContext` immediately
  after decoding (decoding doesn't need an open/running context), avoiding
  resource/context-limit leaks if a user imports many files in one session.

### How to verify this step

1. Serve the folder statically and open `index.html`.
2. Import a valid `.wav` (and a valid `.mp3`) file — confirm the waveform
   draws and the decode-status line reports duration, original sample rate,
   channel count, and the prepared 22050 Hz sample count.
3. Import a corrupted/non-audio file renamed to `.wav` — confirm an inline
   decode error appears (distinct from the import-type validation error) and
   the app does not crash.
4. Rapidly swap between two files — confirm the status/waveform shown always
   matches the *last* selected file (no stale results from a superseded
   decode).
5. Click "✕" to remove the file — confirm the waveform canvas and decode
   status are cleared.

Verified via automated Playwright-driven browser checks against a locally
served copy (valid stereo WAV decode, corrupt-file error path, rapid file
swap race-guard, and remove/reset) — all passed.

### Next steps (pick up here)

**Step 3 (proposed, not started — requires user confirmation):** Basic
Pitch model integration.
- Download and self-host the Basic Pitch TFJS model weights
  (`model.json` + ~0.9 MB weight shard, from `@spotify/basic-pitch@1.0.1`)
  under a new `model/` folder in this repo.
- Load `@spotify/basic-pitch` and its `@tensorflow/tfjs` dependency via an
  `esm.sh` CDN import (no build step/bundler needed — see architecture
  decision in the Step 1 entry below).
- Run `BasicPitch.evaluateModel()` on the mono 22050 Hz buffer already
  prepared by Step 2's `decodeAndPrepare()`, wiring its percent-callback to
  a visible progress bar (inference runs in ~2-second chunks internally).
- Feed the resulting frames/onsets/contours through the library's
  `outputToNotesPoly` + `addPitchBendsToNoteEvents` + `noteFramesToTime` to
  get a first list of note events — still no MIDI *file* export yet (that's
  Step 4), just getting raw note data flowing end-to-end and sanity-checked
  (e.g. logged note count / a simple on-screen list) before building the
  custom MIDI writer on top of it.

**Step 4 (planned):** Implement the custom SMF/MIDI writer (tempo, pitch
bends, note velocity from amplitude, track metadata) and wire the "Download
.midi" flow.

**Step 5 (planned):** Accuracy/post-processing pass — tunable
sensitivity/polyphony controls, minimum note duration, note stitching across
short gaps, and a before-download note/piano-roll preview so users can spot
missing or garbled notes before exporting.

**Step 6 (planned):** Polish pass — progress UX, error handling for
decode failures, large-file handling/chunking guidance, accessibility pass,
and updating `README.md` + the GitHub Pages hosting guide to reflect the
final architecture.

### Notes for whoever continues this (human or AI)

- `decodedAudio` (set in [js/app.js](./js/app.js)) already holds
  `{ audioBuffer, monoSamples, modelSampleRate, meta }` for the currently
  selected file — Step 3 should consume `decodedAudio.monoSamples` directly
  rather than re-decoding.
- Keep honoring the `decodeGeneration` race-guard pattern when adding the
  (much longer-running) model inference step — wrap it the same way so a
  fast file-swap during inference doesn't corrupt the UI.

---

## [Step 1] — 2026-11-02: Project scaffold + audio import UI

**Status:** ✅ Complete

### What was built

- Initialized a local git repository (no remote configured yet).
- Static, no-build project structure:
  - [index.html](./index.html) — page shell with two sections: "Import
    Audio" (active) and "Convert to MIDI" (disabled placeholder).
  - [css/style.css](./css/style.css) — dark-themed styling.
  - [js/app.js](./js/app.js) — UI wiring: drag-and-drop zone, click-to-browse
    file input, file-card preview (name/size/duration), native `<audio>`
    playback preview, remove/replace flow, inline validation errors.
  - [js/modules/file-import.js](./js/modules/file-import.js) — pure helper
    module (no DOM) for validating files (extension + MIME allow-list, empty
    file check, 100 MB size cap) and formatting bytes/duration. Kept separate
    from `app.js` so later steps (decoding, pitch detection, MIDI export) can
    import it without pulling in UI code.
  - [README.md](./README.md) — quick start + pointers.
  - `.gitignore` — standard excludes.
- Scope deliberately **excludes** any audio decoding or MIDI
  conversion — the "Convert to MIDI" button is present but disabled, per the
  agreed step-by-step build-and-confirm process.

### Key architecture decision (applies to all future steps)

After reviewing the existing [github_pages_hosting_guide.md](./github_pages_hosting_guide.md),
its sample `app.js` pitch-detection algorithm was found to be **fundamentally
broken**: it treats raw time-domain audio sample amplitudes as if they were an
FFT frequency-domain magnitude spectrum (no FFT is actually performed), so the
frequency-to-MIDI mapping it computes is meaningless. **That code will not be
used.**

Decision (confirmed with user via prompt on 2026-11-02):

- **Pitch/note detection engine:** Use Spotify's open-source **Basic Pitch**
  model (`@spotify/basic-pitch`, Apache-2.0) running **client-side via
  TensorFlow.js**. This is the same ML engine that powers basicpitch.io, so
  baseline transcription accuracy matches it. We will differentiate /
  out-perform the basicpitch.io experience via:
  - Self-hosting the model weights (~0.9 MB) in this repo for reliability and
    offline-friendliness rather than depending on an external CDN at runtime.
  - A better, from-scratch **MIDI writer** (no reliance on the library's
    Node-`Buffer`-based export): proper tempo meta-event, time signature,
    track naming, per-note pitch bends with RPN pitch-bend-range messages,
    and a fully-chunked/validated Standard MIDI File (SMF) output — written
    by us so output is complete/robust rather than relying on default/limited
    export behavior.
  - Note post-processing to avoid missing/truncated notes: tunable
    onset/frame thresholds, configurable minimum note length, pitch-bend
    reconstruction from contour data (already supported by the model output,
    but must be wired through), and sensible defaults validated against
    real audio.
  - Polished, editable UI/UX around the conversion (progress reporting,
    before-download preview) planned for later steps.
- **Tooling:** No build step. Plain ES modules (`<script type="module">`),
  loading third-party packages from a CDN (`esm.sh`, which auto-resolves
  nested bare-specifier imports like `@tensorflow/tfjs` without needing an
  import map). This keeps the project a pure static site deployable as-is to
  GitHub Pages.
- **Supported input formats:** `.mp3` and `.wav` only (per requirements).
  Validation checks both file extension and MIME type (some
  browsers/OSes report inconsistent MIME types for audio files, so either
  signal is accepted).

### How to verify this step

1. Serve the folder statically (e.g. `npx serve .` or
   `python -m http.server 8080`) — opening `index.html` directly via
   `file://` also works for this step since no network/module CORS issues
   are triggered yet by pure local file imports in most browsers, but a
   local server is recommended for consistency with later steps.
2. Drag a `.mp3` or `.wav` file onto the drop zone, or click to browse.
3. Confirm: file name/size/duration appear, native audio playback works,
   the "✕" button clears the selection, and selecting a non-audio file
   (e.g. `.txt`) shows an inline error instead.
4. Confirm the "Convert to MIDI" button is visibly present but disabled.

(See Step 2's entry above for what was built next, and the top of this file
for the current/next step.)

### Notes for whoever continues this (human or AI)

- Do **not** reuse the `app.js` code sample embedded in
  [github_pages_hosting_guide.md](./github_pages_hosting_guide.md) — it is
  kept only as a historical reference for repo/Pages setup steps (section
  1–2 of that doc are still valid; its "Source Code Files" section's
  pitch-detection code is superseded by this changelog's architecture
  decision above).
- Follow the project's step-by-step-with-confirmation workflow: implement
  one increment, verify it, update this changelog's "Unreleased" section
  (renaming it to a dated entry and starting a fresh "Unreleased" section
  for the next step), and get sign-off before starting the next step.
- Keep `js/modules/file-import.js`-style separation going forward: one
  module per concern (decode, pitch-detect, midi-write), imported by
  `js/app.js`, so each piece stays independently testable/reviewable.
