# Audio Reactivity Guide

This guide shows you how to make your shaders audio-reactive for live VJ performances.

## Quick Start with MIDI Chime (Easiest!)

The MIDI chime lets you test audio-reactivity without needing a microphone or external audio source.

### 1. Enable Audio with MIDI Chime

In your `sketch.js` setup function:

```javascript
function setup() {
	// ... your existing setup code ...

	// Enable audio reactivity with MIDI chime (built-in synthesizer)
	shaderEffects.enableAudio("chime", {
		smoothing: 0.85,
		beatThreshold: 0.15,
		chimeOptions: {
			pattern: "chords", // 'chords', 'scale', 'bassline', 'arpeggio', 'random'
			autoPlayInterval: 500, // ms between notes/chords
		},
	});

	// Enable keyboard controls
	enableMidiKeyboard();
}
```

### Keyboard Controls

- `SPACE` - Toggle auto-play
- `A-K` - Play notes (C major scale)
- `1-5` - Play chords
- `Z,X,C` - Drums (kick, snare, hi-hat)

## Using Microphone Instead

```javascript
function setup() {
	// ... your existing setup code ...

	// Enable audio reactivity with microphone (user will be prompted for access)
	shaderEffects.enableAudio("microphone", {
		smoothing: 0.8, // 0-1, higher = smoother (default: 0.8)
		beatThreshold: 0.15, // 0-1, sensitivity for beat detection (default: 0.15)
		fftBands: 1024, // FFT resolution: 16, 32, 64, 128, 256, 512, 1024 (default: 1024)
		fftSmoothing: 0.8, // 0-1, FFT smoothing (default: 0.8)
	});
}
```

### 2. Make Shaders Audio-Reactive

In `shaders/sketch-shaders.js`, modify your `effectsConfig` to use audio variables:

```javascript
effectsConfig = {
	deform: {
		enabled: true,
		amount: 0.1,
		uniforms: {
			// Make deformation intensity follow bass frequencies
			uAmount: "amount * (1 + audioBass * 2)",
			uTime: "shaderTime",
			uSeed: "shaderSeed",
			uOctave: "4.0",
		},
	},

	chromatic: {
		enabled: true,
		amount: 0.0025,
		uniforms: {
			// Chromatic aberration pulses with overall energy
			uAmount: "amount * (1 + audioEnergy * 5)",
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
			// Rotate based on mid frequencies
			uAngle: "angle + audioMid * 3.14159",
			// Threshold follows volume
			uThreshold: "threshold * (1 - audioVolume * 0.5)",
			uSortAmount: "sortAmount",
			uSampleCount: "32.0",
			uInvert: "0.0",
			uSortMode: "1.0",
			uTime: "shaderTime",
			uSeed: "shaderSeed + 999.0",
			uResolution: "[width, height]",
		},
	},

	grain: {
		enabled: true,
		amount: 0.1,
		uniforms: {
			// Grain intensity follows treble (cymbals, hi-hats)
			uAmount: "amount * (1 + audioTreble * 0.5)",
			uTime: "shaderTime",
			uSeed: "shaderSeed + 345.0",
		},
	},
};
```

## Available Audio Variables

All audio variables are normalized to 0-1 range and can be used in uniform expressions:

### Frequency Bands

- `audioBass` - Bass frequencies (20-140 Hz) - kicks, bass
- `audioMid` - Mid frequencies (140-2000 Hz) - vocals, guitars
- `audioTreble` - Treble frequencies (2000-20000 Hz) - cymbals, hi-hats
- `audioSubBass` - Sub-bass frequencies (20-60 Hz) - deep rumble
- `audioLowMid` - Low-mid frequencies (250-500 Hz) - warmth
- `audioHighMid` - High-mid frequencies (2000-4000 Hz) - presence
- `audioPresence` - Presence frequencies (4000-6000 Hz) - clarity

### Overall Metrics

- `audioVolume` - Overall loudness (0-1)
- `audioEnergy` - Energy level (volume squared for more dramatic response)
- `audioBeat` - Beat detected this frame (0.0 or 1.0)
- `audioBPM` - Detected BPM (number, e.g., 120)

