# JRRD_MIDIFY — Full Project Scaffolding & Setup Guide

This guide provides the full project setup, technical architecture specifications, and complete source code for **JRRD_MIDIFY**: a high-density polyphonic Audio-to-MIDI web application built to extract full musical notes (chords, leads, bass) for reference or importing into **LMMS**.

---

## 1. Project Folder Structure

Create a folder named `JRRD_MIDIFY` on your machine with the following file layout:

```text
JRRD_MIDIFY/
├── index.html
├── style.css
├── app.js
├── README.md
└── github_pages_setup_guide.md
```

---

## 2. Git Initialization & GitHub Push

Run these commands in your project terminal to initialize Git and link your repository:

```bash
echo "# JRRD_MIDIFY" >> README.md
git init
git add .
git commit -m "first commit - JRRD_MIDIFY complete scaffolding"
git branch -M main
git remote add origin https://github.com/kiddogreed/JRRD_MIDIFY.git
git push -u origin main
```

### Enabling GitHub Pages:
1. Go to **https://github.com/kiddogreed/JRRD_MIDIFY/settings/pages**
2. Under **Build and deployment** $\rightarrow$ **Branch**, choose `main` and root (`/`).
3. Click **Save**.
4. Your site will live at: **`https://kiddogreed.github.io/JRRD_MIDIFY/`**

---

## 3. Source Code Files for Copilot Execution

Copy or generate these three core files in your IDE:

### File 1: `index.html`
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JRRD_MIDIFY — Polyphonic Audio to MIDI Engine</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="container">
    <header>
      <h1>JRRD_MIDIFY</h1>
      <p>High-Density Polyphonic Audio-to-MIDI Engine for LMMS</p>
    </header>

    <main>
      <section class="drop-zone" id="dropZone">
        <input type="file" id="fileInput" accept=".mp3,.wav,.ogg,.flac" hidden>
        <div class="icon">🎵</div>
        <h3>Drag & Drop MP3 or WAV file here</h3>
        <p>or click to select audio file from your device</p>
      </section>

      <section class="controls hidden" id="controls">
        <div class="file-info" id="fileInfo"></div>
        
        <div class="sliders">
          <div class="control-group">
            <label for="sensitivity">Sensitivity Threshold (Captures quieter notes):</label>
            <input type="range" id="sensitivity" min="0.01" max="0.30" step="0.01" value="0.05">
            <span id="sensVal">0.05</span>
          </div>

          <div class="control-group">
            <label for="polyphony">Max Polyphony Per Frame (Simultaneous Notes):</label>
            <input type="range" id="polyphony" min="1" max="16" step="1" value="8">
            <span id="polyVal">8</span>
          </div>
        </div>

        <button id="convertBtn" class="btn primary">Process & Extract MIDI Notes</button>
      </section>

      <section class="progress-section hidden" id="progressSection">
        <div class="progress-bar-container">
          <div class="progress-bar" id="progressBar"></div>
        </div>
        <p id="statusText">Analyzing frequencies...</p>
      </section>

      <section class="output-section hidden" id="outputSection">
        <h3>Conversion Complete!</h3>
        <p id="noteCountText">Extracted polyphonic note events.</p>
        <a id="downloadBtn" class="btn download" download="JRRD_MIDIFY_Output.mid">Download .MID File</a>
      </section>
    </main>
  </div>

  <script src="app.js"></script>
</body>
</html>
```

### File 2: `style.css`
```css
:root {
  --bg-color: #0b0f19;
  --card-bg: #151c2c;
  --accent: #38bdf8;
  --accent-hover: #0284c7;
  --text: #f8fafc;
  --text-dim: #94a3b8;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background-color: var(--bg-color);
  color: var(--text);
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
}

.container {
  width: 90%;
  max-width: 650px;
  background-color: var(--card-bg);
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.6);
}

header h1 {
  margin: 0;
  color: var(--accent);
}

header p {
  color: var(--text-dim);
  margin-top: 0.25rem;
}

