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
		`;

		document.body.appendChild(panel);
		this.el = panel;
		this.listEl = panel.querySelector("[data-ref='list']");

		panel.addEventListener("keydown", (e) => e.stopPropagation());
		this._bindListDnD();
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

		summary.appendChild(handle);
		summary.appendChild(toggle);
		summary.appendChild(label);

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

	_editableParams(effect) {
		const out = [];
		for (const [key, value] of Object.entries(effect)) {
			if (key === "enabled" || key === "uniforms") continue;
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

		if (
			k.includes("amount") ||
			k.includes("threshold") ||
			k.includes("ratio") ||
			k.includes("opacity") ||
			k.includes("mix") ||
			k.includes("invert") ||
			k.includes("diffuse") ||
			k.includes("strength") ||
			k.includes("falloff") ||
			k === "debug" ||
			k.includes("center") ||
			k.includes("animate") ||
			(k.includes("gap") && v <= 1)
		) {
			return {min: 0, max: 1, step: 0.001};
		}

		if (k.includes("angle")) return {min: 0, max: Math.PI * 2, step: 0.01};
		if (k.includes("mode")) return {min: 0, max: 8, step: 1};
		if (k.includes("levels")) return {min: 1, max: 32, step: 1};
		if (k.includes("sample")) return {min: 1, max: 64, step: 1};
		if (k.includes("octave")) return {min: 1, max: 8, step: 0.1};
		if (k.includes("multiplier") || k.includes("speed")) return {min: 0, max: Math.max(5, v * 3 || 5), step: 0.01};
		if (k.includes("brightness") || k.includes("gain") || k.includes("scale")) {
			return {min: 0, max: Math.max(2, v * 2 || 2), step: 0.01};
		}
		if (k.includes("size") || k.includes("tile") || k.includes("grid") || k.includes("cell") || k.includes("radius")) {
			return {min: 0, max: Math.max(64, v * 2 || 64), step: v >= 10 ? 1 : 0.1};
		}
		if (k.includes("phase") || k.includes("amplitude")) {
			return {min: -Math.max(10, v * 2), max: Math.max(10, v * 2), step: 0.01};
		}

		const max = Math.max(1, v * 3, 1);
		return {min: Math.min(0, -max * 0.25), max, step: max > 10 ? 0.1 : 0.01};
	}

	_createNumberControl(effectName, key, value, componentIndex, componentCount) {
		const range = this._guessRange(key, value);
		const labelText = componentIndex == null ? key : `${key}[${componentIndex}]`;

		const root = document.createElement("label");
		root.className = "shader-effects-panel__control";

		const meta = document.createElement("div");
		meta.className = "shader-effects-panel__control-meta";

		const nameEl = document.createElement("span");
		nameEl.textContent = labelText;

		const valueEl = document.createElement("span");
		valueEl.className = "shader-effects-panel__control-value";
		valueEl.textContent = this._formatValue(value);

		meta.appendChild(nameEl);
		meta.appendChild(valueEl);

		const input = document.createElement("input");
		input.type = "range";
		input.min = String(range.min);
		input.max = String(range.max);
		input.step = String(range.step);
		input.value = String(value);
		input.dataset.effect = effectName;
		input.dataset.param = key;
		if (componentIndex != null) input.dataset.index = String(componentIndex);

		const commit = () => {
			const num = parseFloat(input.value);
			valueEl.textContent = this._formatValue(num);
			this._applyParam(effectName, key, num, componentIndex, componentCount);
		};

		input.addEventListener("pointerdown", () => {
			this._editing = true;
		});
		input.addEventListener("pointerup", () => {
			this._editing = false;
		});
		input.addEventListener("input", commit);
		input.addEventListener("change", () => {
			this._editing = false;
			commit();
		});

		root.appendChild(meta);
		root.appendChild(input);

		return {root, input, valueEl, key, componentIndex};
	}

	_formatValue(num) {
		if (!Number.isFinite(num)) return "—";
		const abs = Math.abs(num);
		if (abs >= 100) return num.toFixed(0);
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
				if (value < min) control.input.min = String(value);
				if (value > max) control.input.max = String(value);

				control.input.value = String(value);
				control.valueEl.textContent = this._formatValue(value);
			}
		}
	}

	update() {
		this.syncFromConfig();
	}
}

const shaderEffectsPanel = new ShaderEffectsPanel();
