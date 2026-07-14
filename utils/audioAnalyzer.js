/**
 * Audio Analyzer for p5.js with p5.sound (0.2+ / Tone.js rewrite)
 *
 * Provides real-time audio analysis for VJ / audio-reactive purposes
 * Features: FFT analysis, frequency bands, volume detection, beat detection
 *
 * Usage:
 * 1. In setup(): audioAnalyzer.init()
 * 2. In draw/update loop: audioAnalyzer.update()
 * 3. Access values: audioAnalyzer.bass, audioAnalyzer.volume, etc.
 *
 * Notes for p5.sound 0.2+/0.3+ (p5.js 2.x):
 * - FFT constructor takes fftSize only: new p5.FFT(1024)
 * - analyze() returns amplitudes in 0–1 (not 0–255)
 * - getEnergy() was removed — band energy is derived from the spectrum here
 */
class AudioAnalyzer {
	constructor() {
		// Audio input sources
		this.mic = null;
		this.soundFile = null;
		this.fft = null;
		this.spectrum = [];

		// Audio features (0-1 normalized values)
		this.bass = 0;
		this.mid = 0;
		this.treble = 0;
		this.volume = 0;
		this.energy = 0;

		// Detailed frequency bands (0-1 normalized)
		this.subBass = 0; // 20-60 Hz
		this.lowMid = 0; // 250-500 Hz
		this.highMid = 0; // 2000-4000 Hz
		this.presence = 0; // 4000-6000 Hz

		// Beat detection
		this.beatThreshold = 0.15;
		this.beatDecay = 0.9;
		this.beatValue = 0;
		this.isBeat = false;
		this.lastBeatTime = 0;
		this.bpm = 0;
		this.beatHistory = [];

		// Smoothing
		this.smoothing = 0.8; // 0 = no smoothing, 1 = maximum smoothing

		// Configuration
		this.fftBands = 1024; // power of 2: 16–1024 in p5.sound 0.3
		this.fftSmoothing = 0.8; // kept for API compat; applied via our own smooth()

		// Source type
		this.sourceType = null; // 'microphone', 'file', 'chime', 'custom'
		this.isInitialized = false;

		// Classic p5.sound band ranges (Hz)
		this.bandRanges = {
			bass: [20, 140],
			mid: [400, 2600],
			treble: [5200, 14000],
		};
	}

	/**
	 * Clamp FFT size to a valid power of two for p5.sound 0.3
	 */
	_normalizeFftSize(size) {
		const allowed = [16, 32, 64, 128, 256, 512, 1024];
		let best = 1024;
		let bestDiff = Infinity;
		for (const n of allowed) {
			const d = Math.abs(n - size);
			if (d < bestDiff) {
				best = n;
				bestDiff = d;
			}
		}
		return best;
	}

	/**
	 * Average spectrum energy between two frequencies (0–1).
	 * Replaces the removed p5.FFT.getEnergy() from p5.sound 1.x.
	 */
	getEnergy(lowOrName, highFreq) {
		let lowFreq = lowOrName;
		if (typeof lowOrName === "string") {
			const range = this.bandRanges[lowOrName];
			if (!range) return 0;
			lowFreq = range[0];
			highFreq = highFreq !== undefined ? highFreq : range[1];
			// Support getEnergy("bass", "treble") spanning two named bands
			if (typeof highFreq === "string") {
				const highRange = this.bandRanges[highFreq];
				highFreq = highRange ? highRange[1] : range[1];
			}
		}

		const spectrum = this.spectrum;
		if (!spectrum || !spectrum.length) return 0;

		const sr = typeof sampleRate === "function" ? sampleRate() : 44100;
		const nyquist = sr / 2;
		const n = spectrum.length;
		let lowIndex = Math.max(0, Math.floor((lowFreq / nyquist) * n));
		let highIndex = Math.min(n - 1, Math.floor((highFreq / nyquist) * n));
		if (highIndex < lowIndex) {
			const tmp = lowIndex;
			lowIndex = highIndex;
			highIndex = tmp;
		}

		let sum = 0;
		let count = 0;
		for (let i = lowIndex; i <= highIndex; i++) {
			sum += spectrum[i] || 0;
			count++;
		}
		return count > 0 ? sum / count : 0;
	}

