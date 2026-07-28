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
		this.sourceDensity = 1;
		this.densityScale = 1;
	}

	/**
	 * Render the shader stage at a multiple of the sketch's pixel density.
	 *
	 * Below 1 the whole post-process chain runs at reduced resolution — much cheaper for
	 * expensive passes, and a deliberately coarser look. Above 1 it supersamples.
	 * Applied inside init(), so a host calling init() with the sketch density needs no
	 * changes to pick this up.
	 *
	 * Off-scale renders go through a dedicated output framebuffer that is blitted to the
	 * screen at the end. Do NOT implement this by changing the p5 pixel density instead:
	 * that is global state the sketch owns, and any p5.Graphics created afterwards
	 * inherits it — which silently rescales the artwork buffer and compounds on reload.
	 *
	 * Call the host's pipeline re-init after changing this.
	 *
	 * @param {number} scale - Multiplier on the source density
	 */
	setDensityScale(scale) {
		const s = Number(scale);
		this.densityScale = Number.isFinite(s) && s > 0 ? Math.min(Math.max(s, 0.05), 8) : 1;
		return this;
	}

	getDensityScale() {
		return this.densityScale;
	}

	/** Density the buffers are actually allocated at (source × scale, clamped). */
	getEffectiveDensity() {
		return this.pixelDensity;
	}

	init(width, height, enabledEffects = [], pixelDensity = 1) {
		for (const buf of [...this.buffers, this.outputBuffer]) {
			try {
				buf?.remove?.();
			} catch {
				// ignore
			}
		}
		this.outputBuffer = null;

		this.width = width;
		this.height = height;
		this.sourceDensity = pixelDensity;
		this.pixelDensity = Math.min(Math.max(pixelDensity * this.densityScale, 0.05), 8);

		// Only create buffers if we have multiple effects that need ping-pong
		if (enabledEffects.length <= 1) {
			this.buffers = [];
		} else {
			// Only create 2 buffers when we actually need ping-pong (2+ effects)
			// Safari mobile fallback - divide by 2 for better performance
			const bufferDivisor = isSafariMobile() ? 1 : 1;
			const bufferW = width / bufferDivisor;
			const bufferH = height / bufferDivisor;
			this.buffers = [this.shaderManager.createBuffer(bufferW, bufferH, this.pixelDensity), this.shaderManager.createBuffer(bufferW, bufferH, this.pixelDensity)];
		}

		// Off-scale: the chain ends in its own buffer at the scaled density, then gets
		// blitted to the screen. That is what makes the whole stage cheaper (or
		// supersampled) without touching the canvas the sketch owns.
		if (this.densityScale !== 1) {
			this.outputBuffer = this.shaderManager.createBuffer(width, height, this.pixelDensity);
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

		const renderPass = (passName, uniformsProvider, readTex, writeTarget, useRenderRatio = false, writesToFramebuffer = false) => {
			this.shaderManager.renderPass(passName, uniformsProvider, readTex, writeTarget || this.p5, useRenderRatio, writesToFramebuffer);
		};

		const screen = outputTarget || this.p5;
		const finalBuf = this.outputBuffer;

		/**
		 * Draw the last pass. At scale 1 it goes straight to the screen. Off-scale it goes
		 * into the output buffer, which is then blitted — so the render-ratio crop moves to
		 * that blit, since that is the draw that actually reaches the canvas.
		 */
		const finish = (readTex, name, uniformsProvider) => {
			if (!finalBuf) {
				renderPass(name, uniformsProvider, readTex, screen, true);
				return;
			}
			finalBuf.begin();
			this.p5.clear();
			renderPass(name, uniformsProvider, readTex, this.p5, false, true);
			finalBuf.end();
			this.shaderManager.blit(finalBuf, screen, true);
		};

		if (this.passes.length === 0) {
			this.shaderManager.blit(inputTexture, screen, true);
			return;
		}

		// Special case: if only one effect, render directly to output
		if (this.passes.length === 1) {
			const {name, uniformsProvider} = this.passes[0];
			finish(inputTexture, name, uniformsProvider);
			return;
		}

		// For multiple effects, use ping-pong between 2 framebuffers (same WEBGL context)
		let readTex = inputTexture;
		let ping = 0;

		for (let i = 0; i < this.passes.length; i++) {
			const {name, uniformsProvider} = this.passes[i];

			if (i === this.passes.length - 1) {
				finish(readTex, name, uniformsProvider);
			} else {
				const writeBuf = this.buffers[ping];
				writeBuf.begin();
				this.p5.clear();
				// writesToFramebuffer: toggle Y so the buffer stores upright content
				renderPass(name, uniformsProvider, readTex, this.p5, false, true);
				writeBuf.end();
				readTex = writeBuf;
				ping = 1 - ping;
			}
		}
	}
}

// Global helper
let shaderPipeline;
