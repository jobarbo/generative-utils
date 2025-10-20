/**
 * Audio Analyzer for p5.js with p5.sound
 *
 * Provides real-time audio analysis for VJ / audio-reactive purposes
 * Features: FFT analysis, frequency bands, volume detection, beat detection
 *
 * Usage:
 * 1. In preload(): (optional - if loading audio files)
 * 2. In setup(): audioAnalyzer.init()
 * 3. In draw/update loop: audioAnalyzer.update()
 * 4. Access values: audioAnalyzer.bass, audioAnalyzer.mid, etc.
 */
class AudioAnalyzer {
	constructor() {
		// Audio input sources
		this.mic = null;
		this.soundFile = null;
		this.fft = null;

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
		this.fftBands = 1024; // 16, 32, 64, 128, 256, 512, 1024
		this.fftSmoothing = 0.8;

		// Source type
		this.sourceType = null; // 'microphone', 'file'
		this.isInitialized = false;
	}

	/**
	 * Initialize audio analyzer
	 * @param {string} source - 'microphone', 'chime', or provide a p5.SoundFile
	 * @param {object} options - Configuration options
	 */
	init(source = "microphone", options = {}) {
		// Apply options
		if (options.fftBands) this.fftBands = options.fftBands;
		if (options.fftSmoothing !== undefined) this.fftSmoothing = options.fftSmoothing;
		if (options.smoothing !== undefined) this.smoothing = options.smoothing;
		if (options.beatThreshold !== undefined) this.beatThreshold = options.beatThreshold;

		// Create FFT analyzer
		this.fft = new p5.FFT(this.fftSmoothing, this.fftBands);

		if (source === "microphone") {
			this.sourceType = "microphone";
			this.mic = new p5.AudioIn();
			this.mic.start();
			this.fft.setInput(this.mic);
			console.log("Audio Analyzer: Microphone initialized");
		} else if (source === "chime") {
			this.sourceType = "chime";
			// The FFT will analyze all p5.sound output by default
			// No need to set input - it listens to master output
			console.log("Audio Analyzer: MIDI Chime mode (listening to all audio output)");
		} else if (source instanceof p5.SoundFile) {
			this.sourceType = "file";
			this.soundFile = source;
			this.fft.setInput(source);
			console.log("Audio Analyzer: Sound file initialized");
		} else if (source && source.connect) {
			// Custom audio source (p5.Oscillator, p5.PolySynth, etc.)
			this.sourceType = "custom";
			this.fft.setInput(source);
			console.log("Audio Analyzer: Custom source initialized");
		}

		this.isInitialized = true;
		return this;
	}

	/**
	 * Update audio analysis - call this every frame
	 */
	update() {
		if (!this.isInitialized) {
			console.warn("AudioAnalyzer not initialized");
			return this;
		}

		// Get frequency spectrum
		const spectrum = this.fft.analyze();

		// Get overall volume (0-255, normalized to 0-1)
		let currentVolume = this.fft.getEnergy("bass", "treble") / 255;

		// Smooth volume
		this.volume = this.smooth(this.volume, currentVolume, this.smoothing);

		// Calculate energy (squared volume for more dramatic response)
		this.energy = Math.pow(this.volume, 2);

		// Get frequency bands (normalized 0-1)
		this.bass = this.smooth(this.bass, this.fft.getEnergy("bass") / 255, this.smoothing);
		this.mid = this.smooth(this.mid, this.fft.getEnergy("mid") / 255, this.smoothing);
		this.treble = this.smooth(this.treble, this.fft.getEnergy("treble") / 255, this.smoothing);

		// Get detailed frequency bands
		this.subBass = this.smooth(this.subBass, this.fft.getEnergy(20, 60) / 255, this.smoothing);
		this.lowMid = this.smooth(this.lowMid, this.fft.getEnergy(250, 500) / 255, this.smoothing);
		this.highMid = this.smooth(this.highMid, this.fft.getEnergy(2000, 4000) / 255, this.smoothing);
		this.presence = this.smooth(this.presence, this.fft.getEnergy(4000, 6000) / 255, this.smoothing);

		// Beat detection
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
		// Decay beat value
		this.beatValue *= this.beatDecay;

		// Check if current energy exceeds threshold
		if (this.energy > this.beatThreshold && this.energy > this.beatValue) {
			this.beatValue = this.energy;
			this.isBeat = true;

			// Calculate BPM
			const now = millis();
			const timeSinceLastBeat = now - this.lastBeatTime;

			if (timeSinceLastBeat > 200 && timeSinceLastBeat < 2000) {
				// Valid beat interval (30-300 BPM)
				this.beatHistory.push(timeSinceLastBeat);

				// Keep only last 4 beats for BPM calculation
				if (this.beatHistory.length > 4) {
					this.beatHistory.shift();
				}

				// Calculate average BPM
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
		return this.fft.getEnergy(lowFreq, highFreq) / 255;
	}

	/**
	 * Get raw spectrum array
	 * @returns {Uint8Array} Frequency spectrum (0-255 values)
	 */
	getSpectrum() {
		if (!this.isInitialized) return [];
		return this.fft.analyze();
	}

	/**
	 * Get waveform array
	 * @returns {Array} Waveform amplitude values (-1 to 1)
	 */
	getWaveform() {
		if (!this.isInitialized) return [];
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
		if (this.soundFile && !this.soundFile.isPlaying()) {
			this.soundFile.play();
		}
		return this;
	}

	/**
	 * Pause sound file (if using file source)
	 */
	pause() {
		if (this.soundFile && this.soundFile.isPlaying()) {
			this.soundFile.pause();
		}
		return this;
	}

	/**
	 * Stop audio input
	 */
	stop() {
		if (this.mic) {
			this.mic.stop();
		}
		if (this.soundFile) {
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
		};
	}
}

// Create global instance
const audioAnalyzer = new AudioAnalyzer();
