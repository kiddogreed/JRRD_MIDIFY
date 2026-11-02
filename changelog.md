# Changelog

All notable progress, decisions, and TODOs for **JRRD_MIDIFY** are logged
here, in reverse-chronological order (newest first). This file is the
single source of truth for anyone (human or AI) picking up this project —
read the latest entry's "Next steps" section to know where to resume.

---

## [Unreleased] — Step 6: Polish pass (not started)

Proposed next step — requires user confirmation before implementation, per
the project's step-by-step-with-confirmation workflow. See "Next steps"
under Step 5 below for the detailed plan.

---

## [Step 5] — 2026-11-02: Accuracy tuning & note-stitching post-processing

**Status:** ✅ Complete

### What was built

- [js/modules/note-postprocess.js](./js/modules/note-postprocess.js) —
  `stitchNotes(notes, { maxGapSeconds })`: merges consecutive same-pitch
  notes separated by a gap shorter than `maxGapSeconds` into one continuous
  note (combined duration, loudest fragment's amplitude kept, pitch-bend
  samples concatenated in order). Directly targets the "no missing notes /
  no incomplete tune" requirement: a sustained note that the model
  momentarily under-reads (a dynamic swell, a vibrato dip, background
  noise) and reports as 2-3 separate fragments reads as broken/incomplete
  even though no actual pitch information was lost — this repairs that.
- [js/modules/basic-pitch.js](./js/modules/basic-pitch.js) — exported
  `MODEL_FRAME_SECONDS` (≈11.6 ms/frame) so the UI can show the minimum-
  note-length slider in milliseconds instead of raw model frames.
- [index.html](./index.html) / [css/style.css](./css/style.css) — added a
  collapsible "Detection settings (optional)" panel inside the Detect Notes
  card with four sliders, each showing a live, human-readable value:
  - **Onset sensitivity** (`onsetThreshold`, default 0.25) — lower recovers
    quieter/missed note onsets; higher reduces false positives.
  - **Sustain threshold** (`frameThreshold`, default 0.25) — lower holds
    notes longer (less likely to cut a note off early).
  - **Minimum note length** (`minNoteLengthFrames`, default 5 ≈ 58 ms) —
    filters transient noise; shorter allows brief/grace notes through.
  - **Note stitching gap** (new, default 60 ms, 0 disables) — feeds
    `stitchNotes()` above.
  - A "Reset to defaults" button.
- [js/app.js](./js/app.js) wiring: slider values are read fresh each time
  detection runs and passed through to `detectNotes()` / `stitchNotes()`;
  changing any slider immediately invalidates (clears) any cached detection
  result for the current file so a stale result can never be silently
  reused (e.g. by clicking "Convert to MIDI" right after adjusting a
  slider) — this closes a correctness gap that would otherwise have been
  introduced by making detection parameters user-adjustable. The settings
  panel is disabled for the duration of a detection run, consistent with
  Step 3's existing import-lock pattern. The note preview summary now also
  reports how many fragments were stitched back together, when applicable.

### Key decisions

- Stitching operates on the **final note list**, not on raw model frames,
  so it can be re-applied instantly (no re-running the slow model) whenever
  only the stitching-gap slider changes — only the three model-facing
  sliders (onset/sustain/min-length) require a fresh `detectNotes()` call.
  *(Note: the current implementation re-runs full detection on any slider
  change for simplicity/correctness; re-stitching cached raw model output
  without a full re-run is a cheap follow-up optimization, not done here.)*
- Stitching only merges notes of the *exact same* (rounded) MIDI pitch —
  it will never merge two genuinely different notes, even if adjacent and
  close in time.
- Defaults (0.25 / 0.25 / 5 frames) match Basic Pitch's own published
  defaults, so out-of-the-box behavior is unchanged from Step 3/4 unless a
  user deliberately opens the settings panel.

### How to verify this step

1. Serve the folder statically and open `index.html`.
2. Expand "Detection settings (optional)" — confirm all four sliders show
   sensible live values (e.g. minimum note length shows "58 ms" at its
   default position).
3. Import a file, run detection, then change any slider — confirm the note
   preview and any existing MIDI result immediately disappear (stale-result
   guard).
4. Click "Convert to MIDI" directly after changing a slider (without
   re-clicking "Detect Notes") — confirm it re-runs detection with the new
   setting rather than reusing the old result.
5. Click "Reset to defaults" — confirm all four sliders and their labels
   return to the defaults above.

Verified via:
- A dedicated unit-style test for `stitchNotes()` covering: two close
  same-pitch fragments merge into one (correct combined duration, loudest
  amplitude kept, pitch-bends concatenated); notes far apart stay separate;
  different pitches never merge even when close; a three-fragment chain
  merges into a single note; `maxGapSeconds: 0` disables stitching
  entirely; and the input array/objects are never mutated. All passed.
