// JRRD_MIDIFY — App entry point.
// Step 1: import UI. Step 2: audio decoding. Step 3: note detection preview.
// Step 4: MIDI (.midi) file export. Step 5: tunable detection accuracy +
// note-stitching post-processing.
// Wires up drag-and-drop + file picker UI, delegates validation to
// js/modules/file-import.js, decoding/resampling/waveform rendering to
// js/modules/audio-decode.js / js/modules/waveform.js, ML note detection to
// js/modules/basic-pitch.js, note-stitching to
// js/modules/note-postprocess.js, and Standard MIDI File encoding to
// js/modules/midi-writer.js (see changelog.md).

import { validateAudioFile, formatBytes, formatDuration, getExtension } from './modules/file-import.js';
import { decodeAndPrepare } from './modules/audio-decode.js';
import { drawWaveform } from './modules/waveform.js';
import { detectNotes, MODEL_FRAME_SECONDS } from './modules/basic-pitch.js';
import { stitchNotes } from './modules/note-postprocess.js';
import { midiToNoteName, amplitudeToVelocity } from './modules/music-utils.js';
import { buildMidiBlob, suggestMidiFileName } from './modules/midi-writer.js';

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const errorText = document.getElementById('errorText');
const fileCard = document.getElementById('fileCard');
const fileName = document.getElementById('fileName');
const fileSub = document.getElementById('fileSub');
const audioPreview = document.getElementById('audioPreview');
const removeFileBtn = document.getElementById('removeFileBtn');
const waveformCanvas = document.getElementById('waveformCanvas');
const decodeStatus = document.getElementById('decodeStatus');

const detectCard = document.getElementById('detectCard');
const detectHint = document.getElementById('detectHint');
const detectBtn = document.getElementById('detectBtn');
const detectProgressSection = document.getElementById('detectProgressSection');
const detectProgressBar = document.getElementById('detectProgressBar');
const detectStatus = document.getElementById('detectStatus');
const noteResults = document.getElementById('noteResults');
const noteSummary = document.getElementById('noteSummary');
const noteTableBody = document.getElementById('noteTableBody');
const noteTableFootnote = document.getElementById('noteTableFootnote');

const onsetSensitivityInput = document.getElementById('onsetSensitivity');
const onsetSensitivityVal = document.getElementById('onsetSensitivityVal');
const sustainThresholdInput = document.getElementById('sustainThreshold');
const sustainThresholdVal = document.getElementById('sustainThresholdVal');
const minNoteLengthInput = document.getElementById('minNoteLength');
const minNoteLengthVal = document.getElementById('minNoteLengthVal');
const stitchGapInput = document.getElementById('stitchGap');
const stitchGapVal = document.getElementById('stitchGapVal');
const resetSettingsBtn = document.getElementById('resetSettingsBtn');
const DETECTION_SETTING_INPUTS = [onsetSensitivityInput, sustainThresholdInput, minNoteLengthInput, stitchGapInput];
const DEFAULT_DETECTION_SETTINGS = { onsetSensitivity: 0.25, sustainThreshold: 0.25, minNoteLength: 5, stitchGap: 60 };

const processCard = document.getElementById('processCard');
const convertHint = document.getElementById('convertHint');
const convertBtn = document.getElementById('convertBtn');
const convertStatus = document.getElementById('convertStatus');
const midiResult = document.getElementById('midiResult');
const midiResultSummary = document.getElementById('midiResultSummary');
const midiDownloadLink = document.getElementById('midiDownloadLink');

const MAX_NOTE_ROWS_RENDERED = 300;

let selectedFile = null;
let objectUrl = null;
let midiObjectUrl = null;
let decodedAudio = null; // Populated by decodeSelectedFile(); consumed by note detection.
let detectedNotes = null; // Populated by runNoteDetection(); consumed by the MIDI writer.
// True while a note-detection run is in flight. Basic Pitch's model
// instance is a shared singleton (js/modules/basic-pitch.js) that cannot
// safely run two overlapping evaluateModel() calls, so file import/removal
// is locked while this is true rather than merely discarding stale results.
let isDetecting = false;
// Guards against a slow decode/detection finishing after the user has
// already picked a different file (or removed the selection).
let decodeGeneration = 0;

// --- Detection settings ---------------------------------------------------

updateSliderLabels();

DETECTION_SETTING_INPUTS.forEach((input) => {
  input.addEventListener('input', () => {
    updateSliderLabels();
    invalidateCachedDetection();
  });
});

