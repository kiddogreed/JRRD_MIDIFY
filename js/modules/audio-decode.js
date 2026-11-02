// JRRD_MIDIFY — Audio decoding helpers (no DOM).
// Decodes a File into an AudioBuffer and prepares a mono, 22050 Hz
// Float32Array copy, which is the exact input format Spotify's Basic Pitch
// model requires (see Step 3 in changelog.md). Kept dependency-free and
// framework-free so it can be unit-tested or reused independently of the UI.

export const MODEL_SAMPLE_RATE = 22050;

/**
 * Decodes a File (mp3/wav) into a Web Audio API AudioBuffer.
 * @param {File} file
 * @returns {Promise<AudioBuffer>}
 */
export async function decodeAudioFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error('This browser does not support the Web Audio API.');
  }

  const audioCtx = new AudioContextCtor();
  try {
    // decodeAudioData detaches/consumes the buffer in some browsers, so it
    // must not be reused after this call.
    const audioBuffer = await decodeWithPromise(audioCtx, arrayBuffer);
    return audioBuffer;
  } finally {
    // Decoding does not require an open context; release it immediately.
    audioCtx.close().catch(() => {});
  }
}

/**
 * Wraps decodeAudioData's callback/promise dual API to normalize errors
 * across browsers (Safari historically only supported the callback form).
 */
function decodeWithPromise(audioCtx, arrayBuffer) {
  return new Promise((resolve, reject) => {
    const maybePromise = audioCtx.decodeAudioData(
      arrayBuffer,
      resolve,
      (err) => reject(err || new Error('Unknown audio decoding error.'))
    );
    if (maybePromise && typeof maybePromise.then === 'function') {
      maybePromise.then(resolve, reject);
    }
  });
}

/**
 * Downmixes and resamples a decoded AudioBuffer to mono @ MODEL_SAMPLE_RATE
 * using an OfflineAudioContext (the browser does the band-limited resampling).
 * @param {AudioBuffer} audioBuffer
 * @returns {Promise<Float32Array>}
 */
export async function resampleToMono(audioBuffer, targetSampleRate = MODEL_SAMPLE_RATE) {
  const OfflineAudioContextCtor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineAudioContextCtor) {
    throw new Error('This browser does not support OfflineAudioContext.');
  }

  const length = Math.max(1, Math.ceil(audioBuffer.duration * targetSampleRate));
  const offlineCtx = new OfflineAudioContextCtor(1, length, targetSampleRate);

  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  // Connecting a multi-channel source to a 1-channel destination makes the
  // Web Audio API downmix automatically per the spec's mixing rules.
  source.connect(offlineCtx.destination);
  source.start(0);

  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0);
}

/**
 * Convenience helper: decode a file and immediately prepare the mono
 * 22050 Hz samples future steps need, alongside metadata for the UI.
 * @param {File} file
 */
export async function decodeAndPrepare(file) {
  const audioBuffer = await decodeAudioFile(file);
  const monoSamples = await resampleToMono(audioBuffer);
  return {
    audioBuffer,
    monoSamples,
    modelSampleRate: MODEL_SAMPLE_RATE,
    meta: {
      durationSeconds: audioBuffer.duration,
      originalSampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels,
      monoSampleCount: monoSamples.length,
    },
  };
}
