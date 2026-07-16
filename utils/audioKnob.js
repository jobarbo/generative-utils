/**
 * AudioKnob - Maps audio data to shader uniforms
 *
 * Provides a similar interface to knob.js, but driven by audio features
 * (microphone or MIDI chime output) instead of MIDI controllers.
 *
 * Usage:
 *   In setup():
 *     audioKnob.setSource('microphone')  // or 'chime'
 *       .map('bass',   'symmetry', 'rotationSpeed', 0.5, 20)
 *       .map('energy', 'chromatic', 'amount',       0,   0.8)
 *       .map('beat',   'zoom',     'zoomAmount',    1.0, 1.2);
 *       .map('bass',   'zoom',     'zoomOutAmount', 1.2, 12, 0, 1, 1, 0.5); // ramp only after 50% “bass”
 *
 *   In draw loop (via customDraw in sketch.js):
 *     audioKnob.update();
 */
class AudioKnob {
	constructor() {
		this.mappings = [];
		this.enabled = true;
		this.initialized = false;
		this.sourceType = null;

		// Beat pulse for smooth one-shot effects
		// Returns 1.0 when beat detected, decays to 0 each frame
		this.beatPulse = 0;
		this.beatPulseDecay = 0.85;
	}

	/**
	 * Initialize with audio source
	 * @param {string} source - 'microphone' | 'chime'
	 * @param {object} options - passed to audioAnalyzer.init() { fftBands, fftSmoothing, smoothing, beatThreshold }
	 * @returns {AudioKnob} this (for chaining)
	 */
	setSource(source = "microphone", options = {}) {
		if (typeof audioAnalyzer === "undefined") {
			console.error("[AudioKnob] audioAnalyzer not found. Make sure audioAnalyzer.js is loaded.");
			return this;
		}

		try {
			audioAnalyzer.init(source, options);
			this.sourceType = source;
			this.initialized = true;
		} catch (e) {
			console.error("[AudioKnob] setSource() error:", e);
		}

		return this;
	}

	/**
	 * Add a mapping from audio feature to shader uniform parameter
	 * @param {string} audioFeature - audio feature name ('bass', 'mid', 'treble', 'energy', 'volume', 'beat', 'subBass', 'lowMid', 'highMid', 'presence')
	 * @param {string} effectName - shader effect name (e.g., 'symmetry', 'chromatic', 'pixelSort', 'zoom', 'grain')
	 * @param {string} paramName - parameter name (e.g., 'rotationSpeed', 'amount', 'threshold')
	 * @param {number} outMin - minimum output value
	 * @param {number} outMax - maximum output value
	 * @param {number} [inMin=0] - lower bound of the **input** feature (0–1). Raise this if the effect stays pegged at outMax: bass often sits in e.g. 0.4–0.95, not 0–1.
	 * @param {number} [inMax=1] - upper bound of the input feature. Lower this if quiet passages still hit the max.
	 * @param {number} [exponent=1] - applied to normalized input before mapping: use 1.5–3 to soften peaks (less time stuck at max), or 0.5–0.8 to make hits punch harder.
	 * @param {number} [stepFrom] - if set (0–1), output stays at outMin until normalized input reaches this fraction, then ramps to outMax over the remainder. Example: 0.5 = no increase until halfway through the input range.
	 * @returns {AudioKnob} this (for chaining)
	 */
	map(audioFeature, effectName, paramName, outMin, outMax, inMin = 0, inMax = 1, exponent = 1, stepFrom = undefined) {
		this.mappings.push({
			audioFeature,
			effectName,
			paramName,
			outMin,
			outMax,
			inMin,
			inMax,
			exponent,
			stepFrom,
		});
		return this;
	}

	/**
	 * Remove all mappings
	 * @returns {AudioKnob} this (for chaining)
	 */
	clearMappings() {
		this.mappings = [];
		return this;
	}

	/**
	 * Toggle all mappings on/off (without clearing them)
	 * @returns {AudioKnob} this (for chaining)
	 */
	toggle() {
		this.enabled = !this.enabled;
		return this;
	}