## Usage Patterns

### Simple Multiplication

Make any parameter pulse with audio:

```javascript
uAmount: "baseAmount * (1 + audioBass * 2)";
// When audioBass = 0: uAmount = baseAmount * 1 = baseAmount
// When audioBass = 1: uAmount = baseAmount * 3 = 3x stronger
```

### Adding/Offsetting

Offset values based on audio:

```javascript
uAngle: "angle + audioMid * 3.14159";
// Rotates up to 180 degrees based on mid frequencies
```

### Multiple Sources

Combine different frequencies:

```javascript
uAmount: "baseAmount * (1 + audioBass * 0.5 + audioTreble * 0.3)";
// Reacts to both bass and treble with different intensities
```

### Beat Triggers

Use beat detection for discrete events:

```javascript
uFlash: "audioBeat * 0.5";
// Sends 0.5 on beat, 0.0 otherwise
```

### Complex Expressions

You can use any JavaScript math:

```javascript
uValue: "Math.sin(shaderTime + audioBass * 6.28) * audioEnergy";
// Sine wave modulated by bass, scaled by energy
```

## Advanced: Direct Audio Access

You can also access the audio analyzer directly in your sketch:

```javascript
function draw() {
	// Get current audio values
	let bass = audioAnalyzer.bass;
	let beat = audioAnalyzer.beat();
	let bpm = audioAnalyzer.getBPM();

	// Get specific frequency range (in Hz)
	let kickDrum = audioAnalyzer.getFrequency(40, 100);

	// Get raw spectrum (array of 0-255 values)
	let spectrum = audioAnalyzer.getSpectrum();

	// Get waveform (array of -1 to 1 values)
	let waveform = audioAnalyzer.getWaveform();

	// Debug info
	console.log(audioAnalyzer.getDebugInfo());
}
```

## Performance Tips

1. **Smoothing**: Higher smoothing (0.8-0.95) gives smoother visuals but slower response
2. **FFT Bands**: Lower values (256-512) are faster but less detailed
3. **Beat Threshold**: Adjust based on your audio source (quieter = lower threshold)
4. **Combine Effects**: Mix time-based and audio-reactive animations for best results

## Example: Full Audio-Reactive Configuration

```javascript
// In sketch.js setup():
shaderEffects.enableAudio({
    smoothing: 0.85,
    beatThreshold: 0.12,
    fftBands: 512
});

// In sketch-shaders.js effectsConfig:
pixelSort: {
    enabled: true,
    baseAngle: 0.0,
    baseThreshold: 0.3,
    uniforms: {
        // Rotate continuously with time, modulated by mid frequencies
        uAngle: "baseAngle + shaderTime * 0.1 + audioMid * 3.14",

        // Threshold bounces with bass
        uThreshold: "baseThreshold * (0.7 + audioBass * 0.5)",

        // Sort amount follows overall energy
        uSortAmount: "0.6 + audioEnergy * 0.4",

        // Flash to full sort on beats
        uSampleCount: "audioBeat > 0.5 ? 64.0 : 32.0",

        uInvert: "0.0",
        uSortMode: "1.0",
        uTime: "shaderTime",
        uSeed: "shaderSeed",
        uResolution: "[width, height]",
    },
},
```

## Browser Compatibility

- **Microphone access** requires HTTPS (or localhost for development)
- User must grant microphone permission
- Tested on: Chrome, Firefox, Safari, Edge

## Troubleshooting

**No audio detected:**

- Check browser console for errors
- Ensure microphone permission is granted
- Try a different browser
- Make sure audio is playing/microphone is active

**Jerky visuals:**

- Increase smoothing: `shaderEffects.audioAnalyzer.setSmoothing(0.9)`
- Lower FFT resolution
- Add dampening: `audioBass * 0.3` instead of `audioBass`

**No beat detection:**

- Lower beat threshold: `shaderEffects.audioAnalyzer.setBeatThreshold(0.1)`
- Check if music has strong transients (drums, percussion)
- Try using `audioEnergy` instead for continuous response