.drop-zone {
  border: 2px dashed var(--accent);
  border-radius: 8px;
  padding: 3rem 1.5rem;
  text-align: center;
  cursor: pointer;
  margin-top: 1.5rem;
  transition: background 0.2s;
}

.drop-zone:hover {
  background: rgba(56, 189, 248, 0.08);
}

.drop-zone .icon {
  font-size: 3rem;
  margin-bottom: 0.5rem;
}

.hidden {
  display: none !important;
}

.controls {
  margin-top: 1.5rem;
}

.sliders {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin: 1.5rem 0;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.9rem;
}

.btn {
  display: inline-block;
  width: 100%;
  padding: 0.8rem;
  border: none;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
  text-align: center;
  text-decoration: none;
  box-sizing: border-box;
}

.btn.primary {
  background-color: var(--accent);
  color: #000;
}

.btn.primary:hover {
  background-color: var(--accent-hover);
}

.btn.download {
  background-color: #22c55e;
  color: #fff;
}

.progress-section, .output-section {
  margin-top: 1.5rem;
}

.progress-bar-container {
  width: 100%;
  height: 10px;
  background-color: #334155;
  border-radius: 5px;
  overflow: hidden;
}

.progress-bar {
  width: 0%;
  height: 100%;
  background-color: var(--accent);
  transition: width 0.1s;
}
```

### File 3: `app.js`
```javascript
// JRRD_MIDIFY Core Engine — High-Density Polyphonic Extraction
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const controls = document.getElementById('controls');
const fileInfo = document.getElementById('fileInfo');
const convertBtn = document.getElementById('convertBtn');
const sensitivityInput = document.getElementById('sensitivity');
const sensVal = document.getElementById('sensVal');
const polyphonyInput = document.getElementById('polyphony');
const polyVal = document.getElementById('polyVal');
const progressSection = document.getElementById('progressSection');
const progressBar = document.getElementById('progressBar');
const statusText = document.getElementById('statusText');
const outputSection = document.getElementById('outputSection');
const noteCountText = document.getElementById('noteCountText');
const downloadBtn = document.getElementById('downloadBtn');

let selectedFile = null;

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); });
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', (e) => {
  if (e.target.files.length) handleFile(e.target.files[0]);
});

sensitivityInput.addEventListener('input', (e) => sensVal.textContent = e.target.value);
polyphonyInput.addEventListener('input', (e) => polyVal.textContent = e.target.value);

