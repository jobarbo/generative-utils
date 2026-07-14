/**
 * Unified Debug Panel
 *
 * DOM overlay for perf (FPS / loop) + audio monitoring (bands, beat, spectrum).
 * Separate from #controls / paramsPanel. Toggle with D.
 *
 * Usage:
 *   debugPanel.init({ audio: audioAnalyzer, shaders: shaderEffects });
 *   // in draw():
 *   debugPanel.update();
 *   // key D → debugPanel.toggle()
 *
 * Backward-compat alias: audioDebugDisplay === debugPanel
 */
class DebugPanel {
	constructor() {
		this.audioAnalyzer = null;
		this.shaderEffects = null;
		this.visible = false;
		this.el = null;
		this.spectrumCanvas = null;
		this.spectrumCtx = null;
		this.refs = {};
		this._boundKeyHandler = null;
		this.spectrumWidth = 220;
		this.spectrumHeight = 56;
	}

	/**
	 * @param {object} options
	 * @param {object} [options.audio] - audioAnalyzer instance
	 * @param {object} [options.shaders] - shaderEffects instance
	 */
	init(options = {}) {
		// Support legacy init(audioAnalyzer)
		if (options && typeof options.isInitialized !== "undefined" && !options.audio) {
			this.audioAnalyzer = options;
		} else {
			this.audioAnalyzer = options.audio || (typeof audioAnalyzer !== "undefined" ? audioAnalyzer : null);
			this.shaderEffects = options.shaders || (typeof shaderEffects !== "undefined" ? shaderEffects : null);
		}

		this._ensureDom();
		this._hideStandaloneOverlays();

		// Keyboard toggle is handled by the sketch (key D) to avoid double-firing.
		this._applyVisibility();
		console.log("[debugPanel] ready — press D to toggle");
		return this;
	}

	_ensureDom() {
		if (this.el) return;

		const panel = document.createElement("div");
		panel.id = "debug-panel";
		panel.className = "debug-panel is-hidden";
		panel.setAttribute("aria-hidden", "true");

		panel.innerHTML = `
			<div class="debug-panel__header">
				<span class="debug-panel__title">Debug</span>
				<span class="debug-panel__hint">D</span>
			</div>
			<section class="debug-panel__section" data-section="perf">
				<div class="debug-panel__row">
					<span class="debug-panel__label">FPS</span>
					<span class="debug-panel__value" data-ref="fps">—</span>
				</div>
				<div class="debug-panel__row">
					<label class="debug-panel__loop-toggle">
						<input type="checkbox" data-ref="loop-enabled" title="Enable master loop" />
						<span class="debug-panel__label">Loop</span>
					</label>
					<span class="debug-panel__value" data-ref="loop">—</span>
				</div>
			</section>
			<section class="debug-panel__section" data-section="audio">
				<div class="debug-panel__row">
					<span class="debug-panel__label">Source</span>
					<span class="debug-panel__value" data-ref="source">—</span>
				</div>
				<div class="debug-panel__row">
					<span class="debug-panel__label">Signal</span>
					<span class="debug-panel__signal" data-ref="signal-dot"></span>
					<span class="debug-panel__value" data-ref="signal">—</span>
				</div>
				<div class="debug-panel__bars">
					${this._barHtml("bass", "Bass")}
					${this._barHtml("mid", "Mid")}
					${this._barHtml("treble", "Treble")}
					${this._barHtml("volume", "Volume")}
					${this._barHtml("energy", "Energy")}
				</div>
				<div class="debug-panel__row debug-panel__row--beat">
					<span class="debug-panel__label">Beat</span>
					<span class="debug-panel__beat" data-ref="beat"></span>
					<span class="debug-panel__value" data-ref="bpm">BPM —</span>
				</div>
			</section>
			<section class="debug-panel__section" data-section="spectrum">
				<div class="debug-panel__row">
					<span class="debug-panel__label">Spectrum</span>
				</div>
				<canvas class="debug-panel__spectrum" width="${this.spectrumWidth}" height="${this.spectrumHeight}" data-ref="spectrum"></canvas>
			</section>
		`;

		document.body.appendChild(panel);
		this.el = panel;

		panel.querySelectorAll("[data-ref]").forEach((node) => {
			this.refs[node.getAttribute("data-ref")] = node;
		});

		this.spectrumCanvas = this.refs.spectrum;
		this.spectrumCtx = this.spectrumCanvas ? this.spectrumCanvas.getContext("2d") : null;

		if (this.refs["loop-enabled"]) {
			const loopInput = this.refs["loop-enabled"];
			// Keep gestures on the control (don't fall through to canvas / mic unlock)
			["pointerdown", "mousedown", "click", "touchstart"].forEach((ev) => {
				loopInput.addEventListener(ev, (e) => e.stopPropagation());
			});
			loopInput.addEventListener("change", () => {
				const shaders = this.shaderEffects;
				if (!shaders || typeof shaders.setLoopConfig !== "function") return;
				const on = loopInput.checked;
				this._loopToggleBusy = true;
				shaders.setLoopConfig({enabled: on});
				console.log(`[debugPanel] loop ${on ? "ON" : "OFF"}`);
				requestAnimationFrame(() => {
					this._loopToggleBusy = false;
				});
			});
			loopInput.addEventListener("keydown", (e) => e.stopPropagation());
		}

		panel.addEventListener("keydown", (e) => {
			if (e.target?.tagName === "INPUT") e.stopPropagation();
		});
	}

