/**
 * AnimationController - A modular animation management library for p5.js and animation generators
 *
 * Usage examples:
 *
 * // For p5.js draw() loop with animated variables:
 * const animationController = new AnimationController({
 *   saveInterval: 100,
 *   maxCycles: 1,
 *   animatedVariables: {
 *     'angle': 0.5,     // Increment angle by 0.5 each cycle
 *     'scale': 0.01,    // Increment scale by 0.01 each cycle
 *     'offset': 0.1     // Increment offset by 0.1 each cycle
 *   },
 *   onSave: (frameCount) => console.log(`Saved frame ${frameCount}`),
 *   onComplete: () => console.log('Animation complete')
 * });
 *
 * function draw() {
 *   // Your drawing code here
 *   animationController.checkAndSave();
 * }
 *
 * // For animation generator:
 * const animationController = new AnimationController({
 *   mode: 'generator',
 *   totalFrames: 1000,
 *   onComplete: () => console.log('Animation complete')
 * });
 */

class AnimationController {
	constructor(options = {}) {
		// Default configuration
		this.config = {
			mode: "p5", // 'p5' for draw() loop, 'generator' for animation generator
			saveInterval: 100, // Save every N frames (for p5 mode)
			maxCycles: 1, // Maximum number of complete cycles before stopping
			totalFrames: null, // Total frames for generator mode
			cycleDetectionAngle: "easeAng", // Variable name to monitor for cycle detection
			cycleThreshold: 1, // Threshold for cycle detection (cos value >= 1)
			onSave: null, // Callback when saving (receives frameCount)
			onCycleComplete: null, // Callback when a cycle completes
			onComplete: null, // Callback when all cycles are done
			onProgress: null, // Callback for progress updates (receives progress info)
			saveFunction: null, // Custom save function, defaults to saveArtwork()
			resetFunction: null, // Custom reset function, defaults to INIT()
			initFunction: null, // Custom init function to call after save
			initSeed: null, // Seed to pass to init function
			autoResetAfterSave: true, // Whether to automatically reset after saving
			animatedVariables: {}, // Object defining which variables to animate and by how much
			computedVariables: {}, // Object defining computed variables as functions
			variableScope: null, // Scope where variables are stored (defaults to window)
			...options,
		};

		// Internal state
		this.frameCount = 0;
		this.cycleCount = 0;
		this.isComplete = false;
		this.lastCosValue = 0;
		this.progress = 0;

		// Bind methods
		this.checkAndSave = this.checkAndSave.bind(this);
		this.updateProgress = this.updateProgress.bind(this);
		this.save = this.save.bind(this);
		this.reset = this.reset.bind(this);
	}

	/**
	 * Main method for p5.js draw() loop - call this in your draw function
	 */
	checkAndSave() {
		if (this.isComplete) return;

		this.frameCount++;

		if (this.config.mode === "p5") {
			this._handleP5Mode();
		}
	}

	/**
	 * Method for animation generator - call this to update progress
	 * @param {number} currentFrame - Current frame number
	 * @param {number} totalFrames - Total frames (optional, uses config if not provided)
	 */
	updateProgress(currentFrame, totalFrames = null) {
		if (this.isComplete) return;

		this.frameCount = currentFrame;
		const total = totalFrames || this.config.totalFrames;

		if (total) {
			this.progress = (currentFrame / total) * 100;

			if (this.config.onProgress) {
				this.config.onProgress({
					currentFrame,
					totalFrames: total,
					progress: this.progress,
					cycleCount: this.cycleCount,
				});
			}

			// Check if animation is complete
			if (currentFrame >= total) {
				this._complete();
			}
		}
	}

	/**
	 * Manually trigger a save
	 */
	save() {
		if (this.config.saveFunction) {
			this.config.saveFunction(this.frameCount);
		} else if (typeof saveArtwork === "function") {
			saveArtwork();
		} else {
			console.warn("No save function available");
		}

		if (this.config.onSave) {
			this.config.onSave(this.frameCount);
		}
	}