resetSettingsBtn.addEventListener('click', () => {
  onsetSensitivityInput.value = DEFAULT_DETECTION_SETTINGS.onsetSensitivity;
  sustainThresholdInput.value = DEFAULT_DETECTION_SETTINGS.sustainThreshold;
  minNoteLengthInput.value = DEFAULT_DETECTION_SETTINGS.minNoteLength;
  stitchGapInput.value = DEFAULT_DETECTION_SETTINGS.stitchGap;
  updateSliderLabels();
  invalidateCachedDetection();
});

function updateSliderLabels() {
  onsetSensitivityVal.textContent = parseFloat(onsetSensitivityInput.value).toFixed(2);
  sustainThresholdVal.textContent = parseFloat(sustainThresholdInput.value).toFixed(2);
  const minLenMs = Math.round(parseInt(minNoteLengthInput.value, 10) * MODEL_FRAME_SECONDS * 1000);
  minNoteLengthVal.textContent = `${minLenMs} ms`;
  stitchGapVal.textContent = `${stitchGapInput.value} ms`;
}

function readDetectionSettings() {
  return {
    onsetThreshold: parseFloat(onsetSensitivityInput.value),
    frameThreshold: parseFloat(sustainThresholdInput.value),
    minNoteLengthFrames: parseInt(minNoteLengthInput.value, 10),
    stitchGapSeconds: parseInt(stitchGapInput.value, 10) / 1000,
  };
}

/** Called whenever a detection setting changes: any cached results no
 * longer reflect the current settings, so they must not be reused silently
 * (e.g. by clicking "Convert to MIDI" without re-running detection). */
function invalidateCachedDetection() {
  if (isDetecting) return; // Settings inputs are locked during a run anyway.
  detectedNotes = null;
  noteResults.classList.add('hidden');
  midiResult.classList.add('hidden');
  setDetectStatus('');
  setConvertStatus('');
}

// --- Drop zone interactions ---------------------------------------------

dropZone.addEventListener('click', () => {
  if (!isDetecting) fileInput.click();
});

dropZone.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && !isDetecting) {
    e.preventDefault();
    fileInput.click();
  }
});

['dragenter', 'dragover'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drag-over');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
  });
});

dropZone.addEventListener('drop', (e) => {
  const files = e.dataTransfer && e.dataTransfer.files;
  if (files && files.length) {
    handleFile(files[0]);
  }
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length) {
    handleFile(e.target.files[0]);
  }
  // Reset so selecting the same file again still fires `change`.
  fileInput.value = '';
});

removeFileBtn.addEventListener('click', () => {
  if (isDetecting) return; // Locked while a detection run is in flight.
  resetSelection();
});

detectBtn.addEventListener('click', () => {
  if (decodedAudio && !isDetecting) {
    runNoteDetection(decodedAudio, decodeGeneration);
  }
});

convertBtn.addEventListener('click', () => {
  if (decodedAudio && !isDetecting) {
    generateAndDownloadMidi(decodedAudio, decodeGeneration);
  }
});

// --- File handling -------------------------------------------------------

function handleFile(file) {
  if (isDetecting) {
    showError('Note detection is in progress — please wait for it to finish before importing a different file.');
    return;
  }

  const result = validateAudioFile(file);
  if (!result.ok) {
    showError(result.reason);
    return;
  }

  clearError();
  selectedFile = file;
  decodedAudio = null;
  decodeGeneration += 1;
  const myGeneration = decodeGeneration;

  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
  }
  objectUrl = URL.createObjectURL(file);

  fileName.textContent = file.name;
  fileSub.textContent = `${getExtension(file.name).toUpperCase()} · ${formatBytes(file.size)} · loading duration…`;

  audioPreview.src = objectUrl;
  audioPreview.addEventListener(
    'loadedmetadata',
    () => {
      fileSub.textContent = `${getExtension(file.name).toUpperCase()} · ${formatBytes(file.size)} · ${formatDuration(audioPreview.duration)}`;
    },
    { once: true }
  );

  fileCard.classList.remove('hidden');

  detectedNotes = null;
  detectCard.classList.add('disabled-card');
  detectHint.textContent = 'Decoding audio before notes can be detected…';
  detectBtn.disabled = true;
  detectProgressSection.classList.add('hidden');
  noteResults.classList.add('hidden');
  setDetectStatus('');

  processCard.classList.add('disabled-card');
  convertHint.textContent = 'Decoding audio before it can be converted…';
  convertBtn.disabled = true;
  midiResult.classList.add('hidden');
  setConvertStatus('');
  if (midiObjectUrl) {
    URL.revokeObjectURL(midiObjectUrl);
    midiObjectUrl = null;
  }

  decodeSelectedFile(file, myGeneration);
}

