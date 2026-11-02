// JRRD_MIDIFY — Audio file import & validation helpers.
// Kept isolated from UI wiring so later steps (decoding, pitch detection,
// MIDI export) can import these helpers without pulling in DOM code.

export const ACCEPTED_EXTENSIONS = ['mp3', 'wav'];
export const ACCEPTED_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
];
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

/**
 * Validates that a File is an acceptable MP3/WAV audio file.
 * @param {File} file
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateAudioFile(file) {
  if (!file) {
    return { ok: false, reason: 'No file was selected.' };
  }

  const extension = getExtension(file.name);
  const extensionOk = ACCEPTED_EXTENSIONS.includes(extension);
  // Some browsers/OSes report an empty or generic MIME type for audio
  // files, so we accept the file if *either* the extension or the MIME
  // type matches a known-good value.
  const mimeOk = file.type ? ACCEPTED_MIME_TYPES.includes(file.type.toLowerCase()) : false;

  if (!extensionOk && !mimeOk) {
    return {
      ok: false,
      reason: `Unsupported file type. Please choose an ${formatList(ACCEPTED_EXTENSIONS)} file.`,
    };
  }

  if (file.size === 0) {
    return { ok: false, reason: 'The selected file is empty.' };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      reason: `File is too large (${formatBytes(file.size)}). Maximum supported size is ${formatBytes(MAX_FILE_SIZE_BYTES)}.`,
    };
  }

  return { ok: true };
}

export function getExtension(filename) {
  const match = /\.([^.]+)$/.exec(filename || '');
  return match ? match[1].toLowerCase() : '';
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 ? 2 : 1)} ${units[unitIndex]}`;
}

export function formatDuration(seconds) {
  if (!isFinite(seconds) || seconds < 0) return 'unknown length';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function formatList(items) {
  return items.map((item) => `.${item}`).join(' or ');
}
