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
		this.smoothing = 0.65; // 0 = no smoothing, 1 = maximum smoothing

		// Configuration
		this.fftBands = 1024; // power of 2: 16–1024 in p5.sound 0.3
		this.fftSmoothing = 0.8; // kept for API compat; applied via our own smooth()

		// Source type
		this.sourceType = null; // 'microphone', 'file', 'chime', 'custom'
		this.isInitialized = false;

		// Source perception (updated each frame / on mic open)
		this.sourceError = null;
		this.micOpened = false;
		this.isReceiving = false; // true when measurable signal present this frame
		this._receiveFloor = 0.0004; // peak of lower FFT bins
		this._receiveHoldMs = 350;
		this._lastReceiveTime = 0;
		this._unlockBound = false;

		// Tone.js FFT returns tiny linear gains for mics (~0.001–0.05).
		// Map them up to usable 0–1 levels for UI + shader mappings.
		this.sensitivity = 1; // extra multiply after AGC (1 = AGC only)
		this.levelCurve = 0.55; // <1 expands quiet sounds
		this._agcPeak = 0.008; // rolling max of raw band energy
		this._agcDecay = 0.997; // slow fall so quiet pauses don't blow up noise
		this._agcFloor = 0.002; // ignore noise floor when adapting

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
	 * Read a bin amplitude normalized toward 0–1 linear gain.
	 */
	_binValue(v) {
		if (v == null) return 0;
		return v > 1 ? v / 255 : v;
	}

	/**
	 * Map tiny Tone.js FFT gains → usable 0–1 levels (AGC + curve).
	 * AGC peak is updated once per frame in update(), not here.
	 */
	_normalizeLevel(raw) {
		const r = Math.max(0, raw || 0);
		const denom = Math.max(this._agcPeak * 0.85, this._agcFloor);
		let t = Math.min(1, (r / denom) * this.sensitivity);
		if (this.levelCurve !== 1 && t > 0) {
			t = Math.pow(t, this.levelCurve);
		}
		return Math.min(1, Math.max(0, t));
	}

	/**
	 * Average spectrum energy between two frequencies (0–1 after normalization).
	 * Uses RMS of bins (more responsive than a flat mean on sparse spectra).
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

		let sumSq = 0;
		let peak = 0;
		let count = 0;
		for (let i = lowIndex; i <= highIndex; i++) {
			const v = this._binValue(spectrum[i]);
			sumSq += v * v;
			if (v > peak) peak = v;
			count++;
		}
		if (!count) return 0;

		// Blend RMS + peak so narrow loud bands still register
		const rms = Math.sqrt(sumSq / count);
		const raw = rms * 0.65 + peak * 0.35;
		return this._normalizeLevel(raw);
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
		if (options.sensitivity !== undefined) this.sensitivity = options.sensitivity;
		if (options.levelCurve !== undefined) this.levelCurve = options.levelCurve;

		const fftSize = this._normalizeFftSize(this.fftBands);
		this.fftBands = fftSize;

		// p5.sound 0.2+: constructor is FFT(fftSize) only
		this.fft = new p5.FFT(fftSize);

		if (source === "microphone") {
			this.sourceType = "microphone";
			this.micOpened = false;
			this.sourceError = null;
			this.mic = new p5.AudioIn();

			// Don't route through setInput until the mic stream is actually open.
			// Browsers require a user gesture for getUserMedia — retry on first click/key.
			this._enableMicUnlock();
			this._startMicrophone();
		} else if (source === "chime") {
			this.sourceType = "chime";
			this.micOpened = true; // master output always "available"
			// FFT listens to master output by default when no setInput is used
		} else if (typeof p5.SoundFile === "function" && source instanceof p5.SoundFile) {
			this.sourceType = "file";
			this.soundFile = source;
			this.micOpened = true;
			this.fft.setInput(source);
		} else if (source && (source.connect || source.getNode)) {
			// Custom audio source (p5.Oscillator, p5.PolySynth, etc.)
			this.sourceType = "custom";
			this.micOpened = true;
			this.fft.setInput(source);
		} else {
			console.warn("[AudioAnalyzer] Unknown source, defaulting to master output:", source);
			this.sourceType = "chime";
			this.micOpened = true;
		}

		this.isInitialized = true;
		return this;
	}

	/**
	 * Wire mic → FFT without speakers (avoids feedback).
	 */
	_wireMicToFft() {
		if (!this.mic || !this.fft) return;
		try {
			this.mic.disconnect();
		} catch (_) {
			/* ignore */
		}
		try {
			this.fft.setInput(this.mic);
		} catch (err) {
			console.warn("[AudioAnalyzer] setInput failed:", err);
		}
	}

	/**
	 * Attempt to open the microphone (may no-op until a user gesture).
	 */
	_startMicrophone() {
		if (!this.mic) return;

		const ac = typeof getAudioContext === "function" ? getAudioContext() : null;
		if (ac && ac.state !== "running") {
			ac.resume().catch(() => {});
		}
		if (typeof userStartAudio === "function") {
			try {
				userStartAudio();
			} catch (_) {
				/* ignore */
			}
		}

		try {
			this.mic.start();
		} catch (err) {
			this.sourceError = err?.message || String(err);
			console.error("[AudioAnalyzer] Microphone start failed:", err);
			return;
		}

		this._watchMicOpen();
	}

	/**
	 * Resume AudioContext + retry mic.open on the first user gesture (required by browsers).
	 */
	_enableMicUnlock() {
		if (this._unlockBound) return;
		this._unlockBound = true;

		const unlock = (e) => {
			// Ignore UI overlays (debug / shader panels, controls) — only canvas/page unlocks mic
			const t = e?.target;
			if (t?.closest?.("#debug-panel, #shader-effects-panel, #controls, button, input, label, select, textarea")) {
				return;
			}
			this.sourceError = null;
			this._startMicrophone();
		};

		["pointerdown", "keydown", "touchstart"].forEach((ev) => {
			document.addEventListener(ev, unlock, {passive: true});
		});
	}

	/**
	 * Poll Tone UserMedia until the mic stream is open, then route into FFT.
	 */
	_watchMicOpen() {
		const tryAttach = () => {
			const um = this.mic?.node;
			if (um?.state === "started") {
				if (!this.micOpened) {
					this.micOpened = true;
					this.sourceError = null;
					this._wireMicToFft();
					console.log("[AudioAnalyzer] Microphone open — routed to FFT");
				}
				return true;
			}
			return false;
		};

		if (tryAttach()) return;

		let tries = 0;
		const timer = setInterval(() => {
			tries++;
			if (tryAttach() || tries > 100) clearInterval(timer);
		}, 100);
	}

	/**
	 * Human-readable source perception status for debug UI.
	 * @returns {{ code: string, label: string, ok: boolean, receiving: boolean }}
	 */
	getSourceStatus() {
		if (!this.isInitialized) {
			return {code: "not-init", label: "not init", ok: false, receiving: false};
		}

		const ac = typeof getAudioContext === "function" ? getAudioContext() : null;
		if (ac && ac.state === "suspended") {
			return {code: "suspended", label: "click page to unlock", ok: false, receiving: false};
		}

		if (this.sourceError) {
			return {code: "denied", label: "source denied", ok: false, receiving: false};
		}

		if (this.sourceType === "microphone") {
			const umState = this.mic?.node?.state;
			if (umState === "started") {
				if (!this.micOpened) {
					this.micOpened = true;
					this._wireMicToFft();
				}
			}
			if (!this.micOpened) {
				return {code: "waiting", label: "click page to enable mic", ok: false, receiving: false};
			}
		}

		if (this.isReceiving) {
			return {code: "live", label: "receiving", ok: true, receiving: true};
		}

		return {code: "silent", label: "no signal", ok: false, receiving: false};
	}

	/**
	 * Update audio analysis - call this every frame
	 */
	update() {
		if (!this.isInitialized || !this.fft) {
			return this;
		}

		// Keep trying to attach mic if permission landed mid-session
		if (this.sourceType === "microphone" && this.mic?.node?.state === "started") {
			if (!this.micOpened) {
				this.micOpened = true;
				this._wireMicToFft();
			}
		}

		// Spectrum is tiny linear gains in p5.sound 0.2+ (Tone normalRange)
		this.spectrum = this.fft.analyze() || [];

		// Peak of lower bins for presence detection
		let peak = 0;
		const lowBins = Math.min(this.spectrum.length, 256);
		for (let i = 0; i < lowBins; i++) {
			const v = this._binValue(this.spectrum[i]);
			if (v > peak) peak = v;
		}
		const now = typeof millis === "function" ? millis() : performance.now();
		if (peak > this._receiveFloor) {
			this._lastReceiveTime = now;
		}
		this.isReceiving = now - this._lastReceiveTime < this._receiveHoldMs;

		// Seed / decay AGC once per frame from overall peak across the band we care about
		if (peak > this._agcFloor) {
			this._agcPeak = Math.max(this._agcPeak * this._agcDecay, peak);
		} else {
			this._agcPeak = Math.max(this._agcFloor, this._agcPeak * this._agcDecay);
		}

		const currentVolume = this.getEnergy("bass", "treble");
		this.volume = this.smooth(this.volume, currentVolume, this.smoothing);
		this.energy = Math.pow(this.volume, 1.4);

		this.bass = this.smooth(this.bass, this.getEnergy("bass"), this.smoothing);
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
