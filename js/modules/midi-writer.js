// JRRD_MIDIFY — Standard MIDI File (SMF) writer (Step 4).
//
// Hand-written SMF Type 0 encoder — no dependency on `@tonejs/midi` (which
// relies on Node's `Buffer` and isn't needed in-browser; see the Step 1
// architecture decision in changelog.md). Takes the note events produced by
// js/modules/basic-pitch.js and encodes a complete, player-compatible
// .midi file: tempo + time signature, a General MIDI program change, an
// RPN 0,0 pitch-bend-range declaration, and Note On/Off + Pitch Bend events
// reconstructed from each note's contour data.
//
// Pitch-bend design note: MIDI pitch bend is a *channel-wide* message — it
// bends every note currently sounding on that channel, not just one. To
// avoid incorrectly bending notes that happen to sound at the same time as
// a bent note (e.g. a bent melody note stacked over a sustained chord),
// bend reconstruction is only applied to notes that do not overlap in time
// with any other note (see computeOverlapFlags). Overlapping notes (chords,
// double-stops) still get fully correct pitch/timing/velocity — they just
// play at their quantized semitone pitch rather than with micro-pitch
// detail, which also matches how those instruments usually behave in
// practice (e.g. a piano cannot bend pitch at all). This keeps the whole
// file on a single clean channel/track (friendly for DAW/LMMS import)
// instead of spreading notes across many MIDI channels purely to guarantee
// per-note bend isolation.

import { amplitudeToVelocity } from './music-utils.js';

const CONTOUR_BINS_PER_SEMITONE = 3; // Basic Pitch's pitchBends unit (1 bin = 1/3 semitone).
const CHANNEL = 0;
const PITCH_BEND_CENTER = 8192;

/**
 * @param {Array<{startTimeSeconds:number, durationSeconds:number, pitchMidi:number, amplitude:number, pitchBends?:number[]}>} notes
 * @param {Object} [options]
 * @param {number} [options.bpm=120] Tempo used for the file's tick/time
 *   mapping. Does not affect audible timing accuracy: note times are always
 *   converted to ticks using this same value, so playback comes out at the
 *   correct real-world duration regardless of which BPM number is chosen.
 * @param {number} [options.ticksPerQuarter=960] SMF division (ticks per
 *   quarter note) — higher gives finer pitch-bend timing resolution.
 * @param {number} [options.pitchBendRangeSemitones=12] Range declared via
 *   RPN 0,0; bend samples are scaled against this.
 * @param {string} [options.trackName='JRRD_MIDIFY']
 * @returns {Uint8Array}
 */
