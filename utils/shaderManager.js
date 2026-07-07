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
			fitCanvas: false,
			width: 1,
			height: 1,
		};
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
	 * Load a shader
	 * @param {string} name - Name to reference the shader
	 * @param {string} fragPath - Path to the fragment shader (relative to basePath)
	 * @param {string} vertPath - Path to the vertex shader (optional, uses default if not provided)
	 */
	loadShader(name, fragPath, vertPath = null) {
		const vertexPath = vertPath ? this.basePath + vertPath : this.defaultVertexPath;
		const fragmentPath = this.basePath + fragPath;

		if (!vertexPath) {
			console.error("No vertex shader specified and no default set");
			return this;
		}

		this.shaders[name] = this.p5Instance.loadShader(vertexPath, fragmentPath);
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
		}

		return this;
	}

	/**
	 * Draw a fullscreen quad to render the shader.
	 * Vertex shaders use aPosition as clip-space NDC (-1..1).
	 * Custom ratios crop the texture (object-fit: cover) to fill the canvas.
	 *
	 * @param {p5.Graphics|p5} [target] - Render target (defaults to p5 instance).
	 * @param {boolean} [useRenderRatio=false] - When true, apply setRenderRatio() on the final pass.
	 */
	drawFullscreenQuad(target = null, useRenderRatio = false) {
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

		ctx.push();
		ctx.noStroke();
		if (typeof ctx.resetMatrix === "function") {
			ctx.resetMatrix();
		}

		ctx.beginShape();
		ctx.vertex(-1, 1, 0, u0, v0);
		ctx.vertex(1, 1, 0, u1, v0);
		ctx.vertex(1, -1, 0, u1, v1);
		ctx.vertex(-1, -1, 0, u0, v1);
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
	createBuffer(width, height, pixelDensity = 1) {
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
