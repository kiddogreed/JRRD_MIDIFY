// JRRD_MIDIFY — App entry point (Step 1: import / attach audio file).
// Wires up drag-and-drop + file picker UI and delegates validation to
// js/modules/file-import.js. Processing/conversion logic will be added
// in subsequent steps (see changelog.md).

import { validateAudioFile, formatBytes, formatDuration, getExtension } from './modules/file-import.js';

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const errorText = document.getElementById('errorText');
const fileCard = document.getElementById('fileCard');
const fileName = document.getElementById('fileName');
const fileSub = document.getElementById('fileSub');
const audioPreview = document.getElementById('audioPreview');
const removeFileBtn = document.getElementById('removeFileBtn');
const convertBtn = document.getElementById('convertBtn');

let selectedFile = null;
let objectUrl = null;

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
  // Convert button stays disabled until the processing engine (Step 2) lands.
  convertBtn.disabled = true;
}

function resetSelection() {
  selectedFile = null;
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  audioPreview.removeAttribute('src');
  audioPreview.load();
  fileCard.classList.add('hidden');
  convertBtn.disabled = true;
  clearError();
}

function showError(message) {
  errorText.textContent = message;
  errorText.classList.remove('hidden');
}

function clearError() {
  errorText.textContent = '';
  errorText.classList.add('hidden');
}