	/**
	 * Update - call every frame in the draw loop
	 * Updates audio analysis and applies all mappings to shader uniforms
	 */
	update() {
		if (!this.initialized || !this.enabled) return;
		if (typeof audioAnalyzer === "undefined") return;

		// Always analyze — even if shaders aren't ready yet
		audioAnalyzer.update();

		if (typeof shaderEffects === "undefined" || typeof shaderEffects.updateEffectParam !== "function") {
			return;
		}

		// Pause driving uniforms while the shader effects panel is open so sliders can stick
		if (typeof shaderEffectsPanel !== "undefined" && shaderEffectsPanel.visible) {
			return;
		}

		// No live signal (mic locked, denied, or silent) — don't drive params,
		// otherwise hand-set panel values get mapped back to outMin every frame
		if (typeof audioAnalyzer.getSourceStatus === "function" && !audioAnalyzer.getSourceStatus().receiving) {
			return;
		}

		// Handle beat pulse (smooth decay for frame-based animation)
		if (audioAnalyzer.isBeat) {
			this.beatPulse = 1.0;
		} else {
			this.beatPulse *= this.beatPulseDecay;
		}

		for (const m of this.mappings) {
			let audioValue = this._getAudioValue(m.audioFeature);
			const inLo = m.inMin ?? 0;
			const inHi = m.inMax ?? 1;
			audioValue = constrain(audioValue, inLo, inHi);
			const span = inHi - inLo;
			let t = span > 0 ? (audioValue - inLo) / span : 0;
			const step = m.stepFrom;
			if (step !== undefined && step !== null && !Number.isNaN(step)) {
				const s = constrain(step, 0, 1);
				if (s >= 1) {
					t = t >= 1 ? 1 : 0;
				} else if (t <= s) {
					t = 0;
				} else {
					t = (t - s) / (1 - s);
				}
			}
			const exp = m.exponent ?? 1;
			if (exp !== 1 && t > 0) {
				t = Math.pow(t, exp);
			}
			const mapped = map(t, 0, 1, m.outMin, m.outMax, true);
			shaderEffects.updateEffectParam(m.effectName, m.paramName, mapped);
		}
	}

	/**
	 * Get the current normalized (0-1) value of an audio feature
	 * @param {string} feature - audio feature name
	 * @returns {number} value (0-1)
	 */
	_getAudioValue(feature) {
		switch (feature) {
			case "bass":
				return audioAnalyzer.bass;
			case "mid":
				return audioAnalyzer.mid;
			case "treble":
				return audioAnalyzer.treble;
			case "volume":
				return audioAnalyzer.volume;
			case "energy":
				return audioAnalyzer.energy;
			case "subBass":
				return audioAnalyzer.subBass;
			case "lowMid":
				return audioAnalyzer.lowMid;
			case "highMid":
				return audioAnalyzer.highMid;
			case "presence":
				return audioAnalyzer.presence;
			case "beat":
				return this.beatPulse; // smooth beat pulse instead of raw boolean
			default:
				return 0;
		}
	}

	/**
	 * Switch audio source on the fly
	 * @param {string} source - 'microphone' | 'chime'
	 * @returns {AudioKnob} this (for chaining)
	 */
	switchSource(source) {
		if (typeof audioAnalyzer === "undefined") {
			console.error("[AudioKnob] audioAnalyzer not found");
			return this;
		}

		try {
			audioAnalyzer.stop();
			audioAnalyzer.init(source);
			this.sourceType = source;
			this.beatPulse = 0; // reset beat pulse on source switch
		} catch (e) {
			console.error("[AudioKnob] switchSource() error:", e);
		}

		return this;
	}

	/**
	 * Get debug information
	 * @returns {object} debug info with all audio values and configuration
	 */
	getDebugInfo() {
		if (typeof audioAnalyzer === "undefined") {
			return {error: "audioAnalyzer not found"};
		}

		return {
			...audioAnalyzer.getDebugInfo(),
			beatPulse: this.beatPulse.toFixed(3),
			mappingsCount: this.mappings.length,
			mappings: this.mappings.map((m) => `${m.audioFeature} → ${m.effectName}.${m.paramName}`),
			enabled: this.enabled,
			source: this.sourceType,
			initialized: this.initialized,
		};
	}

	/**
	 * Disable audio input (e.g., to stop microphone recording)
	 * @returns {AudioKnob} this (for chaining)
	 */
	stop() {
		if (typeof audioAnalyzer !== "undefined") {
			audioAnalyzer.stop();
		}
		this.initialized = false;
		this.beatPulse = 0;
		return this;
	}
}

// Create global singleton instance
const audioKnob = new AudioKnob();
