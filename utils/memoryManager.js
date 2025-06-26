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

// Clear any cached images and canvases
function clearImageCache() {
	// Clear any cached image elements
	const images = document.getElementsByTagName("img");
	for (let img of images) {
		img.src = "";
	}

	// Clear any cached canvas data
	const canvases = document.getElementsByTagName("canvas");
	for (let canvas of canvases) {
		const ctx = canvas.getContext("2d");
		if (ctx) {
			ctx.clearRect(0, 0, canvas.width, canvas.height);
		}
	}
}

// Memory management interval - runs every 5 seconds
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

			Logger.memory.usage(used, total, limit);

			// If memory usage is getting high, force more aggressive cleanup
			if (used / limit > 0.8) {
				Logger.memory.cleanup("High memory usage detected");
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

// Start memory management when page loads
window.addEventListener("load", startMemoryManagement);

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
	stopMemoryManagement();
	forceGC();
});

// Expose functions globally for manual use
window.forceGC = forceGC;
window.clearImageCache = clearImageCache;
window.startMemoryManagement = startMemoryManagement;
window.stopMemoryManagement = stopMemoryManagement;
