# Changelog

All notable progress, decisions, and TODOs for **JRRD_MIDIFY** are logged
here, in reverse-chronological order (newest first). This file is the
single source of truth for anyone (human or AI) picking up this project —
read the latest entry's "Next steps" section to know where to resume.

---

## [Unreleased] — Step 4: Custom MIDI (.midi) file writer (not started)

Proposed next step — requires user confirmation before implementation, per
the project's step-by-step-with-confirmation workflow. See "Next steps"
under Step 3 below for the detailed plan.

---

## [Step 3] — 2026-11-02: Basic Pitch model integration (note detection preview)

**Status:** ✅ Complete

### What was built

- [js/modules/basic-pitch.js](./js/modules/basic-pitch.js) — loads
  `@spotify/basic-pitch` + its `@tensorflow/tfjs` dependency from the
  `esm.sh` CDN (no bundler), and exposes `detectNotes(monoSamples, options)`
  which runs the model's chunked `evaluateModel()` inference, then pipes the
  raw frames/onsets/contours through the library's own
  `outputToNotesPoly` → `addPitchBendsToNoteEvents` → `noteFramesToTime` to
  produce note events: `{ startTimeSeconds, durationSeconds, pitchMidi,
  amplitude, pitchBends }`. `onsetThreshold`, `frameThreshold`, and
  `minNoteLengthFrames` are exposed as tunable options (not yet surfaced in
  the UI — see Step 5).
- [js/modules/music-utils.js](./js/modules/music-utils.js) — small shared
  helpers: `midiToNoteName` (MIDI number → e.g. "C4") and
  `amplitudeToVelocity` (Basic Pitch amplitude → MIDI velocity 1-127), for
  reuse by this step's preview table and Step 4's MIDI writer.
- [index.html](./index.html) / [css/style.css](./css/style.css) — added a
  new "2. Detect Notes (preview)" card between Import and Convert: a
  "Detect Notes" button, a progress bar driven by the model's percent
  callback, and a results view (summary line + scrollable note table,
  capped at 300 rendered rows with a footnote if more were detected). The
  "Convert to MIDI" card is renumbered to step 3 and still disabled — it
  will consume `detectedNotes` once Step 4 lands.
- [js/app.js](./js/app.js) wiring:
  - The Detect Notes button enables once decoding succeeds, and triggers
    `detectNotes()` on the Step 2 mono 22050 Hz buffer.
  - **Import is locked while detection is running** (drop zone, file input,
    and remove button all disabled, with an inline explanatory error if the
    user tries to swap files) — see "Bug found & fixed" below for why.
  - Detected notes are stored in `detectedNotes` for the next step to
    consume; detection errors surface inline without crashing the app.

### Key decision: CDN-hosted model weights (deviates from the Step 1 plan)

The Step 1/2 plan called for **self-hosting** the ~0.9 MB Basic Pitch model
weights in a `model/` folder in this repo. That was attempted first, but
**outbound binary downloads from the dev sandbox's shell/tooling are
blocked by environment policy** (`Invoke-WebRequest` and `curl` both failed
with a permission error that cannot be worked around from this session).

Resolution: the model (`model.json` + weight shard) is instead loaded at
**runtime, directly by the user's browser**, from the `jsdelivr` CDN
(`https://cdn.jsdelivr.net/npm/@spotify/basic-pitch@1.0.1/model/model.json`),
alongside the `@spotify/basic-pitch`/`@tensorflow/tfjs` module itself from
`esm.sh`. This is functionally equivalent for end users (same bytes, same
one-time download), just not vendored into this git repo. Verified working
end-to-end with real browser `fetch` calls (see "How to verify" below).

**To self-host later** (optional, e.g. for stricter offline support or to
remove the runtime CDN dependency): download
`https://unpkg.com/@spotify/basic-pitch@1.0.1/model/model.json` and the
sibling `group1-shard1of1.bin` into a `model/` folder in this repo, then
change `MODEL_URL` in `js/modules/basic-pitch.js` to `'./model/model.json'`.
No other code changes are needed.

### Bug found & fixed during verification: overlapping detection runs

Initial testing (rapidly swapping files while a detection was in flight)
surfaced a real concurrency bug: `js/modules/basic-pitch.js` holds a single
shared `BasicPitch` model instance, and nothing stopped a second
`detectNotes()` call from starting while a prior (now-superseded) one was
still executing in the background. The existing "generation" guard only
discarded the *stale result* at the end — it didn't stop the stale run from
executing — so two overlapping `evaluateModel()` calls ended up contending
for the same TF.js graph/backend simultaneously, causing severe slowdown
(observed: a 1-second clip took over a minute to resolve instead of a few
seconds).

