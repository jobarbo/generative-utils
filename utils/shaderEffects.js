/**
 * ShaderEffects — modular shader effects stack for p5.js sketches.
 *
 * Loads every effect of SHADER_CATALOG (library/shaders/catalog.js), exposes them as
 * templates in the shader panel, and runs the enabled ones through ShaderPipeline.
 *
 * Load order in index.html:
 *   library/utils/shaderManager.js, library/utils/shaderPipeline.js,
 *   library/shaders/catalog.js, library/utils/shaderEffects.js,
 *   then the sketch file that creates the instance (shaders/sketch-shaders.js):
 *
 *   const shaderEffects = new ShaderEffects({
 *     defaultStack: ["chromatic", "grain"],   // startup stack, order = pass order
 *     overrides: { grain: { amount: 0.1 } },  // per-sketch values on top of the catalog
 *     storageKey: "my-sketch:shaderPanel",    // localStorage key for panel persistence
 *   });
 *
 * Sketch usage:
 * 1. In async setup(): await shaderEffects.preload(window)
 * 2. In setup(): shaderEffects.setup(width, height, mainCanvas, shaderCanvas)
 * 3. Per frame: shaderEffects.renderFrame(isSketchComplete)
 * Master speed: shaderEffects.setAnimationSpeed()
 *
 * Master loop (off by default): shaderEffects.setLoopConfig({enabled: true, mode: "yoyo"})
 * — also toggled by debugPanel's "loop" checkbox, which reads getLoopCountdown().
 *
 * Optional sketch-level globals read if defined: SHOW_FPS_UI, fitDisplayToViewport()
 * (called after resize() unless options.onResize is given).
 */

// Pixel params are authored at this short-edge size (matches sketch BASE_WIDTH).
const SHADER_SIZE_REF = 1000;

class ShaderEffects {
	/**
	 * @param {object} [options]
	 * @param {string[]} [options.defaultStack=["chromatic","grain"]] - effects in the stack at startup (order = pass order)
	 * @param {object} [options.overrides={}] - per-effect values applied on top of the catalog, e.g. {grain: {amount: 0.1}}
	 * @param {object} [options.catalog=SHADER_CATALOG] - effect catalog (see library/shaders/catalog.js)
	 * @param {string} [options.storageKey="shaderEffects:panel"] - localStorage key for panel persistence
	 * @param {{fitCanvas:boolean,width:number,height:number}} [options.renderRatio] - output framing
	 * @param {boolean} [options.crispPixels=false] - NEAREST sampling + CSS pixelated
	 * @param {boolean} [options.continueAfterCompletion=true] - keep shaders running when the sketch is done
	 * @param {boolean} [options.applyDuringSketch=true] - apply shaders while the sketch is drawing
	 * @param {number} [options.applyInterval=1] - run the full pipeline every N frames while sketching
	 * @param {object} [options.loop] - master loop config (see setLoopConfig), disabled by default
	 * @param {(w:number,h:number)=>void} [options.onResize] - layout hook after resize(); replaces fitDisplayToViewport()
	 */
	constructor(options = {}) {
		this.options = options;
		this.panelStorageKey = options.storageKey || ShaderEffects.PANEL_STORAGE_KEY;

		// Shader animation control
		this.continueShadersAfterCompletion = options.continueAfterCompletion ?? true; // false = stop shaders when sketch is done
		this.applyShadersDuringSketch = options.applyDuringSketch ?? true; // true = apply shaders while sketching
		this.shaderFrameRate = 60; // Base clock rate (see advanceShaderClock)
		this.animationSpeed = 1.0; // Master speed multiplier — override via setAnimationSpeed() or SHADER_ANIMATION_SPEED in sketch.js
		this.shaderApplyInterval = Math.max(1, Math.floor(options.applyInterval ?? 1)); // see setShaderApplyInterval()
		this.shaderFrameCounter = 0;
		this.onResize = typeof options.onResize === "function" ? options.onResize : null;

		// Master loop — wall-clock cycle with optional pause before restart (see setLoopConfig)
		this.loopConfig = {
			enabled: false,
			mode: "yoyo", // "yoyo" = smooth ping-pong | "reset" = hard restart
			// Easing per yoyo half: linear | sine | easeIn | easeOut | easeInOut | bounce
			easing: "easeInOut",
			durationSeconds: 5,
			pauseSeconds: 0,
			showCountdown: true,
			warnAtSeconds: 3,
			...(options.loop || {}),
		};
		this.loopStartTime = 0;
		this.loopPaused = false;
		this.loopPauseStartTime = 0;
		this.loopShaderTimeMax = 0;
		this.loopOverlayElement = null;

		// Animation state
		this.shaderTime = 0;
		this.shaderSeed = 0;
		this.lastShaderUpdateTime = 0;
		this.particleAnimationComplete = false;
		this.loadingProgress = 0.0; // Loading progress from 0.0 (0%) to 1.0 (100%)

		// Canvas references
		this.mainCanvas = null;
		this.shaderCanvas = null;
		this.pixelDensity = 1;

		// Shader system references
		this.shaderManager = null;
		this.shaderPipeline = null;
		this.p5Instance = null;

		// Output framing — passed to shaderManager.setRenderRatio() in setup().
		// fitCanvas: true = full texture mapped to canvas (no crop).
		// Custom ratios use object-fit: cover on the final pass only.
		this.renderRatio = {
			fitCanvas: true,
			width: 1,
			height: 1,
			...(options.renderRatio || {}),
		};

		// NEAREST sampling + CSS pixelated when true (togglable in shader panel).
		// Default false = smooth (LINEAR) rendering.
		this.crispPixels = Boolean(options.crispPixels);

		// Templates for the panel's "add effect" menu: every catalog entry,
		// with the sketch's overrides on top. (survive delete of the last instance of an effect)
		const catalog = options.catalog || (typeof SHADER_CATALOG === "object" && SHADER_CATALOG ? SHADER_CATALOG : {});
		this.catalog = catalog;
		if (!Object.keys(catalog).length) {
			console.warn("[ShaderEffects] SHADER_CATALOG missing — load library/shaders/catalog.js before creating ShaderEffects");
		}
		const allOverrides = options.overrides || {};
		this.effectTemplates = {};
		for (const [name, entry] of Object.entries(catalog)) {
			if (!entry?.config) continue;
			const template = JSON.parse(JSON.stringify(entry.config));
			const overrides = allOverrides[name];
			if (overrides) Object.assign(template, JSON.parse(JSON.stringify(overrides)));
			template.enabled = false;
			template.pass = template.pass || name;
			this.effectTemplates[name] = template;
		}

		// Startup stack (order = pass order). Everything else is added from the panel.
		this.effectsConfig = {};
		for (const name of options.defaultStack || ["chromatic", "grain"]) {
			if (!this.effectTemplates[name]) {
				console.warn(`[ShaderEffects] default stack: "${name}" is not in SHADER_CATALOG — skipped`);
				continue;
			}
			const cfg = JSON.parse(JSON.stringify(this.effectTemplates[name]));
			cfg.enabled = true;
			this.effectsConfig[name] = cfg;
		}

		// Snapshot for panel Reset / persist restore (constructor defaults only)
		this.defaultEffectsConfig = JSON.parse(JSON.stringify(this.effectsConfig));
		this.defaultOutput = {
			renderRatio: {...this.renderRatio},
			crispPixels: this.crispPixels,
			animationSpeed: this.animationSpeed,
		};

		// Symmetry phase tracking (prevents jumps when speed changes)
		this.lastTranslationSpeed = {};
		this.lastRotationSpeed = {};
		this.lastRotationOscillationSpeed = {};
		for (const name of Object.keys(this.effectsConfig).filter((n) => n.startsWith("symmetry"))) {
			this.lastTranslationSpeed[name] = null;
			this.lastRotationSpeed[name] = null;
			this.lastRotationOscillationSpeed[name] = null;
		}

		// Cache for last enabled effects (to detect changes)
		this.lastEnabledEffects = null;

		// FPS tracking
		// Disable FPS counter on Safari mobile to prevent crashes
		// Also disable FPS counter when in iframe
		// NOTE: actual default is finalized in setup() so a sketch-level config constant
		// (declared in sketch.js) can control it.
		this.showFPS = false;
		this.fpsHistory = [];
		this.fpsHistorySize = 60; // Average over 60 frames
		this.lastFrameTime = performance.now();
		this.currentFPS = 60;
	}

