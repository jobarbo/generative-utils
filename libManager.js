/**
 * BUBBLE-CHAMBER Library Manager
 * Modular library system for managing dependencies and imports
 */

class LibManager {
	constructor() {
		this.modules = new Map();
		this.loadedModules = new Set();
		this.dependencies = new Map();
		this.loadPromises = new Map();
		this.globalVarsBackup = new Map();

		// Define module paths
		this.modulePaths = {
			// Utility modules
			utils: "./library/utils/utils.js",
			logs: "./library/utils/logs.js",
			memory: "./library/utils/memoryManager.js",
			stopMotion: "./library/utils/stopMotionController.js",
			// animation: moved to utils.js as createAnimationGenerator()
			shader: "./library/utils/shaderManager.js",
			shaderPipeline: "./library/utils/shaderPipeline.js",
			smudge: "./library/utils/smudge.js",
			horizon: "./library/utils/horizon.js",
			knob: "./library/utils/knob.js",
			paramsPanel: "./library/utils/paramsPanel.js",
			chromaPalette: "./library/utils/chromaPalette.js",

			// Core libraries
			fxhash: "./library/utils/fxhash.js",
			p5: "./library/p5/p5.min.js",
			spectral: "./library/p5/spectral.js",

			// Application modules
			params: "./parameters/params.js",
			mover: "./modules/mover.js",
		};

		// Define dependencies (what each module needs)
		this.dependencies.set("utils", ["logs"]); // utils needs Logger from logs
		this.dependencies.set("mover", ["utils", "logs"]);
		// animation functionality is now in utils.js (createAnimationGenerator)
		this.dependencies.set("shader", ["logs"]);
		this.dependencies.set("shaderPipeline", ["shader"]);
		this.dependencies.set("params", ["fxhash"]); // params needs fxhash
		this.dependencies.set("paramsPanel", ["params"]);
		this.dependencies.set("chromaPalette", []);

		// Global exports for each module
		this.moduleExports = new Map();
	}

	/**
	 * Backup a global variable before it might be overwritten
	 */
	backupGlobalVar(varName) {
		if (window[varName] !== undefined && !this.globalVarsBackup.has(varName)) {
			this.globalVarsBackup.set(varName, window[varName]);
		}
	}

	/**
	 * Restore a global variable from backup
	 */
	restoreGlobalVar(varName) {
		if (this.globalVarsBackup.has(varName)) {
			window[varName] = this.globalVarsBackup.get(varName);
		}
	}

	/**
	 * Load a script dynamically
	 */
	async loadScript(src) {
		if (this.loadPromises.has(src)) {
			return this.loadPromises.get(src);
		}

		const promise = new Promise((resolve, reject) => {
			// Check if script is already loaded
			const existingScript = document.querySelector(`script[src="${src}"]`);
			if (existingScript) {
				console.log(`⚡ Already loaded: ${src}`);
				resolve();
				return;
			}

			const script = document.createElement("script");
			script.src = src;
			script.onload = () => {
				console.log(`✓ Loaded: ${src}`);
				resolve();
			};
			script.onerror = () => {
				console.error(`✗ Failed to load: ${src}`);
				reject(new Error(`Failed to load script: ${src}`));
			};
			document.head.appendChild(script);
		});

		this.loadPromises.set(src, promise);
		return promise;
	}

	/**
	 * Load a module and its dependencies
	 */
	async loadModule(moduleName) {
		if (this.loadedModules.has(moduleName)) {
			return this.modules.get(moduleName);
		}

		// Load dependencies first
		const deps = this.dependencies.get(moduleName) || [];
		for (const dep of deps) {
			await this.loadModule(dep);
		}

		// Handle special cases before loading
		if (moduleName === "mover") {
			this.backupGlobalVar("Mover");
		}

		// Load the module itself
		const modulePath = this.modulePaths[moduleName];
		if (!modulePath) {
			throw new Error(`Unknown module: ${moduleName}`);
		}

		await this.loadScript(modulePath);
		this.loadedModules.add(moduleName);

		// Extract and store module exports based on the module type
		this.extractModuleExports(moduleName);

		return this.modules.get(moduleName);
	}