**Fix:** file import/removal is now locked (disabled, with an inline
message) for the whole duration of a detection run, so a second detection
can never start while one is already in flight. This is simpler and more
robust than true cancellation (which would require re-implementing the
library's internal chunk loop to check an abort flag) and is an acceptable
UX trade-off since detection is the point of this step. Re-verified after
the fix: attempting to swap files mid-detection now shows an inline block
message instead of racing, and import unlocks automatically once detection
settles (success or error).

### Key decisions

- Detection threshold defaults (`onsetThreshold=0.25`, `frameThreshold=0.25`,
  `minNoteLengthFrames=5`) are the library's own published defaults from its
  README usage example — not yet tuned. Tuning these (and exposing sliders
  for them) is deferred to Step 5 so this step stays focused on "does the
  pipeline work correctly end-to-end".
- The preview table is capped at 300 rendered rows (with an accurate total
  count) purely to keep the DOM light for dense polyphonic pieces; all
  detected notes are kept in the `detectedNotes` in-memory array regardless
  of how many are rendered.

### How to verify this step

1. Serve the folder statically and open `index.html`.
2. Import a `.wav`/`.mp3` file and wait for it to decode (Step 2). The
   "Detect Notes" button should enable.
3. Click "Detect Notes". A progress bar should advance to 100%, then a
   summary line (note count, pitch range, duration) and a note table
   should appear.
4. Try importing a different file *while* detection is running — confirm
   an inline message blocks it instead of corrupting the UI, and that
   importing becomes available again once detection finishes.
5. Click "✕" to remove the file — confirm the Detect Notes card, progress
   bar, and results all reset to their initial disabled/empty state.

Verified via automated Playwright-driven browser checks against a locally
served copy:
- A 4-note synthetic arpeggio (C4→E4→G4→C5, 0.5 s each) was detected as
  **exactly 4 notes**, correctly named, with start times ~0.00/0.49/0.96/1.50 s
  (matching the generated audio almost exactly) and durations ~0.5 s each.
- A 1-second 196 Hz tone was detected as a single **G3** note.
- The concurrent-detection bug described above was reproduced, fixed, and
  re-verified (swap now blocked cleanly; normal swap works immediately
  after detection completes).
- Remove/reset correctly clears all Step 3 UI state.

### Next steps (pick up here)

**Step 4 (proposed, not started — requires user confirmation):** Custom
MIDI (.midi) file writer + download flow.
- Implement a from-scratch Standard MIDI File (SMF) Type 0 or Type 1
  encoder in a new `js/modules/midi-writer.js` (no dependency on
  `@tonejs/midi`'s own exporter, which relies on Node's `Buffer` — see Step 1
  entry's architecture decision) — variable-length quantities, a tempo meta
  event (derive BPM or default to 120), time signature, track name, Note
  On/Off events built from `detectedNotes`' start/duration/velocity, and
  **pitch-bend reconstruction**: convert each note's `pitchBends` array into
  MIDI Pitch Bend events plus an RPN 0,0 (pitch-bend-range) message so bent
  notes play back correctly in any DAW/player.
- Wire the "Convert to MIDI" button: consume `detectedNotes` (running
  detection first if not already run for the current file), build the SMF
  byte stream, create a `Blob`/object URL, and enable a real download link
  (replacing today's permanently-disabled placeholder).
- Validate the generated file: confirm it opens correctly in at least one
  external tool (e.g. a DAW, `midicsv`, or a browser-based MIDI player) and
  that note count/timing/pitch match the Step 3 preview table.

**Step 5 (planned):** Accuracy/post-processing pass — tunable
sensitivity/polyphony controls (surface `onsetThreshold`/`frameThreshold`/
`minNoteLengthFrames` as UI sliders), minimum note duration, note stitching
across short gaps, and a before-download note/piano-roll preview so users
can spot missing or garbled notes before exporting.

**Step 6 (planned):** Polish pass — progress UX, large-file handling/
chunking guidance, accessibility pass, a Web Worker for model inference
(so the main thread/UI doesn't momentarily block during each chunk — noted
as a nice-to-have during this step's testing, not required for correctness),
and updating `README.md` + the GitHub Pages hosting guide to reflect the
final architecture.

### Notes for whoever continues this (human or AI)

- `detectedNotes` (set in [js/app.js](./js/app.js)) holds the full array of
  `{ startTimeSeconds, durationSeconds, pitchMidi, amplitude, pitchBends }`
  objects for the currently selected file once detection has run — Step 4
  should consume this directly rather than re-running detection, *unless*
  the user changed detection-affecting settings (not applicable yet, since
  thresholds aren't UI-exposed until Step 5).
- Keep the "lock import while busy" pattern from this step's bug-fix when
  adding Step 4's MIDI generation, if that turns out to be slow enough to
  matter (it shouldn't be — SMF encoding is cheap pure JS — but re-running
  detection as part of "Convert to MIDI" would need the same lock).
- The shared `BasicPitch` singleton in `js/modules/basic-pitch.js` is
  intentional (avoids re-downloading/recompiling the model on every click);
  just remember it means only one detection may run at a time app-wide
  (enforced by `isDetecting` in `js/app.js`).

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

(See Step 3's entry above for what was built next, and the top of this file
for the current/next step.)

### Notes for whoever continues this (human or AI)

- `decodedAudio` (set in [js/app.js](./js/app.js)) already holds
  `{ audioBuffer, monoSamples, modelSampleRate, meta }` for the currently
  selected file — Step 3 consumes `decodedAudio.monoSamples` directly
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