	/**
	 * Preload shaders — call this from async setup() (p5.js 2.0 has no preload()).
	 * loadShader is async; sketch.js awaits this so pipelines never start empty.
	 * @param {p5|Window} p5Instance - The p5 instance (or window in global mode)
	 */
	async preload(p5Instance) {
		this.p5Instance = p5Instance;

		// Initialize the global shader manager instance
		shaderManager.init(p5Instance);

		// Set default vertex shader
		shaderManager.setDefaultVertex("chromatic-aberration/vertex.vert");

		// "copy" is the pipeline's blit pass — always required.
		await shaderManager.loadShader("copy", "copy/fragment.frag", "copy/vertex.vert");

		// One GL program per catalog entry (clones like "grain2" reuse it via `pass`).
		// A broken/missing shader only drops that effect instead of the whole stack.
		const catalog = this.catalog;
		const names = Object.keys(this.effectTemplates);
		const results = await Promise.allSettled(
			names.map((name) => {
				const {dir, fragment = "fragment.frag", vertex = "vertex.vert"} = catalog[name];
				return shaderManager.loadShader(name, `${dir}/${fragment}`, `${dir}/${vertex}`);
			}),
		);
		results.forEach((result, i) => {
			if (result.status === "fulfilled") return;
			const name = names[i];
			console.warn(`[ShaderEffects] shader "${name}" failed to load — removed from the panel`, result.reason);
			delete this.effectTemplates[name];
			for (const effectName of Object.keys(this.effectsConfig)) {
				if ((this.effectsConfig[effectName].pass || effectName) === name) delete this.effectsConfig[effectName];
			}
			for (const effectName of Object.keys(this.defaultEffectsConfig)) {
				if ((this.defaultEffectsConfig[effectName].pass || effectName) === name) delete this.defaultEffectsConfig[effectName];
			}
		});

		this.shaderManager = shaderManager;

		return this;
	}

	/**
	 * Setup shader effects - call this in p5 setup()
	 * @param {number} width - Canvas width
	 * @param {number} height - Canvas height
	 * @param {p5.Graphics} mainCanvas - Main graphics buffer for artwork
	 * @param {p5.Graphics} shaderCanvas - WEBGL canvas for shader effects
	 */
	setup(width, height, mainCanvas, shaderCanvas, pixelDensity = 1) {
		this.mainCanvas = mainCanvas;
		this.shaderCanvas = shaderCanvas;
		this.pixelDensity = pixelDensity;
		this.lastShaderUpdateTime = 0;

		if (this.shaderManager) {
			this.shaderManager.setRenderRatio(this.renderRatio);
			this.setCrispPixels(this.crispPixels);
		}

		// FPS overlay default (can be controlled by sketch-level constant SHOW_FPS_UI)
		const isSafariMobileCheck = typeof isSafariMobile === "function" && isSafariMobile();
		const isInIframeCheck = typeof isInIframe === "function" && isInIframe();
		const allowFpsUi = typeof SHOW_FPS_UI === "undefined" ? true : !!SHOW_FPS_UI;
		this.showFPS = allowFpsUi && !isSafariMobileCheck && !isInIframeCheck;

		// Seed from fxhash without consuming $fx.rand() (see utils.fxhashSeed)
		if (typeof fxhashSeed === "function") {
			this.shaderSeed = fxhashSeed("shaderEffects") * 10000;
		} else {
			this.shaderSeed = Math.random() * 10000;
		}

		// Initialize shader pipeline with enabled effects
		const enabledEffects = Object.keys(this.effectsConfig).filter((name) => this.effectsConfig[name].enabled);

		this.shaderPipeline = new ShaderPipeline(this.shaderManager, this.p5Instance).init(width, height, enabledEffects, pixelDensity);

		// Make it globally accessible (for backward compatibility)
		window.shaderPipeline = this.shaderPipeline;

		if (this.loopConfig.enabled) this._startLoop();

		return this;
	}

	/**
	 * Update output framing (delegates to shaderManager).
	 * @param {object} options - { fitCanvas, width, height }
	 */
	setRenderRatio(options = {}) {
		this.renderRatio = {
			fitCanvas: options.fitCanvas !== undefined ? Boolean(options.fitCanvas) : this.renderRatio.fitCanvas,
			width: options.width ?? this.renderRatio.width,
			height: options.height ?? this.renderRatio.height,
		};
		if (this.shaderManager) {
			this.shaderManager.setRenderRatio(this.renderRatio);
		}
		return this;
	}

	getRenderRatio() {
		return {...this.renderRatio};
	}

	/**
	 * Add a new shader effect programmatically
	 * @param {string} effectName - Name of the effect
	 * @param {object} config - Effect configuration
	 */
	addEffect(effectName, config) {
		this.effectsConfig[effectName] = {
			enabled: config.enabled || false,
			...config,
			uniforms: config.uniforms || {},
		};
		return this;
	}

	/**
	 * Enable or disable an effect
	 * @param {string} effectName - Name of the effect
	 * @param {boolean} enabled - Enable or disable
	 */
	setEffectEnabled(effectName, enabled) {
		if (this.effectsConfig[effectName]) {
			this.effectsConfig[effectName].enabled = enabled;
			this.reinitializePipeline();
		}
		return this;
	}

	/**
	 * Update an effect parameter
	 * @param {string} effectName - Name of the effect
	 * @param {string} paramName - Parameter name
	 * @param {*} value - New value
	 */
	updateEffectParam(effectName, paramName, value) {
		if (this.effectsConfig[effectName] && this.effectsConfig[effectName][paramName] !== undefined) {
			this.effectsConfig[effectName][paramName] = value;
		}
		return this;
	}

	/**
	 * Sharp pixel look when the buffer is upscaled (CSS + WebGL NEAREST sampling).
	 * @param {boolean} enabled
	 */
	setCrispPixels(enabled) {
		this.crispPixels = Boolean(enabled);
		if (this.shaderManager) {
			this.shaderManager.crispPixels = this.crispPixels;
		}
		if (typeof document !== "undefined") {
			document.querySelectorAll("canvas.p5Canvas").forEach((el) => {
				el.classList.toggle("is-smooth", !this.crispPixels);
			});
		}
		return this;
	}

	getCrispPixels() {
		return !!this.crispPixels;
	}

