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

function formatError(error) {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error.message) return error.message;
  return String(error);
}

async function detectNotesInWorker({ monoSamples, onsetThreshold, frameThreshold, minNoteLengthFrames, onProgress }) {
  const { outputToNotesPoly, addPitchBendsToNoteEvents, noteFramesToTime } = await loadBasicPitchModule();
  const basicPitch = await getModelInstance();
  const normalizedSamples = monoSamples instanceof Float32Array ? monoSamples : new Float32Array(monoSamples);

  const frames = [];
  const onsets = [];
  const contours = [];

  await basicPitch.evaluateModel(
    normalizedSamples,
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

self.addEventListener('message', async (event) => {
  const data = event.data || {};

  if (data.type === 'preload') {
    try {
      await getModelInstance().then((bp) => bp.model);
      self.postMessage({ type: 'preload-ready' });
    } catch (error) {
      self.postMessage({ type: 'preload-error', error: formatError(error) });
    }
    return;
  }

  if (data.type !== 'run') return;

  const runId = data.runId;
  try {
    const notes = await detectNotesInWorker({
      monoSamples: data.monoSamples,
      onsetThreshold: data.onsetThreshold,
      frameThreshold: data.frameThreshold,
      minNoteLengthFrames: data.minNoteLengthFrames,
      onProgress: (progress) => self.postMessage({ type: 'progress', runId, progress }),
    });
    self.postMessage({ type: 'result', runId, notes });
  } catch (error) {
    self.postMessage({ type: 'error', runId, error: formatError(error) });
  }
});
