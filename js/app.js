// JRRD_MIDIFY — App entry point (Step 1: import UI, Step 2: audio decoding).
// Wires up drag-and-drop + file picker UI, delegates validation to
// js/modules/file-import.js, and decoding/resampling/waveform rendering to
// js/modules/audio-decode.js and js/modules/waveform.js. Pitch-detection and
// MIDI export land in later steps (see changelog.md).

import { validateAudioFile, formatBytes, formatDuration, getExtension } from './modules/file-import.js';
import { decodeAndPrepare } from './modules/audio-decode.js';
import { drawWaveform } from './modules/waveform.js';

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

let selectedFile = null;
let objectUrl = null;
let decodedAudio = null; // Populated by decodeSelectedFile(); consumed by later steps.
// Guards against a slow decode finishing after the user has already picked
// a different file (or removed the selection).
let decodeGeneration = 0;

// --- Drop zone interactions ---------------------------------------------

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
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
  resetSelection();
});

// --- File handling -------------------------------------------------------

function handleFile(file) {
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
  // Convert button stays disabled until the processing engine (Step 3) lands.
  convertBtn.disabled = true;

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
  } catch (err) {
    if (myGeneration !== decodeGeneration) return;
    console.error('Audio decoding failed:', err);
    setDecodeStatus(
      `Could not decode this file — it may be corrupted or in an unsupported format. (${err && err.message ? err.message : err})`,
      true
    );
  }
}

function setDecodeStatus(message, isError = false) {
  decodeStatus.textContent = message;
  decodeStatus.classList.toggle('error', isError);
}

function resetSelection() {
  selectedFile = null;
  decodedAudio = null;
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
}

function showError(message) {
  errorText.textContent = message;
  errorText.classList.remove('hidden');
}

function clearError() {
  errorText.textContent = '';
  errorText.classList.add('hidden');
}