	/**
	 * Resize artwork + display canvases and rebuild the shader pipeline
	 * (used by the shader panel's size controls).
	 * @param {number} width
	 * @param {number} height
	 */
	resize(width, height) {
		const w = Math.max(16, Math.min(8192, Math.round(Number(width) || 16)));
		const h = Math.max(16, Math.min(8192, Math.round(Number(height) || 16)));

		const cur = this.getCanvasSize();
		if (Math.round(cur.width) === w && Math.round(cur.height) === h) {
			return this;
		}

		const p5 = this.p5Instance || (typeof window !== "undefined" ? window : null);

		// Artwork offscreen buffer
		if (this.mainCanvas) {
			if (typeof this.mainCanvas.resizeCanvas === "function") {
				this.mainCanvas.resizeCanvas(w, h);
			} else if (typeof this.mainCanvas.resize === "function") {
				this.mainCanvas.resize(w, h);
			}
		}

		// Main WEBGL display canvas (global-mode p5 exposes resizeCanvas on window)
		if (typeof resizeCanvas === "function") {
			resizeCanvas(w, h);
		} else if (p5 && typeof p5.resizeCanvas === "function") {
			p5.resizeCanvas(w, h);
		}

		this.lastEnabledEffects = null;
		this.reinitializePipeline();

		if (this.onResize) {
			this.onResize(w, h);
		} else if (typeof fitDisplayToViewport === "function") {
			fitDisplayToViewport();
		}

		console.log(`[ShaderEffects] resized to ${w}×${h} (main=${this.mainCanvas?.width}×${this.mainCanvas?.height})`);
		return this;
	}

	getCanvasSize() {
		const w = this.mainCanvas?.width ?? (typeof width !== "undefined" ? width : 0);
		const h = this.mainCanvas?.height ?? (typeof height !== "undefined" ? height : 0);
		return {width: w, height: h};
	}

	/**
	 * Reorder effects in the render stack (Object key order = pass order).
	 * @param {string[]} orderedNames - Effect names top→bottom = first→last pass
	 */
	reorderEffects(orderedNames) {
		if (!Array.isArray(orderedNames) || !orderedNames.length) return this;

		const prev = this.effectsConfig;
		const next = {};
		const seen = new Set();

		for (const name of orderedNames) {
			if (prev[name] !== undefined && !seen.has(name)) {
				next[name] = prev[name];
				seen.add(name);
			}
		}
		// Keep any effects omitted from the list at the end
		for (const name of Object.keys(prev)) {
			if (!seen.has(name)) next[name] = prev[name];
		}

		this.effectsConfig = next;
		this.lastEnabledEffects = null; // force pass list rebuild on next apply()
		this.reinitializePipeline();
		return this;
	}

	/**
	 * Next free name: prefers root ("wave") if free, else wave2 / wave3…
	 */
	_nextCloneName(sourceName) {
		const root = String(sourceName).replace(/\d+$/, "") || sourceName;
		if (!this.effectsConfig[root]) return root;
		let n = 2;
		while (this.effectsConfig[root + n]) n++;
		return root + n;
	}

	/**
	 * Register phase-tracking slots for a (new) symmetry-style effect.
	 */
	_ensurePhaseTracking(effectName) {
		if (!String(effectName).startsWith("symmetry")) return;
		if (!(effectName in this.lastTranslationSpeed)) this.lastTranslationSpeed[effectName] = null;
		if (!(effectName in this.lastRotationSpeed)) this.lastRotationSpeed[effectName] = null;
		if (!(effectName in this.lastRotationOscillationSpeed)) this.lastRotationOscillationSpeed[effectName] = null;
		// A symmetry added while the loop runs gets its own restart point
		const effect = this.effectsConfig?.[effectName];
		if (this.loopConfig?.enabled && effect && effect._initialTranslationPhaseX === undefined) {
			this._snapshotPhases(effect);
		}
	}

	/**
	 * Template names available for createEffect (from initial effectsConfig).
	 * @returns {string[]}
	 */
	getEffectTemplateNames() {
		return Object.keys(this.effectTemplates || {}).sort();
	}

	/**
	 * Create a new stack instance from a template (e.g. "symmetry", "grain").
	 * @param {string} templateName
	 * @param {object} [options]
	 * @param {boolean} [options.enabled=true]
	 * @returns {string|null} new effect name
	 */
	createEffect(templateName, options = {}) {
		const root = String(templateName).replace(/\d+$/, "") || templateName;
		const template = this.effectTemplates?.[root];
		if (!template) {
			console.warn(`[ShaderEffects] createEffect: unknown template "${templateName}"`);
			return null;
		}

		const newName = this._nextCloneName(root);
		const created = JSON.parse(JSON.stringify(template));
		created.enabled = options.enabled !== undefined ? Boolean(options.enabled) : true;
		created.pass = template.pass || root;

		this.effectsConfig[newName] = created;
		this._ensurePhaseTracking(newName);

		this.lastEnabledEffects = null;
		this.reinitializePipeline();
		console.log(`[ShaderEffects] created "${newName}" from template "${root}" (pass: ${created.pass})`);
		return newName;
	}

	/**
	 * Remove an effect from the stack.
	 * @param {string} effectName
	 */
	removeEffect(effectName) {
		if (!this.effectsConfig[effectName]) {
			console.warn(`[ShaderEffects] removeEffect: "${effectName}" not found`);
			return this;
		}

		delete this.effectsConfig[effectName];
		delete this.lastTranslationSpeed?.[effectName];
		delete this.lastRotationSpeed?.[effectName];
		delete this.lastRotationOscillationSpeed?.[effectName];

		this.lastEnabledEffects = null;
		this.reinitializePipeline();
		console.log(`[ShaderEffects] removed "${effectName}"`);
		return this;
	}

	/**
	 * Deep-clone an effect as a new stack instance (visual overdub).
	 * Shares the same GL program via `pass` (defaults to the source effect's program).
	 * @param {string} sourceName
	 * @param {object} [options]
	 * @param {boolean} [options.enabled=true]
	 * @param {boolean} [options.insertAfter=true] - place clone right after the source in the stack
	 * @returns {string|null} new effect name
	 */
	cloneEffect(sourceName, options = {}) {
		const source = this.effectsConfig[sourceName];
		if (!source) {
			console.warn(`[ShaderEffects] cloneEffect: "${sourceName}" not found`);
			return null;
		}

		const newName = this._nextCloneName(sourceName);
		const cloned = JSON.parse(JSON.stringify(source));
		cloned.enabled = options.enabled !== undefined ? Boolean(options.enabled) : true;
		// GL program key — reuse the source program (symmetry4 → same as symmetry, etc.)
		cloned.pass = source.pass || String(sourceName).replace(/\d+$/, "") || sourceName;

		const insertAfter = options.insertAfter !== false;
		if (insertAfter) {
			const next = {};
			for (const name of Object.keys(this.effectsConfig)) {
				next[name] = this.effectsConfig[name];
				if (name === sourceName) next[newName] = cloned;
			}
			if (!next[newName]) next[newName] = cloned;
			this.effectsConfig = next;
		} else {
			this.effectsConfig[newName] = cloned;
		}

		this._ensurePhaseTracking(newName);

		this.lastEnabledEffects = null;
		this.reinitializePipeline();
		console.log(`[ShaderEffects] cloned "${sourceName}" → "${newName}" (pass: ${cloned.pass})`);
		return newName;
	}

	/**
	 * Physical resolution of the shader render target, in pixels.
	 *
	 * This is what `uResolution` reports, so it has to describe the target the shaders
	 * actually write to — not the source artwork. When the panel renders the shader stage
	 * at a fraction of the sketch density, every pixel-based effect (blur radius, sort
	 * span, grain) has to follow, or it would silently change scale.
	 */
	getPhysicalResolution() {
		const density = this.mainCanvas?.pixelDensity?.() ?? this.pixelDensity ?? 1;
		const scale = this.shaderPipeline?.getDensityScale?.() ?? 1;
		return [this.mainCanvas.width * density * scale, this.mainCanvas.height * density * scale];
	}

