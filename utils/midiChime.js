/**
 * MIDI Chime / Synthesizer
 *
 * Simple synthesizer for testing audio-reactive shaders
 * Can play MIDI notes, chords, and patterns
 *
 * Usage:
 * 1. In setup(): midiChime.init()
 * 2. To play: midiChime.playNote(60) or midiChime.playChord([60, 64, 67])
 * 3. Auto-play: midiChime.startAutoPlay()
 */
class MidiChime {
	constructor() {
		this.synth = null;
		this.bass = null;
		this.reverb = null;
		this.isInitialized = false;

		// Auto-play configuration
		this.autoPlayEnabled = false;
		this.autoPlayInterval = 500; // ms between notes
		this.lastAutoPlayTime = 0;
		this.autoPlayPatternIndex = 0;

		// Predefined patterns
		this.patterns = {
			// C major scale
			scale: [60, 62, 64, 65, 67, 69, 71, 72],

			// C major chord progression: C - Am - F - G
			chords: [
				[60, 64, 67], // C
				[57, 60, 64], // Am
				[53, 57, 60], // F
				[55, 59, 62], // G
			],

			// Bass line
			bassline: [36, 36, 43, 41, 39, 39, 41, 43],

			// Arpeggio
			arpeggio: [60, 64, 67, 72, 67, 64],

			// Random melody
			random: null, // Will generate random notes
		};

		this.currentPattern = "chords";
	}

	/**
	 * Initialize the MIDI chime
	 * @param {object} options - Configuration options
	 */
	init(options = {}) {
		// Create synthesizer (polyphonic)
		this.synth = new p5.PolySynth();

		// Create bass synthesizer
		this.bass = new p5.MonoSynth();

		// Add reverb effect
		this.reverb = new p5.Reverb();
		this.reverb.process(this.synth, 3, 2); // reverb time, decay rate

		// Set default envelope (attack, decay, sustain, release)
		this.synth.setADSR(0.01, 0.3, 0.3, 0.5);
		this.bass.setADSR(0.01, 0.5, 0.1, 0.8);

		// Apply options
		if (options.pattern) this.currentPattern = options.pattern;
		if (options.autoPlayInterval) this.autoPlayInterval = options.autoPlayInterval;

		this.isInitialized = true;
		console.log("MIDI Chime initialized");

		return this;
	}

	/**
	 * Play a single MIDI note
	 * @param {number} note - MIDI note number (60 = middle C)
	 * @param {number} velocity - Velocity 0-1 (default: 0.5)
	 * @param {number} duration - Duration in seconds (default: 0.5)
	 */
	playNote(note, velocity = 0.5, duration = 0.5) {
		if (!this.isInitialized) {
			console.warn("MidiChime not initialized");
			return this;
		}

		const freq = this.midiToFreq(note);

		// Use bass synth for low notes
		if (note < 48) {
			this.bass.play(freq, velocity, 0, duration);
		} else {
			this.synth.play(freq, velocity, 0, duration);
		}

		return this;
	}

	/**
	 * Play a chord (multiple notes simultaneously)
	 * @param {number[]} notes - Array of MIDI note numbers
	 * @param {number} velocity - Velocity 0-1 (default: 0.5)
	 * @param {number} duration - Duration in seconds (default: 0.5)
	 */
	playChord(notes, velocity = 0.5, duration = 0.5) {
		if (!this.isInitialized) {
			console.warn("MidiChime not initialized");
			return this;
		}

		notes.forEach((note) => {
			const freq = this.midiToFreq(note);
			this.synth.play(freq, velocity, 0, duration);
		});

		return this;
	}

	/**
	 * Play a bass note
	 * @param {number} note - MIDI note number
	 * @param {number} velocity - Velocity 0-1 (default: 0.7)
	 * @param {number} duration - Duration in seconds (default: 0.8)
	 */
	playBass(note, velocity = 0.7, duration = 0.8) {
		if (!this.isInitialized) {
			console.warn("MidiChime not initialized");
			return this;
		}

		const freq = this.midiToFreq(note);
		this.bass.play(freq, velocity, 0, duration);

		return this;
	}

