# ParamsPanel

Reusable EXLIBRIS-style slide-out control panel for p5 / fxhash sketches.

Builds dropdowns from `window.PARAMS_UI`, syncs on **Apply**, and optionally includes a custom palette creator + presentation mode.

## Quick setup

### 1. HTML chrome + assets

```html
<link rel="stylesheet" href="./library/styles/paramsPanel.css" />

<!-- after params.js -->
<script src="./library/utils/paramsPanel.js"></script>

<body>
  <div class="info-toggle">Edit parameters</div>
  <div class="container" aria-label="Controls panel">
    <div class="title-wrapper">
      <h1 class="title">Controls</h1>
      <h6 class="spec">Apply updates without changing seed/hash</h6>
      <p class="status">
        Activity status:
        <span class="spin-container"><span class="spin">.</span></span>
      </p>
    </div>
    <div class="info-wrapper">
      <hr />
      <p class="info-container">
        <span class="info">Hash : </span><span class="kb-params hash"></span>
      </p>
      <hr />
      <p class="info-container">
        <span class="info">Render status : </span
        ><span class="kb-params dashboard"></span>
      </p>
      <hr />
    </div>
    <div class="controls-form"></div>
    <div class="save-wrapper">
      <button class="button btn-apply" id="param-apply"><span>Apply</span></button>
      <button class="button btn-download" id="param-download">
        <span>Download</span>
      </button>
    </div>
  </div>
  <main class="main"><span class="frame"></span></main>
</body>
```

### 2. Boot

```js
ParamsPanel.init({
  storageKey: "myproject:userPalettes", // required if paletteCreator is on
  features: {
    paletteCreator: true,
    presentation: true,
  },
});
```

### 3. Project data (`parameters/params.js`)

```js
window.PARAMS_UI = {
  options: {
    sizes: [0.5, 1, 2],
    palettes: [],
    presentations: ["off", "on", "horizontal"],
    paletteModes: ["oklch", "oklab", "lch", "lab", "hsl", "rgb", "lrgb"],
  },
  current: {
    size: 1,
    paletteName: "",
    presentation: "off",
  },
  ui: [
    { key: "paletteName", label: "Palette", optionsKey: "palettes", kind: "palette" },
    { key: "size", label: "Size", optionsKey: "sizes", format: "compactNumber" },
    {
      key: "presentation",
      label: "Presentation",
      optionsKey: "presentations",
      kind: "presentation",
    },
  ],
  resolved: {},
  lockedSeeds: null,
};

window.resolveParams = function () {
  Object.assign(window.PARAMS_UI.resolved, {
    size: window.PARAMS_UI.current.size,
    paletteName: window.PARAMS_UI.current.paletteName,
    presentation: window.PARAMS_UI.current.presentation,
  });
};
window.resolveParams();
```

### 4. Sketch hooks

```js
// Apply: re-render with locked seeds
window.applyGenerativeSettings = async (settings) => {
  /* update PARAMS_UI.current, re-INIT scene */
};

// Palette list (after ChromaPalette is ready)
window.dispatchEvent(
  new CustomEvent("swatches:ready", {
    detail: {
      names: [...paletteManager.getFileNames()].sort(),
      localNames: /* local palette names */,
      selected: currentPaletteName,
    },
  })
);

// Spinner / status
window.dispatchEvent(new CustomEvent("render:started"));
window.dispatchEvent(new CustomEvent("render:completed"));

// Download uses window.saveArtwork from utils.js
```

Use the same `storageKey` for `initChromaPalettes({ storageKey })` / `loadLocalPalettes` so saved palettes load on refresh.

## `ui[]` metadata

| Field | Purpose |
|-------|---------|
| `key` | Field on `PARAMS_UI.current` |
| `id` | Optional DOM id for the `<select>` |
| `label` | Row label |
| `optionsKey` | Key into `PARAMS_UI.options` |
| `kind: "palette"` | Synthetic `(random)` option + `swatches:ready` wiring |
| `kind: "presentation"` | Live CSS class toggle on canvas / `.frame` |
| `format: "compactNumber"` | `500000` → `500k` |
| `format: "camelToWords"` | `veryFast` → `very fast` |

## Features

| Flag | Default | Behavior |
|------|---------|----------|
| `paletteCreator` | `false` | Fieldset to save/delete/copy local palettes via `paletteManager` |
| `presentation` | `false` | Toggle `.presentation` / `.horizontal` on canvas + `.frame` |

## Contract summary

| Global / event | Direction | Role |
|----------------|-----------|------|
| `PARAMS_UI` | project → panel | Options + current + ui defs |
| `resolveParams()` | panel → project | Enum → resolved numerics |
| `applyGenerativeSettings` | panel → sketch | Apply without new hash |
| `saveArtwork` | panel → utils | Download PNG |
| `paletteManager` | sketch → panel | Palette CRUD / preview |
| `swatches:ready` | sketch → panel | Populate palette select |
| `render:started` / `render:completed` | sketch → panel | Spinner + status text |