	/**
	 * Scale factors that map panel pixel params (authored @ SHADER_SIZE_REF short edge)
	 * onto the current framebuffer.
	 *
	 * viewportScale ≈ sketch MULTIPLIER (min logical edge / 1000).
	 * renderDensity = pixelDensity × panel densityScale.
	 * sizeScale = viewportScale × renderDensity — use this for px → physical uniforms.
	 *
	 * @returns {{pixelDensity: number, densityScale: number, renderDensity: number, viewportScale: number, sizeScale: number}}
	 */
	getSizeScaleFactors() {
		const pixelDensity = this.mainCanvas?.pixelDensity?.() ?? this.pixelDensity ?? 1;
		const densityScale = this.shaderPipeline?.getDensityScale?.() ?? 1;
		const renderDensity = pixelDensity * densityScale;
		const logicalW = this.mainCanvas?.width ?? SHADER_SIZE_REF;
		const logicalH = this.mainCanvas?.height ?? SHADER_SIZE_REF;
		const viewportScale = Math.min(logicalW, logicalH) / SHADER_SIZE_REF;
		return {
			pixelDensity,
			densityScale,
			renderDensity,
			viewportScale,
			sizeScale: viewportScale * renderDensity,
		};
	}

	/**
	 * Update pixel density and rebuild intermediate shader buffers.
	 * @param {number} density
	 */
	setPixelDensity(density) {
		this.pixelDensity = density;
		this.reinitializePipeline();
		return this;
	}

	/**
	 * Reinitialize shader pipeline when effects or resolution change
	 */
	reinitializePipeline() {
		if (this.shaderPipeline && this.shaderManager && this.mainCanvas) {
			const enabledEffects = Object.keys(this.effectsConfig).filter((name) => this.effectsConfig[name].enabled);
			const density = this.mainCanvas.pixelDensity?.() ?? this.pixelDensity ?? 1;
			this.pixelDensity = density;
			this.shaderPipeline.init(this.mainCanvas.width, this.mainCanvas.height, enabledEffects, density);
		}
		return this;
	}

	/**
	 * Set master shader animation speed (scales all time-driven effects uniformly).
	 * @param {number} speed - Multiplier (1.0 = default, 0.5 = half, 2.0 = double)
	 */
	setAnimationSpeed(speed) {
		this.animationSpeed = Math.max(0, speed ?? 1);
		return this;
	}

	getAnimationSpeed() {
		return this.animationSpeed;
	}

	/**
	 * Strip runtime / non-editable fields from an effect for panel persistence.
	 * @param {object} effect
	 * @returns {object}
	 */
	_stripEffectForPanel(effect) {
		const skip = new Set(["uniforms", "translationPhaseX", "translationPhaseY", "rotationPhase"]);
		const out = {};
		for (const [k, v] of Object.entries(effect || {})) {
			if (skip.has(k) || k.startsWith("_")) continue;
			out[k] = typeof v === "object" && v !== null ? JSON.parse(JSON.stringify(v)) : v;
		}
		return out;
	}

	/**
	 * Serializable snapshot of panel-editable shader state (effects + output).
	 * @returns {{version: number, order: string[], effects: object, output: object}}
	 */
	exportPanelConfig() {
		const order = Object.keys(this.effectsConfig);
		const effects = {};
		for (const name of order) {
			effects[name] = this._stripEffectForPanel(this.effectsConfig[name]);
		}
		return {
			version: 1,
			order,
			effects,
			output: {
				renderRatio: this.getRenderRatio(),
				crispPixels: this.getCrispPixels(),
				animationSpeed: this.getAnimationSpeed(),
			},
		};
	}

	/**
	 * Restore panel config from a snapshot (localStorage / Reset).
	 * Rebuilds uniforms from effectTemplates by root name.
	 * @param {object} data
	 * @returns {boolean} true if applied
	 */
	importPanelConfig(data) {
		if (!data || data.version !== 1 || !data.effects || typeof data.effects !== "object") {
			return false;
		}

		const savedEffects = data.effects;
		const order = Array.isArray(data.order) ? data.order.filter((n) => savedEffects[n]) : [];
		for (const name of Object.keys(savedEffects)) {
			if (!order.includes(name)) order.push(name);
		}

		const next = {};
		for (const name of order) {
			const saved = savedEffects[name];
			if (!saved || typeof saved !== "object") continue;

			const root = String(name).replace(/\d+$/, "") || name;
			const template = this.effectTemplates[root];
			if (!template) {
				console.warn(`[ShaderEffects] importPanelConfig: unknown template "${root}" for "${name}" — skipped`);
				continue;
			}

			const merged = JSON.parse(JSON.stringify(template));
			for (const [k, v] of Object.entries(saved)) {
				if (k === "uniforms" || k.startsWith("_")) continue;
				if (k === "translationPhaseX" || k === "translationPhaseY" || k === "rotationPhase") continue;
				// Only restore params the current template still defines. Without this,
				// a param removed from a shader stays alive forever in localStorage and
				// comes back as a panel slider wired to nothing.
				if (!(k in template)) continue;
				merged[k] = typeof v === "object" && v !== null ? JSON.parse(JSON.stringify(v)) : v;
			}
			if ("translationPhaseX" in merged) merged.translationPhaseX = 0;
			if ("translationPhaseY" in merged) merged.translationPhaseY = 0;
			if ("rotationPhase" in merged) merged.rotationPhase = 0;
			merged.uniforms = template.uniforms ? JSON.parse(JSON.stringify(template.uniforms)) : {};
			merged.pass = saved.pass || template.pass || root;
			next[name] = merged;
		}

		if (Object.keys(next).length === 0) return false;

		this.effectsConfig = next;
		this.lastTranslationSpeed = {};
		this.lastRotationSpeed = {};
		this.lastRotationOscillationSpeed = {};
		for (const name of Object.keys(this.effectsConfig)) {
			if (name.startsWith("symmetry")) this._ensurePhaseTracking(name);
		}

		if (data.output && typeof data.output === "object") {
			if (data.output.renderRatio) this.setRenderRatio(data.output.renderRatio);
			if (typeof data.output.crispPixels === "boolean") this.setCrispPixels(data.output.crispPixels);
			if (typeof data.output.animationSpeed === "number") this.setAnimationSpeed(data.output.animationSpeed);
		}

		this.lastEnabledEffects = null;
		if (this.shaderPipeline) this.reinitializePipeline();
		return true;
	}

	/**
	 * Restore constructor defaults (effects + output framing/speed).
	 * @returns {this}
	 */
	resetToDefaultPanelConfig() {
		this.effectsConfig = JSON.parse(JSON.stringify(this.defaultEffectsConfig));
		this.lastTranslationSpeed = {};
		this.lastRotationSpeed = {};
		this.lastRotationOscillationSpeed = {};
		for (const name of Object.keys(this.effectsConfig)) {
			if (name.startsWith("symmetry")) this._ensurePhaseTracking(name);
		}
		const out = this.defaultOutput || {};
		if (out.renderRatio) this.setRenderRatio(out.renderRatio);
		if (typeof out.crispPixels === "boolean") this.setCrispPixels(out.crispPixels);
		if (typeof out.animationSpeed === "number") this.setAnimationSpeed(out.animationSpeed);
		this.lastEnabledEffects = null;
		if (this.shaderPipeline) this.reinitializePipeline();
		return this;
	}

	/** Default localStorage key for panel persistence (override with options.storageKey). */
	static get PANEL_STORAGE_KEY() {
		return "shaderEffects:panel";
	}