	/**
	 * Convert MIDI note number to frequency
	 * @param {number} note - MIDI note number
	 * @returns {number} Frequency in Hz
	 */
	midiToFreq(note) {
		return 440 * Math.pow(2, (note - 69) / 12);
	}

	/**
	 * Start auto-playing pattern
	 * @param {string} patternName - Name of pattern to play
	 */
	startAutoPlay(patternName = null) {
		if (patternName) this.currentPattern = patternName;
		this.autoPlayEnabled = true;
		this.autoPlayPatternIndex = 0;
		this.lastAutoPlayTime = millis();
		console.log(`Auto-play started: ${this.currentPattern}`);
		return this;
	}

	/**
	 * Stop auto-playing
	 */
	stopAutoPlay() {
		this.autoPlayEnabled = false;
		console.log("Auto-play stopped");
		return this;
	}

	/**
	 * Update auto-play (call this in draw loop)
	 */
	update() {
		if (!this.autoPlayEnabled || !this.isInitialized) return;

		const now = millis();
		if (now - this.lastAutoPlayTime >= this.autoPlayInterval) {
			if (this.currentPattern === "drums") {
				this.playDrumPatternStep();
			} else {
				this.playNextInPattern();
			}
			this.lastAutoPlayTime = now;
		}

		return this;
	}

	/**
	 * Play next note/chord in current pattern
	 */
	playNextInPattern() {
		const pattern = this.patterns[this.currentPattern];

		if (this.currentPattern === "random") {
			// Play random note
			const randomNote = Math.floor(Math.random() * 36) + 48; // C3 to C6
			this.playNote(randomNote, Math.random() * 0.3 + 0.3, 0.5);
		} else if (pattern) {
			const item = pattern[this.autoPlayPatternIndex];

			// Check if it's a chord (array) or single note (number)
			if (Array.isArray(item)) {
				this.playChord(item, 0.4, 1.0);
			} else {
				this.playNote(item, 0.5, 0.5);
			}

			// Advance to next in pattern
			this.autoPlayPatternIndex = (this.autoPlayPatternIndex + 1) % pattern.length;
		}

		return this;
	}

	/**
	 * Set pattern
	 * @param {string} patternName - Name of pattern
	 */
	setPattern(patternName) {
		if (this.patterns[patternName] || patternName === "random") {
			this.currentPattern = patternName;
			this.autoPlayPatternIndex = 0;
			console.log(`Pattern set to: ${patternName}`);
		} else {
			console.warn(`Pattern "${patternName}" not found`);
		}
		return this;
	}

	/**
	 * Set auto-play interval
	 * @param {number} interval - Interval in milliseconds
	 */
	setInterval(interval) {
		this.autoPlayInterval = interval;
		return this;
	}

	/**
	 * Add custom pattern
	 * @param {string} name - Pattern name
	 * @param {Array} pattern - Array of notes or chords
	 */
	addPattern(name, pattern) {
		this.patterns[name] = pattern;
		console.log(`Added pattern: ${name}`);
		return this;
	}

	/**
	 * Get list of available patterns
	 * @returns {string[]} Pattern names
	 */
	getPatterns() {
		return Object.keys(this.patterns).concat(["random"]);
	}

	/**
	 * Set synth envelope
	 * @param {number} attack - Attack time (0-1)
	 * @param {number} decay - Decay time (0-1)
	 * @param {number} sustain - Sustain level (0-1)
	 * @param {number} release - Release time (0-1)
	 */
	setEnvelope(attack, decay, sustain, release) {
		if (this.synth) {
			this.synth.setADSR(attack, decay, sustain, release);
		}
		return this;
	}