	/**
	 * Initialize audio analyzer
	 * @param {string} source - 'microphone', 'chime', or provide a p5.SoundFile
	 * @param {object} options - Configuration options
	 */
	init(source = "microphone", options = {}) {
		if (typeof p5 === "undefined" || typeof p5.FFT !== "function") {
			throw new Error("p5.FFT unavailable — load p5.sound 0.2+ after p5.js 2.x");
		}

		// Apply options
		if (options.fftBands) this.fftBands = options.fftBands;
		if (options.fftSmoothing !== undefined) this.fftSmoothing = options.fftSmoothing;
		if (options.smoothing !== undefined) this.smoothing = options.smoothing;
		if (options.beatThreshold !== undefined) this.beatThreshold = options.beatThreshold;

		const fftSize = this._normalizeFftSize(this.fftBands);
		this.fftBands = fftSize;

		// p5.sound 0.2+: constructor is FFT(fftSize) only
		this.fft = new p5.FFT(fftSize);

		if (source === "microphone") {
			this.sourceType = "microphone";
			this.mic = new p5.AudioIn();

			// Keep mic out of speakers (feedback); analyze only
			try {
				this.mic.disconnect();
			} catch (_) {
				/* ignore */
			}

			this.fft.setInput(this.mic);

			// p5.sound 0.3 start() has no callbacks — open mic and resume AudioContext after gesture/permission
			try {
				this.mic.start();
			} catch (err) {
				console.error("[AudioAnalyzer] Microphone start failed:", err);
			}

			const ac = typeof getAudioContext === "function" ? getAudioContext() : null;
			if (ac && ac.state !== "running") {
				ac.resume().catch(() => {});
			}
		} else if (source === "chime") {
			this.sourceType = "chime";
			// FFT listens to master output by default when no setInput is used
		} else if (typeof p5.SoundFile === "function" && source instanceof p5.SoundFile) {
			this.sourceType = "file";
			this.soundFile = source;
			this.fft.setInput(source);
		} else if (source && (source.connect || source.getNode)) {
			// Custom audio source (p5.Oscillator, p5.PolySynth, etc.)
			this.sourceType = "custom";
			this.fft.setInput(source);
		} else {
			console.warn("[AudioAnalyzer] Unknown source, defaulting to master output:", source);
			this.sourceType = "chime";
		}

		this.isInitialized = true;
		return this;
	}

	/**
	 * Update audio analysis - call this every frame
	 */
	update() {
		if (!this.isInitialized || !this.fft) {
			return this;
		}

		// Spectrum is already 0–1 in p5.sound 0.2+
		this.spectrum = this.fft.analyze() || [];

		const currentVolume = this.getEnergy("bass", "treble");
		this.volume = this.smooth(this.volume, currentVolume, this.smoothing);
		this.energy = Math.pow(this.volume, 2);

		this.bass = this.smooth(this.bass, this.getEnergy("bass") , this.smoothing);
		this.mid = this.smooth(this.mid, this.getEnergy("mid"), this.smoothing);
		this.treble = this.smooth(this.treble, this.getEnergy("treble"), this.smoothing);

		this.subBass = this.smooth(this.subBass, this.getEnergy(20, 60), this.smoothing);
		this.lowMid = this.smooth(this.lowMid, this.getEnergy(250, 500), this.smoothing);
		this.highMid = this.smooth(this.highMid, this.getEnergy(2000, 4000), this.smoothing);
		this.presence = this.smooth(this.presence, this.getEnergy(4000, 6000), this.smoothing);

		this.detectBeat();

		return this;
	}

