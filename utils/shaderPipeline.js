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
		this.pixelDensity = 1;
	}

	init(width, height, enabledEffects = [], pixelDensity = 1) {
		for (const buf of this.buffers) {
			try {
				buf?.remove?.();
			} catch {
				// ignore
			}
		}

		this.width = width;
		this.height = height;
		this.pixelDensity = pixelDensity;

		// Only create buffers if we have multiple effects that need ping-pong
		if (enabledEffects.length <= 1) {
			this.buffers = [];
		} else {
			// Only create 2 buffers when we actually need ping-pong (2+ effects)
			// Safari mobile fallback - divide by 2 for better performance
			const bufferDivisor = isSafariMobile() ? 1 : 1;
			const bufferW = width / bufferDivisor;
			const bufferH = height / bufferDivisor;
			this.buffers = [
				this.shaderManager.createBuffer(bufferW, bufferH, pixelDensity),
				this.shaderManager.createBuffer(bufferW, bufferH, pixelDensity),
			];
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

		const resolveTexture = (texture) => this.shaderManager.resolveTexture(texture);
		const renderPass = (passName, uniformsProvider, readTex, writeTarget, useRenderRatio = false) => {
			const uniforms = Object.assign({}, uniformsProvider(), {uTexture: resolveTexture(readTex)});
			const ctx = writeTarget || this.p5;
			this.shaderManager.apply(passName, uniforms, ctx).drawFullscreenQuad(ctx, useRenderRatio);
		};

		if (this.passes.length === 0) {
			// just blit input to screen
			this.shaderManager
				.apply("copy", {uTexture: resolveTexture(inputTexture)}, outputTarget)
				.drawFullscreenQuad(outputTarget, true);
			return;
		}

		// Special case: if only one effect, render directly to output
		if (this.passes.length === 1) {
			const {name, uniformsProvider} = this.passes[0];
			renderPass(name, uniformsProvider, inputTexture, outputTarget, true);
			return;
		}

		// For multiple effects, use ping-pong between 2 framebuffers (same WEBGL context)
		let readTex = inputTexture;
		let ping = 0;

		for (let i = 0; i < this.passes.length; i++) {
			const {name, uniformsProvider} = this.passes[i];

			if (i === this.passes.length - 1) {
				renderPass(name, uniformsProvider, readTex, outputTarget, true);
			} else {
				const writeBuf = this.buffers[ping];
				writeBuf.begin();
				this.p5.clear();
				renderPass(name, uniformsProvider, readTex, this.p5, false);
				writeBuf.end();
				readTex = writeBuf;
				ping = 1 - ping;
			}
		}
	}
}

// Global helper
let shaderPipeline;
