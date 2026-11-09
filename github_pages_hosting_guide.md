# JRRD_MIDIFY — GitHub Pages Hosting Guide

This guide covers deploying **JRRD_MIDIFY** to GitHub Pages and documents the
project's real, end-to-end architecture. JRRD_MIDIFY is a single-page, no-build
web application that converts MP3/WAV audio into detailed, complete MIDI files
— fully client-side in the browser.

---

## 1. Project Folder Structure

Create a folder named `JRRD_MIDIFY` with the following layout (the real,
multi-module structure used by the project):

```text
JRRD_MIDIFY/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   └── modules/
│       ├── audio-decode.js
│       ├── basic-pitch.js
│       ├── basic-pitch-worker.js
│       ├── file-import.js
│       ├── midi-writer.js
│       ├── music-utils.js
│       └── note-postprocess.js
├── README.md
├── changelog.md
├── github_pages_hosting_guide.md
└── .gitignore
```

## 2. Git Initialization & GitHub Pages

Run these commands in your project terminal to initialize Git and publish to
GitHub Pages:

```bash
git init
git add .
git commit -m "first commit - JRRD_MIDIFY"
git branch -M main
git remote add origin https://github.com/<your-username>/JRRD_MIDIFY.git
git push -u origin main
```

### Enabling GitHub Pages:

1. Go to **`https://github.com/<your-username>/JRRD_MIDIFY/settings/pages`**
2. Under **Build and deployment** → **Branch**, choose `main` and root (`/`).
3. Click **Save**.
4. Your site will live at: **`https://<your-username>.github.io/JRRD_MIDIFY/`**

## 3. Real Architecture (replaces the old naive pitch-detection scaffold)

The original sample `app.js` in this guide (before Step 1's architecture
decision) treated raw time-domain sample amplitudes as if they were an FFT
frequency spectrum — no FFT was performed — so its frequency-to-MIDI mapping
was meaningless. **That code is not used.**

### Pitch/note detection engine

Spotify's **Basic Pitch** model (`@spotify/basic-pitch`, Apache-2.0) runs
client-side via **TensorFlow.js**. Both the library and the ~0.9 MB model
weights are loaded at runtime from a CDN (`esm.sh` and `jsDelivr`) — the
browser fetches them directly, so nothing needs to be vendored in the repo.
(To self-host later: download `model.json` + `group1-shard1of1.bin` into a
`model/` folder and point `MODEL_URL` in `js/modules/basic-pitch.js` at it.)

Audio is decoded with the Web Audio API and resampled to mono 22050 Hz (the
rate Basic Pitch requires). The model produces note events with start time,
duration, MIDI pitch, amplitude, and pitch-bend contour data.

### Note post-processing

`js/modules/note-postprocess.js` stitches fragmented sustained notes back
together (user-tunable gap), targeting the "no missing notes / no incomplete
tune" requirement. Detection settings (onset sensitivity, sustain threshold,
minimum note length, stitching gap) are exposed in the UI; changing any of
them invalidates cached results so stale output can never be silently reused.

### MIDI writer

`js/modules/midi-writer.js` is a hand-written **SMF Type 0** encoder (no
`@tonejs/midi` / Node `Buffer` dependency — unnecessary in-browser). It emits:
Set Tempo, 4/4 Time Signature, Track Name, a Program Change to Acoustic Grand
Piano, an RPN 0,0 pitch-bend-range declaration, Note On/Off pairs, and
per-note pitch bends (only for non-overlapping notes, since MIDI pitch bend is
channel-wide) with a reset-to-center at each note's end, plus a correct
End-of-Track event.

### Inference threading

`js/modules/basic-pitch-worker.js` runs model inference in a Web Worker so the
main thread/UI doesn't block during each model chunk, with a main-thread
fallback.

### No build step

Plain ES modules (`<script type="module">`) load third-party packages from
`esm.sh`, which auto-resolves nested bare-specifier imports (e.g.
`@tensorflow/tfjs`) without an import map. The whole project is a static site
deployable as-is.

## 4. Verification

- Serve the folder statically (`npx serve .` or `python -m http.server 8080`)
  and open `index.html`.
- Import an `.mp3`/`.wav`, run detection, adjust the detection settings, and
  confirm cached results clear when settings change.
- Click "Generate & Download .midi" and confirm a valid `.midi` file is
  produced; open it in a DAW, `midicsv`, or similar to verify note
  count/pitch/timing.
- Full step-by-step verification procedures and per-step notes are in
  `changelog.md`.

## 5. Supported input formats

`.mp3` and `.wav` only (max 100 MB). Validation checks both file extension and
MIME type.