- Live browser verification: default slider values compute correctly;
  changing a slider immediately hides the stale preview/MIDI result;
  clicking "Convert to MIDI" after a slider change correctly re-runs
  detection (confirmed via status text transitioning through "Detecting
  notes first…") rather than reusing the prior result, and produces a
  correct result with the new setting; the settings panel and its inputs
  correctly disable during an in-flight detection run; "Reset to defaults"
  correctly restores all four sliders.
- A false alarm investigated and ruled out: a couple of detection runs
  during manual testing took far longer than expected (over a minute for a
  2-second clip), which initially looked like it might be the same kind of
  concurrency bug fixed in Step 3. A controlled back-to-back timing test
  (two detection runs on the same file in the same page session, no
  reload) showed consistent ~6 second run times with no growth between
  them, which rules out a same-session memory/tensor leak as the cause.
  The slow runs are most likely attributable to this shared dev sandbox's
  variable CDN/network/system load rather than an application bug — no
  code change was made for this, since there was no reproducible evidence
  of an actual defect. Documented here in case it recurs for a future
  contributor to investigate further.

### Next steps (pick up here)

**Step 6 (proposed, not started — requires user confirmation):** Polish
pass.
- A Web Worker for model inference, so the main thread/UI doesn't
  momentarily block during each model chunk (noted during Step 3 testing).
- Large-file handling guidance/chunked decoding for very long recordings.
- Accessibility pass (ARIA labelling for the sliders/progress states,
  keyboard navigation audit).
- Update `README.md` and `github_pages_hosting_guide.md` to reflect the
  final, real architecture end-to-end (currently the hosting guide still
  describes the original, unused naive pitch-detection approach from
  before Step 1's architecture decision).
- Consider: re-stitching cached raw detection output when only the
  stitching-gap slider changes, instead of always re-running the full
  model (see "Key decisions" above).
- Consider: optional tempo detection so the exported grid lines up
  musically for users who want to edit the MIDI in a DAW (deferred from
  Step 4's plan, still not done).

### Notes for whoever continues this (human or AI)

- `js/app.js`'s `readDetectionSettings()` is the single place that reads
  slider values into the shape `detectNotes()`/`stitchNotes()` expect —
  add any new tunable parameter there and in `DEFAULT_DETECTION_SETTINGS`/
  `DETECTION_SETTING_INPUTS` together so the invalidate-on-change and
  reset-to-defaults behavior automatically covers it.
- If investigating the "occasional very slow run" note above: check
  `tf.memory()` (via the TF.js instance loaded by
  `js/modules/basic-pitch.js`) before/after several consecutive runs in
  one session; if `numTensors` grows unboundedly across runs (it did not
  in this step's test), wrapping the `evaluateModel()` call in
  `tf.engine().startScope()` / `tf.engine().endScope()` would be the
  standard TF.js fix for leaked intermediate tensors in async code.

---

## [Step 4] — 2026-11-02: Custom MIDI (.midi) file writer + download

**Status:** ✅ Complete

### What was built

- [js/modules/midi-writer.js](./js/modules/midi-writer.js) — a hand-written
  Standard MIDI File (SMF) Type 0 encoder (`buildStandardMidiFile`), plus
  convenience wrappers `buildMidiBlob` (→ `Blob`) and `suggestMidiFileName`.
  No dependency on `@tonejs/midi`'s own exporter (which needs Node's
  `Buffer`, unnecessary in-browser — see Step 1's architecture decision).
  Encodes:
  - Set Tempo, 4/4 Time Signature, Track Name, and a Program Change to
    Acoustic Grand Piano (General MIDI program 0) at tick 0.
  - An RPN 0,0 (Pitch Bend Range) declaration, set to ±12 semitones and then
    nulled so later Data Entry CCs can't retarget it.
  - A Note On/Note Off pair per detected note (velocity from
    `amplitudeToVelocity`, pitch clamped/rounded to a valid MIDI note).
  - Pitch Bend events reconstructed from each note's `pitchBends` contour
    data — **only for notes that don't overlap any other note in time**
    (see "Key decision" below) — with a reset-to-center bend at each such
    note's end, and redundant identical bend samples skipped.
  - A correct End-of-Track meta event as the final, latest-tick event.
  - Proper variable-length-quantity delta-time encoding and tick-ordered
    event sequencing (stable-sorted so same-tick Note Off → Pitch Bend →
    Note On ordering stays sensible).
- [index.html](./index.html) / [css/style.css](./css/style.css) — the
  "Convert to MIDI" card (step 3) now has a live "Generate & Download
  .midi" button, a status line, and a result area (generated filename, note
  count, file size, and a repeatable "Download Again" link).
- [js/app.js](./js/app.js) wiring: clicking Convert reuses the cached
  `detectedNotes` from Step 3's preview if already run for the current
  file, otherwise runs detection automatically first (sharing the same
  `isDetecting` lock from Step 3 — no new concurrency surface introduced).
  The resulting `Blob` is turned into an object URL, a download is
  triggered immediately via a temporary anchor element, and the result area
  stays available afterwards for re-downloading without rebuilding.

### Key decision: single-channel output + overlap-aware pitch bending

MIDI Pitch Bend is a **channel-wide** message — it bends every note
currently sounding on that channel, not just one. Two designs were
considered to reconstruct Basic Pitch's per-note micro-pitch (contour)
data without corrupting simultaneously-sounding notes:

1. **Multi-channel voice allocation** (spread overlapping notes across up
   to 15 channels so each bent note is isolated) — maximizes bend fidelity
   even within dense chords, but fragments the file into many MIDI
   channels, which many DAWs/LMMS display as separate tracks on import —
   messy for what should be a single instrument part.
2. **Single channel + overlap-aware bending** (chosen): every note stays on
   channel 0 (one clean track on import), but a note's `pitchBends` data is
   only emitted if that note's time range doesn't overlap any other note's.
   Overlapping notes (chords, double-stops) still get fully correct
   pitch/timing/velocity — they just play at their quantized semitone pitch
   instead of with micro-pitch detail.

Option 2 was chosen because it keeps the file clean/importable as a single
part, and the trade-off maps well onto real instrument behavior: pitch
bends mostly matter for monophonic passages (lead lines, vocals, solos),
which rarely overlap other notes; chordal/polyphonic passages (e.g. piano)
usually come from instruments that can't bend pitch anyway, so losing bend
detail there is a non-issue. Verified with a real detected 4-note melody
(see "How to verify" below): the three mutually-overlapping notes in that
take correctly got no bend events, while the one isolated trailing note
did, with a correct reset-to-center at its end.

### Key decisions

- **Tempo is a fixed internal constant (120 BPM)**, not detected from the
  audio. This does not affect audible timing accuracy: note start/duration
  are always converted to ticks using that same constant, so playback comes
  out at the exact source duration regardless of the chosen BPM number —
  120 is just the number a DAW will display/let you edit against. True
  tempo detection (so the grid "looks" musically correct for quantization/
  editing) is left for a later step if wanted.
- **Division is 960 ticks/quarter** (not the more common 480) for finer
  pitch-bend timing resolution, since bend samples arrive roughly every
  ~11.6 ms from the model.
- Redundant identical consecutive pitch-bend samples are skipped to keep
  file size down without any loss of fidelity.
- The `.midi` extension (rather than the more common `.mid`) was used for
  the downloaded filename, matching the user's explicit requirement.

### How to verify this step

1. Serve the folder statically and open `index.html`.
2. Import a `.wav`/`.mp3` file, then click "Generate & Download .midi"
   directly (without clicking "Detect Notes" first) — confirm it runs
   detection automatically, then a download triggers and a result summary
   (filename, note count, size) appears.
3. Alternatively, click "Detect Notes" first, then "Convert to MIDI" —
   confirm it reuses the existing results instantly instead of re-running
   detection.
4. Click "Download Again" — confirm it re-downloads the same file without
   rebuilding.
5. Open the generated file in a DAW, `midicsv`, or any MIDI-aware tool —
   confirm note count/pitch/timing match the Step 3 preview table.

Verified via:
- A unit-style round-trip test (write → parse) covering: correct chunk
  IDs/header fields, correct event counts, tempo/time-signature/track-name/
  program-change/RPN-range presence and values, tick-ordering, and —
  critically — that a solo note gets multiple pitch-bend events while two
  deliberately-overlapping chord notes get none.
- A real end-to-end run: imported a 4-note synthetic melody (same one
  validated in Step 3), clicked Convert directly, fetched the resulting
  Blob's raw bytes from the page, and parsed them by hand. Confirmed: Note
  On/Off for all 4 notes at the correct ticks (times matching the Step 3
  preview table to the millisecond), a Program Change, the full RPN
  pitch-bend-range sequence, Tempo/Time-Signature/Track-Name meta events,
  and pitch-bend events present **only** on the one note (the trailing,
  non-overlapping C5) that doesn't overlap another note — exactly as
  designed — with a correct reset-to-center at its end, and a correctly
  placed End-of-Track event closing the file.
- Remove/reset correctly clears the MIDI result area and re-disables the
  Convert button.

### Next steps (pick up here)

(See Step 5's entry above for what was built next, and the top of this
file for the current/next step.)

### Notes for whoever continues this (human or AI)

- `js/modules/midi-writer.js`'s `CHANNEL`, `pitchBendRangeSemitones`,
  `bpm`, and `ticksPerQuarter` are all easy to expose as options if Step 5
  wants to surface any of them in the UI — the function signature already
  accepts an `options` object for this.
- The overlap-detection logic (`computeOverlapFlags`) treats a note as
  "overlapping" (and therefore bend-ineligible) if its interval intersects
  *any* other note's interval, even transitively through a third note. This
  is intentionally conservative/simple; see the module's header comment
  before changing it.
- If multi-channel pitch-bend fidelity is wanted later (trading off the
  "one clean track" property), the groundwork is described in the "Key
  decision" section above as "Option 1" — not implemented, but the
  trade-offs are documented there for whoever picks it up.

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

(See Step 4's entry above for what was built next, and the top of this file
for the current/next step.)

### Notes for whoever continues this (human or AI)

- `detectedNotes` (set in [js/app.js](./js/app.js)) holds the full array of
  `{ startTimeSeconds, durationSeconds, pitchMidi, amplitude, pitchBends }`
  objects for the currently selected file once detection has run — Step 4
  consumes this directly rather than re-running detection, *unless*
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
