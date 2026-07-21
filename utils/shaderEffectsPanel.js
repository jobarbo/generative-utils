/**
 * Shader Effects Panel
 *
 * DOM overlay (similar to debugPanel) to enable/disable ShaderEffects
 * and edit numeric params live. Each effect is a collapsible drawer.
 * Drag the ⠿ handle to reorder the render stack (top = first pass).
 *
 * Usage:
 *   shaderEffectsPanel.init(shaderEffects);
 *   // key E → shaderEffectsPanel.toggle()
 *
 * Separates from #controls / paramsPanel / debugPanel (D).
 */
class ShaderEffectsPanel {
	constructor() {
		this.shaderEffects = null;
		this.visible = false;
		this.el = null;
		this.drawers = new Map(); // effectName -> { root, body, toggle, inputs }
		this._editing = false; // pause external value sync while dragging sliders
		this._dragName = null;
		this._sizeDirty = false; // user edited size fields — don't overwrite until Apply
		this._saveTimer = null;
	}

	/**
	 * @param {object} shaderEffects - ShaderEffects instance
	 */
	init(shaderEffects) {
		this.shaderEffects = shaderEffects || (typeof window !== "undefined" ? window.shaderEffects : null);
		if (!this.shaderEffects?.effectsConfig) {
			console.warn("[shaderEffectsPanel] shaderEffects.effectsConfig missing");
			return this;
		}

		this._ensureDom();
		this._rebuildDrawers();
		this._applyVisibility();
		console.log("[shaderEffectsPanel] ready — press E to toggle (drag ⠿ to reorder)");
		return this;
	}

	toggle() {
		this.visible = !this.visible;
		this._applyVisibility();
		if (this.visible) this.syncFromConfig();
		console.log(`[shaderEffectsPanel] ${this.visible ? "ON" : "OFF"}`);
		return this;
	}

