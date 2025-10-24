# Generative Art Library

A comprehensive library of utilities for creating generative art with p5.js and fxhash.

## Quick Start

```javascript
// Load essential modules
await libManager.loadEssentials();

// Get module references
const utils = libManager.get("utils");
const logger = libManager.get("logs").Logger;
```

## Available Modules

### Core Utilities

#### **utils.js**

General-purpose utilities for generative art:

- Math helpers: `clamp()`, `smoothstep()`, `mix()`, `mapValue()`
- Noise functions: `oct()`, `n2()`, `n3()` (fast 2D/3D value noise)
- SDF functions: `sdf_box()`, `sdf_circle()`, `sdf_hexagon()`
- Canvas utilities: `saveCanvas()`, `saveArtwork()`, `toggleGuides()`
- Animation helpers: `createAnimationGenerator()`, `startAnimation()`
- Execution timing: `ExecutionTimer` class

#### **logs.js**

Enhanced console logging with styled output:

- `Logger.info()`, `Logger.success()`, `Logger.warning()`, `Logger.error()`
- `Logger.table()` - Formatted table output
- `Logger.header()` - Section headers
- Color-coded console output

#### **memoryManager.js**

Memory monitoring and management:

- Automatic garbage collection
- Memory usage tracking
- Cleanup helpers for large sketches
- Browser memory API integration

#### **stopMotionController.js** 🎬 NEW!

Plug-and-play stop-motion animation system:

- Automatic frame capture cycles
- Easing-based parameter evolution
- Scene reinitialization with callbacks
- Memory-efficient rendering
- **See:** `README-STOPMOTION.md` for full documentation
- **Example:** `STOP_MOTION_EXAMPLE.js`

### Visual Effects

#### **shaderManager.js** & **shaderPipeline.js**

WebGL shader effects pipeline:

- Post-processing effects
- Multi-pass rendering
- Shader composition
- Built-in effects: grain, chromatic aberration, deform, pixel sort, etc.

#### **smudge.js**

Smudge/blur effects for p5.js

#### **horizon.js**

Horizon line utilities for perspective drawing

#### **swatchPalette.js**

Color palette management:

- Load palettes from images
- HSL color conversion
- Palette sampling utilities

### P5.js Extensions

Located in `p5/` directory:

- `p5.min.js` - p5.js core library
- `p5.blend.js` - Advanced blending modes
- `p5.brush.js` - Brush rendering
- `p5.chroma.js` - Color manipulation
- `p5.capture.min.js` - Canvas recording
- `p5.gd.js` - Graphics drawing utilities
- `p5collide2d.min.js` - 2D collision detection
- `spectral.js` - Spectral color mixing
- `matter.js` - Physics engine integration

### FXHash Integration

#### **fxhash.js**

FXHash platform integration for generative tokens

#### **params.js**

Parameter management for FXHash features

## Module Loading

Use the `libManager` to load modules:

```javascript
// Load individual modules
await libManager.loadModule("utils");
await libManager.loadModule("stopMotion");

// Load all essentials at once
await libManager.loadEssentials();
// Loads: fxhash, p5, spectral, logs, utils, params, mover

// Load utility suite
await libManager.loadUtils();
// Loads: logs, utils, memory, shader, smudge, horizon, knob
```

## Usage Examples

### Stop Motion Animation

```javascript
const StopMotionController = libManager.get("stopMotion").StopMotionController;

let stopMotion = new StopMotionController({
	captureInterval: 100,
	easingIncrement: 0.31,
	maxCycles: 1,
	onCapture: () => saveArtwork(),
	onReinit: (params) => {
		const scale = params.mapEasing(-0.002, 0.002);
		reinitScene(scale);
	},
});

function draw() {
	// Your drawing code
	stopMotion.update();
}
```

See `README-STOPMOTION.md` for complete documentation.

### Memory Management

```javascript
const MemoryManager = libManager.get("memory").MemoryManager;

const memoryManager = new MemoryManager({
	intervalMs: 5000,
	memoryThreshold: 0.85,
	enableLogging: true,
});

memoryManager.prepareForSketch();
memoryManager.start();
```

### Animation Generator

```javascript
const generator = createAnimationGenerator({
	items: particles,
	maxFrames: 1000,
	startTime: frameCount,
	cycleLength: 1000,
	renderItem: (item, frame) => item.show(),
	moveItem: (item, frame) => item.move(),
	onComplete: () => console.log("Done!"),
});
```

### Logging

```javascript
const logger = libManager.get("logs").Logger;

logger.info("Starting sketch");
logger.success("Render complete!");
logger.table("Parameters", {width: 1080, height: 1080});
```

## File Structure

```
library/
├── libManager.js           # Module loader
├── README.md              # This file
├── utils/
│   ├── utils.js           # Core utilities
│   ├── logs.js            # Enhanced logging
│   ├── memoryManager.js   # Memory management
│   ├── stopMotionController.js  # Stop-motion system
│   ├── shaderManager.js   # Shader effects
│   ├── shaderPipeline.js  # Shader pipeline
│   ├── smudge.js          # Smudge effects
│   ├── horizon.js         # Horizon utilities
│   ├── knob.js            # UI controls
│   ├── fxhash.js          # FXHash integration
│   ├── swatchPalette.js   # Color palettes
│   ├── README-STOPMOTION.md       # Stop motion docs
│   └── STOP_MOTION_EXAMPLE.js    # Stop motion examples
├── p5/                    # P5.js and extensions
└── shaders/               # GLSL shader files
```

## Tips & Best Practices

1. **Always load modules before use**: Wait for `libManager.loadEssentials()` to complete
2. **Use memory manager**: For sketches with >10k particles
3. **Leverage stop motion**: For creating animated sequences with parameter evolution
4. **Check examples**: See `STOP_MOTION_EXAMPLE.js` for complete working examples
5. **Profile performance**: Use `ExecutionTimer` to measure sketch performance

## Contributing

When adding new utilities:

1. Add module path to `libManager.modulePaths`
2. Add export mapping in `libManager.extractModuleExports()`
3. Document in this README
4. Provide usage examples
5. Update TypeScript definitions if needed
