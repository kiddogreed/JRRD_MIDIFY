// JRRD_MIDIFY — Note post-processing (Step 5): stitches together notes that
// were likely a single sustained/held note but got split into two or more
// fragments by a brief dip in the model's frame-confidence (e.g. a slight
// dynamic swell, a vibrato dip, or background noise). This directly targets
// the "no missing notes / no incomplete tune" requirement: a note that
// stutters into 3 fragments instead of 1 continuous tone reads as broken or
// incomplete even though no pitch information was actually lost.
//
// Basic Pitch's own outputToNotesPoly() already has a similar internal
// "energy tolerance" mechanism, but it operates on raw model frames before
// onset/duration quantization and isn't user-tunable without re-running
// inference. This module operates on the final note list instead, so the
// stitching aggressiveness can be adjusted and re-applied instantly without
// re-running the (slow) model -- see js/app.js.

/**
 * Merges consecutive same-pitch notes whose gap is small enough that they
 * were almost certainly one held note that got fragmented.
 * @param {Array<{startTimeSeconds:number, durationSeconds:number, pitchMidi:number, amplitude:number, pitchBends?:number[]}>} notes
 * @param {Object} [options]
 * @param {number} [options.maxGapSeconds=0.06] Maximum silent/low-confidence
 *   gap (in seconds) between two same-pitch notes for them to be merged.
 *   0 disables stitching entirely.
 * @returns {Array<object>} A new array (input is not mutated), sorted by
 *   start time. Merged notes keep the start time of the first fragment, the
 *   combined duration spanning all fragments, the loudest fragment's
 *   amplitude, and all fragments' pitch-bend samples concatenated in order.
 */
export function stitchNotes(notes, options = {}) {
  const { maxGapSeconds = 0.06 } = options;
  if (!maxGapSeconds || maxGapSeconds <= 0 || notes.length === 0) {
    return notes.slice().sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
  }

  const byPitch = new Map();
  notes.forEach((note) => {
    const pitch = Math.round(note.pitchMidi);
    if (!byPitch.has(pitch)) byPitch.set(pitch, []);
    byPitch.get(pitch).push(note);
  });

  const stitched = [];
  for (const group of byPitch.values()) {
    group.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);

    let current = null;
    for (const note of group) {
      if (current) {
        const currentEnd = current.startTimeSeconds + current.durationSeconds;
        const gap = note.startTimeSeconds - currentEnd;
        if (gap <= maxGapSeconds) {
          const noteEnd = note.startTimeSeconds + note.durationSeconds;
          current.durationSeconds = Math.max(currentEnd, noteEnd) - current.startTimeSeconds;
          current.amplitude = Math.max(current.amplitude, note.amplitude);
          if (note.pitchBends && note.pitchBends.length > 0) {
            current.pitchBends = (current.pitchBends || []).concat(note.pitchBends);
          }
          current.mergedFragmentCount = (current.mergedFragmentCount || 1) + 1;
          continue;
        }
      }
      if (current) stitched.push(current);
      current = { ...note };
    }
    if (current) stitched.push(current);
  }

  return stitched.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
}