	/**
	 * Load persisted panel config from localStorage into this instance.
	 * @returns {boolean} true if a snapshot was applied
	 */
	loadPersistedPanelConfig() {
		try {
			const raw = localStorage.getItem(this.panelStorageKey);
			if (!raw) return false;
			const data = JSON.parse(raw);
			return this.importPanelConfig(data);
		} catch (error) {
			console.warn("[ShaderEffects] loadPersistedPanelConfig failed:", error);
			return false;
		}
	}

	/**
	 * Write current panel config to localStorage.
	 * @returns {boolean}
	 */
	savePersistedPanelConfig() {
		try {
			const snapshot = this.exportPanelConfig();
			localStorage.setItem(this.panelStorageKey, JSON.stringify(snapshot));
			return true;
		} catch (error) {
			console.warn("[ShaderEffects] savePersistedPanelConfig failed:", error);
			return false;
		}
	}

	/**
	 * Clear persisted panel config from localStorage.
	 */
	clearPersistedPanelConfig() {
		try {
			localStorage.removeItem(this.panelStorageKey);
		} catch {
			// ignore
		}
		return this;
	}

	/**
	 * Set shader frame rate
	 * @param {number} fps - Frame rate (1-120)
	 */
	setFrameRate(fps) {
		this.shaderFrameRate = Math.max(1, Math.min(120, fps));
		console.log(`Shader frame rate set to ${this.shaderFrameRate}fps`);
		return this;
	}

	/**
	 * Names of symmetry effect passes in the pipeline.
	 * @returns {string[]}
	 */
	getSymmetryEffectNames() {
		return Object.keys(this.effectsConfig).filter((name) => name.startsWith("symmetry"));
	}

	/**
	 * Update translation phases to prevent position jumps when speed changes.
	 * @param {number} delta - Time delta
	 */
	updateTranslationPhases(delta) {
		for (const effectName of this.getSymmetryEffectNames()) {
			const effect = this.effectsConfig[effectName];
			if (!effect || !effect.enabled) continue;
			if (effect.translationEnabled !== undefined && effect.translationEnabled < 0.5) continue;
			this._ensurePhaseTracking(effectName);

			// Prefer per-axis speeds; fall back to legacy translationSpeed
			const legacy = effect.translationSpeed ?? 0;
			const speedX = effect.translationSpeedX !== undefined ? effect.translationSpeedX : legacy;
			const speedY = effect.translationSpeedY !== undefined ? effect.translationSpeedY : legacy;

			if (effect.translationPhaseX === undefined) effect.translationPhaseX = 0;
			if (effect.translationPhaseY === undefined) effect.translationPhaseY = 0;

			const timeMultiplier = effect.timeMultiplier || 0.1;
			const effectiveDelta = delta * timeMultiplier;

			effect.translationPhaseX += effectiveDelta * speedX;
			effect.translationPhaseY += effectiveDelta * speedY;

			this.lastTranslationSpeed[effectName] = {x: speedX, y: speedY};
		}
	}

	/**
	 * Update rotation phases to prevent angle jumps when speed changes.
	 * @param {number} delta - Time delta
	 */
	updateRotationPhases(delta) {
		for (const effectName of this.getSymmetryEffectNames()) {
			const effect = this.effectsConfig[effectName];
			if (!effect || !effect.enabled) continue;
			if (effect.rotationEnabled !== undefined && effect.rotationEnabled < 0.5) continue;
			this._ensurePhaseTracking(effectName);

			const currentSpeed = effect.rotationSpeed || 0;
			const currentOscillationSpeed = effect.rotationOscillationSpeed || 0;
			const lastSpeed = this.lastRotationSpeed[effectName];
			const lastOscillationSpeed = this.lastRotationOscillationSpeed[effectName];
			const rotMode = Math.floor(effect.rotationMode || 0);

			if (effect.rotationPhase === undefined) effect.rotationPhase = 0;

			if (lastSpeed !== null && lastSpeed !== currentSpeed && currentSpeed !== 0) {
				const currentTime = this.shaderTime * (effect.timeMultiplier || 0.1);

				if (rotMode === 0) {
					const oldOscillation = -Math.cos(currentTime * (lastOscillationSpeed || 0));
					effect.rotationPhase = oldOscillation * lastSpeed;
				} else if (rotMode === 1 || rotMode === 2) {
					if (effect.rotationAmplitude === undefined) {
						effect.rotationAmplitude = lastSpeed || currentSpeed;
					}
				}
			}

			const timeMultiplier = effect.timeMultiplier || 0.1;
			const effectiveDelta = delta * timeMultiplier;
			const currentTime = this.shaderTime * timeMultiplier;

			if (rotMode === 0) {
				const oscillation = -Math.cos(currentTime * currentOscillationSpeed);
				const angleDerivative = oscillation * currentSpeed;
				effect.rotationPhase += effectiveDelta * angleDerivative;
			} else {
				effect.rotationPhase += effectiveDelta * currentSpeed;

				if (effect.rotationAmplitude === undefined) {
					effect.rotationAmplitude = currentSpeed;
				}
			}

			this.lastRotationSpeed[effectName] = currentSpeed;
			this.lastRotationOscillationSpeed[effectName] = currentOscillationSpeed;
		}
	}

	/**
	 * Advance shader clock from wall-clock elapsed time (consistent before/after sketch completion).
	 * @returns {number} Delta applied to shaderTime
	 */
	advanceShaderClock() {
		if (this.loopConfig.enabled) return this._advanceLoopClock();

		const now = performance.now();
		if (!this.lastShaderUpdateTime) {
			this.lastShaderUpdateTime = now;
			return 0;
		}

		const dt = Math.min((now - this.lastShaderUpdateTime) / 1000, 0.1);
		this.lastShaderUpdateTime = now;
		const delta = dt * (this.shaderFrameRate / 100) * this.animationSpeed;

		if (delta > 0) {
			this.updateTime(delta);
		}

		return delta;
	}

	/**
	 * Update shader time - call this in your animation loop
	 * @param {number} delta - Time delta (default: 0.01)
	 */
	updateTime(delta = 0.01) {
		this.shaderTime += delta;
		this.updatePhaseAccumulators(delta);
		this.updateTranslationPhases(delta);
		this.updateRotationPhases(delta);
		return this;
	}

	/**
	 * Generic jump-free clock for any effect declaring a numeric `_phase`.
	 *
	 * Effects using `uTime: "shaderTime * timeMultiplier"` jump when the multiplier is
	 * dragged in the panel (the whole product changes at once). Integrating the speed
	 * instead keeps the value continuous — only its derivative changes.
	 * `_phase` is underscore-prefixed so the panel hides it automatically.
	 *
	 * @param {number} delta - Time delta from advanceShaderClock()
	 */
	updatePhaseAccumulators(delta) {
		for (const name in this.effectsConfig) {
			const effect = this.effectsConfig[name];
			if (!effect.enabled || typeof effect._phase !== "number") continue;
			const speed = typeof effect.timeMultiplier === "number" ? effect.timeMultiplier : 1;
			effect._phase += delta * speed;
		}
		return this;
	}

	// ---- Apply interval -----------------------------------------------------

	/**
	 * How often to run the full shader pipeline while sketching (1 = every frame).
	 * Skipped frames keep the last shader output on screen; p5 still draws every frame.
	 * @param {number} interval - Integer >= 1
	 */
	setShaderApplyInterval(interval) {
		this.shaderApplyInterval = Math.max(1, Math.floor(interval));
		this.shaderFrameCounter = 0;
		return this;
	}

	getShaderApplyInterval() {
		return this.shaderApplyInterval;
	}

	/** Whether to run the full multi-pass pipeline this frame (see setShaderApplyInterval). */
	shouldRunFullShaderApply() {
		if (this.shaderApplyInterval <= 1) return true;
		this.shaderFrameCounter++;
		return this.shaderFrameCounter % this.shaderApplyInterval === 0;
	}