async function decodeSelectedFile(file, myGeneration) {
  setDecodeStatus('Decoding audio…');
  try {
    const prepared = await decodeAndPrepare(file);
    if (myGeneration !== decodeGeneration) return; // A newer file was selected meanwhile.

    decodedAudio = prepared;
    drawWaveform(waveformCanvas, prepared.audioBuffer);

    const { durationSeconds, originalSampleRate, numberOfChannels, monoSampleCount } = prepared.meta;
    setDecodeStatus(
      `Decoded: ${formatDuration(durationSeconds)} · ${originalSampleRate.toLocaleString()} Hz · ` +
        `${numberOfChannels === 1 ? 'mono' : `${numberOfChannels}ch`} ` +
        `· prepared ${monoSampleCount.toLocaleString()} samples @ ${prepared.modelSampleRate} Hz for analysis`
    );

    enableProcessingCards();
  } catch (err) {
    if (myGeneration !== decodeGeneration) return;
    console.error('Audio decoding failed:', err);
    setDecodeStatus(
      `Could not decode this file — it may be corrupted or in an unsupported format. (${err && err.message ? err.message : err})`,
      true
    );
  }
}

function enableProcessingCards() {
  detectCard.classList.remove('disabled-card');
  detectHint.textContent = 'Runs Spotify\'s open-source Basic Pitch ML model fully in your browser (first run downloads ~1\u202fMB of model weights).';
  detectBtn.disabled = false;

  processCard.classList.remove('disabled-card');
  convertHint.textContent =
    'Builds a complete, downloadable .midi file (reuses the detection above if you already ran it, otherwise runs it automatically).';
  convertBtn.disabled = false;
}

async function runNoteDetection(prepared, myGeneration) {
  isDetecting = true;
  setImportLocked(true);
  detectBtn.disabled = true;
  convertBtn.disabled = true;
  noteResults.classList.add('hidden');
  detectProgressSection.classList.remove('hidden');
  detectProgressBar.style.width = '0%';
  setDetectStatus('Loading Basic Pitch model…');

  const settings = readDetectionSettings();

  let result = null;
  try {
    const rawNotes = await detectNotes(prepared.monoSamples, {
      onsetThreshold: settings.onsetThreshold,
      frameThreshold: settings.frameThreshold,
      minNoteLengthFrames: settings.minNoteLengthFrames,
      onProgress: (pct) => {
        if (myGeneration !== decodeGeneration) return;
        detectProgressBar.style.width = `${Math.round(pct * 100)}%`;
        setDetectStatus(`Analyzing audio… ${Math.round(pct * 100)}%`);
      },
    });

    if (myGeneration !== decodeGeneration) return null; // Superseded by a newer file.

    const notes = stitchNotes(rawNotes, { maxGapSeconds: settings.stitchGapSeconds });

    detectedNotes = notes;
    renderNoteResults(notes, rawNotes.length);
    detectProgressSection.classList.add('hidden');
    result = notes;
  } catch (err) {
    if (myGeneration !== decodeGeneration) return null;
    console.error('Note detection failed:', err);
    setDetectStatus(`Note detection failed: ${err && err.message ? err.message : err}`, true);
  } finally {
    isDetecting = false;
    setImportLocked(false);
    if (myGeneration === decodeGeneration) {
      detectBtn.disabled = false;
      convertBtn.disabled = false;
    }
  }
  return result;
}

async function generateAndDownloadMidi(prepared, myGeneration) {
  convertBtn.disabled = true;
  midiResult.classList.add('hidden');
  setConvertStatus('');

  try {
    let notes = detectedNotes;
    if (!notes) {
      setConvertStatus('Detecting notes first…');
      notes = await runNoteDetection(prepared, myGeneration);
      if (!notes) return; // Detection failed or was superseded; error already shown.
    }

    if (myGeneration !== decodeGeneration) return;

    setConvertStatus('Building MIDI file…');
    const trackName = selectedFile ? selectedFile.name.replace(/\.[^./]+$/, '') : 'JRRD_MIDIFY';
    const blob = buildMidiBlob(notes, { trackName: trackName || 'JRRD_MIDIFY' });
    const downloadName = suggestMidiFileName(selectedFile ? selectedFile.name : 'output');

    if (midiObjectUrl) {
      URL.revokeObjectURL(midiObjectUrl);
    }
    midiObjectUrl = URL.createObjectURL(blob);

    triggerDownload(midiObjectUrl, downloadName);

    midiResultSummary.textContent =
      `Generated ${downloadName} · ${notes.length.toLocaleString()} note${notes.length === 1 ? '' : 's'} · ${formatBytes(blob.size)}`;
    midiDownloadLink.href = midiObjectUrl;
    midiDownloadLink.download = downloadName;
    midiResult.classList.remove('hidden');
    setConvertStatus('');
  } catch (err) {
    console.error('MIDI generation failed:', err);
    setConvertStatus(`MIDI generation failed: ${err && err.message ? err.message : err}`, true);
  } finally {
    if (myGeneration === decodeGeneration) {
      convertBtn.disabled = false;
    }
  }
}

