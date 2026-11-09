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

// Model frame rate: AUDIO_SAMPLE_RATE (22050) / FFT_HOP (256) ≈ 86.13 fps,
// matching the constants baked into @spotify/basic-pitch's inference code.
// Exposed so the UI can show slider values in milliseconds, not raw frames.
export const MODEL_FRAME_SECONDS = 256 / 22050;

let modulePromise = null;
let modelInstance = null;
let workerInstance = null;
let workerRunId = 0;

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

function getWorkerInstance() {
  if (!workerInstance && typeof Worker !== 'undefined') {
    workerInstance = new Worker(new URL('./basic-pitch-worker.js', import.meta.url), { type: 'module' });
  }
  return workerInstance;
}

/**
 * Pre-fetches the Basic Pitch module + model weights so later calls to
 * detectNotes() don't pay the (one-time) download/compile cost mid-progress.
 */
export async function preloadModel() {
  try {
    const worker = getWorkerInstance();
    if (worker) {
      await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Timed out while preloading Basic Pitch worker model.'));
        }, 20000);
        const onMessage = (event) => {
          const { type, error } = event.data || {};
          if (type === 'preload-ready') {
            clearTimeout(timeoutId);
            worker.removeEventListener('message', onMessage);
            resolve();
          } else if (type === 'preload-error') {
            clearTimeout(timeoutId);
            worker.removeEventListener('message', onMessage);
            reject(new Error(error || 'Basic Pitch worker preload failed.'));
          }
        };
        worker.addEventListener('message', onMessage);
        worker.postMessage({ type: 'preload' });
      });
      return;
    }
  } catch (error) {
    console.warn('Basic Pitch worker preload failed; falling back to main-thread preload.', error);
    workerInstance = null;
  }

  await getModelInstance().then((bp) => bp.model);
}

async function detectNotesOnMainThread(monoSamples, options) {
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
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const onsetThreshold = typeof options.onsetThreshold === 'number' ? options.onsetThreshold : 0.25;
  const frameThreshold = typeof options.frameThreshold === 'number' ? options.frameThreshold : 0.25;
  const minNoteLengthFrames = typeof options.minNoteLengthFrames === 'number' ? options.minNoteLengthFrames : 5;

  try {
    const worker = getWorkerInstance();
    if (worker) {
      const runId = ++workerRunId;
      return await new Promise((resolve, reject) => {
        const onMessage = (event) => {
          const data = event.data || {};
          if (data.runId !== runId) return;

          if (data.type === 'progress') {
            onProgress(data.progress);
            return;
          }

          worker.removeEventListener('message', onMessage);

          if (data.type === 'result') {
            resolve(data.notes || []);
          } else if (data.type === 'error') {
            reject(new Error(data.error || 'Basic Pitch worker failed.'));
          }
        };

        worker.addEventListener('message', onMessage);
        worker.postMessage({
          type: 'run',
          runId,
          monoSamples: Array.from(monoSamples),
          onsetThreshold,
          frameThreshold,
          minNoteLengthFrames,
        });
      });
    }
  } catch (error) {
    console.warn('Basic Pitch worker inference failed; falling back to main-thread inference.', error);
    if (workerInstance) {
      workerInstance.terminate();
      workerInstance = null;
    }
  }

  return detectNotesOnMainThread(monoSamples, {
    onProgress,
    onsetThreshold,
    frameThreshold,
    minNoteLengthFrames,
  });
}
