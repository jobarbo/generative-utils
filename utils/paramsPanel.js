/**
 * ParamsPanel — EXLIBRIS-style slide-out control panel for generative sketches.
 *
 * Reads window.PARAMS_UI ({ ui, options, current }), builds <select> rows,
 * and calls resolveParams / applyGenerativeSettings on Apply.
 *
 * Usage:
 *   ParamsPanel.init({
 *     storageKey: "myproject:userPalettes",
 *     features: { paletteCreator: true, presentation: true },
 *   });
 *
 * PARAMS_UI.ui item fields:
 *   key, id?, label?, optionsKey?,
 *   kind?: "palette" | "presentation",
 *   format?: "compactNumber" | "camelToWords"
 */
(function (root) {
	"use strict";

	const DEFAULT_FEATURES = {
		paletteCreator: false,
		presentation: false,
	};

	const FORMATTERS = {
		compactNumber(n) {
			if (n >= 1000000) {
				const m = n / 1000000;
				return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}m`;
			}
			if (n >= 1000) return `${Math.round(n / 1000)}k`;
			return String(n);
		},
		camelToWords(val) {
			return String(val)
				.replace(/([A-Z])/g, " $1")
				.toLowerCase();
		},
	};

	function getParams() {
		return root.PARAMS_UI;
	}

	function setStatus(isWorking) {
		const spinner = document.querySelector(".spin-container");
		if (!spinner) return;
		if (isWorking) spinner.classList.add("active");
		else spinner.classList.remove("active");
	}

	function setText(selector, value) {
		const el = document.querySelector(selector);
		if (!el) return;
		el.textContent = value ?? "";
	}

	function ensureOption(select, value, label) {
		const opt = document.createElement("option");
		opt.value = String(value);
		opt.textContent = label ?? String(value);
		select.appendChild(opt);
	}

	function fillSelect(select, values, {formatter} = {}) {
		select.innerHTML = "";
		for (const v of values) {
			ensureOption(select, v, formatter ? formatter(v) : String(v));
		}
	}

	function setSelectValue(select, value) {
		select.value = String(value);
		if (select.value !== String(value)) {
			select.selectedIndex = 0;
		}
	}

	function resolveFormatter(format) {
		if (!format) return undefined;
		if (typeof format === "function") return format;
		return FORMATTERS[format];
	}

	function findControlByKind(controls, uiDefs, kind) {
		const def = uiDefs.find((d) => d.kind === kind);
		return def ? controls[def.key] : undefined;
	}

	function findPaletteCurrentKey(uiDefs) {
		const def = uiDefs.find((d) => d.kind === "palette");
		return def?.key ?? "paletteName";
	}

	function findPresentationCurrentKey(uiDefs) {
		const def = uiDefs.find((d) => d.kind === "presentation");
		return def?.key ?? "presentation";
	}

	// ---- Custom palette creation (localStorage, merged by sketch via loadLocalPalettes) ----

	function parseColorsInput(text) {
		const tokens = String(text)
			.replace(/[\[\]{}'"`]/g, " ")
			.split(/[\s,;]+/)
			.filter(Boolean);
		const colors = [];
		const invalid = [];
		for (const token of tokens) {
			const candidate = token.startsWith("#") ? token : `#${token}`;
			if (root.chroma && root.chroma.valid(candidate)) {
				colors.push(root.chroma(candidate).hex());
			} else {
				invalid.push(token);
			}
		}
		return {colors, invalid};
	}

	function paletteCodeSnippet(name, def) {
		const colorList = def.colors.map((c) => `"${c}"`).join(", ");
		const extras = [];
		if (def.mode && def.mode !== "oklch") extras.push(`mode: "${def.mode}"`);
		if (def.steps && def.steps !== 256) extras.push(`steps: ${def.steps}`);
		if (def.discrete) extras.push("discrete: true");
		const extraStr = extras.length ? `, ${extras.join(", ")}` : "";
		return `"${name}": { colors: [${colorList}]${extraStr} },`;
	}

	function initPaletteCreator(p, selPalette, paletteOptionsApi, storageKey, paletteCurrentKey) {
		const form = document.querySelector(".controls-form");
		if (!form) return;

		const readUserPalettes = () => {
			try {
				return JSON.parse(localStorage.getItem(storageKey)) || {};
			} catch {
				return {};
			}
		};

		const writeUserPalettes = (map) => {
			localStorage.setItem(storageKey, JSON.stringify(map));
		};

		const fieldset = document.createElement("fieldset");
		fieldset.className = "palette-creator";

		const legend = document.createElement("legend");
		legend.textContent = "Custom palette generator";
		fieldset.appendChild(legend);

		const palettePreview = document.createElement("div");
		palettePreview.className = "palette-preview";
		fieldset.appendChild(palettePreview);

		function updatePreview() {
			const manager = root.paletteManager;
			if (!manager || !(selPalette instanceof HTMLSelectElement)) return;
			const name = selPalette.value === "(random)" ? p.current[paletteCurrentKey] : selPalette.value;
			const hexes = name ? manager.getHexPalette(name) : null;
			if (!hexes || hexes.length === 0) {
				palettePreview.style.background = "";
				return;
			}
			const step = Math.max(1, Math.floor(hexes.length / 32));
			const stops = hexes.filter((_, i) => i % step === 0);
			if (stops[stops.length - 1] !== hexes[hexes.length - 1]) stops.push(hexes[hexes.length - 1]);
			const discrete = manager.getConfig(name)?.discrete;
			if (discrete) {
				const bandWidth = 100 / stops.length;
				const bands = stops.map((c, i) => `${c} ${i * bandWidth}% ${(i + 1) * bandWidth}%`);
				palettePreview.style.background = `linear-gradient(to right, ${bands.join(", ")})`;
			} else {
				palettePreview.style.background = `linear-gradient(to right, ${stops.join(", ")})`;
			}
		}

		if (selPalette instanceof HTMLSelectElement) {
			selPalette.addEventListener("change", updatePreview);
		}

		const nameInput = document.createElement("input");
		nameInput.type = "text";
		nameInput.placeholder = "palette name";

		const colorsInput = document.createElement("textarea");
		colorsInput.rows = 3;
		colorsInput.placeholder = "['#ffffe0', '#ffebb9', …] or ffcfa2 ffb1ab …";

		const modeSelect = document.createElement("select");
		const modes = Array.isArray(p.options.paletteModes) ? p.options.paletteModes : ["oklch", "oklab", "lch", "lab", "hsl", "rgb", "lrgb"];
		for (const mode of modes) ensureOption(modeSelect, mode, mode);

		const stepsInput = document.createElement("input");
		stepsInput.type = "number";
		stepsInput.min = "2";
		stepsInput.max = "1024";
		stepsInput.value = "256";
		stepsInput.title = "gradient steps";

		const discreteLabel = document.createElement("label");
		discreteLabel.className = "palette-discrete-label";
		const discreteInput = document.createElement("input");
		discreteInput.type = "checkbox";
		discreteLabel.append(discreteInput, document.createTextNode("discrete (no interpolation)"));

		const configRow = document.createElement("div");
		configRow.className = "palette-config-row";
		configRow.append(modeSelect, stepsInput, discreteLabel);

		const status = document.createElement("div");
		status.className = "palette-status";

		const buttonRow = document.createElement("div");
		buttonRow.className = "palette-actions";
		const makeButton = (label, variant) => {
			const btn = document.createElement("button");
			btn.type = "button";
			btn.className = variant ? `button ${variant}` : "button";
			const span = document.createElement("span");
			span.textContent = label;
			btn.appendChild(span);
			buttonRow.appendChild(btn);
			return btn;
		};
		const btnSave = makeButton("Save", "btn-save");
		const btnDelete = makeButton("Delete", "btn-delete");
		const btnCopy = makeButton("Copy as code");

		fieldset.append(nameInput, colorsInput, configRow, buttonRow, status);
		form.appendChild(fieldset);

		const setCreatorStatus = (msg, isError = false) => {
			status.textContent = msg;
			status.classList.toggle("is-error", isError);
		};

		const selectedLocalName = () => {
			if (!(selPalette instanceof HTMLSelectElement)) return null;
			const name = selPalette.value;
			return paletteOptionsApi.getLocalNames().includes(name) ? name : null;
		};

		btnSave.addEventListener("click", () => {
			const manager = root.paletteManager;
			if (!manager) {
				setCreatorStatus("sketch not ready yet", true);
				return;
			}
			const name = nameInput.value.trim();
			if (!name) {
				setCreatorStatus("give the palette a name", true);
				return;
			}
			if (manager.getConfig(name)?.source === "file") {
				setCreatorStatus(`'${name}' already exists as a file palette`, true);
				return;
			}
			const {colors, invalid} = parseColorsInput(colorsInput.value);
			if (invalid.length > 0) {
				setCreatorStatus(`invalid colors: ${invalid.join(", ")}`, true);
				return;
			}
			if (colors.length < 2) {
				setCreatorStatus("need at least 2 colors", true);
				return;
			}
			const steps = Math.max(2, Math.min(1024, parseInt(stepsInput.value, 10) || 256));
			const def = {colors, mode: modeSelect.value, steps, discrete: discreteInput.checked, createdAt: Date.now()};

			try {
				manager.addPalette(name, def, {source: "local"});
			} catch (error) {
				setCreatorStatus(error.message, true);
				return;
			}
			const stored = readUserPalettes();
			stored[name] = def;
			writeUserPalettes(stored);

			const localNames = [...new Set([...paletteOptionsApi.getLocalNames(), name])].sort();
			paletteOptionsApi.setLocalNames(localNames);
			paletteOptionsApi.renderPaletteOptions(name);
			setCreatorStatus(`saved '${name}' — pick it and Apply`);
		});

		btnDelete.addEventListener("click", () => {
			const manager = root.paletteManager;
			const name = selectedLocalName();
			if (!name) {
				setCreatorStatus("select a local palette to delete", true);
				return;
			}
			manager?.removePalette(name);
			const stored = readUserPalettes();
			delete stored[name];
			writeUserPalettes(stored);

			paletteOptionsApi.setLocalNames(paletteOptionsApi.getLocalNames().filter((n) => n !== name));
			if (p.current[paletteCurrentKey] === name) p.current[paletteCurrentKey] = "";
			paletteOptionsApi.renderPaletteOptions("(random)");
			setCreatorStatus(`deleted '${name}'`);
		});

		btnCopy.addEventListener("click", async () => {
			const manager = root.paletteManager;
			const name = selectedLocalName() ?? (selPalette instanceof HTMLSelectElement && selPalette.value !== "(random)" ? selPalette.value : null);
			const config = name ? manager?.getConfig(name) : null;
			if (!config) {
				setCreatorStatus("select a palette to copy", true);
				return;
			}
			try {
				await navigator.clipboard.writeText(paletteCodeSnippet(name, config));
				setCreatorStatus(`copied '${name}' snippet for palettes.js`);
			} catch {
				setCreatorStatus("clipboard unavailable", true);
			}
		});

		return {updatePreview};
	}

	function applyPresentation(mode) {
		const canvas = document.querySelector("canvas.p5Canvas");
		const frame = document.querySelector(".frame");
		if (!canvas || !frame) return;

		const shouldPresent = mode === "on" || mode === "horizontal";
		const horizontal = mode === "horizontal";

		canvas.classList.toggle("presentation", shouldPresent);
		frame.classList.toggle("presentation", shouldPresent);
		canvas.classList.toggle("horizontal", horizontal);
		frame.classList.toggle("horizontal", horizontal);
	}

	function renderDashboard(paletteCurrentKey, presentationCurrentKey) {
		const p = getParams();
		if (!p) return;

		const compact = FORMATTERS.compactNumber;
		setText(".kb-params.hash", root.fxhash ?? root.$fx?.hash ?? "");
		if (p.current.population !== undefined) {
			setText(".kb-params.population", compact(p.current.population));
		}
		if (p.current.particleSize !== undefined) {
			setText(".kb-params.particleSize", String(p.current.particleSize));
		}
		if (paletteCurrentKey && p.current[paletteCurrentKey] !== undefined) {
			setText(".kb-params.palette", p.current[paletteCurrentKey] || "(random)");
		}
		if (p.current.printDPI !== undefined) {
			setText(".kb-params.dpi", String(p.current.printDPI));
		}
		if (p.current.exposure !== undefined) {
			setText(".kb-params.exposure", String(p.current.exposure));
		}
		if (presentationCurrentKey && p.current[presentationCurrentKey] !== undefined) {
			setText(".kb-params.presentation", p.current[presentationCurrentKey]);
		}
		setText(".kb-params.dashboard", p.lockedSeeds ? "seed locked" : "seed unlocked");
	}

	function initUI(config) {
		const features = {...DEFAULT_FEATURES, ...(config.features || {})};
		const storageKey = config.storageKey || "fx_longform2:userPalettes";
		const p = getParams();
		if (!p) return;

		const toggle = document.querySelector(".info-toggle");
		const container = document.querySelector(".container");
		if (toggle && container) {
			toggle.classList.add("show");
			toggle.textContent = "Edit parameters";
			toggle.addEventListener("click", () => {
				const isOpen = container.classList.toggle("show");
				toggle.textContent = isOpen ? "Close tab" : "Edit parameters";
			});
		}

		const form = document.querySelector(".controls-form");
		if (!form) return;

		const controls = {};
		const uiDefs = Array.isArray(p.ui) ? p.ui : [];
		const paletteCurrentKey = findPaletteCurrentKey(uiDefs);
		const presentationCurrentKey = findPresentationCurrentKey(uiDefs);

		for (const def of uiDefs) {
			const key = def.key;
			if (!key) continue;

			const selectId = def.id || `param-${key}`;
			const labelText = def.label || key;

			const row = document.createElement("label");
			row.className = "select-row";

			const span = document.createElement("span");
			span.textContent = labelText;

			const select = document.createElement("select");
			select.id = selectId;

			row.appendChild(span);
			row.appendChild(select);
			form.appendChild(row);

			controls[key] = select;

			const optionsKey = def.optionsKey;
			if (def.kind === "palette") {
				fillSelect(select, ["(random)"]);
			} else if (optionsKey && Array.isArray(p.options[optionsKey])) {
				const values = p.options[optionsKey];
				const formatter = resolveFormatter(def.format);
				fillSelect(select, values, {formatter});
			}

			const currentValue = p.current[key];
			if (def.kind === "palette") {
				if (currentValue) {
					setSelectValue(select, currentValue);
				} else {
					setSelectValue(select, "(random)");
				}
			} else if (currentValue !== undefined) {
				setSelectValue(select, currentValue);
			}
		}

		const selPresentation = findControlByKind(controls, uiDefs, "presentation");
		const selPalette = findControlByKind(controls, uiDefs, "palette");

		const btnApply = document.getElementById("param-apply");
		const btnDownload = document.getElementById("param-download");

		if (!btnApply) return;

		if (features.presentation && selPresentation instanceof HTMLSelectElement) {
			selPresentation.addEventListener("change", () => {
				p.current[presentationCurrentKey] = selPresentation.value;
				applyPresentation(p.current[presentationCurrentKey]);
				renderDashboard(paletteCurrentKey, presentationCurrentKey);
			});
		}

		btnApply.addEventListener("click", async () => {
			setStatus(true);
			setText(".kb-params.dashboard", "rendering…");
			try {
				for (const def of uiDefs) {
					const key = def.key;
					const select = controls[key];
					if (!(select instanceof HTMLSelectElement)) continue;

					const raw = select.value;
					if (def.kind === "palette") {
						p.current[key] = raw === "(random)" ? "" : raw;
						continue;
					}

					const currentValue = p.current[key];
					if (typeof currentValue === "number") {
						const num = raw.includes(".") ? parseFloat(raw) : parseInt(raw, 10);
						if (!Number.isNaN(num)) {
							p.current[key] = num;
						}
					} else {
						p.current[key] = raw;
					}
				}

				if (typeof root.resolveParams === "function") root.resolveParams();

				if (features.presentation) {
					applyPresentation(p.current[presentationCurrentKey]);
				}
				renderDashboard(paletteCurrentKey, presentationCurrentKey);

				if (typeof root.applyGenerativeSettings === "function") {
					await root.applyGenerativeSettings({...p.current});
				} else {
					setText(".kb-params.dashboard", "sketch not ready");
				}
			} finally {
				// Rendering continues asynchronously; completion flips status off.
			}
		});

		if (btnDownload) {
			btnDownload.addEventListener("click", () => {
				if (typeof root.saveArtwork === "function") {
					root.saveArtwork();
				} else {
					setText(".kb-params.dashboard", "download not ready");
				}
			});
		}

		let filePaletteNames = [];
		let localPaletteNames = [];
		let paletteCreator;

		function renderPaletteOptions(selected) {
			if (!(selPalette instanceof HTMLSelectElement)) return;
			if (p.options && Array.isArray(p.options.palettes)) {
				p.options.palettes = filePaletteNames;
			}
			selPalette.innerHTML = "";
			for (const name of filePaletteNames) ensureOption(selPalette, name, name);
			for (const name of localPaletteNames) ensureOption(selPalette, name, `${name} (local)`);
			ensureOption(selPalette, "(random)", "(random)");

			const target = selected || p.current[paletteCurrentKey];
			if (target) {
				setSelectValue(selPalette, target);
			} else if (filePaletteNames.length > 0) {
				setSelectValue(selPalette, filePaletteNames[0]);
			}
			paletteCreator?.updatePreview();
		}

		if (selPalette instanceof HTMLSelectElement) {
			root.addEventListener("swatches:ready", (e) => {
				const names = e?.detail?.names;
				if (!Array.isArray(names)) return;
				filePaletteNames = names;
				if (Array.isArray(e?.detail?.localNames)) localPaletteNames = e.detail.localNames;
				renderPaletteOptions(e?.detail?.selected);
			});
		}

		if (features.paletteCreator && selPalette) {
			paletteCreator = initPaletteCreator(
				p,
				selPalette,
				{
					getLocalNames: () => localPaletteNames,
					setLocalNames: (names) => {
						localPaletteNames = names;
					},
					renderPaletteOptions,
				},
				storageKey,
				paletteCurrentKey
			);
		}

		root.addEventListener("render:started", () => {
			setStatus(true);
			setText(".kb-params.dashboard", "rendering…");
		});
		root.addEventListener("render:completed", () => {
			setStatus(false);
			setText(".kb-params.dashboard", "complete");
		});

		renderDashboard(paletteCurrentKey, presentationCurrentKey);
		if (features.presentation) {
			applyPresentation(p.current[presentationCurrentKey]);
		}
	}

	const ParamsPanel = {
		FORMATTERS,
		init(config = {}) {
			const run = () => initUI(config);
			if (document.readyState === "loading") {
				document.addEventListener("DOMContentLoaded", run);
			} else {
				run();
			}
		},
	};

	root.ParamsPanel = ParamsPanel;

	if (typeof module !== "undefined" && module.exports) {
		module.exports = ParamsPanel;
	}
})(typeof window !== "undefined" ? window : globalThis);