	/**
	 * Play a drum hit (percussive sound for testing beats)
	 * @param {string} type - 'kick', 'snare', or 'hihat'
	 */
	playDrum(type = "kick") {
		if (!this.isInitialized) return this;

		switch (type) {
			case "kick":
				// Low frequency thump
				this.bass.play(60, 0.8, 0, 0.1);
				break;
			case "snare":
				// Mid-high frequency snap
				this.synth.play(200, 0.6, 0, 0.1);
				break;
			case "hihat":
				// High frequency tick
				this.synth.play(8000, 0.3, 0, 0.05);
				break;
		}

		return this;
	}

	/**
	 * Play a simple drum pattern
	 */
	startDrumPattern() {
		this.stopAutoPlay();
		this.drumPatternStep = 0;
		this.autoPlayEnabled = true;
		this.autoPlayInterval = 125; // 120 BPM (500ms per beat / 4 steps)
		this.lastAutoPlayTime = millis();
		this.currentPattern = "drums";
		console.log("Drum pattern started");
		return this;
	}

	/**
	 * Internal: play drum pattern step
	 */
	playDrumPatternStep() {
		if (!this.drumPatternStep) this.drumPatternStep = 0;

		// Simple 4/4 pattern
		const step = this.drumPatternStep % 16;

		// Kick on 1 and 3
		if (step === 0 || step === 8) {
			this.playDrum("kick");
		}

		// Snare on 2 and 4
		if (step === 4 || step === 12) {
			this.playDrum("snare");
		}

		// Hi-hat on every other step
		if (step % 2 === 0) {
			this.playDrum("hihat");
		}

		this.drumPatternStep++;
	}
}

// Keyboard control helper
class MidiKeyboard {
	constructor(midiChime) {
		this.midiChime = midiChime;
		this.keyMap = {
			// Bottom row (C major scale starting at C4)
			a: 60,
			s: 62,
			d: 64,
			f: 65,
			g: 67,
			h: 69,
			j: 71,
			k: 72,
			// Top row (C5 octave)
			q: 72,
			w: 74,
			e: 76,
			r: 77,
			t: 79,
			y: 81,
			u: 83,
			i: 84,
			// Number keys for chords
			1: [60, 64, 67], // C major
			2: [62, 65, 69], // Dm
			3: [64, 67, 71], // Em
			4: [65, 69, 72], // F major
			5: [67, 71, 74], // G major
			// Drums
			z: "kick",
			x: "snare",
			c: "hihat",
		};

		this.setupKeyboardListeners();
	}

	setupKeyboardListeners() {
		document.addEventListener("keydown", (e) => {
			const key = e.key.toLowerCase();

			if (this.keyMap[key]) {
				const value = this.keyMap[key];

				if (typeof value === "number") {
					// Single note
					this.midiChime.playNote(value);
				} else if (Array.isArray(value)) {
					// Chord
					this.midiChime.playChord(value);
				} else if (typeof value === "string") {
					// Drum
					this.midiChime.playDrum(value);
				}
			}

			// Pattern controls
			if (key === " ") {
				// Spacebar toggles auto-play
				if (this.midiChime.autoPlayEnabled) {
					this.midiChime.stopAutoPlay();
				} else {
					this.midiChime.startAutoPlay();
				}
			}
		});

		console.log("Keyboard controls:");
		console.log("  A-K: Play notes (C major scale)");
		console.log("  Q-I: Play higher octave");
		console.log("  1-5: Play chords");
		console.log("  Z,X,C: Kick, Snare, Hi-hat");
		console.log("  SPACE: Toggle auto-play");
	}
}

// Global instances
const midiChime = new MidiChime();
let midiKeyboard = null;

// Helper function to enable keyboard control
function enableMidiKeyboard() {
	if (!midiKeyboard) {
		midiKeyboard = new MidiKeyboard(midiChime);
	}
	return midiKeyboard;
}