	_barHtml(id, label) {
		return `
			<div class="debug-panel__bar" data-bar="${id}">
				<div class="debug-panel__bar-meta">
					<span>${label}</span>
					<span data-ref="${id}-pct">0%</span>
				</div>
				<div class="debug-panel__bar-track">
					<div class="debug-panel__bar-fill" data-ref="${id}-fill"></div>
				</div>
			</div>
		`;
	}

	_hideStandaloneOverlays() {
		["shader-fps-overlay", "shader-loop-overlay"].forEach((id) => {
			const el = document.getElementById(id);
			if (el) {
				el.classList.add("is-hidden");
				el.style.display = "none";
			}
		});
	}

	toggle() {
		this.visible = !this.visible;
		this._applyVisibility();
		console.log(`[debugPanel] ${this.visible ? "ON" : "OFF"}`);
		return this;
	}

	show() {
		this.visible = true;
		this._applyVisibility();
		return this;
	}

	hide() {
		this.visible = false;
		this._applyVisibility();
		return this;
	}

	_applyVisibility() {
		if (!this.el) return;
		this.el.classList.toggle("is-hidden", !this.visible);
		this.el.setAttribute("aria-hidden", this.visible ? "false" : "true");
	}

	/**
	 * Call once per frame from draw()
	 */
	update() {
		if (!this.visible || !this.el) return;

		this._updatePerf();
		this._updateAudio();
		this._drawSpectrum();
	}

	_updatePerf() {
		const shaders = this.shaderEffects;
		if (this.refs.fps) {
			const fps = shaders && typeof shaders.currentFPS === "number" ? shaders.currentFPS : null;
			this.refs.fps.textContent = fps != null && fps > 0 ? `${fps} fps` : "—";
		}

		const loopOn = !!(shaders && shaders.loopConfig?.enabled);
		if (this.refs["loop-enabled"] && !this._loopToggleBusy && document.activeElement !== this.refs["loop-enabled"]) {
			this.refs["loop-enabled"].checked = loopOn;
		}

		if (this.refs.loop) {
			if (!shaders || !loopOn) {
				this.refs.loop.textContent = "off";
				this.refs.loop.classList.remove("is-warning");
				return;
			}

			const countdown = typeof shaders.getLoopCountdown === "function" ? shaders.getLoopCountdown() : null;
			if (!countdown) {
				this.refs.loop.textContent = "—";
				this.refs.loop.classList.remove("is-warning");
				return;
			}

			const seconds = countdown.remaining.toFixed(1);
			this.refs.loop.textContent = countdown.paused ? `pause ${seconds}s` : `${seconds}s`;
			const warn = !countdown.paused && countdown.remaining <= (shaders.loopConfig.warnAtSeconds ?? 0);
			this.refs.loop.classList.toggle("is-warning", warn);
		}
	}

