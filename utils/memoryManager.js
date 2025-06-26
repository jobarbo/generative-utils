/**
 * Memory Manager - Helps prevent browser crashes during intensive frame saving
 * by managing memory usage and preventing excessive caching
 */

// Disable browser caching programmatically
if ("serviceWorker" in navigator) {
	// Clear any existing service worker cache
	caches.keys().then(function (names) {
		for (let name of names) {
			caches.delete(name);
		}
	});
}

// Force garbage collection if available (Chrome DevTools)
function forceGC() {
	if (window.gc) {
		window.gc();
	}
}

// Clear any cached images and canvases (but preserve main drawing canvas)
function clearImageCache() {
	// Clear any cached image elements
	const images = document.getElementsByTagName("img");
	for (let img of images) {
		img.src = "";
	}

	// Clear any cached canvas data, but skip the main p5.js canvas
	const canvases = document.getElementsByTagName("canvas");
	for (let canvas of canvases) {
		// Skip the main p5.js drawing canvas
		if (canvas.id === "defaultCanvas0" || canvas.classList.contains("p5Canvas")) {
			continue;
		}

		const ctx = canvas.getContext("2d");
		if (ctx) {
			ctx.clearRect(0, 0, canvas.width, canvas.height);
		}
	}
}

/**
 * MemoryManager class for managing memory usage in intensive applications
 */
class MemoryManager {
	constructor(options = {}) {
		this.interval = null;
		this.isRunning = false;
		this.options = {
			intervalMs: options.intervalMs || 5000, // 5 seconds default
			memoryThreshold: options.memoryThreshold || 0.8, // 80% memory threshold
			cleanupChance: options.cleanupChance || 0.1, // 10% chance for cleanup
			enableLogging: options.enableLogging !== false, // Enable logging by default
			...options,
		};

		// Bind methods to preserve context
		this.tick = this.tick.bind(this);
		this.handleUnload = this.handleUnload.bind(this);
	}

	/**
	 * Start memory management monitoring
	 */
	start() {
		if (this.isRunning) {
			return;
		}

		this.isRunning = true;
		this.interval = setInterval(this.tick, this.options.intervalMs);

		// Setup cleanup on page unload
		window.addEventListener("beforeunload", this.handleUnload);

		if (this.options.enableLogging) {
			const logger = window.Logger || console;
			logger.info ? logger.info("Memory Manager started") : logger.log("Memory Manager started");
		}
	}

	/**
	 * Stop memory management monitoring
	 */
	stop() {
		if (!this.isRunning) {
			return;
		}

		this.isRunning = false;

		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
		}

		window.removeEventListener("beforeunload", this.handleUnload);

