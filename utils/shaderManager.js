/**
 * Shader Manager Utility
 *
 * A utility class to manage shaders in p5.js projects
 * Makes it easy to load, apply, and reuse shaders from the library
 */
class ShaderManager {
	constructor() {
		this.shaders = {};
		this.defaultVertexPath = null;
		this.p5Instance = null;
		this.basePath = "";
		this.renderRatio = {
			fitCanvas: true,
			width: 1,
			height: 1,
		};
		this.crispPixels = false; // NEAREST sampling in shader passes
	}

	/**
	 * Initialize the shader manager
	 * @param {p5} p5Instance - The p5 instance
	 * @param {string} basePath - Base path to the shader directory (default: "library/shaders/")
	 */
	init(p5Instance, basePath = "library/shaders/") {
		this.p5Instance = p5Instance;
		this.basePath = basePath;
		return this;
	}

	/**
	 * Set the default vertex shader path
	 * @param {string} path - Path to the vertex shader
	 */
	setDefaultVertex(path) {
		this.defaultVertexPath = this.basePath + path;
		return this;
	}

	/**
	 * Load a shader (async in p5.js 2.0)
	 * @param {string} name - Name to reference the shader
	 * @param {string} fragPath - Path to the fragment shader (relative to basePath)
	 * @param {string} vertPath - Path to the vertex shader (optional, uses default if not provided)
	 */
	async loadShader(name, fragPath, vertPath = null) {
		const vertexPath = vertPath ? this.basePath + vertPath : this.defaultVertexPath;
		const fragmentPath = this.basePath + fragPath;

		if (!vertexPath) {
			console.error("No vertex shader specified and no default set");
			return this;
		}

		this.shaders[name] = await this.p5Instance.loadShader(vertexPath, fragmentPath);
		return this;
	}

	/**
	 * Configure how the final shader quad is displayed on the canvas.
	 *
	 * @param {object} options
	 * @param {boolean} [options.fitCanvas=true] - When true, map the full texture to the canvas.
	 * @param {number} [options.width=16] - Target aspect width (used when fitCanvas is false).
	 * @param {number} [options.height=9] - Target aspect height (used when fitCanvas is false).
	 *
	 * Custom ratios use object-fit: cover — the output always fills the canvas and
	 * crops the smaller axis. The largest canvas axis is the reference length for
	 * the ratio. Example: 240×24 canvas with ratio 1:1 fills the full canvas and
	 * crops the vertical center of the texture.
	 */
	setRenderRatio(options = {}) {
		this.renderRatio = {
			fitCanvas: options.fitCanvas !== undefined ? Boolean(options.fitCanvas) : true,
			width: Math.max(options.width ?? 16, 0.0001),
			height: Math.max(options.height ?? 9, 0.0001),
		};
		return this;
	}

	getRenderRatio() {
		return {...this.renderRatio};
	}

	/**
	 * UV bounds for object-fit: cover using the configured render ratio.
	 * @param {number} canvasW
	 * @param {number} canvasH
	 * @returns {{ u0: number, v0: number, u1: number, v1: number }}
	 */
	getCoverUVBounds(canvasW, canvasH) {
		if (!canvasW || !canvasH) {
			return {u0: 0, v0: 0, u1: 1, v1: 1};
		}

		const viewportAspect = canvasW / canvasH;
		const contentAspect = this.renderRatio.width / this.renderRatio.height;

		if (viewportAspect > contentAspect) {
			const scale = viewportAspect / contentAspect;
			const margin = (1 - 1 / scale) / 2;
			return {u0: 0, v0: margin, u1: 1, v1: 1 - margin};
		}

		const scale = contentAspect / viewportAspect;
		const margin = (1 - 1 / scale) / 2;
		return {u0: margin, v0: 0, u1: 1 - margin, v1: 1};
	}

	/**
	 * Apply a shader with uniforms
	 * @param {string} name - Name of the shader to apply
	 * @param {object} uniforms - Object with uniform values to set
	 * @param {p5.Graphics} target - Optional target to render to
	 */
	apply(name, uniforms = {}, target = null) {
		if (!this.shaders[name]) {
			console.error(`Shader "${name}" not found`);
			return this;
		}

		const shader = this.shaders[name];
		const ctx = target || this.p5Instance;
		ctx.shader(shader);

		// Set uniforms
		for (const [key, value] of Object.entries(uniforms)) {
			shader.setUniform(key, value);
			// After binding a sampler, force nearest filtering for crisp low-res look
			if (this.crispPixels && this._looksLikeTexture(value)) {
				this._forceNearestSampling(ctx);
			}
		}

		return this;
	}

	_looksLikeTexture(value) {
		if (!value || typeof value !== "object") return false;
		return typeof value.width === "number" || value instanceof HTMLCanvasElement || value.rawTexture || value.texture || typeof value.begin === "function";
	}

	/**
	 * Use NEAREST mag/min filter on the currently bound 2D texture.
	 */
	_forceNearestSampling(ctx) {
		const gl = ctx?.drawingContext || ctx?._renderer?.GL || ctx?._renderer?.gl;
		if (!gl || typeof gl.texParameteri !== "function") return;
		try {
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		} catch (_) {
			/* ignore */
		}
	}