	_updateAudio() {
		const audio = this.audioAnalyzer;
		const ready = audio && audio.isInitialized;
		const status = ready && typeof audio.getSourceStatus === "function" ? audio.getSourceStatus() : null;

		if (this.refs.source) {
			this.refs.source.textContent = ready ? audio.sourceType || "—" : "not init";
		}

		if (this.refs.signal) {
			this.refs.signal.textContent = status ? status.label : "—";
			this.refs.signal.classList.remove("is-ok", "is-warn", "is-error");
			if (status) {
				if (status.code === "live") this.refs.signal.classList.add("is-ok");
				else if (status.code === "silent" || status.code === "waiting" || status.code === "suspended") {
					this.refs.signal.classList.add("is-warn");
				} else if (status.code === "denied" || status.code === "not-init") {
					this.refs.signal.classList.add("is-error");
				}
			}
		}

		if (this.refs["signal-dot"]) {
			this.refs["signal-dot"].classList.remove("is-ok", "is-warn", "is-error");
			if (status?.code === "live") this.refs["signal-dot"].classList.add("is-ok");
			else if (status?.code === "silent" || status?.code === "waiting" || status?.code === "suspended") {
				this.refs["signal-dot"].classList.add("is-warn");
			} else if (status) {
				this.refs["signal-dot"].classList.add("is-error");
			}
		}

		const bands = [
			["bass", ready ? audio.bass : 0],
			["mid", ready ? audio.mid : 0],
			["treble", ready ? audio.treble : 0],
			["volume", ready ? audio.volume : 0],
			["energy", ready ? audio.energy : 0],
		];

		for (const [id, value] of bands) {
			const pct = Math.round(Math.min(Math.max(value, 0), 1) * 100);
			const fill = this.refs[`${id}-fill`];
			const pctEl = this.refs[`${id}-pct`];
			if (fill) fill.style.width = `${pct}%`;
			if (pctEl) pctEl.textContent = `${pct}%`;
		}

		if (this.refs.beat) {
			this.refs.beat.classList.toggle("is-active", !!(ready && audio.isBeat));
		}
		if (this.refs.bpm) {
			this.refs.bpm.textContent = ready && audio.bpm ? `BPM ${audio.bpm}` : "BPM —";
		}
	}

	_drawSpectrum() {
		const ctx = this.spectrumCtx;
		const canvas = this.spectrumCanvas;
		if (!ctx || !canvas) return;

		const w = canvas.width;
		const h = canvas.height;
		ctx.clearRect(0, 0, w, h);
		ctx.fillStyle = "rgba(255,255,255,0.06)";
		ctx.fillRect(0, 0, w, h);

		const audio = this.audioAnalyzer;
		if (!audio || !audio.isInitialized) return;

		const spectrum = audio.getSpectrum() || [];
		if (!spectrum.length) return;

		const n = spectrum.length;
		const barW = Math.max(w / n, 1);
		const agc = Math.max(audio._agcPeak || 0.01, 0.002);
		const sr = typeof sampleRate === "function" ? sampleRate() : 44100;
		const nyquist = sr / 2;

		// Band colors — same as debug bars (bass / mid / treble)
		const bassColor = [255, 90, 90];
		const midColor = [93, 255, 122];
		const trebleColor = [90, 150, 255];

		const lerpColor = (a, b, t) => [
			Math.round(a[0] + (b[0] - a[0]) * t),
			Math.round(a[1] + (b[1] - a[1]) * t),
			Math.round(a[2] + (b[2] - a[2]) * t),
		];

		const colorForFreq = (hz) => {
			if (hz <= 140) return bassColor;
			if (hz <= 400) {
				return lerpColor(bassColor, midColor, (hz - 140) / (400 - 140));
			}
			if (hz <= 2600) return midColor;
			if (hz <= 5200) {
				return lerpColor(midColor, trebleColor, (hz - 2600) / (5200 - 2600));
			}
			return trebleColor;
		};

		for (let i = 0; i < n; i++) {
			let amp = spectrum[i] || 0;
			if (amp > 1) amp = amp / 255;
			// Match analyzer normalization so the spectrogram is readable with mic levels
			amp = Math.min(1, amp / (agc * 0.85));
			amp = Math.pow(amp, 0.55);
			const barH = amp * h;
			const hz = (i / n) * nyquist;
			const [r, g, b] = colorForFreq(hz);
			const alpha = 0.55 + amp * 0.45;
			ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
			ctx.fillRect(i * barW, h - barH, Math.ceil(barW), barH);
		}
	}

	// ---- Legacy p5-canvas API (no-ops / thin wrappers for old call sites) ----

	draw() {
		this.update();
	}

	setPosition() {
		return this;
	}
}

const debugPanel = new DebugPanel();
// Backward-compatible alias used by README / older sketches
const audioDebugDisplay = debugPanel;
