# Stop Motion Controller

A plug-and-play utility for creating stop-motion style generative art animations with p5.js.

## Overview

The `StopMotionController` manages the entire stop-motion animation cycle:

- **Frame capture timing** - Captures at regular intervals
- **Easing-based parameter evolution** - Smooth cosine easing between states
- **Scene reinitialization** - Rebuilds your scene with evolved parameters
- **Memory management** - Automatic garbage collection integration
- **Cycle detection** - Tracks complete animation cycles

## Quick Start

### 1. Load the Module

```javascript
async function initApp() {
	await libManager.loadModule("stopMotion");
	const StopMotionController = libManager.get("stopMotion").StopMotionController;

	// ... rest of initialization
}
```

### 2. Create Controller Instance

```javascript
let stopMotion;

function setup() {
	stopMotion = new StopMotionController({
		captureInterval: 100, // Capture every 100 frames
		easingIncrement: 0.31, // How fast parameters evolve
		maxCycles: 1, // Stop after 1 cycle

		onCapture: () => {
			saveArtwork(); // Your save function
		},

		onReinit: (params) => {
			// Rebuild your scene with new parameters
			const scale = params.mapEasing(-0.002, 0.002);
			const angle = params.mapNoise("ax", 0, 4000);
			// ... reinitialize your objects
		},

		onComplete: () => {
			console.log("Done!");
		},
	});
}
```

### 3. Update in Draw Loop

```javascript
function draw() {
	// Your drawing code
	drawYourStuff();

	// Update stop motion controller
	stopMotion.update();
}
```

That's it! 🎬

## Configuration Options

```javascript
{
  // Timing
  captureInterval: 100,        // Frames between captures (default: 100)
  easingIncrement: 0.31,       // Angle increment per cycle (default: 0.31)
  maxCycles: 1,                // Number of complete cycles (default: 1)
  reinitDelay: 150,            // Milliseconds before reinit (default: 150)
  startAngle: 180,             // Starting angle in degrees (default: 180, where cos = -1)

  // Memory
  enableMemoryManagement: true, // Use memory manager (default: true)
  memoryManager: null,          // Pass your MemoryManager instance

  // Callbacks
  onCapture: () => {},          // Called when capturing a frame
  onReinit: (params) => {},     // Called when reinitializing scene
  onComplete: () => {},         // Called when animation finishes
  onProgress: (data) => {},     // Called on progress updates
}
```

## Parameter Object

The `params` object passed to `onReinit` contains:

```javascript
{
  // Easing values
  easing: -0.5,              // Cosine easing [-1 to 1]
  easeAng: 45.5,             // Current angle in degrees
  easingNormalized: 0.25,    // Easing normalized to [0 to 1]

  // Cycle info
  cycleCount: 0,             // Current cycle number
  cycleProgress: -0.5,       // Same as easing

  // Noise offsets
  noiseOffsets: {            // Current noise offset values
    x, y, ax, ay, sx, sy
  },

  // Helper methods
  mapEasing(min, max, clamp = true)           // Map easing to range
  mapNoise(offset, min, max, inc, clamp)      // Map noise to range
  getNoise(offset, increment)                  // Get noise value
}
```

## Helper Methods

### mapEasing()

Maps the current easing value to your desired range:

```javascript
// Easing oscillates from -1 to 1 smoothly
const scale = params.mapEasing(-0.002, 0.002);
const angle = params.mapEasing(0, TWO_PI);
const size = params.mapEasing(10, 100);
```

### mapNoise()

Gets an evolving noise value mapped to a range:

```javascript
// Noise slowly drifts, never repeats
const angle1 = params.mapNoise("ax", 0, 4000, 0.01);
const hueShift = params.mapNoise("x", -30, 30, 0.001);
const position = params.mapNoise("y", 0, width, 0.05);
```

Offset names: `'x'`, `'y'`, `'ax'`, `'ay'`, `'sx'`, `'sy'` (or custom)

### getNoise()

Gets raw noise value [0-1]:

```javascript
const raw = params.getNoise("x", 0.01);
```

## Real-World Example

