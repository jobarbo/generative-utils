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

	init(width, height) {
		this.width = width;
		this.height = height;
		// Create two ping-pong buffers in WEBGL mode
		this.buffers = [this.shaderManager.createBuffer(width, height), this.shaderManager.createBuffer(width, height)];
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

		let readTex = inputTexture;
		let ping = 0;

		for (let i = 0; i < this.passes.length; i++) {
			const {name, uniformsProvider} = this.passes[i];
			const writeBuf = this.buffers[ping];
			writeBuf.clear();

			const uniforms = Object.assign({}, uniformsProvider(), {uTexture: readTex});

			this.shaderManager.apply(name, uniforms, writeBuf).drawFullscreenQuad(writeBuf);

			// Next pass reads from what we just wrote
			readTex = writeBuf;
			ping = 1 - ping;
		}

		// Final blit to output
		this.shaderManager.apply("copy", {uTexture: readTex}, outputTarget).drawFullscreenQuad(outputTarget);
	}
}

// Global helper
let shaderPipeline;