	/**
	 * Whether the texture source needs a Y flip when drawn via drawFullscreenQuad.
	 * p5.Graphics / 2D canvases: flip. p5.Framebuffer ping-pong buffers: don't flip.
	 * @param {*} texture
	 * @returns {boolean}
	 */
	shouldFlipTextureSource(texture) {
		return !this.isFramebufferSource(texture);
	}

	/**
	 * p5.Framebuffer vs p5.Graphics — framebuffers use a flipped Y convention in p5 2.x.
	 * @param {*} texture
	 * @returns {boolean}
	 */
	isFramebufferSource(texture) {
		return texture && typeof texture.begin === "function" && typeof texture.end === "function" && texture.color && typeof texture.color !== "function";
	}

	/**
	 * Apply a shader pass and draw a fullscreen quad with correct Y orientation.
	 * All effects should go through this — do not call drawFullscreenQuad directly.
	 *
	 * @param {string} passName - Registered shader name
	 * @param {object|function} uniformsProvider - Uniform values or () => uniforms
	 * @param {*} readTex - p5.Graphics, p5.Framebuffer, or sampler source
	 * @param {p5.Graphics|p5} [writeTarget] - Render target (defaults to p5 instance)
	 * @param {boolean} [useRenderRatio=false] - Apply setRenderRatio() crop on final pass
	 * @param {boolean} [writesToFramebuffer=false] - Set true when the quad is drawn
	 *   inside fbo.begin()/end(). Writing clip-space geometry into a framebuffer
	 *   inverts Y vs the screen, so the flip decision must be toggled to keep the
	 *   stored texture in "no flip needed" orientation. Without this, every
	 *   intermediate ping-pong pass adds one flip (visible with 2+ effects).
	 */
	renderPass(passName, uniformsProvider, readTex, writeTarget = null, useRenderRatio = false, writesToFramebuffer = false) {
		const uniforms = typeof uniformsProvider === "function" ? uniformsProvider() : uniformsProvider || {};
		let flipY = this.shouldFlipTextureSource(readTex);
		if (writesToFramebuffer) flipY = !flipY;
		const ctx = writeTarget || this.p5Instance;
		return this.apply(passName, {...uniforms, uTexture: this.resolveTexture(readTex)}, ctx).drawFullscreenQuad(ctx, useRenderRatio, flipY);
	}

	/**
	 * Blit a texture to a target with the copy shader (correct Y for Graphics vs Framebuffer).
	 */
	blit(readTex, writeTarget = null, useRenderRatio = false) {
		return this.renderPass("copy", {}, readTex, writeTarget, useRenderRatio);
	}

	/**
	 * Draw a fullscreen quad to render the shader.
	 * Prefer renderPass() — handles flipY automatically from the source texture type.
	 *
	 * @param {p5.Graphics|p5} [target] - Render target (defaults to p5 instance).
	 * @param {boolean} [useRenderRatio=false] - When true, apply setRenderRatio() on the final pass.
	 * @param {boolean} [flipY=false] - Flip V coords (needed when sampling p5.Graphics / 2D canvases).
	 */
	drawFullscreenQuad(target = null, useRenderRatio = false, flipY = false) {
		const ctx = target || this.p5Instance;
		const canvasW = ctx.width;
		const canvasH = ctx.height;

		let u0 = 0;
		let v0 = 0;
		let u1 = 1;
		let v1 = 1;
		if (useRenderRatio && !this.renderRatio.fitCanvas) {
			({u0, v0, u1, v1} = this.getCoverUVBounds(canvasW, canvasH));
		}

		const topV = flipY ? v1 : v0;
		const bottomV = flipY ? v0 : v1;

		ctx.push();
		ctx.noStroke();
		if (typeof ctx.resetMatrix === "function") {
			ctx.resetMatrix();
		}

		ctx.beginShape();
		ctx.vertex(-1, 1, 0, u0, topV);
		ctx.vertex(1, 1, 0, u1, topV);
		ctx.vertex(1, -1, 0, u1, bottomV);
		ctx.vertex(-1, -1, 0, u0, bottomV);
		ctx.endShape(ctx.CLOSE);

		ctx.pop();
		return this;
	}

	/**
	 * Create an offscreen framebuffer for shader ping-pong passes.
	 * Uses the main WEBGL context (unlike createGraphics WEBGL buffers).
	 * @param {number} width - Logical width
	 * @param {number} height - Logical height
	 * @param {number} pixelDensity - Physical pixel density multiplier
	 * @returns {p5.Framebuffer}
	 */
	createBuffer(width, height, pixelDensity = 2) {
		if (!this.p5Instance) {
			console.error("ShaderManager not initialized");
			return null;
		}
		return this.p5Instance.createFramebuffer({
			width,
			height,
			density: pixelDensity,
		});
	}

	/**
	 * Normalize a pipeline input (Graphics, Framebuffer, Image) for sampler2D uniforms.
	 * Only p5.Framebuffer objects expose a .color texture; p5.Graphics also has a .color() method.
	 * @param {*} texture
	 * @returns {*}
	 */
	resolveTexture(texture) {
		if (texture && typeof texture.begin === "function" && typeof texture.end === "function") {
			return texture.color;
		}
		return texture;
	}
}

// Create a global instance
const shaderManager = new ShaderManager();