	// ---- Master loop --------------------------------------------------------
	// Off by default. When on, shader time follows a wall-clock cycle:
	//   yoyo  — time runs forward then backward (eased per half), seamless ping-pong
	//   reset — time runs forward, then every time-driven state snaps back to its start
	// An optional pause holds the frame between cycles.

	/**
	 * Configure the master loop. Unspecified keys keep their current value.
	 * @param {object} options - {enabled, mode, easing, durationSeconds, pauseSeconds, showCountdown, warnAtSeconds}
	 */
	setLoopConfig(options = {}) {
		const prev = this.loopConfig;
		this.loopConfig = {
			enabled: options.enabled !== undefined ? Boolean(options.enabled) : prev.enabled,
			mode: options.mode ?? prev.mode ?? "yoyo",
			easing: options.easing ?? prev.easing ?? "easeInOut",
			durationSeconds: Math.max(options.durationSeconds ?? prev.durationSeconds, 0.1),
			pauseSeconds: Math.max(options.pauseSeconds ?? prev.pauseSeconds, 0),
			showCountdown: options.showCountdown !== undefined ? Boolean(options.showCountdown) : prev.showCountdown,
			warnAtSeconds: Math.max(options.warnAtSeconds ?? prev.warnAtSeconds, 0),
		};
		if (this.loopConfig.enabled) this._startLoop();
		return this;
	}

	getLoopConfig() {
		return {...this.loopConfig};
	}

	toggleLoopCountdown(show = null) {
		this.loopConfig.showCountdown = show === null ? !this.loopConfig.showCountdown : Boolean(show);
		return this;
	}

	_startLoop(now = performance.now()) {
		this.loopStartTime = now;
		this.loopPaused = false;
		this.snapshotInitialPhases();
		this.updateLoopShaderTimeMax();
	}

	updateLoopShaderTimeMax() {
		this.loopShaderTimeMax = this.loopConfig.durationSeconds * (this.shaderFrameRate / 100);
	}

	/** Loop easing on normalized t ∈ [0, 1] (same curves as the zoom shader's easing modes). */
	applyLoopEasing(t) {
		const x = Math.max(0, Math.min(1, t));
		switch (this.loopConfig.easing ?? "linear") {
			case "sine":
				return 0.5 - 0.5 * Math.cos(x * Math.PI);
			case "easeIn":
				return x * x * x;
			case "easeOut": {
				const inv = 1 - x;
				return 1 - inv * inv * inv;
			}
			case "easeInOut":
				return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
			case "bounce": {
				const b = 1 - x;
				if (b < 1 / 2.75) return 1 - 7.5625 * b * b;
				if (b < 2 / 2.75) {
					const bb = b - 1.5 / 2.75;
					return 1 - (7.5625 * bb * bb + 0.75);
				}
				if (b < 2.5 / 2.75) {
					const bb = b - 2.25 / 2.75;
					return 1 - (7.5625 * bb * bb + 0.9375);
				}
				const bb = b - 2.625 / 2.75;
				return 1 - (7.5625 * bb * bb + 0.984375);
			}
			case "linear":
			default:
				return x;
		}
	}

	/**
	 * Loop position: 0→1→0 for yoyo (eased per half), 0→1 for reset.
	 * @param {number} elapsed - Seconds since loop start (pause-adjusted)
	 * @returns {{progress: number, halfRemaining: number}}
	 */
	getLoopProgress(elapsed) {
		const dur = this.loopConfig.durationSeconds;
		if (this.loopConfig.mode === "yoyo") {
			const cyclePos = elapsed % (dur * 2);
			if (cyclePos < dur) {
				return {progress: this.applyLoopEasing(cyclePos / dur), halfRemaining: dur - cyclePos};
			}
			return {progress: 1 - this.applyLoopEasing((cyclePos - dur) / dur), halfRemaining: dur * 2 - cyclePos};
		}
		return {progress: Math.min(elapsed / dur, 1), halfRemaining: Math.max(dur - elapsed, 0)};
	}

	_snapshotPhases(effect) {
		effect._initialTranslationPhaseX = effect.translationPhaseX ?? 0;
		effect._initialTranslationPhaseY = effect.translationPhaseY ?? 0;
		effect._initialRotationPhase = effect.rotationPhase ?? 0;
	}

	snapshotInitialPhases() {
		for (const name of this.getSymmetryEffectNames()) {
			const effect = this.effectsConfig[name];
			if (effect) this._snapshotPhases(effect);
		}
	}

	restoreInitialPhases() {
		for (const name of this.getSymmetryEffectNames()) {
			const effect = this.effectsConfig[name];
			if (!effect || effect._initialTranslationPhaseX === undefined) continue;
			effect.translationPhaseX = effect._initialTranslationPhaseX;
			effect.translationPhaseY = effect._initialTranslationPhaseY;
			effect.rotationPhase = effect._initialRotationPhase;
		}
	}

	/** Reset all time-driven shader state at a loop boundary. */
	resetLoopState() {
		this.shaderTime = 0;
		this.restoreInitialPhases();
		for (const name in this.effectsConfig) {
			const effect = this.effectsConfig[name];
			if (effect && typeof effect._phase === "number") effect._phase = 0;
		}
		this.lastTranslationSpeed = {};
		this.lastRotationSpeed = {};
		this.lastRotationOscillationSpeed = {};
		for (const name of this.getSymmetryEffectNames()) this._ensurePhaseTracking(name);

		this.loopStartTime = performance.now();
		this.loopPaused = false;
	}

	/** Elapsed loop seconds, excluding active pause time. */
	getLoopElapsedSeconds(now = performance.now()) {
		let elapsed = (now - this.loopStartTime) / 1000;
		if (this.loopPaused) elapsed -= (now - this.loopPauseStartTime) / 1000;
		return Math.max(elapsed, 0);
	}

	/**
	 * Seconds remaining in the current loop half or inter-loop pause (read by debugPanel).
	 * @returns {{remaining: number, paused: boolean} | null}
	 */
	getLoopCountdown() {
		if (!this.loopConfig.enabled || !this.loopStartTime) return null;
		const now = performance.now();
		if (this.loopPaused) {
			const pauseElapsed = (now - this.loopPauseStartTime) / 1000;
			return {remaining: Math.max(this.loopConfig.pauseSeconds - pauseElapsed, 0), paused: true};
		}
		const {halfRemaining} = this.getLoopProgress(this.getLoopElapsedSeconds(now));
		return {remaining: halfRemaining, paused: false};
	}

