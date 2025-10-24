/**
 * Stop Motion Animation Controller
 *
 * A reusable controller for creating stop-motion style generative art animations.
 * It manages frame capture cycles, easing-based parameter evolution, and scene reinitialization.
 *
 * @example
 * let stopMotion;
 *
 * function setup() {
 *   stopMotion = new StopMotionController({
 *     captureInterval: 100,        // Capture every 100 frames
 *     easingIncrement: 0.31,       // How much to increment easing angle each cycle
 *     maxCycles: 1,                // Stop after 1 complete cycle
 *     onCapture: () => saveArtwork(),
 *     onReinit: (params) => INIT(params),
 *     onComplete: () => console.log('Done!')
 *   });
 * }
 *
 * function draw() {
 *   // Your drawing code here
 *
 *   // Update stop motion at the end of draw
 *   stopMotion.update();
 * }
 */

class StopMotionController {
	constructor(config = {}) {
		// Configuration
		this.config = {
			captureInterval: config.captureInterval || 100, // Frames between captures
			easingIncrement: config.easingIncrement || 0.31, // Angle increment per cycle
			maxCycles: config.maxCycles || 1, // Number of complete cycles before stopping
			reinitDelay: config.reinitDelay || 150, // ms delay before reinitializing
			enableMemoryManagement: config.enableMemoryManagement !== false,
			startAngle: config.startAngle !== undefined ? config.startAngle : 180, // Start angle (180° = cos = -1)

			// Callbacks
			onCapture: config.onCapture || null, // Called when capturing a frame
			onReinit: config.onReinit || null, // Called when reinitializing (receives params object)
			onComplete: config.onComplete || null, // Called when animation completes
			onProgress: config.onProgress || null, // Called on progress updates (receives progress object)
		};

		// State
		// Start at 180° so cos(easeAng) = -1, giving a full cycle to 1
		this.easeAng = config.startAngle !== undefined ? config.startAngle : 180;
		this.cycleCount = 0;
		this.isComplete = false;
		this.isReinitializing = false;

		// Noise offsets for parameter evolution
		this.noiseOffsets = {
			x: Math.random() * 10000,
			y: Math.random() * 10000,
			ax: Math.random() * 10000,
			ay: Math.random() * 10000,
			sx: Math.random() * 10000,
			sy: Math.random() * 10000,
		};

		// Reference to memory manager if available
		this.memoryManager = config.memoryManager || null;

		// Logger
		this.logger = window.Logger || console;
	}

	/**
	 * Gets the current easing value (cosine of easeAng)
	 * @returns {number} Value between -1 and 1
	 */
	getEasing() {
		if (typeof radians === "function") {
			return cos(radians(this.easeAng));
		}
		// Fallback to Math if p5.js functions not available
		return Math.cos((this.easeAng * Math.PI) / 180);
	}

	/**
	 * Maps a value based on current easing
	 * @param {number} min - Minimum value when easing is -1
	 * @param {number} max - Maximum value when easing is 1
	 * @param {boolean} clamp - Whether to clamp the result
	 * @returns {number} Mapped value
	 */
	mapEasing(min, max, clamp = true) {
		const easing = this.getEasing();
		if (typeof map === "function") {
			return map(easing, -1, 1, min, max, clamp);
		}
		// Fallback
		const value = ((easing + 1) / 2) * (max - min) + min;
		return clamp ? Math.max(min, Math.min(max, value)) : value;
	}

	/**
	 * Gets a noise-based value that evolves over cycles
	 * @param {string} offsetName - Name of offset to use ('x', 'y', 'ax', 'ay', 'sx', 'sy')
	 * @param {number} increment - How much to increment the offset (default: 0.01)
	 * @returns {number} Noise value between 0 and 1
	 */
	getNoise(offsetName, increment = 0.01) {
		if (!this.noiseOffsets[offsetName]) {
			this.noiseOffsets[offsetName] = Math.random() * 10000;
		}

		const value = typeof noise === "function" ? noise(this.noiseOffsets[offsetName]) : Math.random();

		this.noiseOffsets[offsetName] += increment;
		return value;
	}

	/**
	 * Maps a noise value to a range
	 * @param {string} offsetName - Name of offset to use
	 * @param {number} min - Minimum value
	 * @param {number} max - Maximum value
	 * @param {number} increment - How much to increment the offset
	 * @param {boolean} clamp - Whether to clamp the result
	 * @returns {number} Mapped noise value
	 */
	mapNoise(offsetName, min, max, increment = 0.01, clamp = true) {
		const noiseVal = this.getNoise(offsetName, increment);
		if (typeof map === "function") {
			return map(noiseVal, 0, 1, min, max, clamp);
		}
		// Fallback
		const value = noiseVal * (max - min) + min;
		return clamp ? Math.max(min, Math.min(max, value)) : value;
	}

