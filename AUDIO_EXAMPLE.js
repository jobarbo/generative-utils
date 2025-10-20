/**
 * EXAMPLE: Creating Custom Audio-Reactive Shader Effects
 *
 * This file shows how to add your own audio-reactive effects
 * Copy the patterns below into sketch-shaders.js effectsConfig
 */

// ============================================
// EXAMPLE 1: Simple Audio Pulse
// ============================================
const pulseExample = {
	enabled: true,
	baseAmount: 0.5,
	uniforms: {
		// Pulse intensity with overall volume
		uAmount: "baseAmount * (1 + audioVolume)",
		uTime: "shaderTime",
		uTexture: "mainCanvas",
	},
};

// ============================================
// EXAMPLE 2: Bass-Driven Effect
// ============================================
const bassDrivenExample = {
	enabled: true,
	baseValue: 0.1,
	maxValue: 0.5,
	uniforms: {
		// Kicks and bass hits drive the effect
		uAmount: "baseValue + audioBass * (maxValue - baseValue)",
		uTime: "shaderTime",
		uSeed: "shaderSeed",
	},
};

// ============================================
// EXAMPLE 3: Multi-Frequency Response
// ============================================
const multiFreqExample = {
	enabled: true,
	uniforms: {
		// Different frequencies control different parameters
		uRotation: "audioMid * 6.28", // Mid frequencies rotate (0-360°)
		uScale: "1.0 + audioTreble * 0.5", // Treble scales up
		uIntensity: "audioBass * 0.8", // Bass controls intensity
		uTime: "shaderTime",
	},
};

// ============================================
// EXAMPLE 4: Beat-Triggered Flash
// ============================================
const beatFlashExample = {
	enabled: true,
	flashIntensity: 1.0,
	decayRate: 0.95,
	uniforms: {
		// Flash on beat, then decay
		// Note: This needs additional state management in shader
		uFlash: "audioBeat * flashIntensity",
		uEnergy: "audioEnergy",
		uTime: "shaderTime",
	},
};

// ============================================
// EXAMPLE 5: BPM-Synced Animation
// ============================================
const bpmSyncExample = {
	enabled: true,
	uniforms: {
		// Sync animation to detected BPM
		// BPM / 60 = beats per second
		// Multiply shaderTime to sync
		uPhase: "Math.sin(shaderTime * (audioBPM / 60) * 6.28)",
		uBPM: "audioBPM",
		uBeat: "audioBeat",
	},
};

// ============================================
// EXAMPLE 6: Frequency Spectrum Mapper
// ============================================
const spectrumMapExample = {
	enabled: true,
	uniforms: {
		// Map different frequency bands to color channels
		uRed: "audioSubBass", // Deep bass -> Red
		uGreen: "audioMid", // Mids -> Green
		uBlue: "audioPresence", // High freq -> Blue
		uAlpha: "audioVolume", // Overall volume -> Opacity
	},
};

// ============================================
// EXAMPLE 7: Dynamic Threshold
// ============================================
const dynamicThresholdExample = {
	enabled: true,
	baseThreshold: 0.5,
	sensitivity: 0.3,
	uniforms: {
		// Threshold changes with energy level
		uThreshold: "baseThreshold - (audioEnergy * sensitivity)",
		uAmount: "audioVolume",
		uTime: "shaderTime",
	},
};

// ============================================
// EXAMPLE 8: Combination Effect
// ============================================
const combinationExample = {
	enabled: true,
	baseRotation: 0.0,
	baseScale: 1.0,
	baseIntensity: 0.5,
	uniforms: {
		// Combine time-based and audio-reactive animations
		uRotation: "baseRotation + shaderTime * 0.5 + audioMid * 3.14",
		uScale: "baseScale + Math.sin(shaderTime) * 0.2 + audioBass * 0.3",
		uIntensity: "baseIntensity * (1 + audioEnergy * 2)",
		uBeat: "audioBeat",
		uTime: "shaderTime",
		uSeed: "shaderSeed",
	},
};