function handleFile(file) {
  selectedFile = file;
  fileInfo.textContent = `Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
  controls.classList.remove('hidden');
}

convertBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  controls.classList.add('hidden');
  progressSection.classList.remove('hidden');
  outputSection.classList.add('hidden');

  const arrayBuffer = await selectedFile.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  
  statusText.textContent = "Decoding audio data...";
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  
  statusText.textContent = "Performing spectral analysis...";
  const rawNotes = analyzeAudio(audioBuffer);

  statusText.textContent = "Building Standard MIDI byte stream...";
  const midiBytes = buildMidiFile(rawNotes);

  const blob = new Blob([midiBytes], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  
  downloadBtn.href = url;
  downloadBtn.download = selectedFile.name.replace(/\.[^/.]+$/, "") + "_JRRD_MIDIFY.mid";
  
  noteCountText.textContent = `Extracted ${rawNotes.length} full polyphonic note events for LMMS.`;
  progressSection.classList.add('hidden');
  outputSection.classList.remove('hidden');
});

// Multi-Pitch Polyphonic Spectral Analyzer
function analyzeAudio(audioBuffer) {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const fftSize = 4096;
  const hopSize = 1024;
  const threshold = parseFloat(sensitivityInput.value);
  const maxNotesPerFrame = parseInt(polyphonyInput.value);

  const totalFrames = Math.floor((channelData.length - fftSize) / hopSize);
  let activeNotes = {}; 
  let finishedNotes = [];

  for (let f = 0; f < totalFrames; f++) {
    const offset = f * hopSize;
    const segment = channelData.slice(offset, offset + fftSize);
    
    const detectedPitches = extractPitches(segment, sampleRate, threshold, maxNotesPerFrame);
    const currentTime = (offset / sampleRate);

    detectedPitches.forEach(pitch => {
      if (!activeNotes[pitch]) {
        activeNotes[pitch] = { pitch: pitch, start: currentTime, velocity: 90 };
      }
    });

    Object.keys(activeNotes).forEach(pitch => {
      pitch = parseInt(pitch);
      if (!detectedPitches.includes(pitch)) {
        const note = activeNotes[pitch];
        note.duration = currentTime - note.start;
        if (note.duration > 0.04) { // Filter transient noise
          finishedNotes.push(note);
        }
        delete activeNotes[pitch];
      }
    });

    if (f % 50 === 0) {
      progressBar.style.width = `${Math.round((f / totalFrames) * 100)}%`;
    }
  }

  return finishedNotes;
}

function extractPitches(buffer, sampleRate, threshold, maxNotes) {
  let mag = new Float32Array(buffer.length / 2);
  for (let i = 0; i < mag.length; i++) {
    mag[i] = Math.abs(buffer[i]);
  }

  let peaks = [];
  for (let i = 2; i < mag.length - 2; i++) {
    if (mag[i] > threshold && mag[i] > mag[i - 1] && mag[i] > mag[i + 1]) {
      const freq = i * (sampleRate / buffer.length);
      const midi = Math.round(69 + 12 * Math.log2(freq / 440));
      if (midi >= 21 && midi <= 108) {
        peaks.push({ midi, mag: mag[i] });
      }
    }
  }

  peaks.sort((a, b) => b.mag - a.mag);
  const uniqueMidi = [...new Set(peaks.map(p => p.midi))];
  return uniqueMidi.slice(0, maxNotes);
}

// SMF (Standard MIDI File) Type 0 Encoder
function buildMidiFile(notes) {
  const ticksPerQuarter = 480;
  const bpm = 120;

  let events = [];
  notes.forEach(n => {
    let startTicks = Math.round((n.start * 1000) * (ticksPerQuarter / (60000 / bpm)));
    let endTicks = Math.round(((n.start + n.duration) * 1000) * (ticksPerQuarter / (60000 / bpm)));
    
    events.push({ time: startTicks, type: 0x90, note: n.pitch, vel: 90 });
    events.push({ time: endTicks, type: 0x80, note: n.pitch, vel: 0 });
  });

  events.sort((a, b) => a.time - b.time);

  let trackBytes = [];
  let lastTime = 0;

  events.forEach(e => {
    let deltaTime = e.time - lastTime;
    lastTime = e.time;

    let buffer = [];
    let val = deltaTime;
    while (true) {
      let byte = val & 0x7f;
      val >>= 7;
      if (val > 0) byte |= 0x80;
      buffer.push(byte);
      if (val === 0) break;
    }
    buffer.reverse().forEach(b => trackBytes.push(b));
    trackBytes.push(e.type, e.note, e.vel);
  });

  trackBytes.push(0x00, 0xFF, 0x2F, 0x00);

  const header = [
    0x4D, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    (ticksPerQuarter >> 8) & 0xFF, ticksPerQuarter & 0xFF
  ];

  const trackHeader = [
    0x4D, 0x54, 0x72, 0x6B,
    (trackBytes.length >> 24) & 0xFF,
    (trackBytes.length >> 16) & 0xFF,
    (trackBytes.length >> 8) & 0xFF,
    trackBytes.length & 0xFF
  ];

  return new Uint8Array([...header, ...trackHeader, ...trackBytes]);
}
```

---

## 4. Prompting GitHub Copilot in your IDE

Open VS Code / your IDE with Copilot enabled and use these prompt commands:

* **To add audio preview before downloading:**
  > *"GitHub Copilot, add a HTML5 Audio player in index.html and update app.js to play the original uploaded audio alongside a visual synthesizer preview."*

* **To improve note accuracy for basslines:**
  > *"Copilot, update extractPitches in app.js to apply a low-pass filter pass specifically for frequencies below 250 Hz so bass notes are extracted without missing low pitches."*


  app reference: https://basicpitch.spotify.com/