function triggerDownload(url, downloadName) {
  const link = document.createElement('a');
  link.href = url;
  link.download = downloadName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function setConvertStatus(message, isError = false) {
  convertStatus.textContent = message;
  convertStatus.classList.toggle('error', isError);
}

function setImportLocked(locked) {
  fileInput.disabled = locked;
  dropZone.classList.toggle('locked', locked);
  dropZone.setAttribute('aria-disabled', String(locked));
  removeFileBtn.disabled = locked;
  DETECTION_SETTING_INPUTS.forEach((input) => {
    input.disabled = locked;
  });
  resetSettingsBtn.disabled = locked;
}

function renderNoteResults(notes, rawFragmentCount) {
  noteResults.classList.remove('hidden');

  if (notes.length === 0) {
    noteSummary.textContent = 'No notes were detected in this audio.';
    noteTableBody.innerHTML = '';
    noteTableFootnote.classList.add('hidden');
    return;
  }

  const pitches = notes.map((n) => n.pitchMidi);
  const minPitch = Math.min(...pitches);
  const maxPitch = Math.max(...pitches);
  const lastNoteEnd = Math.max(...notes.map((n) => n.startTimeSeconds + n.durationSeconds));
  const stitchedCount = typeof rawFragmentCount === 'number' ? rawFragmentCount - notes.length : 0;

  noteSummary.textContent =
    `Detected ${notes.length.toLocaleString()} note${notes.length === 1 ? '' : 's'} · ` +
    `pitch range ${midiToNoteName(minPitch)}–${midiToNoteName(maxPitch)} · ` +
    `spanning ${formatDuration(lastNoteEnd)}` +
    (stitchedCount > 0
      ? ` · stitched ${stitchedCount} fragment${stitchedCount === 1 ? '' : 's'} back into held notes`
      : '');

  const sorted = [...notes].sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
  const rowsToRender = sorted.slice(0, MAX_NOTE_ROWS_RENDERED);

  noteTableBody.innerHTML = rowsToRender
    .map(
      (note) => `<tr>
        <td>${note.startTimeSeconds.toFixed(2)}s</td>
        <td>${note.durationSeconds.toFixed(2)}s</td>
        <td>${midiToNoteName(note.pitchMidi)}</td>
        <td>${amplitudeToVelocity(note.amplitude)}</td>
      </tr>`
    )
    .join('');

  if (notes.length > MAX_NOTE_ROWS_RENDERED) {
    noteTableFootnote.textContent = `Showing first ${MAX_NOTE_ROWS_RENDERED.toLocaleString()} of ${notes.length.toLocaleString()} notes (sorted by start time).`;
    noteTableFootnote.classList.remove('hidden');
  } else {
    noteTableFootnote.classList.add('hidden');
  }
}

function setDetectStatus(message, isError = false) {
  detectStatus.textContent = message;
  detectStatus.classList.toggle('error', isError);
}

function setDecodeStatus(message, isError = false) {
  decodeStatus.textContent = message;
  decodeStatus.classList.toggle('error', isError);
}

function resetSelection() {
  selectedFile = null;
  decodedAudio = null;
  detectedNotes = null;
  decodeGeneration += 1;
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  audioPreview.removeAttribute('src');
  audioPreview.load();
  fileCard.classList.add('hidden');
  convertBtn.disabled = true;
  clearError();
  setDecodeStatus('');
  const ctx = waveformCanvas.getContext('2d');
  ctx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);

  detectCard.classList.add('disabled-card');
  detectHint.textContent = 'Import an audio file above first.';
  detectBtn.disabled = true;
  detectProgressSection.classList.add('hidden');
  noteResults.classList.add('hidden');
  setDetectStatus('');

  processCard.classList.add('disabled-card');
  convertHint.textContent = 'Import an audio file above first.';
  convertBtn.disabled = true;
  midiResult.classList.add('hidden');
  setConvertStatus('');
  if (midiObjectUrl) {
    URL.revokeObjectURL(midiObjectUrl);
    midiObjectUrl = null;
  }
}

function showError(message) {
  errorText.textContent = message;
  errorText.classList.remove('hidden');
}

function clearError() {
  errorText.textContent = '';
  errorText.classList.add('hidden');
}