```javascript
let stopMotion;
let particles = [];
let hue = 0;

async function initApp() {
	await libManager.loadEssentials();
	await libManager.loadModule("stopMotion");

	const StopMotionController = libManager.get("stopMotion").StopMotionController;
	const utils = libManager.get("utils");

	stopMotion = new StopMotionController({
		captureInterval: 100,
		easingIncrement: 0.31,
		maxCycles: 1,

		onCapture: () => {
			utils.saveArtwork();
		},

		onReinit: (params) => {
			// Clear old particles
			particles = [];

			// Get evolved parameters
			const flowScale = params.mapEasing(0.001, 0.005);
			const flowAngle = params.mapNoise("ax", 1000, 5000, 0.01);
			const particleSpeed = params.mapEasing(0.5, 2.0);

			// Drift hue over time
			hue += params.mapNoise("x", -5, 5, 0.001);
			hue = (hue + 360) % 360;

			// Create particles with new parameters
			for (let i = 0; i < 10000; i++) {
				particles.push(
					new Particle({
						x: random(width),
						y: random(height),
						flowScale,
						flowAngle,
						speed: particleSpeed,
						color: (hue + random(-20, 20)) % 360,
					})
				);
			}

			background(0);
		},

		onComplete: () => {
			console.log("Animation complete!");
		},
	});
}

function draw() {
	// Draw particles
	for (let p of particles) {
		p.update();
		p.show();
	}

	// Update controller
	stopMotion.update();
}
```

## How It Works

1. **Setup Phase**: Configure the controller with callbacks
2. **Animation Loop**: Your `draw()` function runs normally
3. **Capture Check**: Every N frames, controller checks if it's time to capture
4. **Cycle Detection**: Uses `cos(easeAng)` to detect when easing reaches 1.0
   - Starts at 180° where `cos(180°) = -1`
   - Increments by `easingIncrement` each reinit
   - When `cos(easeAng) >= 1.0`, a cycle completes (approximately 360° ÷ increment)
5. **Capture**: Calls your `onCapture()` callback (save the frame)
6. **Reinitialize**: Increments `easeAng` and calls `onReinit()` with new parameters
7. **Repeat**: Until `maxCycles` is reached
8. **Complete**: Calls `onComplete()` and stops the loop

**Note:** The easing follows a cosine curve: `-1 → 0 → 1 → 0 → -1`, creating smooth oscillation between parameter extremes.

## Tips

### Smooth Cycling

- Use `mapEasing()` for parameters that should smoothly return to start
- The easing goes: -1 → 0 → 1 → 0 → -1 (cosine wave)
- When it reaches 1, a cycle completes

### Organic Evolution

- Use `mapNoise()` for parameters that should drift over time
- Noise never repeats, creating unique variations
- Lower increment = slower drift

### Memory Efficiency

- Clear arrays before reinit: `particles.length = 0`
- Pass `memoryManager` to controller config
- It will force GC before each capture

### Timing Tuning

- `captureInterval`: Higher = fewer frames, faster render
- `easingIncrement`: Higher = faster parameter evolution
- `reinitDelay`: Increase if saves are failing (frames are black)

### Multiple Parameters

- Combine `mapEasing()` and `mapNoise()` for complex evolution
- Use different noise offsets for independent parameters
- Create custom curves: `const custom = Math.pow(params.easingNormalized, 2)`

### Avoiding Initial Jump

**Problem:** Scene "jumps" or changes scale on the first frame.

**Solution:** Initialize your scene in `setup()` using the controller's starting parameters:

```javascript
function setup() {
	// ... canvas setup ...

	// Get controller's starting state (easing = -1)
	const initialParams = stopMotion.getParameters();

	// Initialize with these params to match first frame
	reinitializeScene(initialParams);
}
```

This ensures the initial scene matches what the controller expects, preventing visual jumps.

## Advanced: Integration with animationGenerator

Coming soon! The controller will support the `createAnimationGenerator()` function from `utils.js` for rendering large particle systems efficiently.

## See Also

- `STOP_MOTION_EXAMPLE.js` - Full working examples
- `utils.js` - Animation generator utilities
- `memoryManager.js` - Memory management integration
