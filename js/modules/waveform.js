// JRRD_MIDIFY — Waveform peak computation & canvas rendering (no DOM lookup,
// takes an explicit canvas element so it stays reusable/testable).

/**
 * Computes min/max peak pairs per pixel-bucket across all channels averaged
 * together, for a compact visual summary of the whole file.
 * @param {AudioBuffer} audioBuffer
 * @param {number} numBuckets
 * @returns {Float32Array} length === numBuckets * 2, interleaved [min, max, min, max, ...]
 */
export function computePeaks(audioBuffer, numBuckets) {
  const channelCount = audioBuffer.numberOfChannels;
  const channels = new Array(channelCount);
  for (let c = 0; c < channelCount; c += 1) {
    channels[c] = audioBuffer.getChannelData(c);
  }

  const length = audioBuffer.length;
  const peaks = new Float32Array(numBuckets * 2);
  const bucketSize = length / numBuckets;

  for (let i = 0; i < numBuckets; i += 1) {
    const start = Math.floor(i * bucketSize);
    const end = Math.min(length, Math.floor((i + 1) * bucketSize));
    let min = 0;
    let max = 0;
    if (end > start) {
      min = Infinity;
      max = -Infinity;
      for (let j = start; j < end; j += 1) {
        let sum = 0;
        for (let c = 0; c < channelCount; c += 1) {
          sum += channels[c][j];
        }
        const sample = sum / channelCount;
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }
    }
    peaks[i * 2] = min;
    peaks[i * 2 + 1] = max;
  }

  return peaks;
}

/**
 * Renders a waveform (min/max bars) onto a canvas element, matching the
 * canvas's current displayed CSS size at the device pixel ratio.
 * @param {HTMLCanvasElement} canvas
 * @param {AudioBuffer} audioBuffer
 */
export function drawWaveform(canvas, audioBuffer) {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 600;
  const cssHeight = canvas.clientHeight || 110;
  canvas.width = Math.max(1, Math.round(cssWidth * dpr));
  canvas.height = Math.max(1, Math.round(cssHeight * dpr));

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const numBuckets = canvas.width;
  const peaks = computePeaks(audioBuffer, numBuckets);
  const midY = canvas.height / 2;
  const scale = canvas.height / 2;

  ctx.fillStyle = '#38bdf8';
  for (let i = 0; i < numBuckets; i += 1) {
    const min = peaks[i * 2];
    const max = peaks[i * 2 + 1];
    const y1 = midY - max * scale;
    const y2 = midY - min * scale;
    const barHeight = Math.max(1, y2 - y1);
    ctx.fillRect(i, y1, 1, barHeight);
  }
}
