/**
 * Simple Shader Pipeline for p5.js
 *
 * Lets you chain multiple post-process passes in order, with per-pass uniforms.
 */
class ShaderPipeline {
	constructor(shaderManager, p5Instance) {
		this.shaderManager = shaderManager;
		this.p5 = p5Instance;
		this.passes = [];
		this.buffers = [];
		this.initialized = false;
		this.width = 0;
		this.height = 0;
	}

	init(width, height, enabledEffects = []) {
		this.width = width;
		this.height = height;

		// Only create buffers if we have multiple effects that need ping-pong
		if (enabledEffects.length <= 1) {
			this.buffers = [];
		} else {
			// Only create 2 buffers when we actually need ping-pong (2+ effects)
			// Safari mobile fallback - divide by 2 for better performance
			const bufferDivisor = isSafariMobile() ? 1 : 1;
			this.buffers = [this.shaderManager.createBuffer(width / bufferDivisor, height / bufferDivisor), this.shaderManager.createBuffer(width / bufferDivisor, height / bufferDivisor)];
		}

		// Initialize buffers
		for (const buf of this.buffers) {
			if (buf) {
				buf.noStroke();
			}
		}
		this.initialized = true;
		return this;
	}

	addPass(passName, uniformsProvider = () => ({})) {
		this.passes.push({name: passName, uniformsProvider});
		return this;
	}

	clearPasses() {
		this.passes = [];
		return this;
	}

	/**
	 * Run the pipeline:
	 * - inputTexture: p5.Graphics or texture to read from (sampler2D)
	 * - outputTarget: where to draw the final quad (usually the main WEBGL canvas)
	 */
	run(inputTexture, outputTarget) {
		if (!this.initialized) {
			console.error("ShaderPipeline not initialized. Call init(width, height).");
			return;
		}
		if (this.passes.length === 0) {
			// just blit input to screen
			this.shaderManager.apply("copy", {uTexture: inputTexture}, outputTarget).drawFullscreenQuad(outputTarget);
			return;
		}

		// Special case: if only one effect, render directly to output
		if (this.passes.length === 1) {
			const {name, uniformsProvider} = this.passes[0];
			const uniforms = Object.assign({}, uniformsProvider(), {uTexture: inputTexture});
			this.shaderManager.apply(name, uniforms, outputTarget).drawFullscreenQuad(outputTarget);
			return;
		}

		// For multiple effects, use ping-pong between 2 buffers
		let readTex = inputTexture;
		let ping = 0;

		for (let i = 0; i < this.passes.length; i++) {
			const {name, uniformsProvider} = this.passes[i];

			if (i === this.passes.length - 1) {
				// Last effect renders directly to output
				const uniforms = Object.assign({}, uniformsProvider(), {uTexture: readTex});
				this.shaderManager.apply(name, uniforms, outputTarget).drawFullscreenQuad(outputTarget);
			} else {
				// Intermediate effects use ping-pong buffers
				const writeBuf = this.buffers[ping];
				writeBuf.clear();

				const uniforms = Object.assign({}, uniformsProvider(), {uTexture: readTex});
				this.shaderManager.apply(name, uniforms, writeBuf).drawFullscreenQuad(writeBuf);

				// Next effect reads from what we just wrote
				readTex = writeBuf;
				ping = 1 - ping; // Switch between buffers
			}
		}
	}
}

// Global helper
let shaderPipeline;
