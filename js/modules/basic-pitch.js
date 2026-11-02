// JRRD_MIDIFY — Basic Pitch model wrapper (Step 3: pitch/note detection).
//
// Loads Spotify's open-source Basic Pitch ML model (Apache-2.0) together
// with its TensorFlow.js dependency from the `esm.sh` CDN at runtime (no
// bundler/build step — see changelog.md Step 1 architecture decision).
//
// The model *weights* are also loaded from a CDN (jsDelivr) rather than
// self-hosted in this repo's `model/` folder: this dev sandbox blocks
// outbound binary downloads from shell/tooling, so the files could not be
// fetched and committed here. Functionally this is equivalent (the browser
// fetches the same ~0.9 MB of weights either way); see changelog.md for how
// to switch to a self-hosted copy later if desired.

const BASIC_PITCH_MODULE_URL = 'https://esm.sh/@spotify/basic-pitch@1.0.1';
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@spotify/basic-pitch@1.0.1/model/model.json';

let modulePromise = null;
let modelInstance = null;

function loadBasicPitchModule() {
  if (!modulePromise) {
    modulePromise = import(/* @vite-ignore */ BASIC_PITCH_MODULE_URL);
  }
  return modulePromise;
}

async function getModelInstance() {
  if (!modelInstance) {
    const { BasicPitch } = await loadBasicPitchModule();
    modelInstance = new BasicPitch(MODEL_URL);
  }
  return modelInstance;
}

/**
 * Pre-fetches the Basic Pitch module + model weights so later calls to
 * detectNotes() don't pay the (one-time) download/compile cost mid-progress.
 */
export async function preloadModel() {
  await getModelInstance().then((bp) => bp.model);
}

/**
 * Runs Basic Pitch polyphonic note detection on mono audio samples.
 * @param {Float32Array} monoSamples Mono audio at 22050 Hz (see
 *   js/modules/audio-decode.js MODEL_SAMPLE_RATE).
 * @param {Object} [options]
 * @param {(percent: number) => void} [options.onProgress] Called with 0..1.
 * @param {number} [options.onsetThreshold=0.25] Lower = more (possibly
 *   spurious) note onsets detected.
 * @param {number} [options.frameThreshold=0.25] Lower = notes held/extended
 *   more readily, reducing missed sustain.
 * @param {number} [options.minNoteLengthFrames=5] Minimum note length in
 *   model frames (~11.6 ms each) before a detected note is discarded.
 * @returns {Promise<Array<{
 *   startTimeSeconds: number,
 *   durationSeconds: number,
 *   pitchMidi: number,
 *   amplitude: number,
 *   pitchBends?: number[],
 * }>>}
 */
export async function detectNotes(monoSamples, options = {}) {
  const {
    onProgress = () => {},
    onsetThreshold = 0.25,
    frameThreshold = 0.25,
    minNoteLengthFrames = 5,
  } = options;

  const { outputToNotesPoly, addPitchBendsToNoteEvents, noteFramesToTime } = await loadBasicPitchModule();
  const basicPitch = await getModelInstance();

  const frames = [];
  const onsets = [];
  const contours = [];

  await basicPitch.evaluateModel(
    monoSamples,
    (frameBatch, onsetBatch, contourBatch) => {
      frames.push(...frameBatch);
      onsets.push(...onsetBatch);
      contours.push(...contourBatch);
    },
    onProgress
  );

  const rawNotes = outputToNotesPoly(frames, onsets, onsetThreshold, frameThreshold, minNoteLengthFrames);
  const notesWithBends = addPitchBendsToNoteEvents(contours, rawNotes);
  return noteFramesToTime(notesWithBends);
}
