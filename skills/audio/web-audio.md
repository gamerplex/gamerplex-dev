# Web Audio API — Game Sound Without External Files

## Architecture

```javascript
// AudioManager singleton — create on first user interaction
let audioCtx;
function initAudio() {
  if (audioCtx) return;
  audioCtx = new AudioContext();
  masterGain = audioCtx.createGain();
  sfxGain = audioCtx.createGain();
  musicGain = audioCtx.createGain();
  sfxGain.connect(masterGain);
  musicGain.connect(masterGain);
  masterGain.connect(audioCtx.destination);
}

// MUST be called from user gesture (click, keydown, touchstart)
document.addEventListener("click", initAudio, { once: true });
document.addEventListener("keydown", initAudio, { once: true });
```

## Synthesized SFX (Zero Dependencies)

```javascript
function playSFX(freq, type, duration, volume = 0.3) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type; // "sine", "square", "sawtooth", "triangle"
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain);
  gain.connect(sfxGain);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

// Standard game SFX preset library:
const SFX = {
  jump:     () => playSFX(440, "square", 0.1, 0.2),
  land:     () => playSFX(150, "triangle", 0.06, 0.15),
  coin:     () => { playSFX(880, "square", 0.08); setTimeout(() => playSFX(1174, "square", 0.12), 80); },
  hit:      () => playSFX(200, "sawtooth", 0.15, 0.25),
  die:      () => playSFX(200, "sawtooth", 0.5, 0.3),
  win:      () => { playSFX(523,"square",0.15); setTimeout(()=>playSFX(659,"square",0.15),150); setTimeout(()=>playSFX(784,"square",0.3),300); },
  click:    () => playSFX(600, "sine", 0.05, 0.1),
  error:    () => { playSFX(120, "square", 0.1); setTimeout(() => playSFX(90, "square", 0.15), 100); },
  powerup:  () => { for(let i=0;i<5;i++) setTimeout(()=>playSFX(400+i*100,"square",0.08),i*50); },
  explosion:() => { const n=audioCtx.createBufferSource();const b=audioCtx.createBuffer(1,audioCtx.sampleRate*0.3,audioCtx.sampleRate);const d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/d.length*5);n.buffer=b;const g=audioCtx.createGain();g.gain.value=0.4;n.connect(g);g.connect(sfxGain);n.start(); },
};
```

## Pitch Variation (Prevents Repetition)
```javascript
function playSFXVaried(baseFreq, type, duration, volume) {
  const variation = 0.95 + Math.random() * 0.1; // ±5%
  playSFX(baseFreq * variation, type, duration, volume);
}
```

## Music (Step Sequencer, No Files)

```javascript
// Simple chiptune sequencer
const NOTES = { C4:261, D4:293, E4:329, F4:349, G4:392, A4:440, B4:493, C5:523 };
const melody = ["C4","E4","G4","C5","G4","E4","C4",null]; // null = rest
let beatIndex = 0;
const BPM = 120;

function playBeat() {
  const note = melody[beatIndex % melody.length];
  if (note) playSFX(NOTES[note], "square", 0.1, 0.1);
  beatIndex++;
  setTimeout(playBeat, 60000 / BPM);
}
```

## Mute with localStorage Persistence
```javascript
let muted = localStorage.getItem("muted") === "true";
function toggleMute() {
  muted = !muted;
  masterGain.gain.value = muted ? 0 : 1;
  localStorage.setItem("muted", muted);
}
```

## Rules
- ALWAYS init AudioContext from user gesture (browser policy)
- ALWAYS provide volume/mute controls
- Sound on EVERY player action — silence = broken game
- Vary pitch ±5% on repeated sounds (prevents machine-gun effect)
- Music volume < SFX volume (music is backdrop, SFX is feedback)
