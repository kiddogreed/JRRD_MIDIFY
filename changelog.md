# Changelog

All notable progress, decisions, and TODOs for **JRRD_MIDIFY** are logged
here, in reverse-chronological order (newest first). This file is the
single source of truth for anyone (human or AI) picking up this project —
read the latest entry's "Next steps" section to know where to resume.

---

## [Unreleased] — Step 1: Project scaffold + audio import UI

**Date:** 2026-11-02
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

### Next steps (pick up here)

**Step 2 (proposed, not started — requires user confirmation before
implementation per project rules):** Audio decoding pipeline.
- Decode the selected file via `AudioContext.decodeAudioData`.
- Resample/downmix to mono 22050 Hz (the sample rate Basic Pitch's model
  requires) using `OfflineAudioContext`.
- Render a waveform preview on a `<canvas>`.
- Still no ML/MIDI conversion yet — just decode + visualize, to keep steps
  small and reviewable.

**Step 3 (planned):** Wire up `@spotify/basic-pitch` via `esm.sh`, download
and self-host the model weights under `model/`, run inference on the decoded
audio, and surface a progress bar (the model evaluates in chunks and already
supports a percent callback).

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
