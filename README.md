# JRRD_MIDIFY

A single-page, no-build web application that converts MP3/WAV audio into
detailed, complete MIDI files — fully client-side in the browser.

## Architecture

JRRD_MIDIFY transcribes audio using Spotify's open-source **Basic Pitch**
model (Apache-2.0) running on **TensorFlow.js** in the browser. The model and
its ~0.9 MB of weights are loaded at runtime from a CDN (the user's browser
fetches them directly — nothing is vendored in this repo). Detected notes are
post-processed (tunable onset/sustain thresholds, minimum note length, and
note-stitching to repair fragmented sustained notes) and then encoded into a
hand-written Standard MIDI File (SMF Type 0) with tempo, time signature, track
name, General MIDI program change, RPN pitch-bend-range, and per-note pitch
bend reconstruction for non-overlapping notes.

There is no build step or bundler: plain ES modules (`<script type="module">`)
load third-party packages from `esm.sh`, making the whole project a static
site deployable as-is to GitHub Pages.

## Project structure

```
JRRD_MIDIFY/
├── index.html                 — Import → Detect Notes → Convert to MIDI UI
├── css/style.css              — Dark-themed styling
├── js/app.js                  — UI wiring + orchestration
├── js/modules/
│   ├── audio-decode.js        — MP3/WAV decoding + mono 22050 Hz resampling
│   ├── basic-pitch.js         — Basic Pitch model wrapper (worker + main thread)
│   ├── basic-pitch-worker.js  — Web Worker for off-main-thread inference
│   ├── file-import.js         — File validation + byte/duration formatting
│   ├── midi-writer.js         — Hand-written SMF Type 0 encoder
│   ├── music-utils.js         — MIDI note name + amplitude→velocity helpers
│   └── note-postprocess.js    — Note stitching post-processing
├── waveform.js                — (see audio-decode.js / js/modules/waveform.js)
├── README.md
├── changelog.md               — Step-by-step progress, decisions, next steps
├── github_pages_hosting_guide.md — GitHub Pages deployment steps
└── .gitignore
```

## Running locally

This is a static site. Any static file server works, for example:

```bash
npx serve .
# or
python -m http.server 8080
```

Then open the printed local URL in your browser.

## How it works (end to end)

1. **Import** — Drop an `.mp3` or `.wav` file (max 100 MB) onto the drop zone
   or click to browse. The file is validated (extension + MIME), decoded with
   the Web Audio API, resampled to mono 22050 Hz (the rate Basic Pitch
   requires), and rendered as a waveform preview.
2. **Detect notes** — The Basic Pitch model runs (client-side, optionally in a
   Web Worker so the UI stays responsive) and produces note events with start
   time, duration, MIDI pitch, amplitude, and pitch-bend contour data. A
   progress bar reports inference progress. Tunable detection settings
   (onset sensitivity, sustain threshold, minimum note length, note-stitching
   gap) live in a collapsible panel; changing any of them clears stale cached
   results so they can never be silently reused.
3. **Convert to MIDI** — The detected notes are encoded into a downloadable
   `.midi` file (SMF Type 0, single channel, 960 ticks/quarter, 120 BPM).
   Pitch bends are reconstructed for notes that don't overlap any other note;
   overlapping (chordal) notes keep correct pitch/timing/velocity but play at
   their quantized semitone pitch.

## Status

🚧 Under active, incremental development. See [changelog.md](./changelog.md)
for the current progress, architecture decisions, and next steps. The project
follows a step-by-step build-and-confirm workflow; each completed step is
logged as a dated entry in the changelog.

## Deployment

See [github_pages_hosting_guide.md](./github_pages_hosting_guide.md) for
GitHub Pages hosting steps.

## Supported input formats

`.mp3` and `.wav` only. Validation checks both file extension and MIME type
(some browsers report inconsistent MIME types for audio, so either signal is
accepted).