	/**
	 * Simple exponential smoothing
	 */
	smooth(current, target, amount) {
		return current * amount + target * (1 - amount);
	}

	/**
	 * Detect beats based on energy spikes
	 */
	detectBeat() {
		this.beatValue *= this.beatDecay;

		if (this.energy > this.beatThreshold && this.energy > this.beatValue) {
			this.beatValue = this.energy;
			this.isBeat = true;

			const now = typeof millis === "function" ? millis() : performance.now();
			const timeSinceLastBeat = now - this.lastBeatTime;

			if (timeSinceLastBeat > 200 && timeSinceLastBeat < 2000) {
				this.beatHistory.push(timeSinceLastBeat);

				if (this.beatHistory.length > 4) {
					this.beatHistory.shift();
				}

				if (this.beatHistory.length > 1) {
					const avgInterval = this.beatHistory.reduce((a, b) => a + b) / this.beatHistory.length;
					this.bpm = Math.round(60000 / avgInterval);
				}
			}

			this.lastBeatTime = now;
		} else {
			this.isBeat = false;
		}
	}

	/**
	 * Get energy in a specific frequency range
	 * @param {number} lowFreq - Low frequency in Hz
	 * @param {number} highFreq - High frequency in Hz
	 * @returns {number} Energy level (0-1)
	 */
	getFrequency(lowFreq, highFreq) {
		if (!this.isInitialized) return 0;
		return this.getEnergy(lowFreq, highFreq);
	}

	/**
	 * Get raw spectrum array
	 * @returns {Array} Frequency spectrum (0-1 values)
	 */
	getSpectrum() {
		if (!this.isInitialized) return [];
		return this.spectrum;
	}

	/**
	 * Get waveform array
	 * @returns {Array} Waveform amplitude values (-1 to 1)
	 */
	getWaveform() {
		if (!this.isInitialized || !this.fft) return [];
		return this.fft.waveform();
	}

	/**
	 * Set smoothing amount
	 * @param {number} amount - Smoothing (0-1, higher = smoother)
	 */
	setSmoothing(amount) {
		this.smoothing = Math.max(0, Math.min(1, amount));
		return this;
	}

	/**
	 * Set beat detection threshold
	 * @param {number} threshold - Threshold (0-1)
	 */
	setBeatThreshold(threshold) {
		this.beatThreshold = threshold;
		return this;
	}

	/**
	 * Check if a beat occurred this frame
	 * @returns {boolean}
	 */
	beat() {
		return this.isBeat;
	}

	/**
	 * Get current BPM
	 * @returns {number}
	 */
	getBPM() {
		return this.bpm;
	}

	/**
	 * Play sound file (if using file source)
	 */
	play() {
		if (this.soundFile && typeof this.soundFile.start === "function") {
			this.soundFile.start();
		} else if (this.soundFile && typeof this.soundFile.play === "function") {
			this.soundFile.play();
		}
		return this;
	}

	/**
	 * Pause sound file (if using file source)
	 */
	pause() {
		if (this.soundFile && typeof this.soundFile.stop === "function") {
			this.soundFile.stop();
		}
		return this;
	}

	/**
	 * Stop audio input
	 */
	stop() {
		if (this.mic && typeof this.mic.stop === "function") {
			this.mic.stop();
		}
		if (this.soundFile && typeof this.soundFile.stop === "function") {
			this.soundFile.stop();
		}
		return this;
	}

	/**
	 * Get debug info
	 * @returns {object} Debug information
	 */
	getDebugInfo() {
		return {
			volume: this.volume.toFixed(3),
			energy: this.energy.toFixed(3),
			bass: this.bass.toFixed(3),
			mid: this.mid.toFixed(3),
			treble: this.treble.toFixed(3),
			beat: this.isBeat,
			bpm: this.bpm,
			source: this.sourceType,
			isInitialized: this.isInitialized,
		};
	}
}

// Create global instance
const audioAnalyzer = new AudioAnalyzer();
