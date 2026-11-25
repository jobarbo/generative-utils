/**
 * Shader catalog — every effect the library ships, with its default config.
 *
 * Sketches don't declare shaders anymore: ShaderEffects (sketch-shaders.js) loads
 * every entry here and exposes it in the shader panel's "add effect" menu.
 *
 * Adding a shader to the library:
 *   1. create library/shaders/<dir>/fragment.frag (+ vertex.vert)
 *   2. add an entry below — it shows up in every sketch using this catalog
 *
 * Entry shape:
 *   name: {
 *     dir: "folder-name",          // under library/shaders/
 *     vertex: "vertex.vert",       // optional, file inside dir (default vertex.vert)
 *     fragment: "fragment.frag",   // optional, file inside dir (default fragment.frag)
 *     config: {                    // panel params + uniform bindings
 *       enabled: false,
 *       someParam: 1.0,
 *       uniforms: { uSomeParam: "someParam", uTime: "shaderTime * timeMultiplier" },
 *     },
 *   }
 *
 * Uniform expressions can use: shaderTime, shaderSeed, width, height, sizeScale,
 * renderDensity, viewportScale, loadingProgress and any key of the effect config.
 * A numeric `_phase` key is a jump-free clock advanced at `timeMultiplier`.
 */

const SHADER_CATALOG = {
	deform: {
		dir: "deform",
		config: {
			enabled: false,
			amount: 0.1,
			timeMultiplier: 0.0,
			octave: 4.0,
			noiseScale: 15.0, // shader falls back to 15.0 when 0
			emberMode: 0.0,
			uniforms: {
				uTime: "shaderTime * timeMultiplier",
				uSeed: "shaderSeed",
				uAmount: "amount",
				uOctave: "octave",
				uNoiseScale: "noiseScale",
				uEmberMode: "emberMode",
			},
		},
	},

	collage: {
		dir: "collage-rotate",
		config: {
			enabled: false,
			amount: 1.0,
			tileSize: 255.0, // px @ short-edge 1000 (× sizeScale)
			tileSize2: 50.0,
			tileSize3: 100.0,
			sizeNoise: 23.0,
			rotNoise: 24.0,
			uniforms: {
				uSeed: "shaderSeed + 2222.0",
				uTileSize1: "tileSize * sizeScale",
				uTileSize2: "tileSize2 * sizeScale",
				uTileSize3: "tileSize3 * sizeScale",
				uSizeNoise: "sizeNoise",
				uRotNoise: "rotNoise",
				uAmount: "amount",
				uResolution: "[width, height]",
			},
		},
	},
	pixelSort: {
		dir: "pixel-sort",
		config: {
			enabled: false,
			angle: 0.0, // 0 = vertical, Math.PI/2 = horizontal
			threshold: 0.2,
			sortAmount: 1.8,
			sampleCount: 1.0, // Number of samples (8-64, higher = better quality but slower)
			invert: 0.0, // 0.0 = sort bright pixels, 1.0 = sort dark pixels
			sortMode: 1.0, // 1.0 = sine wave, 2.0 = noise, 3.0 = FBM, 4.0 = vector field
			timeMultiplier: 0.03,
			uniforms: {
				uTime: "shaderTime * timeMultiplier",
				uSeed: "shaderSeed + 999.0",
				uAngle: "angle",
				uThreshold: "threshold",
				uSortAmount: "sortAmount",
				uSampleCount: "sampleCount",
				uInvert: "invert",
				uSortMode: "sortMode",
				uResolution: "[width, height]",
			},
		},
	},
	// Real pixel sort (Kim Asendorf's ASDF algorithm) — actually permutes pixels,
	// unlike pixelSort above which is a directional smear. See
	// library/shaders/asdf-sort/README.md for the algorithm and perf levers.
	asdfSort: {
		dir: "asdf-sort",
		config: {
			enabled: false,
			// Tick any combination. One axis = uniform. Several = organic Voronoi
			// patches, each sorting along one of the enabled axes.
			axisVertical: 1.0,
			axisHorizontal: 0.0,
			axisDiagonal: 0.0,
			axisAntiDiagonal: 0.0,
			axisRegionScale: 4.0, // Voronoi feature density when several axes are on
			angle: 0.0, // extra rotation on top of the chosen axis
			center: [0.5, 0.5], // pivot the sort axis turns around
			sortKey: 0.0, // 0 luma, 1 hue, 2 saturation, 3 lightness, 4 R, 5 G, 6 B
			gateKey: 0.0, // same enum — key used by the threshold test
			thresholdLow: 0.25,
			thresholdHigh: 0.85,
			invertGate: 0.0, // sort what falls OUTSIDE the band instead
			invertOrder: 0.0, // descending sort
			maxSpan: 24.0, // px @ short-edge 1000 (× sizeScale)
			spanStep: 1.0, // sampling stride @ REF 1000 — main perf lever
			spanJitter: 0.7, // irregularity of the block boundaries
			edgeWobble: 0.35, // bends the block seams into curves
			organicAmount: 0.6, // master de-regulariser: span, threshold, phase per line
			organicScale: 3.0,
			organicSpeed: 0.0, // > 0 makes the organic fields drift — an animation knob
			animateThreshold: 0.0,
			thresholdAnimMode: 0.0, // 0 sine, 1 noise, 2 FBM
			thresholdAnimAmount: 0.15,
			sweepMode: 0.0, // 0 off, 1 sine, 2 scroll ramp, 3 noise, 4 FBM
			sweepAmount: 0.5,
			sweepScale: 1.5,
			sweepSpeed: 0.5,
			animateSpan: 0.0,
			spanAnimAmount: 0.4,
			spanAnimSpeed: 0.5,
			mix: 1.0,
			timeMultiplier: 1.0,
			_phase: 0.0, // accumulated clock (see updatePhaseAccumulators)
			uniforms: {
				uTime: "_phase",
				uSeed: "shaderSeed + 2468.0",
				uAxisVertical: "axisVertical",
				uAxisHorizontal: "axisHorizontal",
				uAxisDiagonal: "axisDiagonal",
				uAxisAntiDiagonal: "axisAntiDiagonal",
				uAxisRegionScale: "axisRegionScale",
				uAngle: "angle",
				uCenter: "center",
				uSortKey: "sortKey",
				uGateKey: "gateKey",
				uThresholdLow: "thresholdLow",
				uThresholdHigh: "thresholdHigh",
				uInvertGate: "invertGate",
				uInvertOrder: "invertOrder",
				uMaxSpan: "maxSpan * sizeScale",
				uSpanStep: "spanStep * sizeScale",
				uSpanJitter: "spanJitter",
				uEdgeWobble: "edgeWobble",
				uOrganicAmount: "organicAmount",
				uOrganicScale: "organicScale",
				uOrganicSpeed: "organicSpeed",
				uAnimateThreshold: "animateThreshold",
				uThresholdAnimMode: "thresholdAnimMode",
				uThresholdAnimAmount: "thresholdAnimAmount",
				uSweepMode: "sweepMode",
				uSweepAmount: "sweepAmount",
				uSweepScale: "sweepScale",
				uSweepSpeed: "sweepSpeed",
				uAnimateSpan: "animateSpan",
				uSpanAnimAmount: "spanAnimAmount",
				uSpanAnimSpeed: "spanAnimSpeed",
				uMix: "mix",
				uResolution: "[width, height]",
			},
		},
	},
	symmetry: {
		dir: "symmetry",
		config: {
			enabled: false,
			symmetryMode: 0.0, // 0=H 2fold, 1=V 2fold, 2=2-line 4fold, 3=4-line 8fold, 4=8-line 16fold, 5=16-line 32fold, 6=radial
			amount: 1.0, // Blend strength [0..1]
			debug: 0.0, // 0.0 = normal, 1.0 = debug mode (shows fold lines and center)
			center: [0.5, 0.5], // symmetry center in normalized coords
			translationEnabled: 1.0, // Master toggle for translation animation
			translationSpeedX: 0.01, // Horizontal translation speed (0 = none)
			translationSpeedY: 0.01, // Vertical translation speed (0 = none)
			translationMode: 3.0, // 0=sine, 1=noise, 2=FBM, 3=vector field, 4=continuous scroll
			translationNoiseScale: 0.5, // Scale of noise variation (lower = smoother, higher = more frequent changes)
			translationAmount: [0.0, 0.0], // static UV offset [-1..1] (applied even when animation is off)
			translationPhaseX: 0.0, // Accumulated phase for X translation (prevents jumps)
			translationPhaseY: 0.0, // Accumulated phase for Y translation (prevents jumps)
			rotationEnabled: 1.0, // Master toggle for animated rotation
			rotationSpeed: 0.01, // Speed of rotation
			rotationOscillationSpeed: 0.5, // Speed of oscillation (controls how fast it alternates between positive/negative)
			rotationStartingAngle: 0.0, // Static rotation in degrees [0..360] (applied even when animation is off)
			rotationMode: 1.0, // 0=cosine oscillation, 1=noise, 2=FBM
			rotationNoiseScale: 0.1, // Scale of rotation noise (lower = smoother, higher = more frequent changes)
			rotationPhase: 0.0, // Accumulated phase for rotation (prevents jumps)
			rotationAmplitude: 50.0, // Fixed amplitude - speed controls phase accumulation rate, not amplitude
			timeMultiplier: 0.4, // Time multiplier for animation
			uniforms: {
				uResolution: "[width, height]",
				uSeed: "shaderSeed + 1234.0",
				uSymmetryMode: "symmetryMode",
				uAmount: "amount",
				uDebug: "debug",
				uCenter: "center",
				uTime: "shaderTime * timeMultiplier",
				uTranslationEnabled: "translationEnabled",
				uTranslationSpeedX: "translationSpeedX",
				uTranslationSpeedY: "translationSpeedY",
				uTranslationMode: "translationMode",
				uTranslationNoiseScale: "translationNoiseScale",
				uTranslationAmount: "translationAmount",
				uTranslationPhaseX: "translationPhaseX",
				uTranslationPhaseY: "translationPhaseY",
				uRotationEnabled: "rotationEnabled",
				uRotationSpeed: "rotationSpeed",
				uRotationOscillationSpeed: "rotationOscillationSpeed",
				uRotationStartingAngle: "rotationStartingAngle * 0.017453292519943295", // deg → rad
				uRotationMode: "rotationMode",
				uRotationNoiseScale: "rotationNoiseScale",
				uRotationPhase: "rotationPhase",
				uRotationAmplitude: "rotationAmplitude",
			},
		},
	},

	loaderGlitch: {
		dir: "loader-glitch",
		config: {
			enabled: false, // Enable to show glitch loader animation
			// progress driven by shaderEffects.setLoadingProgress() / loadingProgress
			uniforms: {
				uProgress: "loadingProgress", // Progress from 0.0 (0%) to 1.0 (100%)
				uSeed: "shaderSeed + 8888.0",
				uResolution: "[width, height]",
				uRenderDensity: "sizeScale",
			},
		},
	},
	zoom: {
		dir: "zoom",
		config: {
			enabled: false,
			zoomAmount: 1.0, // Static zoom level (1.0 = no zoom, 2.0 = 2x in, 0.5 = 2x out)
			zoomSpeed: 0.8, // Animation speed
			zoomOutAmount: 2.25, // Min zoom when animating
			zoomInAmount: 4.5, // Max zoom when animating
			animateZoom: 0.0, // 0.0 = static, 1.0 = animate between out/in
			easingMode: 4.0, // 0=sine, 1=linear, 2=ease-in, 3=ease-out, 4=ease-in-out, 5=bounce
			outOfBoundsMode: 0.0, // 0=black, 1=clamp edge, 2=mirror tile, 3=transparent
			center: [0.5, 0.5], // Zoom center point (normalized 0-1)
			timeMultiplier: 0.0,
			uniforms: {
				uTime: "shaderTime * timeMultiplier",
				uOutOfBoundsMode: "outOfBoundsMode",
				uZoomSpeed: "zoomSpeed",
				uZoomAmount: "zoomAmount",
				uZoomOutAmount: "zoomOutAmount",
				uZoomInAmount: "zoomInAmount",
				uAnimateZoom: "animateZoom",
				uCenter: "center",
				uEasingMode: "easingMode",
			},
		},
	},
	pixelGrid: {
		dir: "pixel-grid",
		config: {
			enabled: false,
			gridSize: [24.0, 24.0],
			cellRatio: 0.0,
			gridMode: 0.0,
			diffuse: 1.5,
			gapSize: 0.0,
			gapBrightness: 1.0,
			uniforms: {
				uResolution: "[width, height]",
				uGridSize: "gridSize",
				uCellRatio: "cellRatio",
				uMode: "gridMode",
				uDiffuse: "diffuse",
				uGapSize: "gapSize",
				uGapBrightness: "gapBrightness",
			},
		},
	},

	dither: {
		dir: "dither",
		config: {
			enabled: false,
			ditherMode: 0.0, // 0=bayer4, 1=bayer8, 2=hash, 3=line, 4=clustered
			levels: 1.0,
			mix: 1.0,
			strength: 1.0,
			scale: 1.0, // pattern cell px @ short-edge 1000 (× sizeScale)
			colorMode: 1.0, // 0=luma quantize, 1=per-channel quantize
			uniforms: {
				uResolution: "[width, height]",
				uDitherMode: "ditherMode",
				uLevels: "levels",
				uMix: "mix",
				uStrength: "strength",
				uScale: "scale * sizeScale",
				uColorMode: "colorMode",
				uSeed: "shaderSeed + 4321.0",
			},
		},
	},
	colorQuantize: {
		dir: "color-quantize",
		config: {
			enabled: false,
			levels: 3.0,
			mix: 1.0,
			uniforms: {
				uLevels: "levels",
				uMix: "mix",
			},
		},
	},
	colorTint: {
		dir: "color-tint",
		config: {
			enabled: false,
			hue: 0.0, // hue rotation, degrees 0–360
			saturation: 1.0, // 0 = gray, 1 = unchanged, 2 = boosted
			tintColor: [1.0, 0.5, 0.2], // filter color RGB 0–1
			tintAmount: 0.0, // 0 = no filter, 1 = full blend
			tintMode: 0.0, // 0=multiply (gel), 1=screen, 2=soft light, 3=colorize
			mix: 1.0, // 0 = original, 1 = full effect
			uniforms: {
				uHue: "hue",
				uSaturation: "saturation",
				uTintColor: "tintColor",
				uTintAmount: "tintAmount",
				uTintMode: "tintMode",
				uMix: "mix",
			},
		},
	},
	pixelShift: {
		dir: "pixel-shift",
		config: {
			enabled: false,
			timeMultiplier: 1.0, // global speed (1 = 1/10 of the width per second)
			shiftAxis: 0.0, // 0 = horizontal bands ←→, 1 = vertical columns ↑↓
			shiftBands: 8.0, // bands/columns, each with its own speed
			shiftDirection: 0.0, // 0=left/up, 1=right/down, 2=alternate, 3=random per band
			shiftSpread: 0.6, // 0 = same speed everywhere, 1 = fully random per band
			shiftGradient: 0.0, // -1..1 speed ramp across bands
			shiftSeed: 0.0, // reroll the random speeds/directions
			mix: 1.0,
			_phase: 0.0, // integrated from timeMultiplier — no jump when speed changes
			uniforms: {
				uTime: "_phase",
				uShiftAxis: "shiftAxis",
				uShiftBands: "shiftBands",
				uShiftDirection: "shiftDirection",
				uShiftSpread: "shiftSpread",
				uShiftGradient: "shiftGradient",
				uShiftSeed: "shiftSeed",
				uMix: "mix",
			},
		},
	},
	pixelRing: {
		dir: "pixel-ring",
		config: {
			enabled: false,
			timeMultiplier: 1.0, // global speed (1 = 1/10 of a turn per second)
			center: [0.5, 0.5], // rotation centre in UV (0–1)
			ringBands: 8.0, // concentric rings, each with its own speed
			ringRadius: 0.8, // outer radius in short-edge units (0.8 ≈ covers corners at ARTWORK_LAYOUT 1:1.21)
			ringDirection: 0.0, // 0=counter-clockwise, 1=clockwise, 2=alternate, 3=random per ring
			ringSpread: 0.6, // 0 = same speed everywhere, 1 = fully random per ring
			ringGradient: 0.0, // -1..1 speed ramp centre→edge
			ringSeed: 0.0, // reroll the random speeds/directions
			mix: 1.0,
			_phase: 0.0, // integrated from timeMultiplier — no jump when speed changes
			uniforms: {
				uTime: "_phase",
				uResolution: "[width, height]",
				uCenter: "center",
				uRingBands: "ringBands",
				uRingRadius: "ringRadius",
				uRingDirection: "ringDirection",
				uRingSpread: "ringSpread",
				uRingGradient: "ringGradient",
				uRingSeed: "ringSeed",
				uMix: "mix",
			},
		},
	},
	chromatic: {
		dir: "chromatic-aberration",
		config: {
			enabled: true,
			amount: 0.001,
			timeMultiplier: 0.0,
			uniforms: {
				uTime: "shaderTime * timeMultiplier",
				uSeed: "shaderSeed + 777.0",
				uAmount: "amount",
			},
		},
	},

	crtDisplay: {
		dir: "pixel-checker",
		config: {
			enabled: false,
			brightness: 0.0,
			cellSize: 2.0, // px @ short-edge 1000 (× sizeScale)
			gapOpacity: 0.0,
			rgbOpacity: 0.0,
			rgbGain: [1.0, 1.0, 1.0],
			dotRadius: 0.41,
			dotFalloff: 0.4,
			filterMode: 0.0,
			uniforms: {
				uResolution: "[width, height]",
				uBrightness: "brightness",
				uCellSize: "cellSize * sizeScale",
				uGapOpacity: "gapOpacity",
				uRgbOpacity: "rgbOpacity",
				uRgbGain: "rgbGain",
				uDotRadius: "dotRadius",
				uDotFalloff: "dotFalloff",
				uFilterMode: "filterMode",
			},
		},
	},
	blur: {
		dir: "blur",
		config: {
			enabled: false,
			blurMode: 1.0, // 0=gaussian, 1=radial, 2=directional
			// Gaussian/directional: px @ short-edge 1000 (× sizeScale). Radial: UV units ×0.01 (no scale).
			blurAmount: 43.0,
			blurQuality: 120.0, // Sampling quality (1-8, higher = better but slower)
			blurDirection: 0, // Angle in radians for directional mode
			blurCenter: [0.5, 0.5], // Center for radial mode (normalized 0-1)
			blurStart: 0.6, // Radial mode: starting radius (0-1, blur kicks in beyond this distance)
			blurCrt: 1.0, // Radial mode: 0.0 = circular, 1.0 = super-ellipse (CRT shape)
			blurCrtPower: 27.0, // Super-ellipse exponent (2.0 = ellipse, 4.0+ = more rectangular/CRT-like)
			blurMin: 0.0, // Radial mode: minimum blur amount at blurStart (0 = sharp center, >0 = always some blur)
			uniforms: {
				uResolution: "[width, height]",
				uBlurMode: "blurMode",
				// Modes 0/2 are texel-sized; mode 1 is UV-based and already size-stable.
				uBlurAmount: "(blurMode < 0.5 || blurMode > 1.5) ? (blurAmount * sizeScale) : blurAmount",
				uBlurQuality: "blurQuality",
				uBlurDirection: "blurDirection",
				uBlurCenter: "blurCenter",
				uBlurStart: "blurStart",
				uBlurCrt: "blurCrt",
				uBlurCrtPower: "blurCrtPower",
				uBlurMin: "blurMin",
			},
		},
	},

	crtWarp: {
		dir: "crt-warp",
		config: {
			enabled: false,
			warpAmount: 0.25,
			aspectCorrect: 0.0,
			borderColor: 2.0,
			vignette: 0.5,
			cornerSmooth: 0.015,
			cornerRadius: 0.1,
			boundsInset: 0.075,
			rgbGain: [1.0, 1.0, 1.0],
			uniforms: {
				uResolution: "[width, height]",
				uWarpAmount: "warpAmount",
				uAspectCorrect: "aspectCorrect",
				uCornerRadius: "cornerRadius",
				uCornerSmooth: "cornerSmooth",
				uBorderColor: "borderColor",
				uVignette: "vignette",
				uBoundsInset: "boundsInset",
				uRgbGain: "rgbGain",
			},
		},
	},
	glitchDisplacement: {
		dir: "glitch-displacement",
		config: {
			enabled: false,
			timeMultiplier: 21.0,
			// intensity / lineDensity are relative to REF=1000px (BASE_WIDTH)
			intensity: 6.6, // horizontal shift in px @ 1000 wide
			lineDensity: 1000.0, // bands across 1000px height (floors at 1px @ REF)
			speed: 100.0,
			threshold: 0.85,
			uniforms: {
				uTime: "shaderTime * timeMultiplier",
				uResolution: "[width, height]",
				uIntensity: "intensity",
				uLineDensity: "lineDensity",
				uSpeed: "speed",
				uThreshold: "threshold",
			},
		},
	},
	grain: {
		dir: "grain",
		config: {
			enabled: true,
			amount: 0.1,
			grainSize: 1.0, // 1 = original look; higher values make larger grain
			angle: 0.25, // grain field rotation in radians (0.25 = original look)
			timeMultiplier: 0.0,
			// Spatial threshold (UV 0-1): grain visible only inside this rectangle
			thresholdMinX: 0.0, // left [0..1]
			thresholdMaxX: 1.0, // right [0..1]
			thresholdMinY: 0.0, // bottom [0..1]
			thresholdMaxY: 1.0, // top [0..1]
			thresholdSmooth: 0.001, // soft edge at boundaries (0 = hard edge)
			uniforms: {
				uTime: "shaderTime * timeMultiplier",
				uSeed: "shaderSeed + 345.0",
				uAmount: "amount",
				uGrainSize: "grainSize",
				uAngle: "angle",
				uThresholdMinX: "thresholdMinX",
				uThresholdMaxX: "thresholdMaxX",
				uThresholdMinY: "thresholdMinY",
				uThresholdMaxY: "thresholdMaxY",
				uThresholdSmooth: "thresholdSmooth",
			},
		},
	},
	wave: {
		dir: "wave",
		vertex: "vertex.frag",
		config: {
			enabled: false,
			timeMultiplier: 1.1,
			center: [0.5, 0.5], // wave origin in normalized UV (0–1)
			amount: 1.0, // Overall mix [0..1]
			spiralAmount: 1.0, // Spiral displacement strength
			spiralFrequency: 12.0, // Ring density
			spiralSpeed: 1.0, // Spiral animation rate
			falloff: 1.414, // Radial falloff (√2 = full diagonal)
			pulseAmount: 0.0, // Extra pulse modulation (0 = legacy look)
			pulseSpeed: 1.7, // Pulse oscillation rate
			waveAmount: 0.0, // Cartesian ripple (0 ≈ legacy nearly-off)
			waveFrequency: 1.0, // Ripple spatial frequency
			uniforms: {
				uTime: "shaderTime * timeMultiplier",
				uResolution: "[width, height]",
				uCenter: "center",
				uAmount: "amount",
				uSpiralAmount: "spiralAmount",
				uSpiralFrequency: "spiralFrequency",
				uSpiralSpeed: "spiralSpeed",
				uFalloff: "falloff",
				uPulseAmount: "pulseAmount",
				uPulseSpeed: "pulseSpeed",
				uWaveAmount: "waveAmount",
				uWaveFrequency: "waveFrequency",
			},
		},
	},
};
