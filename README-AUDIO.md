# Audio Reactivity Guide

Make shader effects react to sound using `audioAnalyzer` and `shaderEffects.updateEffectParam()`.

> **Note:** There is no `shaderEffects.enableAudio()` and no `audioBass` / `audioVolume` strings inside `effectsConfig`. Drive numeric effect params from the sketch each frame.

## Scripts to load

Add these to `index.html` (before `sketch.js`):

```html
<script src="./library/p5/p5.sound.min.js"></script>
<script src="./library/utils/audioAnalyzer.js"></script>
<script src="./library/utils/midiChime.js"></script>
<script src="./library/utils/audioDebugDisplay.js"></script>
```

## Unified debug panel

`audioDebugDisplay.js` exports **`debugPanel`** (alias: `audioDebugDisplay`) — one DOM overlay for:

- **Perf** — FPS + loop countdown (from `shaderEffects`)
- **Audio** — source, Bass/Mid/Treble/Volume/Energy, beat + BPM
- **Spectrum** — live FFT (0–1 scale for p5.sound 0.2+)

Separate from `#controls` / paramsPanel. Default hidden.

```javascript
debugPanel.init({
	audio: audioAnalyzer,
	shaders: shaderEffects,
});

// in draw():
debugPanel.update();

// key D (in keyPressed):
debugPanel.toggle();
```

## Quick Start with MIDI Chime

```javascript
function setup() {
	// ... existing setup ...

	audioAnalyzer.init("chime", {
		smoothing: 0.85,
		beatThreshold: 0.15,
	});

	midiChime.init({
		pattern: "chords", // 'chords', 'scale', 'bassline', 'arpeggio', 'drums', 'random'
		autoPlayInterval: 500,
	});

	enableMidiKeyboard();
	debugPanel.init({ audio: audioAnalyzer, shaders: shaderEffects }); // press D to toggle
}
```

### Keyboard controls

- `SPACE` — toggle auto-play
- `A–K` — notes (C major scale)
- `1–5` — chords
- `Z`, `X`, `C` — kick, snare, hi-hat
- `D` — toggle unified debug panel (FPS / loop / audio / spectrum)

### Test patterns

| Pattern | Good for |
| --- | --- |
| `chords` | overall energy |
| `bassline` | bass response |
| `arpeggio` | rapid changes |
| `drums` | beat detection |
| `scale` / `random` | general testing |

## Using the microphone

```javascript
audioAnalyzer.init("microphone", {
	smoothing: 0.8,
	beatThreshold: 0.15,
	fftBands: 1024,
	fftSmoothing: 0.8,
});
```

## Make shaders audio-reactive

### 1. Keep `effectsConfig` numeric

Uniforms reference effect params (and `shaderTime` / `shaderSeed`) only:

```javascript
deform: {
	enabled: true,
	amount: 0.1,
	octave: 4.0,
	uniforms: {
		uAmount: "amount",
		uTime: "shaderTime",
		uSeed: "shaderSeed",
		uOctave: "octave",
	},
},

chromatic: {
	enabled: true,
	amount: 0.0025,
	uniforms: {
		uAmount: "amount",
		uTime: "shaderTime",
		uSeed: "shaderSeed + 777.0",
	},
},

pixelSort: {
	enabled: true,
	angle: 0.0,
	threshold: 0.3,
	sortAmount: 0.8,
	uniforms: {
		uAngle: "angle",
		uThreshold: "threshold",
		uSortAmount: "sortAmount",
		uTime: "shaderTime",
		uSeed: "shaderSeed + 999.0",
		uResolution: "[width, height]",
	},
},
```

### 2. Update params every frame (before `apply`)

Call this in your draw / render loop before `shaderEffects.apply()`:

```javascript
function updateAudioReactiveParams() {
	if (!audioAnalyzer.isInitialized) return;

	audioAnalyzer.update();

	const bass = audioAnalyzer.bass;
	const mid = audioAnalyzer.mid;
	const treble = audioAnalyzer.treble;
	const volume = audioAnalyzer.volume;
	const energy = audioAnalyzer.energy;
	const beat = audioAnalyzer.isBeat ? 1 : 0;
	const bpm = audioAnalyzer.bpm || 120;
	const t = shaderEffects.shaderTime || 0;

	// 1. Simple audio pulse
	shaderEffects.updateEffectParam("chromatic", "amount", 0.0025 * (1 + volume));

	// 2. Bass-driven amount
	shaderEffects.updateEffectParam("deform", "amount", 0.1 + bass * 0.4);

	// 3. Multi-frequency response
	shaderEffects.updateEffectParam("pixelSort", "angle", mid * Math.PI * 2);
	shaderEffects.updateEffectParam("pixelSort", "sortAmount", 0.8 + treble * 0.5);

	// 4. Beat-triggered flash
	shaderEffects.updateEffectParam("chromatic", "amount", 0.0025 + beat * 0.02);

	// 5. BPM-synced modulation
	const phase = Math.sin(t * (bpm / 60) * Math.PI * 2);
	shaderEffects.updateEffectParam("deform", "amount", 0.1 + phase * 0.05 * energy);

	// 6. Spectrum bands → your own colour / custom params
	// audioAnalyzer.subBass / .mid / .presence / .volume

	// 7. Dynamic threshold
	shaderEffects.updateEffectParam("pixelSort", "threshold", 0.5 - energy * 0.3);

	// 8. Combination (time + audio)
	shaderEffects.updateEffectParam("pixelSort", "angle", t * 0.5 + mid * Math.PI);
	shaderEffects.updateEffectParam("deform", "amount", 0.1 + Math.sin(t) * 0.02 + bass * 0.3);

	// Custom frequency range (kick)
	const kick = audioAnalyzer.getFrequency(40, 100);
	shaderEffects.updateEffectParam("deform", "amount", 0.1 + kick * 0.5);
}
```

Pick the mappings you need — don’t call every line at once if they fight over the same param.

## Available audio properties

All band / level values are normalized **0–1**.

### Frequency bands

| Property | Typical use |
| --- | --- |
| `audioAnalyzer.bass` | kicks, bass |
| `audioAnalyzer.mid` | vocals, guitars |
| `audioAnalyzer.treble` | cymbals, hi-hats |
| `audioAnalyzer.subBass` | 20–60 Hz deep rumble |
| `audioAnalyzer.lowMid` | 250–500 Hz |
| `audioAnalyzer.highMid` | 2000–4000 Hz |
| `audioAnalyzer.presence` | 4000–6000 Hz |

### Overall metrics

| Property / method | Meaning |
| --- | --- |
| `audioAnalyzer.volume` | overall loudness |
| `audioAnalyzer.energy` | volume² (more dramatic) |
| `audioAnalyzer.isBeat` / `.beat()` | beat this frame |
| `audioAnalyzer.bpm` / `.getBPM()` | detected BPM (~30–300) |

### Helpers

```javascript
audioAnalyzer.getFrequency(40, 100); // custom Hz range → 0–1
audioAnalyzer.getSpectrum();
audioAnalyzer.getWaveform();
audioAnalyzer.setSmoothing(0.9);
audioAnalyzer.setBeatThreshold(0.1);
audioAnalyzer.getDebugInfo();
```

## Tips

1. Keep `effectsConfig` static; do audio math in the sketch
2. Bass → big motion / scale; mid → colour / rotation; treble → grain / detail
3. Scale gently (`* 0.3`) first; don’t map every param
4. Smoothing 0.85–0.95 = fluid; 0.5–0.7 = snappy
5. Use `isBeat` for discrete hits, `energy` for continuous response

## Performance

1. **Smoothing** — 0.8–0.95 fluid; 0.5–0.7 snappy
2. **FFT bands** — 256–512 faster; 1024 more detail
3. **Beat threshold** — lower for quiet sources
4. Mix time-based motion with audio modulation

## Browser notes

- Microphone needs HTTPS (or localhost)
- User must grant mic permission

## Troubleshooting

**No audio**

- Scripts loaded? Console errors?
- Mic permission granted?
- For chime: press SPACE so notes play

**Jerky visuals**

- `audioAnalyzer.setSmoothing(0.9)`
- Dampen: `bass * 0.3` instead of raw `bass`

**No beats**

- `audioAnalyzer.setBeatThreshold(0.1)`
- Prefer `energy` for continuous response if the track has weak transients
