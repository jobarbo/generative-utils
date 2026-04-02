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
	 * @param {number} outMin - minimum output value (mapped from audio range 0-1)
	 * @param {number} outMax - maximum output value (mapped from audio range 0-1)
	 * @returns {AudioKnob} this (for chaining)
	 */
	map(audioFeature, effectName, paramName, outMin, outMax) {
		this.mappings.push({
			audioFeature,
			effectName,
			paramName,
			outMin,
			outMax,
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

		if (typeof shaderEffects === "undefined" || typeof shaderEffects.updateEffectParam !== "function") {
			return;
		}

		// Update audio analysis
		audioAnalyzer.update();

		// Handle beat pulse (smooth decay for frame-based animation)
		if (audioAnalyzer.isBeat) {
			this.beatPulse = 1.0;
		} else {
			this.beatPulse *= this.beatPulseDecay;
		}

		for (const m of this.mappings) {
			const audioValue = this._getAudioValue(m.audioFeature);
			const mapped = map(audioValue, 0, 1, m.outMin, m.outMax, true);
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