	/** advanceShaderClock() while the loop is on. */
	_advanceLoopClock() {
		const now = performance.now();
		if (!this.lastShaderUpdateTime) {
			this.lastShaderUpdateTime = now;
			if (!this.loopStartTime) this._startLoop(now);
			return 0;
		}

		const dt = Math.min((now - this.lastShaderUpdateTime) / 1000, 0.1);
		this.lastShaderUpdateTime = now;
		if (!this.loopStartTime) this._startLoop(now);

		if (this.loopPaused) {
			const pauseElapsed = (now - this.loopPauseStartTime) / 1000;
			if (pauseElapsed >= this.loopConfig.pauseSeconds) {
				this.loopStartTime += now - this.loopPauseStartTime;
				this.loopPaused = false;
				if (this.loopConfig.mode === "reset") this.resetLoopState();
			}
			return 0;
		}

		const elapsed = this.getLoopElapsedSeconds(now);
		const dur = this.loopConfig.durationSeconds;

		if (this.loopConfig.mode === "reset") {
			if (elapsed >= dur) {
				if (this.loopConfig.pauseSeconds > 0) {
					this.loopPaused = true;
					this.loopPauseStartTime = now;
					return 0;
				}
				this.resetLoopState();
			}
			const delta = dt * (this.shaderFrameRate / 100) * this.animationSpeed;
			if (delta > 0) this.updateTime(delta);
			return delta;
		}

		// Yoyo: wall clock → triangle wave, shader time runs forward then backward.
		// (animationSpeed is ignored — loop duration is the master clock)
		const prevElapsed = Math.max(elapsed - dt, 0);
		const targetShaderTime = this.getLoopProgress(elapsed).progress * this.loopShaderTimeMax;
		const prevShaderTime = this.getLoopProgress(prevElapsed).progress * this.loopShaderTimeMax;
		const deltaShaderTime = targetShaderTime - prevShaderTime;

		if (this.loopConfig.pauseSeconds > 0) {
			const fullCycle = dur * 2;
			if (prevElapsed % fullCycle > elapsed % fullCycle) {
				this.loopPaused = true;
				this.loopPauseStartTime = now;
				return 0;
			}
		}

		this.shaderTime = targetShaderTime;
		if (deltaShaderTime !== 0) {
			this.updatePhaseAccumulators(deltaShaderTime);
			this.updateTranslationPhases(deltaShaderTime);
			this.updateRotationPhases(deltaShaderTime);
		}
		return deltaShaderTime;
	}

	/**
	 * Standalone loop countdown overlay (#shader-loop-overlay). debugPanel shows the
	 * countdown itself when loaded; nothing is created while the loop is off.
	 */
	drawLoopCountdown() {
		try {
			if (typeof debugPanel !== "undefined") {
				if (this.loopOverlayElement) this.loopOverlayElement.style.display = "none";
				return;
			}

			const show = this.loopConfig.enabled && this.loopConfig.showCountdown;
			if (!show && !this.loopOverlayElement) return;
			if (!this.loopOverlayElement) {
				this.loopOverlayElement = document.getElementById("shader-loop-overlay");
				if (!this.loopOverlayElement) {
					this.loopOverlayElement = document.createElement("div");
					this.loopOverlayElement.id = "shader-loop-overlay";
					document.body.appendChild(this.loopOverlayElement);
				}
			}

			this.loopOverlayElement.classList.toggle("is-hidden", !show);
			if (!show) return;

			const countdown = this.getLoopCountdown();
			if (!countdown) return;

			const seconds = countdown.remaining.toFixed(1);
			this.loopOverlayElement.textContent = countdown.paused ? `loop pause ${seconds}s` : `loop ${seconds}s`;
			const warn = !countdown.paused && countdown.remaining <= this.loopConfig.warnAtSeconds;
			this.loopOverlayElement.classList.toggle("is-warning", warn);
		} catch (error) {
			console.warn("Loop countdown failed:", error);
		}
	}

	/**
	 * Update loading progress - call this to sync with loading percentage
	 * @param {number} progress - Loading progress from 0.0 (0%) to 1.0 (100%)
	 */
	setLoadingProgress(progress) {
		this.loadingProgress = Math.max(0.0, Math.min(1.0, progress));
		return this;
	}

	/**
	 * Evaluate uniform value from string expression
	 * @param {string|*} value - Value or expression
	 * @param {object} effect - Effect configuration
	 * @returns {*} Evaluated value
	 */
	evaluateUniformValue(value, effect) {
		if (typeof value === "string") {
			// Handle special cases
			if (value === "[width, height]") {
				return this.getPhysicalResolution();
			}

			// Handle expressions like 'shaderSeed + 777.0'
			if (value.includes("+") || value.includes("-") || value.includes("*") || value.includes("/")) {
				try {
					const [physW, physH] = this.getPhysicalResolution();
					const scales = this.getSizeScaleFactors();
					// Create a safe evaluation context with available variables
					const evalContext = {
						shaderTime: this.shaderTime,
						shaderSeed: this.shaderSeed,
						width: physW,
						height: physH,
						...effect, // Include effect properties
						pixelDensity: scales.pixelDensity,
						densityScale: scales.densityScale,
						renderDensity: scales.renderDensity,
						viewportScale: scales.viewportScale,
						sizeScale: scales.sizeScale,
					};

					// Replace variable names with their values
					let evalString = value;
					for (const [varName, varValue] of Object.entries(evalContext)) {
						if (typeof varValue === "number") {
							evalString = evalString.replace(new RegExp(`\\b${varName}\\b`, "g"), varValue);
						}
					}

					return eval(evalString);
				} catch (error) {
					console.warn(`Failed to evaluate uniform value "${value}":`, error);
					return 0;
				}
			}

			// Handle property references from the effect config
			if (value in effect) {
				const resolved = effect[value];
				if (resolved === undefined || resolved === null) {
					if (value === "rgbGain") return [1.0, 1.0, 1.0];
					if (value === "center" || value === "blurCenter") return [0.5, 0.5];
					return 0;
				}
				if (Array.isArray(resolved) && resolved.length === 0 && value === "rgbGain") {
					return [1.0, 1.0, 1.0];
				}
				return resolved;
			}

			// Handle global variable references
			if (value === "shaderTime") return this.shaderTime;
			if (value === "shaderSeed") return this.shaderSeed;
			if (value === "loadingProgress") return this.loadingProgress;
			if (value === "width") return this.getPhysicalResolution()[0];
			if (value === "height") return this.getPhysicalResolution()[1];
			if (
				value === "renderDensity" ||
				value === "pixelDensity" ||
				value === "densityScale" ||
				value === "viewportScale" ||
				value === "sizeScale"
			) {
				const scales = this.getSizeScaleFactors();
				return scales[value];
			}

			// Try to evaluate as a simple variable reference
			try {
				return eval(value);
			} catch (error) {
				console.warn(`Failed to evaluate uniform value "${value}":`, error);
				return 0;
			}
		}

		return value;
	}

	/**
	 * Apply shader effects to the main canvas
	 * Call this in your render loop
	 */
	apply() {
		if (!this.shaderManager || !this.mainCanvas) {
			console.warn("ShaderEffects not properly initialized");
			return this;
		}

		// Clear the shader canvas (use p5Instance for global clear)
		if (this.p5Instance && this.p5Instance.clear) {
			this.p5Instance.clear();
		}

		// Build effect passes dynamically (only rebuild if effects changed)
		const currentEnabledEffects = Object.keys(this.effectsConfig).filter((name) => this.effectsConfig[name].enabled);

		if (JSON.stringify(this.lastEnabledEffects) !== JSON.stringify(currentEnabledEffects)) {
			this.shaderPipeline.clearPasses();

			// Iterate through effectsConfig to build passes
			// (effect.pass lets clones like "chromatic2" reuse the "chromatic" GL program)
			for (const effectName in this.effectsConfig) {
				const effect = this.effectsConfig[effectName];
				if (effect.enabled) {
					const passName = effect.pass || effectName;
					this.shaderPipeline.addPass(passName, () => {
						const uniforms = {};
						for (const uniformName in effect.uniforms) {
							const value = effect.uniforms[uniformName];
							uniforms[uniformName] = this.evaluateUniformValue(value, effect);
						}
						return uniforms;
					});
				}
			}

			this.lastEnabledEffects = [...currentEnabledEffects];
		}

		// Run pipeline from mainCanvas to the shader canvas
		this.shaderPipeline.run(this.mainCanvas);

		return this;
	}