		if (this.options.enableLogging) {
			const logger = window.Logger || console;
			logger.info ? logger.info("Memory Manager stopped") : logger.log("Memory Manager stopped");
		}
	}

	/**
	 * Memory management tick - called at regular intervals
	 */
	tick() {
		// Force garbage collection
		this.forceGC();

		// Check memory usage if available
		if (performance.memory) {
			const memory = performance.memory;
			const used = Math.round(memory.usedJSHeapSize / 1048576); // MB
			const total = Math.round(memory.totalJSHeapSize / 1048576); // MB
			const limit = Math.round(memory.jsHeapSizeLimit / 1048576); // MB
			const percentage = used / limit;

			if (this.options.enableLogging) {
				const logger = window.Logger || console;
				if (logger.memory && logger.memory.usage) {
					logger.memory.usage(used, total, limit);
				} else {
					logger.info
						? logger.info(`Memory: ${used}MB / ${total}MB (${Math.round(percentage * 100)}% of ${limit}MB limit)`)
						: logger.log(`Memory: ${used}MB / ${total}MB (${Math.round(percentage * 100)}% of ${limit}MB limit)`);
				}
			}

			// If memory usage is getting high, force more aggressive cleanup (but no image cache clearing)
			if (percentage > this.options.memoryThreshold) {
				if (this.options.enableLogging) {
					const logger = window.Logger || console;
					if (logger.memory && logger.memory.cleanup) {
						logger.memory.cleanup("High memory usage detected - forcing GC");
					} else {
						logger.warning ? logger.warning("High memory usage detected - forcing GC") : logger.warn("High memory usage detected - forcing GC");
					}
				}
				this.forceGC();
				// Removed clearImageCache() from here - only GC during execution
			}

			return {
				used,
				total,
				limit,
				percentage: Math.round(percentage * 100),
			};
		}

		return null;
	}

	/**
	 * Force garbage collection
	 */
	forceGC() {
		forceGC();
	}

	/**
	 * Clear image cache (preserves main drawing canvas)
	 */
	clearImageCache() {
		clearImageCache();
	}

	/**
	 * Get current memory usage
	 */
	getMemoryUsage() {
		if (performance.memory) {
			const memory = performance.memory;
			return {
				used: Math.round(memory.usedJSHeapSize / 1048576),
				total: Math.round(memory.totalJSHeapSize / 1048576),
				limit: Math.round(memory.jsHeapSizeLimit / 1048576),
				percentage: Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100),
			};
		}
		return null;
	}

	/**
	 * Handle page unload
	 */
	handleUnload() {
		this.stop();
		this.forceGC();
	}

	/**
	 * Update options
	 */
	updateOptions(newOptions) {
		this.options = {...this.options, ...newOptions};
	}

	/**
	 * Prepare for sketch start - clear any cached content before beginning
	 */
	prepareForSketch() {
		if (this.options.enableLogging) {
			const logger = window.Logger || console;
			logger.info ? logger.info("Preparing memory for sketch start") : logger.log("Preparing memory for sketch start");
		}
		this.clearImageCache();
		this.forceGC();
	}

	/**
	 * Cleanup after sketch completion
	 */
	cleanupAfterSketch() {
		if (this.options.enableLogging) {
			const logger = window.Logger || console;
			logger.info ? logger.info("Cleaning up memory after sketch completion") : logger.log("Cleaning up memory after sketch completion");
		}
		this.clearImageCache();
		this.forceGC();
	}
}

// Memory management interval - runs every 5 seconds (legacy support)
let memoryInterval;

function startMemoryManagement() {
	memoryInterval = setInterval(() => {
		// Force garbage collection
		forceGC();

		// Clear image cache periodically
		if (Math.random() < 0.1) {
			// 10% chance each interval
			clearImageCache();
		}

		// Log memory usage if available
		if (performance.memory) {
			const memory = performance.memory;
			const used = Math.round(memory.usedJSHeapSize / 1048576); // MB
			const total = Math.round(memory.totalJSHeapSize / 1048576); // MB
			const limit = Math.round(memory.jsHeapSizeLimit / 1048576); // MB

			const logger = window.Logger || console;
			if (logger.memory && logger.memory.usage) {
				logger.memory.usage(used, total, limit);
			}

			// If memory usage is getting high, force more aggressive cleanup
			if (used / limit > 0.8) {
				if (logger.memory && logger.memory.cleanup) {
					logger.memory.cleanup("High memory usage detected");
				}
				forceGC();
				clearImageCache();
			}
		}
	}, 5000); // Every 5 seconds
}

function stopMemoryManagement() {
	if (memoryInterval) {
		clearInterval(memoryInterval);
		memoryInterval = null;
	}
}

// Start memory management when page loads (legacy support)
window.addEventListener("load", startMemoryManagement);

// Cleanup on page unload (legacy support)
window.addEventListener("beforeunload", () => {
	stopMemoryManagement();
	forceGC();
});

// Expose functions globally for manual use
window.forceGC = forceGC;
window.clearImageCache = clearImageCache;
window.startMemoryManagement = startMemoryManagement;
window.stopMemoryManagement = stopMemoryManagement;
window.MemoryManager = MemoryManager;
