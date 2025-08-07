/**
 * SwatchPalette - A utility class for loading and managing color palettes from PNG swatch images
 *
 * Usage:
 * const swatchPalette = new SwatchPalette();
 * await swatchPalette.loadFromManifest('swatches/manifest.json');
 * const colors = swatchPalette.getPalette('december-small.png');
 */
class SwatchPalette {
	constructor() {
		this.swatches = new Map(); // Store loaded swatch data
		this.manifest = null;
		this.loadedImages = new Map(); // Store p5.Image objects
	}

	/**
	 * Load swatches from a manifest file
	 * @param {string} manifestPath - Path to the manifest.json file
	 * @returns {Promise} Promise that resolves when all swatches are loaded
	 */
	async loadFromManifest(manifestPath) {
		try {
			// Load manifest
			const response = await fetch(manifestPath);
			this.manifest = await response.json();

			console.log(`Loading ${this.manifest.swatches.length} swatches from manifest`);

			// Load all swatch images
			const loadPromises = this.manifest.swatches.map((swatchName) => this.loadSwatch(swatchName));

			await Promise.all(loadPromises);
			console.log(`Successfully loaded ${this.swatches.size} swatches`);
		} catch (error) {
			console.error("Failed to load swatches from manifest:", error);
			throw error;
		}
	}

	/**
	 * Load a single swatch image and extract colors
	 * @param {string} swatchName - Name of the swatch file
	 * @returns {Promise} Promise that resolves when swatch is loaded
	 */
	async loadSwatch(swatchName) {
		return new Promise((resolve, reject) => {
			const swatchPath = `swatches/${swatchName}`;

			// Use p5.js loadImage function
			loadImage(
				swatchPath,
				(img) => {
					try {
						this.loadedImages.set(swatchName, img);
						const colors = this.extractColorsFromImage(img);
						this.swatches.set(swatchName, colors);
						console.log(`Loaded swatch '${swatchName}' with ${colors.length} colors`);
						resolve();
					} catch (error) {
						console.error(`Failed to extract colors from ${swatchName}:`, error);
						reject(error);
					}
				},
				(error) => {
					console.error(`Failed to load image ${swatchPath}:`, error);
					reject(error);
				}
			);
		});
	}

	/**
	 * Extract colors from a loaded p5.Image by sampling each pixel along the x-axis
	 * @param {p5.Image} img - The loaded p5.Image
	 * @returns {Array} Array of color objects in HSL format
	 */
	extractColorsFromImage(img) {
		const colors = [];

		// Load pixels to access pixel data
		img.loadPixels();

		// Sample colors from the middle row (y = height/2) across the width
		const y = Math.floor(img.height / 2);

		for (let x = 0; x < img.width; x++) {
			// Get pixel index (4 values per pixel: R, G, B, A)
			const pixelIndex = (y * img.width + x) * 4;

			// Extract RGB values
			const r = img.pixels[pixelIndex];
			const g = img.pixels[pixelIndex + 1];
			const b = img.pixels[pixelIndex + 2];
			const a = img.pixels[pixelIndex + 3];

			// Skip transparent pixels
			if (a < 128) continue;

			// Convert RGB to HSL
			const hsl = this.rgbToHsl(r, g, b);
			colors.push(hsl);
		}

		return colors;
	}

	/**
	 * Convert RGB values to HSL format compatible with p5.js HSB color mode
	 * @param {number} r - Red value (0-255)
	 * @param {number} g - Green value (0-255)
	 * @param {number} b - Blue value (0-255)
	 * @returns {Object} HSL object with h (0-360), s (0-100), l (0-100)
	 */
	rgbToHsl(r, g, b) {
		// Normalize RGB values to 0-1
		r /= 255;
		g /= 255;
		b /= 255;

		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		let h,
			s,
			l = (max + min) / 2;

		if (max === min) {
			h = s = 0; // achromatic
		} else {
			const d = max - min;
			s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

			switch (max) {
				case r:
					h = (g - b) / d + (g < b ? 6 : 0);
					break;
				case g:
					h = (b - r) / d + 2;
					break;
				case b:
					h = (r - g) / d + 4;
					break;
			}
			h /= 6;
		}

		return {
			h: Math.round(h * 360),
			s: Math.round(s * 100),
			l: Math.round(l * 100),
		};
	}

	/**
	 * Get a color palette from a loaded swatch
	 * @param {string} swatchName - Name of the swatch file
	 * @returns {Array} Array of HSL color objects, or null if not found
	 */
	getPalette(swatchName) {
		return this.swatches.get(swatchName) || null;
	}

	/**
	 * Get all available swatch names
	 * @returns {Array} Array of swatch names
	 */
	getSwatchNames() {
		return Array.from(this.swatches.keys());
	}

	/**
	 * Get a random palette from loaded swatches
	 * @returns {Array} Random color palette
	 */
	getRandomPalette() {
		const names = this.getSwatchNames();
		if (names.length === 0) return null;

		const randomName = names[Math.floor(Math.random() * names.length)];
		return this.getPalette(randomName);
	}

	/**
	 * Check if swatches are loaded and ready
	 * @returns {boolean} True if swatches are loaded
	 */
	isReady() {
		return this.swatches.size > 0;
	}

	/**
	 * Get the number of loaded swatches
	 * @returns {number} Number of loaded swatches
	 */
	getSwatchCount() {
		return this.swatches.size;
	}
}

// Export for use in other scripts
if (typeof module !== "undefined" && module.exports) {
	module.exports = SwatchPalette;
}