	/**
	 * Reset the animation (calls reset function if provided)
	 */
	reset() {
		// Update animated variables before reset
		this._updateAnimatedVariables();

		if (this.config.resetFunction) {
			this.config.resetFunction();
		} else if (this.config.initFunction) {
			// Use the provided init function
			const seed = this.config.initSeed || (typeof rseed !== "undefined" ? rseed : Math.random() * 10000);
			this.config.initFunction(seed);
		} else if (typeof INIT === "function") {
			// Try to get the seed from global scope
			const seed = typeof rseed !== "undefined" ? rseed : Math.random() * 10000;
			INIT(seed);
		}
	}

	/**
	 * Check if a cycle is complete using angle-based detection
	 * @param {number} angleValue - Current angle value (e.g., easeAng)
	 */
	checkCycleComplete(angleValue) {
		if (this.isComplete) return false;

		const cosValue = Math.cos((angleValue * Math.PI) / 180); // Convert to radians if needed

		// Detect when cos value reaches or exceeds threshold
		if (cosValue >= this.config.cycleThreshold && this.lastCosValue < this.config.cycleThreshold) {
			this.cycleCount++;

			if (this.config.onCycleComplete) {
				this.config.onCycleComplete(this.cycleCount);
			}

			// Check if we've completed all cycles
			if (this.cycleCount >= this.config.maxCycles) {
				this._complete();
				return true;
			}
		}

		this.lastCosValue = cosValue;
		return false;
	}

	/**
	 * Get current status
	 */
	getStatus() {
		return {
			frameCount: this.frameCount,
			cycleCount: this.cycleCount,
			progress: this.progress,
			isComplete: this.isComplete,
			mode: this.config.mode,
		};
	}

	/**
	 * Stop the frame saver
	 */
	stop() {
		this.isComplete = true;
	}

	/**
	 * Restart the frame saver
	 */
	restart() {
		this.frameCount = 0;
		this.cycleCount = 0;
		this.progress = 0;
		this.isComplete = false;
		this.lastCosValue = 0;
	}

	// Private methods
	_handleP5Mode() {
		// Save at specified intervals
		if (this.frameCount % this.config.saveInterval === 0) {
			// Check for cycle completion if angle detection is enabled
			if (this.config.cycleDetectionAngle && typeof window[this.config.cycleDetectionAngle] !== "undefined") {
				const angleValue = window[this.config.cycleDetectionAngle];
				const cosValue = Math.cos(angleValue); // easeAng is already in radians

				console.log(`cosIndex: ${cosValue}`);

				// Detect cycle completion when cos reaches threshold
				if (cosValue >= this.config.cycleThreshold) {
					this.cycleCount++;
					console.log(`cycleCount: ${this.cycleCount}`);
				}

				if (this.cycleCount < this.config.maxCycles) {
					console.log("screenshot");
					this.save();
					if (this.config.autoResetAfterSave) {
						this.reset();
					}
				} else {
					this._complete();
				}
			} else {
				// Simple save without cycle detection
				this.save();
				if (this.config.autoResetAfterSave) {
					this.reset();
				}
			}
		}
	}

	/**
	 * Update animated variables based on configuration
	 */
	_updateAnimatedVariables() {
		const scope = this.config.variableScope || window;

		// Update simple animated variables (incremental)
		for (const [varName, increment] of Object.entries(this.config.animatedVariables)) {
			if (typeof scope[varName] !== "undefined") {
				scope[varName] += increment;
				console.log(`Updated ${varName}: ${scope[varName]}`);
			} else {
				console.warn(`Variable ${varName} not found in scope`);
			}
		}

		// Update computed variables (calculated each time)
		for (const [varName, computeFunction] of Object.entries(this.config.computedVariables)) {
			if (typeof computeFunction === "function") {
				scope[varName] = computeFunction(scope);
				console.log(`Computed ${varName}: ${scope[varName]}`);
			} else {
				console.warn(`Compute function for ${varName} is not a function`);
			}
		}
	}

	_complete() {
		this.isComplete = true;

		// Stop p5.js loop if available
		if (typeof noLoop === "function") {
			noLoop();
		}

		if (this.config.onComplete) {
			this.config.onComplete({
				totalFrames: this.frameCount,
				totalCycles: this.cycleCount,
				progress: 100,
			});
		}
	}
}

// Export for different module systems
if (typeof module !== "undefined" && module.exports) {
	module.exports = FrameSaver;
} else if (typeof window !== "undefined") {
	window.FrameSaver = FrameSaver;
}