	/**
	 * Apply copy shader (just display the main canvas without effects)
	 */
	applyCopy() {
		if (!this.shaderManager || !this.mainCanvas) {
			return this;
		}

		if (this.p5Instance && this.p5Instance.clear) {
			this.p5Instance.clear();
		}

		// blit() applies the Graphics→WEBGL Y flip + optional render-ratio crop
		this.shaderManager.blit(this.mainCanvas, this.p5Instance, true);

		return this;
	}

	/**
	 * Load additional shader dynamically
	 * @param {string} name - Shader name
	 * @param {string} fragPath - Fragment shader path
	 * @param {string} vertPath - Vertex shader path (optional)
	 */
	loadShader(name, fragPath, vertPath = null) {
		if (this.shaderManager) {
			this.shaderManager.loadShader(name, fragPath, vertPath);
			console.log(`Loaded shader: ${name}`);
		}
		return this;
	}

	/**
	 * Get list of loaded shader names
	 * @returns {string[]} Array of shader names
	 */
	getLoadedShaders() {
		if (this.shaderManager && this.shaderManager.shaders) {
			return Object.keys(this.shaderManager.shaders);
		}
		return [];
	}

	/**
	 * Mark particle animation as complete
	 */
	setParticleAnimationComplete(complete = true) {
		this.particleAnimationComplete = complete;
		return this;
	}

	/**
	 * Check if shaders should continue after completion
	 * @returns {boolean}
	 */
	shouldContinueAfterCompletion() {
		return this.continueShadersAfterCompletion;
	}

	/**
	 * Set whether shaders should continue after sketch completion
	 * @param {boolean} value - Continue or not
	 */
	setContinueAfterCompletion(value) {
		this.continueShadersAfterCompletion = value;
		return this;
	}

	/**
	 * Set whether to apply shaders during sketch rendering
	 * @param {boolean} value - Apply or not
	 */
	setApplyDuringSketch(value) {
		this.applyShadersDuringSketch = value;
		return this;
	}

	/**
	 * Check if shaders should be applied during sketch
	 * @returns {boolean}
	 */
	shouldApplyDuringSketch() {
		return this.applyShadersDuringSketch;
	}

	/**
	 * Get current shader frame rate
	 * @returns {number}
	 */
	getFrameRate() {
		return this.shaderFrameRate;
	}

	/**
	 * Stall until queued WebGL work finishes so FPS includes GPU cost.
	 * Without this, high density looks lagged while the counter still reports
	 * rAF cadence (often 60–120+) because draw calls return before the GPU is done.
	 */
	_syncGpuForFps() {
		try {
			const gl = this.p5Instance?.drawingContext;
			if (gl && typeof gl.finish === "function") gl.finish();
		} catch {
			/* ignore — FPS stays best-effort */
		}
	}

	/**
	 * Record one completed frame for the FPS counter.
	 * Call after apply()/applyCopy() so the sample covers real work.
	 */
	_markFrameForFps() {
		// Sync only while the overlay is on — finish() is a real stall.
		if (this.showFPS) this._syncGpuForFps();
		this.updateFPS();
	}

	/**
	 * Update FPS counter from wall-clock time since the previous completed frame.
	 */
	updateFPS() {
		// Always track FPS (the debug panel reads currentFPS even when the
		// standalone overlay is hidden); drawFPS() gates the overlay itself.
		const now = performance.now();
		const delta = now - this.lastFrameTime;
		this.lastFrameTime = now;

		// Ignore sub-ms / non-finite samples (double-fire, first tick after a pause)
		if (!(delta > 0.5) || !Number.isFinite(delta)) return;

		const instantFPS = Math.min(1000 / delta, 240);

		this.fpsHistory.push(instantFPS);
		if (this.fpsHistory.length > this.fpsHistorySize) {
			this.fpsHistory.shift();
		}

		const sum = this.fpsHistory.reduce((a, b) => a + b, 0);
		this.currentFPS = Math.round(sum / this.fpsHistory.length);
	}

	/**
	 * Draw FPS counter on screen (using DOM overlay for better visibility)
	 */
	drawFPS() {
		try {
			// Don't show FPS if in iframe
			if (typeof isInIframe === "function" && isInIframe()) {
				return;
			}

			// Create or update FPS overlay element
			let fpsElement = document.getElementById("shader-fps-overlay");
			if (!fpsElement) {
				fpsElement = document.createElement("div");
				fpsElement.id = "shader-fps-overlay";
				document.body.appendChild(fpsElement);
			}

			// Hide if FPS is disabled
			if (!this.showFPS) {
				fpsElement.style.display = "none";
				return;
			}

			fpsElement.style.display = "block";

			// Get canvas position
			const canvas = document.querySelector("canvas");
			if (!canvas) return;

			const canvasRect = canvas.getBoundingClientRect();

			// Update position to match canvas
			fpsElement.style.position = "fixed";
			fpsElement.style.left = canvasRect.left + 10 + "px";
			fpsElement.style.top = canvasRect.top + 10 + "px";
			fpsElement.style.zIndex = "10000";

			// Color based on performance
			let textColor;
			if (this.currentFPS >= 55) {
				textColor = "#64ff64"; // Green
			} else if (this.currentFPS >= 30) {
				textColor = "#ffc864"; // Orange
			} else {
				textColor = "#ff6464"; // Red
			}

			// Update content
			fpsElement.innerHTML = `
				<div style="
					background: rgba(0, 0, 0, 0.7);
					padding: 8px 12px;
					border-radius: 4px;
					font-family: 'Courier New', monospace;
					font-size: 16px;
					color: ${textColor};
					font-weight: bold;
				">
					FPS: ${this.currentFPS}
				</div>
			`;
		} catch (error) {
			// Silently fail if DOM operations crash (common on Safari mobile)
			console.warn("FPS counter failed:", error);
		}
	}

	/**
	 * Toggle FPS display
	 * @param {boolean} show - Show or hide FPS
	 */
	toggleFPS(show = null) {
		// Respect sketch-level UI toggle if present
		if (typeof SHOW_FPS_UI !== "undefined" && !SHOW_FPS_UI) return;
		if (show === null) {
			this.showFPS = !this.showFPS;
		} else {
			this.showFPS = show;
		}
		// Reset the window so enabling the overlay doesn't inherit inflated samples
		this.fpsHistory = [];
		this.lastFrameTime = performance.now();
		return this;
	}

	/**
	 * Render frame - handles shader logic for each animation frame
	 * @param {boolean} isSketchComplete - Whether the sketch animation is complete
	 * @param {Function} continueCallback - Callback to continue animation loop
	 * @returns {boolean} Whether to continue the animation loop
	 */
	renderFrame(isSketchComplete, continueCallback) {
		if (isSketchComplete) {
			// Always apply shaders at least once when sketch is complete
			if (!this.shouldApplyDuringSketch()) {
				this.apply();
			}

			if (this.shouldContinueAfterCompletion()) {
				// Keep shaders running even after particles are complete
				this.advanceShaderClock();
				this.apply();

				this._markFrameForFps();
				this.drawFPS();
				this.drawLoopCountdown();

				// Continue using requestAnimationFrame
				return true;
			} else {
				// Stop everything when sketch is complete
				console.log("Sketch complete - shaders stopped");
				return false;
			}
		}

		// Update shader time during sketching
		this.advanceShaderClock();

		// Only apply shaders during sketching if enabled
		if (this.shouldApplyDuringSketch()) {
			// Skipped frames (applyInterval > 1) leave the last shader output on screen
			if (this.shouldRunFullShaderApply()) this.apply();
		} else {
			// If not applying shaders during sketching, use copy shader to display base sketch
			this.applyCopy();
		}

		this._markFrameForFps();
		this.drawFPS();
		this.drawLoopCountdown();

		return true; // Continue animation
	}
}