	/**
	 * Extract exports from loaded modules
	 */
	extractModuleExports(moduleName) {
		switch (moduleName) {
			case "logs":
				this.modules.set(moduleName, {
					Logger: window.Logger,
					generateConsoleLogs: window.generateConsoleLogs,
				});
				break;

			case "utils":
				// Extract utility functions from global scope
				this.modules.set(moduleName, {
					clamp: window.clamp,
					smoothstep: window.smoothstep,
					mix: window.mix,
					vec2Dot: window.vec2Dot,
					subtract: window.subtract,
					multiply: window.multiply,
					length: window.length,
					randomInt: window.randomInt,
					fxhashSeed: window.fxhashSeed,
					R: window.R,
					L: window.L,
					k: window.k,
					oct: window.oct,
					weighted_choice: window.weighted_choice,
					mapValue: window.mapValue,
					pmap: window.pmap,
					sdf_box: window.sdf_box,
					sdf_circle: window.sdf_circle,
					sdf_hexagon: window.sdf_hexagon,
					dpi: window.dpi,
					handleSaveCanvasShortcut: window.handleSaveCanvasShortcut,
					toggleGuides: window.toggleGuides,
					saveArtwork: window.saveArtwork,
					showLoadingBar: window.showLoadingBar,
					createAnimationGenerator: window.createAnimationGenerator,
					startAnimation: window.startAnimation,
					ExecutionTimer: window.ExecutionTimer,
				});
				break;

			case "memory":
				this.modules.set(moduleName, {
					MemoryManager: window.MemoryManager,
				});
				break;

			case "stopMotion":
				this.modules.set(moduleName, {
					StopMotionController: window.StopMotionController,
				});
				break;

			case "paramsPanel":
				this.modules.set(moduleName, {
					ParamsPanel: window.ParamsPanel,
				});
				break;

			case "chromaPalette":
				this.modules.set(moduleName, {
					ChromaPalette: window.ChromaPalette,
				});
				break;

			case "animation":
				this.modules.set(moduleName, {
					AnimationController: window.AnimationController,
				});
				break;

			case "mover":
				this.modules.set(moduleName, {
					Mover: window.Mover,
				});
				break;

			case "params":
				this.modules.set(moduleName, {
					features: window.features || {},
					generate_composition_params: window.generate_composition_params,
					fxhash: window.fxhash,
					fxrand: window.fxrand,
					fx: window.fx,
				});
				break;

			case "fxhash":
				this.modules.set(moduleName, {
					fxhash: window.fxhash || window.$fx?.hash,
					fxrand: window.fxrand || window.$fx?.rand,
					fx: window.$fx,
				});
				break;

			default:
				// For other modules, just mark as loaded
				this.modules.set(moduleName, {});
		}
	}

	/**
	 * Get a loaded module
	 */
	get(moduleName) {
		if (!this.loadedModules.has(moduleName)) {
			throw new Error(`Module '${moduleName}' not loaded. Call loadModule('${moduleName}') first.`);
		}
		return this.modules.get(moduleName);
	}

	/**
	 * Check if a module is loaded
	 */
	isLoaded(moduleName) {
		return this.loadedModules.has(moduleName);
	}

	/**
	 * Load multiple modules at once
	 */
	async loadModules(moduleNames) {
		const promises = moduleNames.map((name) => this.loadModule(name));
		return Promise.all(promises);
	}

	/**
	 * Load essential modules for the sketch
	 */
	async loadEssentials() {
		console.log("🚀 Loading essential modules...");
		await this.loadModules(["fxhash", "p5", "spectral", "logs", "utils", "params", "mover"]);
		// Use Logger if available, otherwise fallback to console
		const logger = window.Logger || console;
		logger.success ? logger.success("All essential modules loaded!") : console.log("✅ All essential modules loaded!");
	}

	/**
	 * Load utility modules
	 */
	async loadUtils() {
		console.log("🔧 Loading utility modules...");
		await this.loadModules(["logs", "utils", "memory", "animation", "shader", "smudge", "horizon", "knob"]);
		// Use Logger if available, otherwise fallback to console
		const logger = window.Logger || console;
		logger.success ? logger.success("All utility modules loaded!") : console.log("✅ All utility modules loaded!");
	}

	/**
	 * Get list of loaded modules
	 */
	getLoadedModules() {
		return Array.from(this.loadedModules);
	}

	/**
	 * Debug info
	 */
	debug() {
		const logger = window.Logger || console;
		logger.header ? logger.header("LibManager Debug Info") : console.log("🔍 LibManager Debug Info:");
		logger.table ? logger.table("Loaded Modules", this.getLoadedModules()) : console.log("Loaded modules:", this.getLoadedModules());
		logger.table ? logger.table("Available Modules", Object.keys(this.modulePaths)) : console.log("Available modules:", Object.keys(this.modulePaths));
		logger.table ? logger.table("Dependencies", Object.fromEntries(this.dependencies)) : console.log("Dependencies:", Object.fromEntries(this.dependencies));
	}
}

// Create global instance
window.LibManager = LibManager;
window.libManager = new LibManager();

// Export for module systems
if (typeof module !== "undefined" && module.exports) {
	module.exports = LibManager;
}