// ============================================
// HOW TO USE THESE EXAMPLES
// ============================================

/*
1. Copy the example you want into sketch-shaders.js effectsConfig:

   effectsConfig = {
       myEffect: { ...pulseExample },
       // ... other effects
   }

2. Make sure your shader has corresponding uniforms:

   // In your fragment shader:
   uniform float uAmount;
   uniform float uTime;
   // etc.

3. Test it:
   - Run your sketch
   - Press SPACE to start audio
   - Watch the effect react!

4. Tweak values:
   - Adjust baseValue, sensitivity, etc.
   - Try different audio variables
   - Combine multiple sources
*/

// ============================================
// AVAILABLE AUDIO VARIABLES (all 0-1)
// ============================================

/*
Frequency Bands:
- audioBass       // 20-140 Hz (kicks, bass)
- audioMid        // 140-2000 Hz (vocals, guitars)
- audioTreble     // 2000-20000 Hz (cymbals, hi-hats)
- audioSubBass    // 20-60 Hz (deep rumble)
- audioLowMid     // 250-500 Hz (warmth)
- audioHighMid    // 2000-4000 Hz (presence)
- audioPresence   // 4000-6000 Hz (clarity)

Overall Metrics:
- audioVolume     // Overall loudness
- audioEnergy     // Volume squared (more dramatic)
- audioBeat       // 0.0 or 1.0 (beat detected)
- audioBPM        // Number (30-300)
*/

// ============================================
// TIPS FOR AUDIO-REACTIVE DESIGN
// ============================================

/*
1. BALANCE:
   - Don't make everything audio-reactive
   - Mix static and reactive elements
   - Use time-based animation as base, audio as modulation

2. FREQUENCY SELECTION:
   - Bass: Big movements, position, scale
   - Mid: Color, rotation, moderate changes
   - Treble: Fast details, particles, grain

3. SCALING:
   - Multiply by small values (0.3) for subtle
   - Multiply by large values (2-5) for dramatic
   - Add offset to avoid zero: (0.5 + audio * 0.5)

4. SMOOTHING:
   - Set smoothing high (0.85-0.95) for fluid motion
   - Set smoothing low (0.5-0.7) for snappy response
   - Different effects can have different smoothing needs

5. LAYERING:
   - Stack multiple audio-reactive effects
   - Each effect responds to different frequencies
   - Create complex interactions

6. BEATS:
   - Use audioBeat for discrete events
   - Use audioEnergy for continuous response
   - Combine both for best results
*/

// ============================================
// ADVANCED: CUSTOM FREQUENCY RANGES
// ============================================

/*
You can get specific frequency ranges in your sketch:

In draw() or setup():
  const kickDrum = audioAnalyzer.getFrequency(40, 100);
  const snare = audioAnalyzer.getFrequency(150, 250);

Then pass as custom uniform:
  shaderEffects.updateEffectParam('myEffect', 'kickValue', kickDrum);

Or access in shader via global variables if you make them available
in the evaluateUniformValue context.
*/

// ============================================
// TESTING YOUR EFFECTS
// ============================================

/*
1. Start with MIDI chime (default)
   - Press SPACE for auto-play
   - Press A-K for manual notes
   - Press 1-5 for chords
   - Easy to test specific frequencies

2. Try different patterns:
   - 'chords' - Good for testing overall energy
   - 'bassline' - Tests bass response
   - 'arpeggio' - Tests rapid changes
   - 'drums' - Tests beat detection

3. Use debug display:
   - Press V to show audio levels
   - Watch which frequencies are active
   - Adjust your mappings accordingly

4. Switch to microphone:
   - Change to 'microphone' mode
   - Play different types of music
   - Adjust sensitivity/smoothing
*/

console.log("Audio example patterns loaded!");
console.log("Copy these examples into sketch-shaders.js effectsConfig");