	/**
	 * Gets a parameters object with common animated values
	 * @returns {Object} Parameters object with easing, noise, and cycle info
	 */
	getParameters() {
		const easing = this.getEasing();

		return {
			// Easing values
			easing: easing,
			easeAng: this.easeAng,
			easingNormalized: (easing + 1) / 2, // 0 to 1 range

			// Cycle info
			cycleCount: this.cycleCount,
			cycleProgress: easing, // -1 to 1, where 1 completes a cycle

			// Noise offsets (for user to sample)
			noiseOffsets: {...this.noiseOffsets},

			// Helper methods bound to this instance
			mapEasing: this.mapEasing.bind(this),
			mapNoise: this.mapNoise.bind(this),
			getNoise: this.getNoise.bind(this),
		};
	}

	/**
	 * Main update function - call this in your draw() loop
	 */
	update() {
		// Don't update if complete or reinitializing
		if (this.isComplete || this.isReinitializing) {
			return;
		}

		// Check if it's time to capture
		if (typeof frameCount !== "undefined" && frameCount % this.config.captureInterval === 0) {
			this.handleCapture();
		}
	}

	/**
	 * Handles the capture logic
	 */
	handleCapture() {
		const easing = this.getEasing();

		// Get memory usage if available
		let memoryUsage = null;
		if (this.memoryManager && this.config.enableMemoryManagement) {
			memoryUsage = this.memoryManager.getMemoryUsage();
		}

		// Progress data
		const progressData = {
			easing: easing.toFixed(4),
			cycleCount: this.cycleCount,
			frameCount: typeof frameCount !== "undefined" ? frameCount : 0,
			easeAng: this.easeAng.toFixed(2),
		};

		// Add memory info if available
		if (memoryUsage) {
			progressData.memoryUsed = memoryUsage.used + "MB";
			progressData.memoryPercent = memoryUsage.percentage + "%";
		}

		// Log progress
		if (this.logger.table) {
			this.logger.table("Stop Motion Progress", progressData);
		}

		// Call progress callback
		if (this.config.onProgress) {
			this.config.onProgress(progressData);
		}

		// Check if cycle completed
		if (easing >= 1) {
			this.cycleCount += 1;
		}

		// Continue capturing or complete
		if (this.cycleCount < this.config.maxCycles) {
			this.captureFrame();
		} else {
			this.complete();
		}
	}

	/**
	 * Captures a frame and schedules reinitialization
	 */
	captureFrame() {
		this.logger.info ? this.logger.info("Capturing frame...") : console.log("Capturing frame...");

		// Force garbage collection if available
		if (this.memoryManager && this.config.enableMemoryManagement) {
			this.memoryManager.forceGC();
		}

		// Call capture callback
		if (this.config.onCapture) {
			this.config.onCapture();
		}

		// Schedule reinitialization
		this.isReinitializing = true;

		if (typeof requestAnimationFrame !== "undefined") {
			requestAnimationFrame(() => {
				setTimeout(() => {
					this.reinitialize();
				}, this.config.reinitDelay);
			});
		} else {
			setTimeout(() => {
				this.reinitialize();
			}, this.config.reinitDelay);
		}
	}

	/**
	 * Reinitializes the scene with updated parameters
	 */
	reinitialize() {
		this.logger.info ? this.logger.info("Reinitializing...") : console.log("Reinitializing...");

		// Increment easing angle
		this.easeAng += this.config.easingIncrement;

		// Get new parameters
		const params = this.getParameters();

		// Call reinit callback with parameters
		if (this.config.onReinit) {
			this.config.onReinit(params);
		}

		this.isReinitializing = false;
	}

	/**
	 * Completes the animation
	 */
	complete() {
		if (this.isComplete) return;

		this.isComplete = true;

		// Stop memory monitoring and cleanup
		if (this.memoryManager && this.config.enableMemoryManagement) {
			this.memoryManager.stop();
			this.memoryManager.cleanupAfterSketch();
			this.logger.info ? this.logger.info("Animation complete - Memory monitoring stopped") : console.log("Animation complete - Memory monitoring stopped");
		}

		// Stop p5 loop if available
		if (typeof noLoop === "function") {
			noLoop();
		}

		// Call complete callback
		if (this.config.onComplete) {
			this.config.onComplete();
		}
	}

	/**
	 * Resets the controller to initial state
	 */
	reset() {
		this.easeAng = this.config.startAngle;
		this.cycleCount = 0;
		this.isComplete = false;
		this.isReinitializing = false;

		// Reset noise offsets
		this.noiseOffsets = {
			x: Math.random() * 10000,
			y: Math.random() * 10000,
			ax: Math.random() * 10000,
			ay: Math.random() * 10000,
			sx: Math.random() * 10000,
			sy: Math.random() * 10000,
		};

		// Restart loop if available
		if (typeof loop === "function") {
			loop();
		}
	}

	/**
	 * Checks if animation is complete
	 * @returns {boolean}
	 */
	isDone() {
		return this.isComplete;
	}

	/**
	 * Gets current cycle count
	 * @returns {number}
	 */
	getCycleCount() {
		return this.cycleCount;
	}

	/**
	 * Gets current easing angle
	 * @returns {number}
	 */
	getEaseAngle() {
		return this.easeAng;
	}
}

// Export for both browser and module systems
if (typeof window !== "undefined") {
	window.StopMotionController = StopMotionController;
}

if (typeof module !== "undefined" && module.exports) {
	module.exports = StopMotionController;
}