	show() {
		this.visible = true;
		this._applyVisibility();
		this.syncFromConfig();
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

	_ensureDom() {
		if (this.el) return;

		const panel = document.createElement("div");
		panel.id = "shader-effects-panel";
		panel.className = "shader-effects-panel is-hidden";
		panel.setAttribute("aria-hidden", "true");

		panel.innerHTML = `
			<div class="shader-effects-panel__header">
				<span class="shader-effects-panel__title">Shaders</span>
				<span class="shader-effects-panel__hint">E · drag ⠿</span>
			</div>
			<section class="shader-effects-panel__output" data-ref="output">
				<div class="shader-effects-panel__output-title">Output</div>
				<label class="shader-effects-panel__control shader-effects-panel__control--bool">
					<input type="checkbox" class="shader-effects-panel__bool" data-ref="fit-canvas" title="Map full texture (no crop)" />
					<span class="shader-effects-panel__bool-label">fit canvas (no crop)</span>
				</label>
				<label class="shader-effects-panel__control shader-effects-panel__control--bool">
					<input type="checkbox" class="shader-effects-panel__bool" data-ref="crisp" title="Nearest filtering — sharp colors when upscaled" checked />
					<span class="shader-effects-panel__bool-label">crisp pixels (no blur)</span>
				</label>
				<div class="shader-effects-panel__output-row">
					<span class="shader-effects-panel__output-label">ratio</span>
					<input type="number" class="shader-effects-panel__number" data-ref="ratio-w" min="0.01" step="0.01" title="Crop aspect width" />
					<span class="shader-effects-panel__output-sep">:</span>
					<input type="number" class="shader-effects-panel__number" data-ref="ratio-h" min="0.01" step="0.01" title="Crop aspect height" />
					<select class="shader-effects-panel__preset" data-ref="ratio-preset" title="Ratio presets">
						<option value="">custom</option>
						<option value="1:1">1:1</option>
						<option value="16:9">16:9</option>
						<option value="9:16">9:16</option>
						<option value="4:3">4:3</option>
						<option value="3:4">3:4</option>
						<option value="21:9">21:9</option>
						<option value="10:1">10:1</option>
					</select>
				</div>
				<div class="shader-effects-panel__output-row">
					<span class="shader-effects-panel__output-label">size</span>
					<input type="number" class="shader-effects-panel__number" data-ref="size-w" min="16" step="1" title="Canvas width" />
					<span class="shader-effects-panel__output-sep">×</span>
					<input type="number" class="shader-effects-panel__number" data-ref="size-h" min="16" step="1" title="Canvas height" />
					<button type="button" class="shader-effects-panel__apply" data-ref="size-apply" title="Apply canvas resolution">ok</button>
				</div>
			</section>
			<div class="shader-effects-panel__list" data-ref="list"></div>
			<div class="shader-effects-panel__footer" data-ref="footer">
				<select class="shader-effects-panel__template" data-ref="template" title="Effect type"></select>
				<button type="button" class="shader-effects-panel__add" data-ref="add" title="Add effect">+</button>
				<label class="shader-effects-panel__clear" title="Clear saved shader settings from localStorage and restore defaults">
					<input type="checkbox" data-ref="clear-storage" />
					<span>Clear saved</span>
				</label>
			</div>
		`;

		document.body.appendChild(panel);
		this.el = panel;
		this.listEl = panel.querySelector("[data-ref='list']");
		this.templateSelect = panel.querySelector("[data-ref='template']");
		this.addBtn = panel.querySelector("[data-ref='add']");
		this.clearStorageCheckbox = panel.querySelector("[data-ref='clear-storage']");
		this.outputRefs = {
			fit: panel.querySelector("[data-ref='fit-canvas']"),
			crisp: panel.querySelector("[data-ref='crisp']"),
			ratioW: panel.querySelector("[data-ref='ratio-w']"),
			ratioH: panel.querySelector("[data-ref='ratio-h']"),
			preset: panel.querySelector("[data-ref='ratio-preset']"),
			sizeW: panel.querySelector("[data-ref='size-w']"),
			sizeH: panel.querySelector("[data-ref='size-h']"),
			apply: panel.querySelector("[data-ref='size-apply']"),
		};

		panel.addEventListener("keydown", (e) => e.stopPropagation());
		this._bindListDnD();
		this._bindAddFooter();
		this._bindClearStorageCheckbox();
		this._bindOutputControls();
		this._syncOutputControls();
	}

	_bindOutputControls() {
		const r = this.outputRefs;
		if (!r?.fit || r.fit.dataset.bound) return;
		r.fit.dataset.bound = "1";

		const stop = (e) => e.stopPropagation();
		["pointerdown", "mousedown", "click", "keydown"].forEach((ev) => {
			r.fit.addEventListener(ev, stop);
			if (r.crisp) r.crisp.addEventListener(ev, stop);
			r.ratioW.addEventListener(ev, stop);
			r.ratioH.addEventListener(ev, stop);
			r.preset.addEventListener(ev, stop);
			r.sizeW.addEventListener(ev, stop);
			r.sizeH.addEventListener(ev, stop);
			r.apply.addEventListener(ev, stop);
		});

		const commitRatio = () => {
			if (!this.shaderEffects?.setRenderRatio) return;
			const w = Math.max(parseFloat(r.ratioW.value) || 1, 0.01);
			const h = Math.max(parseFloat(r.ratioH.value) || 1, 0.01);
			this.shaderEffects.setRenderRatio({
				fitCanvas: r.fit.checked,
				width: w,
				height: h,
			});
			this._updateRatioPresetMatch();
			this._setRatioFieldsEnabled(!r.fit.checked);
			this._scheduleSave();
		};

		r.fit.addEventListener("change", commitRatio);
		if (r.crisp) {
			r.crisp.addEventListener("change", () => {
				if (typeof this.shaderEffects?.setCrispPixels === "function") {
					this.shaderEffects.setCrispPixels(r.crisp.checked);
					this._scheduleSave();
				}
			});
		}
		r.ratioW.addEventListener("change", commitRatio);
		r.ratioH.addEventListener("change", commitRatio);
		r.ratioW.addEventListener("keydown", (e) => {
			if (e.key === "Enter") commitRatio();
		});
		r.ratioH.addEventListener("keydown", (e) => {
			if (e.key === "Enter") commitRatio();
		});

		r.preset.addEventListener("change", () => {
			const val = r.preset.value;
			if (!val) return;
			const [w, h] = val.split(":").map(Number);
			if (!w || !h) return;
			r.ratioW.value = String(w);
			r.ratioH.value = String(h);
			r.fit.checked = false;
			commitRatio();
		});

		const markSizeDirty = () => {
			this._sizeDirty = true;
		};
		r.sizeW.addEventListener("input", markSizeDirty);
		r.sizeH.addEventListener("input", markSizeDirty);

		const applySize = () => {
			if (!this.shaderEffects?.resize || this._applyingSize) return;
			const w = parseFloat(r.sizeW.value);
			const h = parseFloat(r.sizeH.value);
			if (!Number.isFinite(w) || !Number.isFinite(h) || w < 16 || h < 16) {
				console.warn("[shaderEffectsPanel] invalid size — need both W and H ≥ 16");
				return;
			}

			this._applyingSize = true;
			this._editing = true;
			this._sizeDirty = false;
			try {
				this.shaderEffects.resize(w, h);
				const size = this.shaderEffects.getCanvasSize?.() || {width: w, height: h};
				r.sizeW.value = String(Math.round(size.width || w));
				r.sizeH.value = String(Math.round(size.height || h));
			} finally {
				// Delay unlock so blur/click can't double-fire in the same gesture
				requestAnimationFrame(() => {
					this._editing = false;
					this._applyingSize = false;
				});
			}
		};

		// pointerdown reads values before focus moves — one apply, no blur race
		r.apply.addEventListener("pointerdown", (e) => {
			e.preventDefault();
			e.stopPropagation();
			applySize();
		});
		r.apply.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
		});
		r.sizeW.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				applySize();
			}
		});
		r.sizeH.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				applySize();
			}
		});
	}

	_setRatioFieldsEnabled(enabled) {
		const r = this.outputRefs;
		if (!r) return;
		r.ratioW.disabled = !enabled;
		r.ratioH.disabled = !enabled;
		r.preset.disabled = !enabled;
	}

	_updateRatioPresetMatch() {
		const r = this.outputRefs;
		if (!r?.preset) return;
		const w = parseFloat(r.ratioW.value);
		const h = parseFloat(r.ratioH.value);
		let match = "";
		for (const opt of r.preset.options) {
			if (!opt.value) continue;
			const [pw, ph] = opt.value.split(":").map(Number);
			if (Math.abs(w / h - pw / ph) < 0.001) {
				match = opt.value;
				break;
			}
		}
		r.preset.value = match;
	}

	_syncOutputControls() {
		const r = this.outputRefs;
		const se = this.shaderEffects;
		if (!r || !se) return;

		const ratio = typeof se.getRenderRatio === "function" ? se.getRenderRatio() : se.renderRatio || {};
		if (document.activeElement !== r.fit) r.fit.checked = !!ratio.fitCanvas;
		if (r.crisp && document.activeElement !== r.crisp) {
			r.crisp.checked = typeof se.getCrispPixels === "function" ? se.getCrispPixels() : !!se.crispPixels;
		}
		if (document.activeElement !== r.ratioW) r.ratioW.value = String(ratio.width ?? 1);
		if (document.activeElement !== r.ratioH) r.ratioH.value = String(ratio.height ?? 1);
		this._setRatioFieldsEnabled(!ratio.fitCanvas);
		this._updateRatioPresetMatch();

		// Don't clobber in-progress size edits (otherwise Apply reads reset values)
		if (this._sizeDirty) return;

		const size = typeof se.getCanvasSize === "function" ? se.getCanvasSize() : {width: 0, height: 0};
		if (document.activeElement !== r.sizeW && size.width) r.sizeW.value = String(Math.round(size.width));
		if (document.activeElement !== r.sizeH && size.height) r.sizeH.value = String(Math.round(size.height));
	}

	_bindAddFooter() {
		if (!this.addBtn || this.addBtn.dataset.bound) return;
		this.addBtn.dataset.bound = "1";
		this.addBtn.addEventListener("click", (e) => {
			e.preventDefault();
			const type = this.templateSelect?.value;
			if (type) this._createEffect(type);
		});
	}

	_fillTemplateSelect() {
		if (!this.templateSelect || !this.shaderEffects) return;
		const names = typeof this.shaderEffects.getEffectTemplateNames === "function" ? this.shaderEffects.getEffectTemplateNames() : Object.keys(this.shaderEffects.effectTemplates || {}).sort();
		const prev = this.templateSelect.value;
		this.templateSelect.innerHTML = "";
		for (const name of names) {
			const opt = document.createElement("option");
			opt.value = name;
			opt.textContent = name;
			this.templateSelect.appendChild(opt);
		}
		if (prev && names.includes(prev)) this.templateSelect.value = prev;
		this.templateSelect.disabled = !names.length;
		if (this.addBtn) this.addBtn.disabled = !names.length;
	}

	_bindListDnD() {
		const list = this.listEl;
		if (!list || list.dataset.dndBound) return;
		list.dataset.dndBound = "1";

		list.addEventListener("dragover", (e) => {
			e.preventDefault();
			const drawer = e.target.closest?.(".shader-effects-panel__drawer");
			if (!drawer || !this._dragName) return;
			e.dataTransfer.dropEffect = "move";

			const rect = drawer.getBoundingClientRect();
			const before = e.clientY < rect.top + rect.height / 2;
			list.querySelectorAll(".shader-effects-panel__drawer").forEach((el) => {
				el.classList.remove("is-drop-before", "is-drop-after");
			});
			drawer.classList.add(before ? "is-drop-before" : "is-drop-after");
		});

		list.addEventListener("dragleave", (e) => {
			if (!list.contains(e.relatedTarget)) {
				list.querySelectorAll(".shader-effects-panel__drawer").forEach((el) => {
					el.classList.remove("is-drop-before", "is-drop-after");
				});
			}
		});

		list.addEventListener("drop", (e) => {
			e.preventDefault();
			const target = e.target.closest?.(".shader-effects-panel__drawer");
			list.querySelectorAll(".shader-effects-panel__drawer").forEach((el) => {
				el.classList.remove("is-drop-before", "is-drop-after", "is-dragging");
			});

			const fromName = this._dragName || e.dataTransfer.getData("text/plain");
			this._dragName = null;
			if (!fromName || !target) return;

			const toName = target.dataset.effect;
			if (!toName || toName === fromName) return;

			const rect = target.getBoundingClientRect();
			const placeBefore = e.clientY < rect.top + rect.height / 2;
			this._reorderDomAndConfig(fromName, toName, placeBefore);
		});
	}

	_reorderDomAndConfig(fromName, toName, placeBefore) {
		const fromEl = this.drawers.get(fromName)?.root;
		const toEl = this.drawers.get(toName)?.root;
		if (!fromEl || !toEl || !this.listEl) return;

		if (placeBefore) this.listEl.insertBefore(fromEl, toEl);
		else this.listEl.insertBefore(fromEl, toEl.nextSibling);

		const order = [...this.listEl.querySelectorAll(".shader-effects-panel__drawer")].map((el) => el.dataset.effect);
		if (typeof this.shaderEffects.reorderEffects === "function") {
			this.shaderEffects.reorderEffects(order);
		}
		console.log("[shaderEffectsPanel] order:", order.join(" → "));
		this._scheduleSave();
	}

	_rebuildDrawers() {
		if (!this.listEl || !this.shaderEffects) return;
		this.listEl.innerHTML = "";
		this.drawers.clear();

		const config = this.shaderEffects.effectsConfig;
		for (const effectName of Object.keys(config)) {
			this.listEl.appendChild(this._createDrawer(effectName, config[effectName]));
		}
		this._fillTemplateSelect();
	}

	_createDrawer(effectName, effect) {
		const drawer = document.createElement("details");
		drawer.className = "shader-effects-panel__drawer";
		drawer.dataset.effect = effectName;
		if (effect.enabled) drawer.classList.add("is-enabled");

		const summary = document.createElement("summary");
		summary.className = "shader-effects-panel__summary";

		const handle = document.createElement("span");
		handle.className = "shader-effects-panel__handle";
		handle.textContent = "⠿";
		handle.title = "Drag to reorder render stack";
		handle.draggable = true;
		handle.addEventListener("click", (e) => e.preventDefault());
		handle.addEventListener("pointerdown", (e) => e.stopPropagation());
		handle.addEventListener("dragstart", (e) => {
			this._dragName = effectName;
			drawer.classList.add("is-dragging");
			e.dataTransfer.effectAllowed = "move";
			e.dataTransfer.setData("text/plain", effectName);
			try {
				e.dataTransfer.setDragImage(drawer, 16, 16);
			} catch (_) {
				/* ignore */
			}
		});
		handle.addEventListener("dragend", () => {
			this._dragName = null;
			this.listEl?.querySelectorAll(".shader-effects-panel__drawer").forEach((el) => {
				el.classList.remove("is-dragging", "is-drop-before", "is-drop-after");
			});
		});

		const toggle = document.createElement("input");
		toggle.type = "checkbox";
		toggle.className = "shader-effects-panel__enable";
		toggle.checked = !!effect.enabled;
		toggle.title = "Enable effect";
		toggle.addEventListener("click", (e) => e.stopPropagation());
		toggle.addEventListener("change", () => {
			this.shaderEffects.setEffectEnabled(effectName, toggle.checked);
			drawer.classList.toggle("is-enabled", toggle.checked);
			this._scheduleSave();
		});

		const label = document.createElement("span");
		label.className = "shader-effects-panel__name";
		label.textContent = effectName;

		const cloneBtn = document.createElement("button");
		cloneBtn.type = "button";
		cloneBtn.className = "shader-effects-panel__clone";
		cloneBtn.title = "Clone / overdub (stack another instance)";
		cloneBtn.textContent = "+";
		cloneBtn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this._cloneEffect(effectName);
		});

		const removeBtn = document.createElement("button");
		removeBtn.type = "button";
		removeBtn.className = "shader-effects-panel__remove";
		removeBtn.title = "Remove effect";
		removeBtn.textContent = "×";
		removeBtn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this._removeEffect(effectName);
		});

		summary.appendChild(handle);
		summary.appendChild(toggle);
		summary.appendChild(label);
		summary.appendChild(cloneBtn);
		summary.appendChild(removeBtn);

		const body = document.createElement("div");
		body.className = "shader-effects-panel__body";

		const inputs = new Map();
		const params = this._editableParams(effect);
		for (const {key, value} of params) {
			if (Array.isArray(value)) {
				value.forEach((comp, idx) => {
					if (typeof comp !== "number") return;
					const control = this._createNumberControl(effectName, key, comp, idx, value.length);
					body.appendChild(control.root);
					inputs.set(`${key}.${idx}`, control);
				});
			} else if (typeof value === "number") {
				const control = this._isBoolParam(key) ? this._createBoolControl(effectName, key, value) : this._createNumberControl(effectName, key, value, null, 1);
				body.appendChild(control.root);
				inputs.set(key, control);
			}
		}

		if (!params.length) {
			const empty = document.createElement("div");
			empty.className = "shader-effects-panel__empty";
			empty.textContent = "No editable params";
			body.appendChild(empty);
		}

		drawer.appendChild(summary);
		drawer.appendChild(body);

		this.drawers.set(effectName, {root: drawer, body, toggle, inputs});
		return drawer;
	}

	_cloneEffect(sourceName) {
		if (!this.shaderEffects || typeof this.shaderEffects.cloneEffect !== "function") {
			console.warn("[shaderEffectsPanel] cloneEffect unavailable");
			return;
		}

		const openNames = this._openDrawerNames();
		const newName = this.shaderEffects.cloneEffect(sourceName);
		if (!newName) return;

		this._rebuildDrawers();
		this._restoreOpenDrawers(openNames, newName);
		this._scheduleSave();
	}

	_createEffect(templateName) {
		if (!this.shaderEffects || typeof this.shaderEffects.createEffect !== "function") {
			console.warn("[shaderEffectsPanel] createEffect unavailable");
			return;
		}

		const openNames = this._openDrawerNames();
		const newName = this.shaderEffects.createEffect(templateName);
		if (!newName) return;

		this._rebuildDrawers();
		this._restoreOpenDrawers(openNames, newName);
		this._scheduleSave();
	}

	_removeEffect(effectName) {
		if (!this.shaderEffects || typeof this.shaderEffects.removeEffect !== "function") {
			console.warn("[shaderEffectsPanel] removeEffect unavailable");
			return;
		}

		const openNames = this._openDrawerNames();
		openNames.delete(effectName);
		this.shaderEffects.removeEffect(effectName);
		this._rebuildDrawers();
		this._restoreOpenDrawers(openNames);
		this._scheduleSave();
	}

	_openDrawerNames() {
		return new Set([...this.listEl.querySelectorAll(".shader-effects-panel__drawer[open]")].map((el) => el.dataset.effect));
	}

	_restoreOpenDrawers(openNames, focusName = null) {
		for (const name of openNames) {
			const d = this.drawers.get(name)?.root;
			if (d) d.open = true;
		}
		if (focusName) {
			const created = this.drawers.get(focusName)?.root;
			if (created) {
				created.open = true;
				created.scrollIntoView({block: "nearest", behavior: "smooth"});
			}
		}
	}

	_editableParams(effect) {
		const out = [];
		for (const [key, value] of Object.entries(effect)) {
			if (key === "enabled" || key === "uniforms" || key === "pass") continue;
			if (key.startsWith("_")) continue; // internal snapshots
			// Accumulated phases — driven by speed, not hand-edited
			if (key === "translationPhaseX" || key === "translationPhaseY" || key === "rotationPhase") continue;
			if (typeof value === "number") out.push({key, value});
			else if (Array.isArray(value) && value.length && value.every((v) => typeof v === "number")) {
				out.push({key, value});
			}
		}
		return out;
	}

	_isBoolParam(key) {
		const k = String(key).toLowerCase();
		return (
			k === "debug" ||
			k === "translationenabled" ||
			k === "rotationenabled" ||
			k === "animatezoom" ||
			k === "aspectcorrect" ||
			k === "blurcrt" ||
			k.includes("invert") ||
			(k.includes("animate") && !k.includes("amount"))
		);
	}

	/**
	 * Exact per-param limits (modes, ints, known 0–1 caps).
	 * Checked before heuristics so enums never get a generic 0–8.
	 */
	_paramLimits(key) {
		const k = String(key).toLowerCase();

		/** @type {Record<string, {min:number,max:number,step:number,integer?:boolean}>} */
		const exact = {
			// —— Modes / enums ——
			symmetrymode: {min: 0, max: 6, step: 1, integer: true}, // H V 2 4 8 16 radial
			translationmode: {min: 0, max: 4, step: 1, integer: true}, // sine noise FBM vf scroll
			rotationmode: {min: 0, max: 2, step: 1, integer: true}, // cos noise FBM
			sortmode: {min: 1, max: 4, step: 1, integer: true}, // sine noise FBM vf
			gridmode: {min: 0, max: 1, step: 1, integer: true}, // pixel / diffuse
			dithermode: {min: 0, max: 4, step: 1, integer: true}, // bayer4/8 hash line cluster
			colormode: {min: 0, max: 1, step: 1, integer: true}, // luma / per-channel
			easingmode: {min: 0, max: 5, step: 1, integer: true}, // sine…bounce
			outofboundsmode: {min: 0, max: 3, step: 1, integer: true}, // black clamp mirror alpha
			blurmode: {min: 0, max: 2, step: 1, integer: true}, // gaussian radial directional
			filtermode: {min: 0, max: 1, step: 1, integer: true}, // true pixel / filter overlay

			// —— Discrete counts ——
			samplecount: {min: 1, max: 64, step: 1, integer: true},
			levels: {min: 2, max: 256, step: 1, integer: true},
			octave: {min: 1, max: 36, step: 1, integer: true},
			blurquality: {min: 1, max: 128, step: 1, integer: true},

			// —— Degrees / angles ——
			rotationstartingangle: {min: 0, max: 360, step: 0.1},
			angle: {min: 0, max: Math.PI * 2, step: 0.01},
			blurdirection: {min: 0, max: Math.PI * 2, step: 0.01},

			// —— Known units ——
			gridsize: {min: 1, max: 1440, step: 1, integer: true},
			sortamount: {min: 0, max: 120, step: 0.1},
			translationspeedx: {min: 0, max: 5, step: 0.01},
			translationspeedy: {min: 0, max: 5, step: 0.01},
			spiralamount: {min: 0, max: 3, step: 0.01},
			spiralfrequency: {min: 0, max: 48, step: 0.1},
			spiralspeed: {min: 0, max: 5, step: 0.01},
			pulsespeed: {min: 0, max: 5, step: 0.01},
			pulseamount: {min: 0, max: 1, step: 0.01},
			falloff: {min: 0.1, max: 2.5, step: 0.01},
			waveamount: {min: 0, max: 0.15, step: 0.001},
			wavefrequency: {min: 0, max: 8, step: 0.01},
			cellratio: {min: 0, max: 4, step: 0.01},
			mix: {min: 0, max: 1, step: 0.001}, // shader clamp
			blurstart: {min: 0, max: 1, step: 0.01},
			blurmin: {min: 0, max: 1, step: 0.01},
			blurcrtpower: {min: 1, max: 64, step: 0.1},
			gapbrightness: {min: 0, max: 1, step: 0.01},
		};

		if (exact[k]) {
			const r = exact[k];
			return {min: r.min, max: r.max, step: r.step, integer: !!r.integer};
		}
		return null;
	}

	_guessRange(key, value) {
		const k = key.toLowerCase();
		const v = Math.abs(Number(value)) || 0;

		const exact = this._paramLimits(key);
		if (exact) return exact;

		if (this._isBoolParam(key)) {
			return {min: 0, max: 1, step: 1, integer: true};
		}

		// Remaining *Mode enums (keep tight if name ends with Mode)
		if (k.endsWith("mode")) {
			return {min: 0, max: 8, step: 1, integer: true};
		}

		// 0–1 normalized / blend-style (exclude amplified *Amount params)
		const amplifiedAmount = k.includes("zoom") || k.includes("sort") || k.includes("blur") || k.includes("spiral") || k.includes("wave") || k.includes("pulse") || k === "warpamount";
		if (
			!amplifiedAmount &&
			(k === "amount" ||
				k.endsWith("amount") ||
				k.includes("threshold") ||
				k.includes("opacity") ||
				k.includes("diffuse") ||
				k.includes("strength") ||
				k.includes("center") ||
				k.includes("vignette") ||
				k.includes("inset") ||
				k.includes("smooth") ||
				(k.includes("gap") && v <= 1))
		) {
			// Tiny chromatic-style amounts get a finer range
			if (k === "amount" && v > 0 && v < 0.05) {
				return {min: 0, max: 0.05, step: 0.0001, integer: false};
			}
			return {min: 0, max: 1, step: 0.001, integer: false};
		}

		if (k.includes("ratio") && k !== "cellratio") {
			return {min: 0, max: 1, step: 0.001, integer: false};
		}

		if (k.includes("angle") || k.includes("direction")) {
			return {min: 0, max: Math.PI * 2, step: 0.01, integer: false};
		}

		if (k.includes("multiplier") || (k.includes("speed") && !k.includes("line"))) {
			return {min: 0, max: Math.max(5, v * 3 || 5), step: 0.01, integer: false};
		}

		if (k.includes("zoom")) {
			return {min: 0, max: Math.max(8, v * 2 || 8), step: 0.01, integer: false};
		}

		if (k === "warpamount" || k.includes("intensity") || k.includes("density")) {
			return {min: 0, max: Math.max(1, v * 2 || 1), step: v > 10 ? 0.1 : 0.01, integer: false};
		}

		if (k.includes("brightness") || k.includes("gain") || k.includes("scale")) {
			return {min: 0, max: Math.max(2, v * 2 || 2), step: 0.01, integer: false};
		}

		if (k.includes("bluramount") || (k.includes("blur") && k.includes("amount"))) {
			return {min: 0, max: Math.max(64, v * 2 || 64), step: 0.1, integer: false};
		}

		if (k.includes("size") || k.includes("tile") || k.includes("grid") || k.includes("cell") || k.includes("radius")) {
			return {min: 0, max: Math.max(64, v * 2 || 64), step: v >= 10 ? 1 : 0.1, integer: v >= 10};
		}

		if (k.includes("amplitude")) {
			return {min: 0, max: Math.max(100, v * 2 || 100), step: 0.1, integer: false};
		}

		if (k.includes("phase")) {
			return {min: -Math.max(10, v * 2), max: Math.max(10, v * 2), step: 0.01, integer: false};
		}

		const max = Math.max(1, v * 3, 1);
		return {min: Math.min(0, -max * 0.25), max, step: max > 10 ? 0.1 : 0.01, integer: false};
	}

	_createBoolControl(effectName, key, value) {
		const root = document.createElement("label");
		root.className = "shader-effects-panel__control shader-effects-panel__control--bool";

		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.className = "shader-effects-panel__bool";
		checkbox.checked = Number(value) > 0.5;
		const boolLabels = {
			debug: "debug (guides)",
			translationEnabled: "translation",
			rotationEnabled: "rotation",
			animateZoom: "animate zoom",
			aspectCorrect: "aspect correct",
			blurCrt: "blur CRT shape",
			invert: "invert",
		};
		checkbox.title = boolLabels[key] ? `Toggle ${boolLabels[key]}` : `Toggle ${key}`;

		const nameEl = document.createElement("span");
		nameEl.className = "shader-effects-panel__bool-label";
		nameEl.textContent = boolLabels[key] || key;

		checkbox.addEventListener("change", () => {
			this._applyParam(effectName, key, checkbox.checked ? 1 : 0, null, 1);
		});

		root.appendChild(checkbox);
		root.appendChild(nameEl);

		return {root, input: checkbox, key, componentIndex: null, bool: true};
	}

	_paramLabel(key, componentIndex, componentCount) {
		const k = String(key).toLowerCase();
		const labels = {
			translationspeedx: "translation speed X",
			translationspeedy: "translation speed Y",
			translationmode: "translation mode (0–4)",
			symmetrymode: "symmetry mode (0–6)",
			rotationmode: "rotation mode (0–2)",
			rotationstartingangle: "rotation amount (°)",
			spiralamount: "spiral amount",
			spiralfrequency: "spiral frequency",
			spiralspeed: "spiral speed",
			pulseamount: "pulse amount",
			pulsespeed: "pulse speed",
			waveamount: "wave amount",
			wavefrequency: "wave frequency",
			sortamount: "sort amount",
			sortmode: "sort mode (1–4)",
			samplecount: "sample count",
			gridmode: "grid mode (0 pixel / 1 diffuse)",
			dithermode: "dither mode (0–4)",
			colormode: "color mode (0–1)",
			easingmode: "easing mode (0–5)",
			outofboundsmode: "bounds mode (0–3)",
			blurmode: "blur mode (0–2)",
			filtermode: "filter mode (0–1)",
			blurquality: "blur quality",
			blurdirection: "blur direction",
			levels: "levels (2–256)",
		};
		if (labels[k]) return labels[k];

		if (componentIndex == null) return key;

		const axis2 = ["X", "Y"];
		const axis3 = ["X", "Y", "Z"];
		const axis4 = ["X", "Y", "Z", "W"];
		const rgb = ["R", "G", "B"];
		const rgba = ["R", "G", "B", "A"];

		if (k === "gridsize" && componentCount === 2) {
			return `pixel ${axis2[componentIndex] || componentIndex}`;
		}
		if ((k === "center" || k.includes("center") || k.includes("offset") || k.includes("position") || k.includes("origin")) && componentCount === 2) {
			return `${key} ${axis2[componentIndex] || componentIndex}`;
		}
		if (k.includes("color") || k.includes("rgb")) {
			const labels = componentCount === 4 ? rgba : rgb;
			if (componentIndex < labels.length) return `${key} ${labels[componentIndex]}`;
		}
		if (componentCount === 2) return `${key} ${axis2[componentIndex] || `[${componentIndex}]`}`;
		if (componentCount === 3) return `${key} ${axis3[componentIndex] || `[${componentIndex}]`}`;
		if (componentCount === 4) return `${key} ${axis4[componentIndex] || `[${componentIndex}]`}`;
		return `${key}[${componentIndex}]`;
	}

	_createNumberControl(effectName, key, value, componentIndex, componentCount) {
		const range = this._guessRange(key, value);
		const labelText = this._paramLabel(key, componentIndex, componentCount);

		const root = document.createElement("div");
		root.className = "shader-effects-panel__control";

		const meta = document.createElement("div");
		meta.className = "shader-effects-panel__control-meta";

		const nameEl = document.createElement("span");
		nameEl.textContent = labelText;

		const numberInput = document.createElement("input");
		numberInput.type = "number";
		numberInput.className = "shader-effects-panel__number";
		numberInput.min = String(range.min);
		numberInput.max = String(range.max);
		numberInput.step = String(range.step);
		numberInput.value = this._formatValue(value);
		numberInput.title = range.integer ? "Integer only" : "Type a value";
		if (range.integer) numberInput.dataset.integer = "1";

		meta.appendChild(nameEl);
		meta.appendChild(numberInput);

		const slider = document.createElement("input");
		slider.type = "range";
		slider.className = "shader-effects-panel__slider";
		slider.min = String(range.min);
		slider.max = String(range.max);
		slider.step = String(range.step);
		slider.value = String(value);
		slider.dataset.effect = effectName;
		slider.dataset.param = key;
		if (componentIndex != null) slider.dataset.index = String(componentIndex);

		const setViews = (num) => {
			slider.value = String(num);
			numberInput.value = this._formatValue(num);
		};

		const commit = (raw, {fromNumber = false} = {}) => {
			let num = parseFloat(raw);
			if (!Number.isFinite(num)) {
				numberInput.value = this._formatValue(parseFloat(slider.value));
				return;
			}

			if (range.integer) {
				num = Math.round(num);
				num = Math.min(range.max, Math.max(range.min, num));
			} else if (fromNumber) {
				// Free float entry: expand slider range if needed
				if (num < parseFloat(slider.min)) slider.min = String(num);
				if (num > parseFloat(slider.max)) slider.max = String(num);
				numberInput.min = slider.min;
				numberInput.max = slider.max;
			} else {
				num = Math.min(parseFloat(slider.max), Math.max(parseFloat(slider.min), num));
			}

			setViews(num);
			this._applyParam(effectName, key, num, componentIndex, componentCount);
		};

		slider.addEventListener("pointerdown", () => {
			this._editing = true;
		});
		slider.addEventListener("pointerup", () => {
			this._editing = false;
		});
		slider.addEventListener("input", () => commit(slider.value));
		slider.addEventListener("change", () => {
			this._editing = false;
			commit(slider.value);
		});

		numberInput.addEventListener("focus", () => {
			this._editing = true;
		});
		numberInput.addEventListener("blur", () => {
			commit(numberInput.value, {fromNumber: !range.integer});
			this._editing = false;
		});
		numberInput.addEventListener("keydown", (e) => {
			e.stopPropagation();
			if (e.key === "Enter") {
				commit(numberInput.value, {fromNumber: !range.integer});
				numberInput.blur();
			}
			if (e.key === "Escape") {
				numberInput.value = this._formatValue(parseFloat(slider.value));
				numberInput.blur();
			}
		});
		// Keep slider in sync while typing (integers snap live)
		numberInput.addEventListener("input", () => {
			if (range.integer) {
				const n = parseFloat(numberInput.value);
				if (Number.isFinite(n)) {
					const snapped = Math.min(range.max, Math.max(range.min, Math.round(n)));
					slider.value = String(snapped);
					this._applyParam(effectName, key, snapped, componentIndex, componentCount);
				}
			}
		});

		root.appendChild(meta);
		root.appendChild(slider);

		return {root, input: slider, numberInput, key, componentIndex, integer: !!range.integer};
	}

	_formatValue(num) {
		if (!Number.isFinite(num)) return "—";
		const abs = Math.abs(num);
		if (Number.isInteger(num) || abs >= 100) return String(Math.round(num));
		if (abs >= 10) return num.toFixed(1);
		if (abs >= 1) return num.toFixed(2);
		return num.toFixed(3);
	}

	_applyParam(effectName, key, num, componentIndex, componentCount) {
		const effect = this.shaderEffects?.effectsConfig?.[effectName];
		if (!effect) return;

		if (componentIndex != null) {
			const current = Array.isArray(effect[key]) ? [...effect[key]] : Array(componentCount).fill(0);
			current[componentIndex] = num;
			this.shaderEffects.updateEffectParam(effectName, key, current);
		} else {
			this.shaderEffects.updateEffectParam(effectName, key, num);
		}
		this._scheduleSave();
	}

	_persistEnabled() {
		return typeof PERSIST_SHADER_PANEL === "undefined" || !!PERSIST_SHADER_PANEL;
	}

	_scheduleSave() {
		if (!this._persistEnabled() || !this.shaderEffects?.savePersistedPanelConfig) return;
		if (this._saveTimer) clearTimeout(this._saveTimer);
		this._saveTimer = setTimeout(() => {
			this._saveTimer = null;
			this.shaderEffects.savePersistedPanelConfig();
		}, 400);
	}

	_bindClearStorageCheckbox() {
		if (!this.clearStorageCheckbox || this.clearStorageCheckbox.dataset.bound) return;
		this.clearStorageCheckbox.dataset.bound = "1";
		this.clearStorageCheckbox.addEventListener("change", () => {
			if (!this.clearStorageCheckbox.checked) return;
			this._resetPersistedConfig();
			this.clearStorageCheckbox.checked = false;
		});
	}

	_resetPersistedConfig() {
		if (!this.shaderEffects) return;
		if (this._saveTimer) {
			clearTimeout(this._saveTimer);
			this._saveTimer = null;
		}
		if (typeof this.shaderEffects.clearPersistedPanelConfig === "function") {
			this.shaderEffects.clearPersistedPanelConfig();
		}
		if (typeof this.shaderEffects.resetToDefaultPanelConfig === "function") {
			this.shaderEffects.resetToDefaultPanelConfig();
		}
		this._rebuildDrawers();
		this._syncOutputControls();
		console.log("[shaderEffectsPanel] cleared saved shaders and restored defaults");
	}

	syncFromConfig() {
		if (!this.visible || this._editing || !this.shaderEffects) return;

		for (const [effectName, drawer] of this.drawers) {
			const effect = this.shaderEffects.effectsConfig[effectName];
			if (!effect) continue;

			if (drawer.toggle) {
				drawer.toggle.checked = !!effect.enabled;
				drawer.root.classList.toggle("is-enabled", !!effect.enabled);
			}

			for (const [, control] of drawer.inputs) {
				let value;
				if (control.componentIndex != null) {
					value = effect[control.key]?.[control.componentIndex];
				} else {
					value = effect[control.key];
				}
				if (typeof value !== "number") continue;

				if (control.bool) {
					control.input.checked = value > 0.5;
					continue;
				}

				const min = parseFloat(control.input.min);
				const max = parseFloat(control.input.max);
				if (!control.integer) {
					if (value < min) {
						control.input.min = String(value);
						if (control.numberInput) control.numberInput.min = String(value);
					}
					if (value > max) {
						control.input.max = String(value);
						if (control.numberInput) control.numberInput.max = String(value);
					}
				}

				control.input.value = String(value);
				if (control.numberInput) control.numberInput.value = this._formatValue(value);
			}
		}

		this._syncOutputControls();
	}

	update() {
		this.syncFromConfig();
	}
}

const shaderEffectsPanel = new ShaderEffectsPanel();
