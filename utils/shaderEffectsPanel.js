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
			<div class="shader-effects-panel__list" data-ref="list"></div>
			<div class="shader-effects-panel__footer" data-ref="footer">
				<select class="shader-effects-panel__template" data-ref="template" title="Effect type"></select>
				<button type="button" class="shader-effects-panel__add" data-ref="add" title="Add effect">+</button>
			</div>
		`;

		document.body.appendChild(panel);
		this.el = panel;
		this.listEl = panel.querySelector("[data-ref='list']");
		this.templateSelect = panel.querySelector("[data-ref='template']");
		this.addBtn = panel.querySelector("[data-ref='add']");

		panel.addEventListener("keydown", (e) => e.stopPropagation());
		this._bindListDnD();
		this._bindAddFooter();
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
		const names =
			typeof this.shaderEffects.getEffectTemplateNames === "function"
				? this.shaderEffects.getEffectTemplateNames()
				: Object.keys(this.shaderEffects.effectTemplates || {}).sort();
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
				const control = this._createNumberControl(effectName, key, value, null, 1);
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
	}

	_openDrawerNames() {
		return new Set(
			[...this.listEl.querySelectorAll(".shader-effects-panel__drawer[open]")].map((el) => el.dataset.effect),
		);
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
			if (typeof value === "number") out.push({key, value});
			else if (Array.isArray(value) && value.length && value.every((v) => typeof v === "number")) {
				out.push({key, value});
			}
		}
		return out;
	}

	_guessRange(key, value) {
		const k = key.toLowerCase();
		const v = Math.abs(Number(value)) || 0;

		// Discrete integers — typed entry allowed but snaps to int + clamped range
		if (k.includes("mode")) return {min: 0, max: 8, step: 1, integer: true};
		if (k.includes("levels")) return {min: 1, max: 32, step: 1, integer: true};
		if (k.includes("sample")) return {min: 1, max: 64, step: 1, integer: true};
		if (k === "debug" || k.includes("invert") || k.includes("animate")) {
			return {min: 0, max: 1, step: 1, integer: true};
		}
		if (k.includes("filtermode") || k.includes("colormode") || k.includes("gridmode") || k.includes("sortmode")) {
			return {min: 0, max: 8, step: 1, integer: true};
		}

		if (
			k.includes("amount") ||
			k.includes("threshold") ||
			k.includes("ratio") ||
			k.includes("opacity") ||
			k.includes("mix") ||
			k.includes("diffuse") ||
			k.includes("strength") ||
			k.includes("falloff") ||
			k.includes("center") ||
			(k.includes("gap") && v <= 1)
		) {
			return {min: 0, max: 1, step: 0.001, integer: false};
		}

		if (k.includes("angle")) return {min: 0, max: Math.PI * 2, step: 0.01, integer: false};
		if (k.includes("octave")) return {min: 1, max: 8, step: 0.1, integer: false};
		if (k.includes("multiplier") || k.includes("speed")) {
			return {min: 0, max: Math.max(5, v * 3 || 5), step: 0.01, integer: false};
		}
		if (k.includes("brightness") || k.includes("gain") || k.includes("scale")) {
			return {min: 0, max: Math.max(2, v * 2 || 2), step: 0.01, integer: false};
		}
		if (k.includes("size") || k.includes("tile") || k.includes("grid") || k.includes("cell") || k.includes("radius")) {
			return {min: 0, max: Math.max(64, v * 2 || 64), step: v >= 10 ? 1 : 0.1, integer: v >= 10};
		}
		if (k.includes("phase") || k.includes("amplitude")) {
			return {min: -Math.max(10, v * 2), max: Math.max(10, v * 2), step: 0.01, integer: false};
		}

		const max = Math.max(1, v * 3, 1);
		return {min: Math.min(0, -max * 0.25), max, step: max > 10 ? 0.1 : 0.01, integer: false};
	}

	_createNumberControl(effectName, key, value, componentIndex, componentCount) {
		const range = this._guessRange(key, value);
		const labelText = componentIndex == null ? key : `${key}[${componentIndex}]`;

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
	}

	update() {
		this.syncFromConfig();
	}
}

const shaderEffectsPanel = new ShaderEffectsPanel();
