/**
 * ChromaPalette - A utility class for building color palettes from hex color arrays
 * (e.g. arrays generated on https://obumbratta.com/colour), resampled into smooth
 * gradients with chroma.js.
 *
 * Requires chroma.js to be loaded first (window.chroma).
 *
 * Usage:
 * const palettes = new ChromaPalette({ mode: "oklch", steps: 256 });
 * palettes.addPalette("dawn-ember", { colors: ["#ffffe0", "#02439e"] });
 * const colors = palettes.getPalette("dawn-ember"); // -> [{h, s, l}, ...]
 *
 * Palette definition (def):
 *   hex[]                                  shorthand, uses global defaults
 *   { colors: hex[], mode?, steps?, discrete? }
 *     mode:     chroma.scale interpolation mode ("oklch", "oklab", "lch", "lab", "hsl", "rgb", "lrgb")
 *     steps:    number of resampled colors in the final gradient
 *     discrete: if true, colors are used as-is (no resampling)
 */
class ChromaPalette {
	static MODES = ["oklch", "oklab", "lch", "lab", "hsl", "rgb", "lrgb"];

	constructor(defaults = {}) {
		if (typeof chroma === "undefined") {
			throw new Error("ChromaPalette requires chroma.js (load library/p5/p5.chroma.js first)");
		}
		this.defaults = {
			mode: defaults.mode || "oklch",
			steps: defaults.steps || 256,
		};
		this.configs = new Map(); // name -> {colors, mode, steps, discrete, source}
		this.built = new Map(); // name -> [{h,s,l}] cache
	}

	/**
	 * Register a named palette
	 * @param {string} name - Palette name
	 * @param {Array|Object} def - hex[] or {colors, mode?, steps?, discrete?}
	 * @param {Object} [opts] - { source: "file" | "local" } (default "file")
	 */
	addPalette(name, def, opts = {}) {
		const config = Array.isArray(def) ? { colors: def } : { ...def };
		if (!Array.isArray(config.colors) || config.colors.length < 2) {
			throw new Error(`ChromaPalette '${name}': needs an array of at least 2 colors`);
		}

		const invalid = config.colors.filter((c) => !chroma.valid(c));
		if (invalid.length > 0) {
			throw new Error(`ChromaPalette '${name}': invalid colors: ${invalid.join(", ")}`);
		}

		this.configs.set(name, {
			colors: config.colors.map((c) => chroma(c).hex()),
			mode: config.mode || this.defaults.mode,
			steps: config.steps || this.defaults.steps,
			discrete: !!config.discrete,
			source: opts.source || "file",
		});
		this.built.delete(name); // invalidate cache on redefinition
	}

	/**
	 * Register several palettes at once
	 * @param {Object} map - { name: def, ... }
	 * @param {Object} [opts] - passed to addPalette
	 */
	addPalettes(map, opts = {}) {
		for (const [name, def] of Object.entries(map || {})) {
			this.addPalette(name, def, opts);
		}
	}

	/**
	 * Remove a palette
	 * @param {string} name - Palette name
	 */
	removePalette(name) {
		this.configs.delete(name);
		this.built.delete(name);
	}

	/**
	 * Get a palette as an ordered array of HSL color objects
	 * (same contract as SwatchPalette: h 0-360, s 0-100, l 0-100)
	 * @param {string} name - Palette name
	 * @returns {Array|null} Array of {h, s, l} objects, or null if not found
	 */
	getPalette(name) {
		if (this.built.has(name)) return this.built.get(name);
		const config = this.configs.get(name);
		if (!config) return null;

		const hexColors = this._buildHexColors(config);

		// Convert to {h,s,l}; greys have NaN hue in chroma — carry the previous
		// hue forward to keep the Mover's hue-walk continuous
		let lastValidHue = 0;
		const colors = hexColors.map((hex) => {
			const [h, s, l] = chroma(hex).hsl();
			if (!Number.isNaN(h)) lastValidHue = h;
			return {
				h: Math.round(lastValidHue),
				s: Math.round(s * 100),
				l: Math.round(l * 100),
			};
		});

		this.built.set(name, colors);
		return colors;
	}

	/**
	 * Get a palette as resampled hex strings (for UI previews / copy-as-code)
	 * @param {string} name - Palette name
	 * @returns {Array|null} Array of hex strings, or null if not found
	 */
	getHexPalette(name) {
		const config = this.configs.get(name);
		if (!config) return null;
		return this._buildHexColors(config);
	}

	/**
	 * Get a palette's configuration
	 * @param {string} name - Palette name
	 * @returns {Object|null} {colors, mode, steps, discrete, source} or null
	 */
	getConfig(name) {
		const config = this.configs.get(name);
		return config ? { ...config, colors: [...config.colors] } : null;
	}

	/**
	 * Get all palette names (file + local)
	 * @returns {Array} Array of palette names
	 */
	getPaletteNames() {
		return Array.from(this.configs.keys());
	}

	/**
	 * Get only source:"file" palette names — the deterministic random-pick pool.
	 * Local (browser-only) palettes must never enter fxrand selection.
	 * @returns {Array} Array of palette names
	 */
	getFileNames() {
		return this.getPaletteNames().filter((name) => this.configs.get(name).source === "file");
	}

	/**
	 * Get a random palette (deterministic via fxrand, over sorted file palettes only)
	 * @returns {Array|null} Random color palette
	 */
	getRandomPalette() {
		const names = this.getFileNames().sort();
		if (names.length === 0) return null;
		const randomName = names[Math.floor(fxrand() * names.length)];
		return this.getPalette(randomName);
	}

	/**
	 * Check if at least one palette is registered
	 * @returns {boolean}
	 */
	isReady() {
		return this.configs.size > 0;
	}

	/**
	 * Get the number of registered palettes
	 * @returns {number}
	 */
	getCount() {
		return this.configs.size;
	}

	/**
	 * Build the (possibly resampled) hex color list for a config
	 * @private
	 */
	_buildHexColors(config) {
		if (config.discrete) return [...config.colors];
		return chroma.scale(config.colors).mode(config.mode).colors(config.steps);
	}

	/**
	 * Extensibility hook for a future palette generator (not implemented yet).
	 * A generator produces anchor colors; the result is a def consumable by addPalette.
	 *
	 * @param {Function} generatorFn - (rng, opts) => hex[] — anchor color generator
	 * @param {Object} [opts] - { rng = fxrand, mode?, steps?, discrete?, ...generator options }
	 * @returns {Object} Palette def: { colors, mode?, steps?, discrete? }
	 */
	static fromGenerator(generatorFn, opts = {}) {
		const { rng = typeof fxrand !== "undefined" ? fxrand : Math.random, mode, steps, discrete, ...generatorOpts } = opts;
		const colors = generatorFn(rng, generatorOpts);
		return { colors, mode, steps, discrete };
	}
}

// Export for use in other scripts
if (typeof module !== "undefined" && module.exports) {
	module.exports = ChromaPalette;
}
