// JRRD_MIDIFY — App entry point.
// Step 1: import UI. Step 2: audio decoding. Step 3: note detection preview.
// Wires up drag-and-drop + file picker UI, delegates validation to
// js/modules/file-import.js, decoding/resampling/waveform rendering to
// js/modules/audio-decode.js / js/modules/waveform.js, and ML note detection
// to js/modules/basic-pitch.js. MIDI file export lands in a later step (see
// changelog.md).

import { validateAudioFile, formatBytes, formatDuration, getExtension } from './modules/file-import.js';
import { decodeAndPrepare } from './modules/audio-decode.js';
import { drawWaveform } from './modules/waveform.js';
import { detectNotes } from './modules/basic-pitch.js';
import { midiToNoteName, amplitudeToVelocity } from './modules/music-utils.js';

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const errorText = document.getElementById('errorText');
const fileCard = document.getElementById('fileCard');
const fileName = document.getElementById('fileName');
const fileSub = document.getElementById('fileSub');
const audioPreview = document.getElementById('audioPreview');
const removeFileBtn = document.getElementById('removeFileBtn');
const convertBtn = document.getElementById('convertBtn');
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

const MAX_NOTE_ROWS_RENDERED = 300;

let selectedFile = null;
let objectUrl = null;
let decodedAudio = null; // Populated by decodeSelectedFile(); consumed by note detection.
let detectedNotes = null; // Populated by runNoteDetection(); consumed by a later MIDI-export step.
// True while a note-detection run is in flight. Basic Pitch's model
// instance is a shared singleton (js/modules/basic-pitch.js) that cannot
// safely run two overlapping evaluateModel() calls, so file import/removal
// is locked while this is true rather than merely discarding stale results.
let isDetecting = false;
// Guards against a slow decode/detection finishing after the user has
// already picked a different file (or removed the selection).
let decodeGeneration = 0;

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
  // Convert button stays disabled until the MIDI export engine (Step 4) lands.
  convertBtn.disabled = true;

  detectedNotes = null;
  detectCard.classList.add('disabled-card');
  detectHint.textContent = 'Decoding audio before notes can be detected…';
  detectBtn.disabled = true;
  detectProgressSection.classList.add('hidden');
  noteResults.classList.add('hidden');
  setDetectStatus('');

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

    enableDetectCard();
  } catch (err) {
    if (myGeneration !== decodeGeneration) return;
    console.error('Audio decoding failed:', err);
    setDecodeStatus(
      `Could not decode this file — it may be corrupted or in an unsupported format. (${err && err.message ? err.message : err})`,
      true
    );
  }
}

function enableDetectCard() {
  detectCard.classList.remove('disabled-card');
  detectHint.textContent = 'Runs Spotify\'s open-source Basic Pitch ML model fully in your browser (first run downloads ~1\u202fMB of model weights).';
  detectBtn.disabled = false;
}

async function runNoteDetection(prepared, myGeneration) {
  isDetecting = true;
  setImportLocked(true);
  detectBtn.disabled = true;
  noteResults.classList.add('hidden');
  detectProgressSection.classList.remove('hidden');
  detectProgressBar.style.width = '0%';
  setDetectStatus('Loading Basic Pitch model…');

  try {
    const notes = await detectNotes(prepared.monoSamples, {
      onProgress: (pct) => {
        if (myGeneration !== decodeGeneration) return;
        detectProgressBar.style.width = `${Math.round(pct * 100)}%`;
        setDetectStatus(`Analyzing audio… ${Math.round(pct * 100)}%`);
      },
    });

    if (myGeneration !== decodeGeneration) return; // Superseded by a newer file.

    detectedNotes = notes;
    renderNoteResults(notes);
    detectProgressSection.classList.add('hidden');
  } catch (err) {
    if (myGeneration !== decodeGeneration) return;
    console.error('Note detection failed:', err);
    setDetectStatus(`Note detection failed: ${err && err.message ? err.message : err}`, true);
  } finally {
    isDetecting = false;
    setImportLocked(false);
    if (myGeneration === decodeGeneration) {
      detectBtn.disabled = false;
    }
  }
}

function setImportLocked(locked) {
  fileInput.disabled = locked;
  dropZone.classList.toggle('locked', locked);
  dropZone.setAttribute('aria-disabled', String(locked));
  removeFileBtn.disabled = locked;
}

function renderNoteResults(notes) {
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

  noteSummary.textContent =
    `Detected ${notes.length.toLocaleString()} note${notes.length === 1 ? '' : 's'} · ` +
    `pitch range ${midiToNoteName(minPitch)}–${midiToNoteName(maxPitch)} · ` +
    `spanning ${formatDuration(lastNoteEnd)}`;

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
}

function showError(message) {
  errorText.textContent = message;
  errorText.classList.remove('hidden');
}

function clearError() {
  errorText.textContent = '';
  errorText.classList.add('hidden');
}
