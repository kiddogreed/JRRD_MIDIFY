// JRRD_MIDIFY — Small music-theory helpers shared by the note preview (Step 3)
// and the upcoming MIDI writer (Step 4).

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Converts a (possibly fractional, from pitch-bend-adjusted) MIDI note
 * number into a human-readable note name, e.g. 60 -> "C4".
 * @param {number} midi
 */
export function midiToNoteName(midi) {
  const rounded = Math.round(midi);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

/**
 * Converts a Basic Pitch note "amplitude" (roughly 0..1 model confidence/
 * energy) into a MIDI velocity (1..127).
 * @param {number} amplitude
 */
export function amplitudeToVelocity(amplitude) {
  const velocity = Math.round(Math.max(0, Math.min(1, amplitude)) * 127);
  return Math.max(1, velocity);
}