export function buildStandardMidiFile(notes, options = {}) {
  const {
    bpm = 120,
    ticksPerQuarter = 960,
    pitchBendRangeSemitones = 12,
    trackName = 'JRRD_MIDIFY',
  } = options;

  const ticksPerSecond = (ticksPerQuarter * bpm) / 60;
  const toTicks = (seconds) => Math.max(0, Math.round(seconds * ticksPerSecond));

  const cleanNotes = notes
    .filter((note) => note.durationSeconds > 0)
    .map((note) => ({
      startTimeSeconds: note.startTimeSeconds,
      durationSeconds: note.durationSeconds,
      pitchMidi: clamp(Math.round(note.pitchMidi), 0, 127),
      velocity: amplitudeToVelocity(note.amplitude),
      pitchBends: note.pitchBends,
    }));

  const overlapsAnother = computeOverlapFlags(cleanNotes);

  const events = []; // { tick, priority, seq, bytes }
  let seq = 0; // Stable tie-break so same-tick events keep a sensible order.
  const push = (tick, priority, bytes) => {
    events.push({ tick, priority, seq: seq++, bytes });
  };

  // --- Setup meta/control events at tick 0 --------------------------------
  const microsecondsPerQuarter = Math.round(60000000 / bpm);
  push(
    0,
    0,
    metaEvent(0x51, [
      (microsecondsPerQuarter >> 16) & 0xff,
      (microsecondsPerQuarter >> 8) & 0xff,
      microsecondsPerQuarter & 0xff,
    ])
  ); // Set Tempo
  push(0, 0, metaEvent(0x58, [4, 2, 24, 8])); // Time Signature: 4/4
  push(0, 0, metaEvent(0x03, textBytes(trackName))); // Track Name
  push(0, 0, [0xc0 | CHANNEL, 0]); // Program Change -> Acoustic Grand Piano
  // RPN 0,0 -> Pitch Bend Range (semitones.cents), then null the RPN so no
  // later Data Entry CC can accidentally retarget it.
  push(0, 1, [0xb0 | CHANNEL, 0x65, 0x00]);
  push(0, 1, [0xb0 | CHANNEL, 0x64, 0x00]);
  push(0, 1, [0xb0 | CHANNEL, 0x06, clamp(Math.round(pitchBendRangeSemitones), 0, 127)]);
  push(0, 1, [0xb0 | CHANNEL, 0x26, 0x00]);
  push(0, 1, [0xb0 | CHANNEL, 0x65, 0x7f]);
  push(0, 1, [0xb0 | CHANNEL, 0x64, 0x7f]);

  // --- Notes ---------------------------------------------------------------
  cleanNotes.forEach((note, i) => {
    const startTick = toTicks(note.startTimeSeconds);
    const endTick = Math.max(startTick + 1, toTicks(note.startTimeSeconds + note.durationSeconds));

    push(startTick, 2, [0x90 | CHANNEL, note.pitchMidi, note.velocity]); // Note On
    push(endTick, 0, [0x80 | CHANNEL, note.pitchMidi, 0]); // Note Off

    if (!overlapsAnother[i] && note.pitchBends && note.pitchBends.length > 0) {
      let lastValue = null;
      note.pitchBends.forEach((bend, k) => {
        const sampleTime = note.startTimeSeconds + (k * note.durationSeconds) / note.pitchBends.length;
        const semitoneOffset = bend / CONTOUR_BINS_PER_SEMITONE;
        const normalized = clamp(semitoneOffset / pitchBendRangeSemitones, -1, 1);
        const value14 = clamp(Math.round(PITCH_BEND_CENTER + normalized * PITCH_BEND_CENTER), 0, 16383);
        if (value14 === lastValue) return; // Skip redundant identical samples.
        lastValue = value14;
        push(toTicks(sampleTime), 3, pitchBendEvent(value14));
      });
      // Return to center so this channel's bend doesn't leak into whatever
      // plays next (the whole file shares one channel -- see module header).
      push(endTick, 3, pitchBendEvent(PITCH_BEND_CENTER));
    }
  });

  // --- End of track ----------------------------------------------------------
  const lastTick = events.reduce((max, e) => Math.max(max, e.tick), 0);
  push(lastTick, 4, metaEvent(0x2f, []));

  events.sort((a, b) => a.tick - b.tick || a.priority - b.priority || a.seq - b.seq);

  const trackBytes = [];
  let prevTick = 0;
  for (const event of events) {
    trackBytes.push(...encodeVarLength(event.tick - prevTick));
    trackBytes.push(...event.bytes);
    prevTick = event.tick;
  }

  const header = [
    ...asciiBytes('MThd'),
    0,
    0,
    0,
    6,
    0,
    0, // format 0 (single multi-channel track)
    0,
    1, // 1 track
    (ticksPerQuarter >> 8) & 0xff,
    ticksPerQuarter & 0xff,
  ];

  const track = [...asciiBytes('MTrk'), ...uint32(trackBytes.length), ...trackBytes];

  return new Uint8Array([...header, ...track]);
}

/**
 * Convenience wrapper: build the file and wrap it in a Blob ready for
 * URL.createObjectURL().
 * @returns {Blob}
 */
export function buildMidiBlob(notes, options) {
  const bytes = buildStandardMidiFile(notes, options);
  return new Blob([bytes], { type: 'audio/midi' });
}

/** Derives a `<name>_JRRD_MIDIFY.midi` filename from an input audio filename. */
export function suggestMidiFileName(originalFileName) {
  const base = (originalFileName || 'output').replace(/\.[^./]+$/, '');
  return `${base}_JRRD_MIDIFY.midi`;
}

// --- Internal helpers --------------------------------------------------------

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function metaEvent(type, dataBytes) {
  return [0xff, type, dataBytes.length, ...dataBytes];
}

function pitchBendEvent(value14) {
  return [0xe0 | CHANNEL, value14 & 0x7f, (value14 >> 7) & 0x7f];
}

function textBytes(text) {
  return Array.from(text, (ch) => ch.charCodeAt(0) & 0x7f);
}

function asciiBytes(text) {
  return Array.from(text, (ch) => ch.charCodeAt(0));
}

function uint32(value) {
  return [(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function encodeVarLength(value) {
  const bytes = [value & 0x7f];
  let remaining = value >>> 7;
  while (remaining > 0) {
    bytes.unshift((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }
  return bytes;
}

/**
 * Marks each note `true` if its [start, end) interval overlaps any other
 * note's interval (used to decide whether pitch-bend reconstruction is
 * safe for that note — see the module header comment).
 * @param {Array<{startTimeSeconds:number, durationSeconds:number}>} notes
 * @returns {boolean[]}
 */
function computeOverlapFlags(notes) {
  const order = notes
    .map((note, index) => ({
      index,
      start: note.startTimeSeconds,
      end: note.startTimeSeconds + note.durationSeconds,
    }))
    .sort((a, b) => a.start - b.start);

  const overlaps = new Array(notes.length).fill(false);
  const active = []; // { index, end }

  for (const current of order) {
    for (let i = active.length - 1; i >= 0; i -= 1) {
      if (active[i].end <= current.start) {
        active.splice(i, 1);
      }
    }
    if (active.length > 0) {
      overlaps[current.index] = true;
      active.forEach((a) => {
        overlaps[a.index] = true;
      });
    }
    active.push({ index: current.index, end: current.end });
  }

  return overlaps;
}
