let noiseCanvasWidth = 1;
let noiseCanvasHeight = 1;

/**
 * p5 2.x top-level globals compat.
 * Math helpers like max/min/map are only bound to window after the p5 instance
 * starts. Top-level sketch code (e.g. `const DEFAULT_SIZE = max(...)`) needs
 * them earlier — otherwise the throw leaves later `let` bindings in the TDZ
 * while hoisted setup() still runs. Lives here because every branch already
 * loads utils.js before sketch.js. p5 overwrites these once global mode inits.
 */
(function (root) {
	if (!root || root.__p5ToplevelCompatApplied) return;
	root.__p5ToplevelCompatApplied = true;

	function define(name, fn) {
		if (typeof root[name] === "undefined") root[name] = fn;
	}
	function toNums(args) {
		return args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
	}

	define("abs", Math.abs);
	define("ceil", Math.ceil);
	define("exp", Math.exp);
	define("floor", Math.floor);
	define("log", Math.log);
	define("pow", Math.pow);
	define("round", Math.round);
	define("sqrt", Math.sqrt);
	define("sq", (n) => n * n);
	define("fract", (n) => n - Math.floor(n));

	define("sin", Math.sin);
	define("cos", Math.cos);
	define("tan", Math.tan);
	define("asin", Math.asin);
	define("acos", Math.acos);
	define("atan", Math.atan);
	define("atan2", Math.atan2);

	define("degrees", (radians) => (radians * 180) / Math.PI);
	define("radians", (degrees) => (degrees * Math.PI) / 180);

	define("min", function () {
		return Math.min.apply(Math, toNums(arguments));
	});
	define("max", function () {
		return Math.max.apply(Math, toNums(arguments));
	});
	define("constrain", (n, low, high) => Math.max(Math.min(n, high), low));
	define("lerp", (start, stop, amt) => start + (stop - start) * amt);
	define("norm", (value, start, stop) => (value - start) / (stop - start));
	define("map", (value, start1, stop1, start2, stop2, withinBounds) => {
		const outgoing = start2 + ((stop2 - start2) * (value - start1)) / (stop1 - start1);
		if (!withinBounds) return outgoing;
		if (start2 < stop2) return Math.max(Math.min(outgoing, stop2), start2);
		return Math.max(Math.min(outgoing, start2), stop2);
	});
	define("dist", function () {
		if (arguments.length === 4) {
			return Math.hypot(arguments[2] - arguments[0], arguments[3] - arguments[1]);
		}
		if (arguments.length === 6) {
			return Math.hypot(arguments[3] - arguments[0], arguments[4] - arguments[1], arguments[5] - arguments[2]);
		}
		return NaN;
	});
	define("mag", function () {
		if (arguments.length === 2) return Math.hypot(arguments[0], arguments[1]);
		if (arguments.length === 3) return Math.hypot(arguments[0], arguments[1], arguments[2]);
		return NaN;
	});

	const constants = {
		PI: Math.PI,
		TWO_PI: Math.PI * 2,
		HALF_PI: Math.PI / 2,
		QUARTER_PI: Math.PI / 4,
		TAU: Math.PI * 2,
	};
	for (const [name, value] of Object.entries(constants)) {
		if (typeof root[name] === "undefined") root[name] = value;
	}
})(typeof window !== "undefined" ? window : globalThis);

/**
 * p5 2.x preload() compatibility (based on processing/p5.js-compatibility).
 * p5 2 no longer calls preload(); this addon runs window.preload in presetup
 * and restores 1.x-style load* stubs so existing sketches keep working.
 */
(function registerP5PreloadCompat(root) {
	if (!root || root.__p5PreloadCompatApplied) return;
	if (typeof p5 === "undefined" || typeof p5.registerAddon !== "function") return;
	root.__p5PreloadCompatApplied = true;

	function addPreload(p5Ctor, fn, lifecycles) {
		const placeholderFactories = {
			loadImage: () => new p5Ctor.Image(1, 1),
			loadModel: () => new p5Ctor.Geometry(),
			loadJSON: () => ({}),
			loadStrings: () => [],
			loadFont: (pInst) => new p5Ctor.Font(pInst, new FontFace("default", "default.woff")),
		};

		p5Ctor.isPreloadSupported = function () {
			return true;
		};

		const promises = [];

		for (const method in placeholderFactories) {
			if (typeof fn[method] !== "function") continue;
			const prevMethod = fn[method];
			fn[method] = function (...args) {
				if (!this._isInPreload) return prevMethod.apply(this, args);
				const obj = placeholderFactories[method](this);
				const promise = Promise.resolve(prevMethod.apply(this, args)).then((result) => {
					if (result && typeof result === "object") {
						for (const key in result) obj[key] = result[key];
					}
					return result;
				});
				promises.push(promise);
				return obj;
			};
		}

		// loadShader is used heavily by this library; track it during preload too
		if (typeof fn.loadShader === "function") {
			const prevLoadShader = fn.loadShader;
			fn.loadShader = function (...args) {
				const result = prevLoadShader.apply(this, args);
				if (this._isInPreload && result && typeof result.then === "function") {
					promises.push(result);
				}
				return result;
			};
		}

		if (typeof fn.loadBytes === "function") {
			const prevLoadBytes = fn.loadBytes;
			fn.loadBytes = function (...args) {
				if (!this._isInPreload) return prevLoadBytes.apply(this, args);
				const obj = {};
				promises.push(
					Promise.resolve(prevLoadBytes.apply(this, args)).then((result) => {
						obj.bytes = result;
						return result;
					}),
				);
				return obj;
			};
		}

		lifecycles.presetup = async function () {
			const preloadFn = root.preload;
			if (typeof preloadFn !== "function") return;

			this._isInPreload = true;
			try {
				const maybePromise = preloadFn.call(this);
				if (maybePromise && typeof maybePromise.then === "function") {
					promises.push(maybePromise);
				}
			} finally {
				this._isInPreload = false;
			}

			await Promise.all(promises);
			promises.length = 0;
		};
	}

	p5.registerAddon(addPreload);
})(typeof window !== "undefined" ? window : globalThis);

// Check if the sketch is running in an iframe
function isInIframe() {
	try {
		return window !== window.top;
	} catch (e) {
		return true;
	}
}

// Check if the user is on Safari mobile
function isSafariMobile() {
	const ua = window.navigator.userAgent;
	const iOS = !!ua.match(/iPad/i) || !!ua.match(/iPhone/i);
	const webkit = !!ua.match(/WebKit/i);
	const iOSSafari = iOS && webkit && !ua.match(/CriOS/i);
	return iOSSafari;
}

// Load user-created palettes persisted by the params UI (browser-only, never
// part of the deterministic fxrand pool — see ChromaPalette.getFileNames)
function loadLocalPalettes(manager, storageKey = "fx_longform2:userPalettes") {
	let stored;
	try {
		stored = JSON.parse(localStorage.getItem(storageKey)) || {};
	} catch {
		return;
	}
	for (const [name, def] of Object.entries(stored)) {
		try {
			if (manager.getConfig(name)?.source === "file") {
				console.warn(`Local palette '${name}' shadows a file palette — skipped`);
				continue;
			}
			manager.addPalette(name, def, {source: "local"});
		} catch (error) {
			console.warn(`Skipping invalid local palette '${name}':`, error.message);
		}
	}
}

/**
 * Build a ChromaPalette from file defs + optional localStorage overlays.
 * @param {Object} [opts]
 * @param {Object} [opts.defaults] - ChromaPalette defaults ({ mode, steps })
 * @param {Object} [opts.palettes] - { name: def, ... } file palettes
 * @param {string} [opts.storageKey] - localStorage key for user palettes
 * @param {boolean} [opts.exposeGlobal=true] - set window.paletteManager
 * @param {boolean} [opts.loadLocal=true] - merge localStorage palettes
 * @returns {{ manager: ChromaPalette, ready: boolean }}
 */
function initChromaPalettes({defaults, palettes = {}, storageKey, exposeGlobal = true, loadLocal = true} = {}) {
	const manager = new ChromaPalette(defaults);
	manager.addPalettes(palettes, {source: "file"});
	if (loadLocal) {
		loadLocalPalettes(manager, storageKey);
	}
	if (exposeGlobal) {
		window.paletteManager = manager;
	}
	return {manager, ready: manager.isReady()};
}

/**
 * Whether shaders are enabled and the global shaderEffects object exists.
 * @param {boolean} [flag=true] - project-level ENABLE_SHADERS toggle
 */
function shadersEnabled(flag = true) {
	return !!flag && typeof shaderEffects !== "undefined";
}

/**
 * Bust p5's internal style cache when drawing code writes to drawingContext directly.
 * Call before re-init / Apply so the next g.fill(...) re-applies fillStyle.
 */
function flushGraphicsStyleCache(g) {
	if (!g?.fill || !g?.colorMode) return;
	try {
		// No push/pop here: pop() restores p5's cached style state, which would
		// undo the bust and let p5 keep skipping fillStyle writes that match its
		// stale cache (the context may hold a raw fillStyle written directly by
		// drawing code, e.g. Mover.show). Callers must set their own colorMode
		// and fill/stroke after this.
		g.colorMode(RGB, 255, 255, 255, 255);
		g.fill(255, 0, 255, 255); // sentinel — unlikely to match any intended fill
		g.stroke(255, 0, 255, 255);
		g.noStroke();
	} catch {
		// ignore
	}
}

let clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
let smoothstep = (a, b, x) => (((x -= a), (x /= b - a)) < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));
let mix = (a, b, p) => a + p * (b - a);

/**
 * Deterministic float in [0, 1) from fxhash without advancing `$fx.rand()` / `fxrand()`.
 * Use this in optional library subsystems (shaders, overlays, helpers) so enabling
 * them cannot shift the project's composition random stream.
 * @param {number|string} [salt=0] - Domain separator so multiple callers don't collide
 * @returns {number}
 */
function fxhashSeed(salt = 0) {
	const hash = String((typeof $fx !== "undefined" && $fx.hash) || (typeof fxhash !== "undefined" && fxhash) || "");
	const saltStr = String(salt);
	let h = 0x811c9dc5; // FNV-1a offset basis
	for (let i = 0; i < hash.length; i++) {
		h ^= hash.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	for (let i = 0; i < saltStr.length; i++) {
		h ^= saltStr.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0) / 4294967296;
}

// Array[2] dot product — use var (not function) so p5 can bind its own global `dot`.
var vec2Dot = function (v1, v2) {
	if (v1.length !== 2 || v2.length !== 2) {
		throw new Error("Both vectors should have exactly 2 elements.");
	}
	return v1[0] * v2[0] + v1[1] * v2[1];
};

let subtract = (v1, v2) => ({x: v1.x - v2.x, y: v1.y - v2.y});
let multiply = (v1, v2) => ({x: v1.x * v2.x, y: v1.y * v2.y});
let length = (v) => Math.sqrt(v.x * v.x + v.y * v.y);
let randomInt = (max) => Math.floor(Math.random() * max);

let R = (a = 1) => Math.random() * a;
let L = (x, y) => (x * x + y * y) ** 0.5; // Elements by Euclid 300 BC
let k = (a, b) => (a > 0 && b > 0 ? L(a, b) : a > b ? a : b);

// Definitions ===========================================================
({sin, cos, imul, PI} = Math);
TAU = PI * 2;
F = (N, f) => [...Array(N)].map((_, i) => f(i)); // for loop / map / list function

// A seeded PRNG =========================================================
//seed = 'das9d7as9d7as'; // random seed]
//seed = Math.random() * 2 ** 32;

S = Uint32Array.of(9, 7, 5, 3); // PRNG state
R = (a = 1) => a * ((a = S[3]), (S[3] = S[2]), (S[2] = S[1]), (a ^= a << 11), (S[0] ^= a ^ (a >>> 8) ^ ((S[1] = S[0]) >>> 19)), S[0] / 2 ** 32); // random function
[...(seed + "ThxPiter")].map((c) => R((S[3] ^= c.charCodeAt() * 23205))); // seeding the random function

// general noise definitions =============================================
KNUTH = 0x9e3779b1; // prime number close to PHI * 2 ** 32
NSEED = R(2 ** 32); // noise seed, random 32 bit integer
// 3d noise grid function
ri = (i, j, k) => ((i = imul((((i & 1023) << 20) | ((j & 1023) << 10) | ((i ^ j ^ k) & 1023)) ^ NSEED, KNUTH)), (i <<= 3 + (i >>> 29)), (i >>> 1) / 2 ** 31 - 0.5);

// 3D value noise function ===============================================
no = F(99, (_) => R(1024)); // random noise offsets

n3 = (
	x,
	y,
	z,
	s,
	i, // (x,y,z) = coordinate, s = scale, i = noise offset index
	xi = floor((x = x * s + no[(i *= 3)])), // (xi,yi,zi) = integer coordinates
	yi = floor((y = y * s + no[i + 1])),
	zi = floor((z = z * s + no[i + 2])),
) => (
	(x -= xi),
	(y -= yi),
	(z -= zi), // (x,y,z) are now fractional parts of coordinates
	(x *= x * (3 - 2 * x)), // smoothstep polynomial (comment out if true linear interpolation is desired)
	(y *= y * (3 - 2 * y)), // this is like an easing function for the fractional part
	(z *= z * (3 - 2 * z)),
	// calculate the interpolated value
	ri(xi, yi, zi) * (1 - x) * (1 - y) * (1 - z) +
		ri(xi, yi, zi + 1) * (1 - x) * (1 - y) * z +
		ri(xi, yi + 1, zi) * (1 - x) * y * (1 - z) +
		ri(xi, yi + 1, zi + 1) * (1 - x) * y * z +
		ri(xi + 1, yi, zi) * x * (1 - y) * (1 - z) +
		ri(xi + 1, yi, zi + 1) * x * (1 - y) * z +
		ri(xi + 1, yi + 1, zi) * x * y * (1 - z) +
		ri(xi + 1, yi + 1, zi + 1) * x * y * z
);

// 2D value noise function ===============================================
na = F(99, (_) => R(TAU)); // random noise angles
ns = na.map(sin);
nc = na.map(cos); // sin and cos of those angles
nox = F(99, (_) => R(1024)); // random noise x offset
noy = F(99, (_) => R(1024)); // random noise y offset

n2 = (
	x,
	y,
	s,
	i,
	c = nc[i] * s,
	n = ns[i] * s,
	xi = floor((([x, y] = [(x - noiseCanvasWidth / 2) * c + (y - noiseCanvasHeight * 2) * n + nox[i], (y - noiseCanvasHeight * 2) * c - (x - noiseCanvasWidth / 2) * n + noy[i]]), x)),
	yi = floor(y), // (x,y) = coordinate, s = scale, i = noise offset index
) => (
	(x -= xi),
	(y -= yi),
	(x *= x * (3 - 2 * x)),
	(y *= y * (3 - 2 * y)),
	ri(xi, yi, i) * (1 - x) * (1 - y) + ri(xi, yi + 1, i) * (1 - x) * y + ri(xi + 1, yi, i) * x * (1 - y) + ri(xi + 1, yi + 1, i) * x * y
);

//! Spell formula from Piter The Mage
ZZ = (x, m, b, r) => (x < 0 ? x : x > (b *= r * 4) ? x - b : ((x /= r), fract(x / 4) < 0.5 ? r : -r) * ((x = abs(fract(x / 2) - 0.5)), 1 - (x > m ? x * 2 : x * (x /= m) * x * (2 - x) + m)));

// the point of all the previous code is that now you have a very
// fast value noise function called nz(x,y,s,i). It has four parameters:
// x -- the x coordinate
// y -- the y coordinate
// s -- the scale (simply multiplies x and y by s)
// i -- the noise index, you get 99 different random noises! (but you
//      can increase this number by changing the 99s in the code above)
//      each of the 99 noises also has a random rotation which increases
//      the "randomness" if you add many together
//
// ohh also important to mention that it returns smooth noise values
// between -.5 and .5

function oct(x, y, s, i, octaves = 1) {
	let result = 0;
	let sm = 1;
	i *= octaves;
	for (let j = 0; j < octaves; j++) {
		result += n2(x, y, s * sm, i + j) / sm;
		sm *= 2;
	}
	return result;
}

function weighted_choice(data) {
	let total = 0;
	for (let i = 0; i < data.length; ++i) {
		total += data[i][1];
	}
	const threshold = rand() * total;
	total = 0;
	for (let i = 0; i < data.length - 1; ++i) {
		total += data[i][1];
		if (total >= threshold) {
			return data[i][0];
		}
	}
	return data[data.length - 1][0];
}

let mapValue = (v, s, S, a, b) => ((v = Math.min(Math.max(v, s), S)), ((v - s) * (b - a)) / (S - s) + a);
const pmap = (v, cl, cm, tl, th, c) => (c ? Math.min(Math.max(((v - cl) / (cm - cl)) * (th - tl) + tl, tl), th) : ((v - cl) / (cm - cl)) * (th - tl) + tl);

function sdf_box([x, y], [cx, cy], [w, h], r = 0) {
	x -= cx;
	y -= cy;

	// Use the original calculation for sharp corners when r is 0
	if (r === 0) {
		return k(abs(x) - w, abs(y) - h);
	}

	// Calculate the distance with border radius
	let dx = abs(x) - w + r;
	let dy = abs(y) - h + r;
	// External distance
	let external = L(Math.max(dx, 0), Math.max(dy, 0)) - r;
	// Internal distance
	let internal = Math.min(Math.max(dx, dy), 0);
	return external + internal;
}

function sdf_circle([x, y], [cx, cy], r) {
	x -= cx;
	y -= cy;
	return L(x, y) - r;
}

function sdf_pentagon([x, y], [cx, cy], r, cornerRadius = 0) {
	// Translate point relative to center
	x -= cx;
	y -= cy;

	// Rotate pentagon so vertex points up (standard orientation)
	const rotation = Math.PI / 2; // 90 degrees
	const cosR = Math.cos(rotation);
	const sinR = Math.sin(rotation);
	let px = x * cosR - y * sinR;
	let py = x * sinR + y * cosR;

	// Calculate angle from positive y-axis (since vertex points up)
	let angle = Math.atan2(px, py);
	angle = Math.abs(angle);

	// Pentagon has 5 sectors, each is 72 degrees (2π/5)
	const sectorAngle = TAU / 5;
	const halfSector = sectorAngle / 2;

	// Reduce to first sector using symmetry
	let sector = Math.floor(angle / sectorAngle);
	angle = angle - sector * sectorAngle;
	// Rotate to center of sector (symmetric around y-axis)
	angle = angle - halfSector;

	// Calculate signed distance to pentagon edge
	// The edge line in the first sector makes an angle of halfSector with y-axis
	let dist = L(px, py);
	// Distance to edge: r * cos(halfSector) / cos(angle) gives the distance along the ray
	let edgeDist = (r * Math.cos(halfSector)) / Math.cos(Math.abs(angle));

	// Apply corner rounding if specified
	if (cornerRadius > 0) {
		// Calculate distance to the nearest corner (vertex)
		// Corners are at the boundaries between sectors
		let cornerAngle = Math.abs(angle);
		// Distance from center to corner vertex
		let cornerDist = r / Math.cos(halfSector);
		// Distance from point to corner
		let distToCorner = L(px - 0, py - cornerDist);
		// Round the corner by subtracting the corner radius
		let roundedCornerDist = distToCorner - cornerRadius;

		// Blend between edge distance and rounded corner distance
		// Use smoothstep to transition near corners
		let cornerBlend = smoothstep(halfSector * 0.7, halfSector, cornerAngle);
		edgeDist = mix(edgeDist, roundedCornerDist + r - cornerDist, cornerBlend);
	}

	// Signed distance: positive outside, negative inside
	return dist - edgeDist;
}

function sdf_hexagon(p, c, r) {
	// Vector from the center of the hexagon to the point
	let q = [Math.abs(p[0] - c[0]), Math.abs(p[1] - c[1])];

	// Rotate the hexagon 30 degrees
	let rotated = [q[0] * Math.cos(Math.PI / 6) - q[1] * Math.sin(Math.PI / 6), q[0] * Math.sin(Math.PI / 6) + q[1] * Math.cos(Math.PI / 6)];

	// Calculate the distance to the rotated hexagon
	let d = Math.max(rotated[1], rotated[0] * 0.5 + rotated[1] * 0.5);

	// Subtract the radius to get the signed distance
	let dist = d - r;

	return dist;
}

let dpi = (maxDPI = 3.0) => {
	var ua = window.navigator.userAgent;
	var iOS = !!ua.match(/iPad/i) || !!ua.match(/iPhone/i);
	var webkit = !!ua.match(/WebKit/i);
	var iOSSafari = iOS && webkit && !ua.match(/CriOS/i);
	let mobileDPI = maxDPI * 2;
	if (iOSSafari) {
		if (mobileDPI > 6) {
			mobileDPI = 6;
		}
		return mobileDPI;
	} else {
		return maxDPI;
	}
};

// Helper function to truncate multiplier calculations to 2 decimals
function truncateMultiplier(value, decimals = 2) {
	return Math.round(value * 10 ** decimals) / 10 ** decimals;
}

/* ---------- Helper: round off noise coords --------------- */
function truncateNoiseCoord(val, p = 5) {
	return Math.round(val * 10 ** p) / 10 ** p;
}

// if cmd + s is pressed, save the canvas
// Named to avoid colliding with p5's global saveCanvas (browsers make
// top-level function declarations non-configurable on window).
function handleSaveCanvasShortcut(event) {
	const logger = window.Logger || console;
	logger.debug ? logger.debug("handleSaveCanvasShortcut called") : logger.log("handleSaveCanvasShortcut called");
	if (event.key === "s" && (event.metaKey || event.ctrlKey)) {
		logger.info ? logger.info("Save shortcut detected") : logger.log("Save shortcut detected");
		saveArtwork();
		event.preventDefault();
		return false;
	}
}

document.addEventListener("keydown", handleSaveCanvasShortcut);
document.addEventListener("keydown", toggleGuides);

// Function to toggle guide lines visibility
function toggleGuides(event) {
	// Toggle guides when 'g' key is pressed
	if (event.key === "g") {
		let guideContainer = document.querySelector(".guide-container");

		// Create guide container if it doesn't exist
		if (!guideContainer) {
			guideContainer = document.createElement("span");
			guideContainer.className = "guide-container";
			document.querySelector("main").appendChild(guideContainer);
		}

		// Toggle the show class
		guideContainer.classList.toggle("show");
		const logger = window.Logger || console;
		logger.info ? logger.info("Guides toggled") : logger.log("Guides toggled");
	}
}

/**
 * Resolve the on-screen artwork canvas for export.
 * createGraphics() often claims defaultCanvas0 (and may not be in the DOM);
 * createCanvas() / WEBGL may use defaultCanvas1+. Prefer the live p5 main canvas.
 */
function resolveSaveCanvas() {
	// p5 global-mode main canvas (HTMLCanvasElement)
	if (typeof canvas !== "undefined" && canvas instanceof HTMLCanvasElement) {
		return canvas;
	}
	// p5.Element from createCanvas (WEBGL or 2D)
	if (typeof drawingContext !== "undefined" && drawingContext?.canvas instanceof HTMLCanvasElement) {
		return drawingContext.canvas;
	}
	const byId = document.getElementById("defaultCanvas0");
	if (byId instanceof HTMLCanvasElement && byId.isConnected) {
		return byId;
	}
	const p5Canvases = [...document.querySelectorAll("canvas.p5Canvas")];
	const visible = p5Canvases.find((c) => {
		const r = c.getBoundingClientRect();
		return r.width > 0 && r.height > 0 && getComputedStyle(c).display !== "none";
	});
	if (visible) return visible;
	return p5Canvases[0] || document.querySelector("canvas");
}

/**
 * Mount the display canvas in main.main and publish logical aspect as CSS
 * variables so style.css can contain-fit to the viewport.
 * Uses logical size (p5 width/height), NOT bitmap size — so pixelDensity
 * does not affect on-screen layout; export still uses the full buffer.
 */
function fitDisplayToViewport() {
	const canvasEl = resolveSaveCanvas();
	if (!(canvasEl instanceof HTMLCanvasElement)) return;

	const mainEl = document.querySelector("main.main");
	if (mainEl && canvasEl.parentElement !== mainEl) {
		const frame = mainEl.querySelector(".frame");
		if (frame && frame.nextSibling) {
			mainEl.insertBefore(canvasEl, frame.nextSibling);
		} else {
			mainEl.appendChild(canvasEl);
		}
	}

	// Logical artwork size (ignore pixelDensity / backing-store scale)
	let logicalW = typeof width === "number" && width > 0 ? width : 0;
	let logicalH = typeof height === "number" && height > 0 ? height : 0;
	if (!logicalW || !logicalH) {
		const density = (typeof pixelDensity === "function" ? pixelDensity() : null) || (typeof pixel_density === "number" ? pixel_density : 1) || 1;
		logicalW = (canvasEl.width || 1) / Math.max(1, density);
		logicalH = (canvasEl.height || 1) / Math.max(1, density);
	}

	const root = document.documentElement;
	root.style.setProperty("--art-w", String(logicalW));
	root.style.setProperty("--art-h", String(logicalH));

	// Drop any previous JS pixel sizing — CSS owns display size
	canvasEl.style.removeProperty("width");
	canvasEl.style.removeProperty("height");
	canvasEl.style.removeProperty("max-width");
	canvasEl.style.removeProperty("max-height");
	if (mainEl) {
		mainEl.style.removeProperty("width");
		mainEl.style.removeProperty("height");
	}

	if (typeof updateDebugOverlay === "function" && typeof debugBounds !== "undefined") {
		try {
			const padding =
				typeof getArtworkPaddingNorm === "function"
					? getArtworkPaddingNorm(typeof width === "number" ? width : 1, typeof height === "number" ? height : 1)
					: typeof CANVAS_CONFIG !== "undefined"
						? CANVAS_CONFIG.ARTWORK_PADDING
						: typeof BASE_PADDING !== "undefined"
							? BASE_PADDING
							: 0.1;
			updateDebugOverlay({
				debugBounds: !!debugBounds,
				padding,
				movers: typeof movers !== "undefined" ? movers : [],
			});
		} catch {
			// ignore
		}
	}
}

// make a function to save the canvas as a png file with the git branch name and a timestamp
function saveArtwork() {
	const logger = window.Logger || console;
	var output_hash = fxhash;
	logger.debug ? logger.debug("Hash for save: " + output_hash) : logger.log("Hash for save:", output_hash);
	var canvasEl = resolveSaveCanvas();
	var d = new Date();
	var datestring = `${d.getMonth() + 1}` + "_" + d.getDate() + "_" + d.getFullYear() + "_" + `${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}_${fxhash}`;
	logger.debug ? logger.debug("Canvas element: " + (canvasEl ? "Found" : "Not found")) : logger.log("Canvas element:", canvasEl);
	if (!canvasEl) {
		logger.error ? logger.error("Save failed: no canvas found") : logger.error("Save failed: no canvas found");
		return;
	}
	var fileName = datestring + ".png";

	// Standard download for other browsers
	const imageUrl = canvasEl.toDataURL("image/png").replace("image/png", "image/octet-stream");
	const a = document.createElement("a");
	a.href = imageUrl;
	a.setAttribute("download", fileName);
	a.click();

	logger.success ? logger.success("Saved " + fileName) : logger.log("saved " + fileName);
}

// Create and show download button (only if not in iframe)
function createDownloadButton() {
	// Don't show button if in iframe
	if (isInIframe()) {
		return;
	}

	// Check if button already exists
	if (document.getElementById("download-button")) {
		return;
	}

	// Wait a bit for the canvas to be ready (p5 2.x / WEBGL may not use defaultCanvas0)
	setTimeout(() => {
		const canvas = resolveSaveCanvas();
		if (!canvas) {
			console.log("Canvas not ready yet, retrying...");
			createDownloadButton();
			return;
		}

		createDownloadButtonUI();
	}, 500);
}

function createDownloadButtonUI() {
	// Create simple download button
	const downloadButton = document.createElement("button");
	downloadButton.id = "download-button";
	downloadButton.textContent = "Download";
	// Add button class for styling consistency
	downloadButton.className = "control-button";

	// Add click handler
	downloadButton.addEventListener("click", () => {
		saveArtwork();
	});

	// Add button to mobile controls container if it exists, otherwise to body
	const controls = document.getElementById("controls");
	if (controls) {
		controls.appendChild(downloadButton);
	} else {
		// Fallback: add to body with inline styles
		downloadButton.style.cssText = `
			position: fixed;
			top: 20px;
			right: 20px;
			z-index: 1000;
			background: rgba(0, 0, 0, 0.8);
			color: white;
			border: none;
			border-radius: 8px;
			padding: 12px 20px;
			font-size: 16px;
			cursor: pointer;
		`;
		document.body.appendChild(downloadButton);
	}
}

// url search params
const sp = new URLSearchParams(window.location.search);

/**
 * Shows a loading bar with progress and time estimation
 * @param {number} elapsedTime - Current elapsed time
 * @param {number} maxFrames - Total number of frames
 * @param {number} renderStart - Timestamp when rendering started
 * @param {number} framesRendered - Number of frames rendered so far
 */
function showLoadingBar(elapsedTime, maxFrames, renderStart, framesRendered) {
	let currentTime = Date.now();
	let totalElapsedTime = currentTime - renderStart;

	let percent = (elapsedTime / maxFrames) * 100;
	if (percent > 100) percent = 100;

	let averageFrameTime = totalElapsedTime / framesRendered;
	let remainingFrames = maxFrames - framesRendered;
	let estimatedTimeRemaining = averageFrameTime * remainingFrames;

	// Convert milliseconds to seconds
	let timeLeftSec = Math.round(estimatedTimeRemaining / 1000);

	// Format time display
	let timeDisplay;
	if (timeLeftSec > 60) {
		let minutes = Math.floor(timeLeftSec / 60);
		let seconds = timeLeftSec % 60;
		timeDisplay = `${minutes}m ${seconds}s`;
	} else {
		timeDisplay = `${timeLeftSec}s`;
	}

	// put the percent in the title of the page
	document.title = percent.toFixed(0) + "% - Time left : " + timeDisplay;

	// Update shader system with loading progress if available
	if (typeof shaderEffects !== "undefined" && shaderEffects.setLoadingProgress) {
		const progressNormalized = percent / 100.0; // Convert 0-100 to 0.0-1.0
		shaderEffects.setLoadingProgress(progressNormalized);
	}
}

/**
 * Creates a generator function for animation rendering
 * @param {Object} config - Configuration object
 * @param {Array} config.items - Array of items to animate
 * @param {number} config.maxFrames - Maximum number of frames to render
 * @param {number} config.startTime - Starting frame count
 * @param {number} config.cycleLength - Number of items to process before yielding
 * @param {Function} config.renderItem - Function to render a single item
 * @param {Function} config.moveItem - Function to update item position
 * @param {Function} config.onComplete - Callback when animation is complete
 * @returns {Generator} A generator function that handles the animation
 */
function createAnimationGenerator(config) {
	const {items, maxFrames, startTime, cycleLength, renderItem, moveItem, onComplete, frameMode} = config;

	let elapsedTime = 0;
	let framesRendered = 0;
	let renderStart = Date.now();
	let drawing = true;
	let totalOperations = maxFrames ? items.length * maxFrames : Infinity;
	let operationsCompleted = 0;
	let currentFrame = 0;

	// frameMode: yield once per complete pass — all items stay in sync (p5 draw-loop style)
	if (frameMode) {
		function* frameModeGenerator() {
			while (drawing) {
				for (let i = 0; i < items.length; i++) {
					if (renderItem) renderItem(items[i], currentFrame);
					if (moveItem) moveItem(items[i], currentFrame);
				}
				currentFrame++;
				framesRendered++;
				if (maxFrames) {
					showLoadingBar(currentFrame, maxFrames, renderStart, framesRendered);
					if (currentFrame >= maxFrames) {
						drawing = false;
						if (onComplete) onComplete();
						return;
					}
				}
				yield;
			}
		}
		return frameModeGenerator();
	}

	function* animationGenerator() {
		let count = 0;

		while (drawing) {
			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				if (renderItem) {
					renderItem(item, currentFrame);
				}
				if (moveItem) {
					moveItem(item, currentFrame);
				}
				operationsCompleted++;

				if (count > cycleLength) {
					count = 0;

					if (maxFrames) {
						// Calculate progress based on total operations instead of just frames
						let progress = (operationsCompleted / totalOperations) * maxFrames;
						showLoadingBar(progress, maxFrames, renderStart, framesRendered);

						// Check if we've reached 100%
						if (progress >= maxFrames) {
							drawing = false;
							if (onComplete) {
								onComplete();
							}
							return;
						}
					}

					yield;
				}
				count++;
			}

			currentFrame++;
			elapsedTime = currentFrame;
			framesRendered++;
		}
	}

	return animationGenerator();
}

/**
 * Starts an animation loop using a generator
 * @param {Generator} generator - The animation generator instance
 * @returns {number} The animation timeout ID
 */
function startAnimation(generator) {
	let animation;

	function animate() {
		animation = setTimeout(animate, 0);
		generator.next();
	}

	animate();
	return animation;
}

/**
 * A simple timer utility for measuring execution time
 */
class ExecutionTimer {
	constructor() {
		this.startTime = null;
		this.endTime = null;
	}

	start() {
		this.startTime = Date.now();
		return this;
	}

	stop() {
		this.endTime = Date.now();
		return this;
	}

	getElapsedTime() {
		if (!this.startTime) {
			const logger = window.Logger || console;
			logger.warning ? logger.warning("Timer was not started") : logger.warn("Timer was not started");
			return 0;
		}
		const endTime = this.endTime || Date.now();
		return (endTime - this.startTime) / 1000; // Convert to seconds
	}

	logElapsedTime(message = "Execution completed in") {
		const logger = window.Logger || console;
		logger.info ? logger.info(`${message} ${this.getElapsedTime().toFixed(2)} seconds`) : logger.log(`${message} ${this.getElapsedTime().toFixed(2)} seconds`);
		return this;
	}

	reset() {
		this.startTime = null;
		this.endTime = null;
		return this;
	}
}

/**
 * P5.js Dimension-Agnostic Utilities
 * Simple adaptation of SketchEngine for p5.js
 */

// Global state for dimension-agnostic scaling
let p5PixelRatio = 1;
let p5LogicalSize = null;
let p5ScaleFactor = 1;

/**
 * Sets the pixel ratio for the p5.js canvas
 * @param {number} ratio - The pixel ratio to set
 */
function setPixelRatio(ratio) {
	p5PixelRatio = ratio;
	if (typeof resizeCanvas === "function") {
		resizeCanvas(width, height);
	}
}

/**
 * Sets the dimension-agnostic logical size
 * @param {number} logicalSize - The logical size for scaling
 */
function setDimensionAgnostic(logicalSize) {
	p5LogicalSize = logicalSize;
	_updateP5Scaling();
}

/**
 * Updates the p5.js scaling transformation
 */
function _updateP5Scaling() {
	if (p5LogicalSize && typeof width !== "undefined" && typeof height !== "undefined") {
		p5ScaleFactor = Math.min(width, height) / p5LogicalSize;
		// Apply the transformation directly
		scale(p5PixelRatio * p5ScaleFactor);
	} else {
		p5ScaleFactor = 1;
		scale(p5PixelRatio);
	}
}

/**
 * Resizes the p5.js canvas with proper scaling
 * @param {number} w - New width
 * @param {number} h - New height
 */
function resizeP5Canvas(w, h) {
	if (typeof resizeCanvas === "function") {
		resizeCanvas(w, h);
		_updateP5Scaling();
	}
}

// ============================================================================
// SKETCH DRAW LOOP / CONTROLS / DEBUG OVERLAY
// ============================================================================

/**
 * Create a rAF draw loop that advances a generator and optionally runs shaderEffects.
 * @param {Object} opts
 * @param {() => Generator} opts.getGenerator
 * @param {() => boolean} opts.isShadersEnabled
 * @param {() => *} opts.getShaderCanvas
 * @param {() => *} opts.getMainCanvas
 * @returns {{ start: Function, stop: Function }}
 */
function createSketchDrawLoop({getGenerator, isShadersEnabled, getShaderCanvas, getMainCanvas}) {
	let animationFrameId = null;

	function tick() {
		const generator = typeof getGenerator === "function" ? getGenerator() : null;
		if (!generator) return;

		const result = generator.next();
		const shadersOn = typeof isShadersEnabled === "function" ? isShadersEnabled() : false;
		const shaderCanvas = typeof getShaderCanvas === "function" ? getShaderCanvas() : null;
		const mainCanvas = typeof getMainCanvas === "function" ? getMainCanvas() : null;

		if (shadersOn && shaderCanvas) {
			const shouldContinue = shaderEffects.renderFrame(result.done, tick);
			if (shouldContinue) {
				animationFrameId = requestAnimationFrame(tick);
			}
		} else {
			clear();
			image(mainCanvas, 0, 0);
			if (shadersOn) {
				shaderEffects.updateFPS();
				shaderEffects.drawFPS();
			}
			if (!result.done) {
				animationFrameId = requestAnimationFrame(tick);
			}
		}
	}

	return {
		start() {
			tick();
		},
		stop() {
			if (animationFrameId !== null) {
				try {
					cancelAnimationFrame(animationFrameId);
				} catch {
					// ignore
				}
				animationFrameId = null;
			}
		},
	};
}

function setFpsButtonState(toggleFpsButton, {showFpsUi = true, checkShaders = () => true} = {}) {
	if (!toggleFpsButton || !showFpsUi || !checkShaders()) return;
	if (shaderEffects.showFPS) {
		toggleFpsButton.classList.add("active");
		toggleFpsButton.textContent = "FPS: ON";
	} else {
		toggleFpsButton.classList.remove("active");
		toggleFpsButton.textContent = "FPS: OFF";
	}
}

function toggleFps(from = "unknown", {showFpsUi = true, checkShaders = () => true, buttonId = "toggle-fps"} = {}) {
	if (!showFpsUi) return;
	if (!checkShaders()) return;
	if (typeof isInIframe === "function" && isInIframe()) return;

	shaderEffects.toggleFPS();
	setFpsButtonState(document.getElementById(buttonId), {showFpsUi, checkShaders});
	console.log(`FPS counter toggled (${from}): `, shaderEffects.showFPS);
}

/**
 * Wire optional mobile FPS / download controls (#controls).
 * @param {Object} [opts]
 * @param {boolean} [opts.showFps=false]
 * @param {boolean} [opts.showDownload=false]
 * @param {() => boolean} [opts.checkShaders]
 */
function setupControls({showFps = false, showDownload = false, checkShaders = () => true} = {}) {
	const controlsContainer = document.getElementById("controls");
	if (!controlsContainer) return;

	if (typeof isInIframe === "function" && isInIframe()) {
		controlsContainer.style.display = "none";
		return;
	}

	if (!showFps && !showDownload) {
		controlsContainer.style.display = "none";
		return;
	}

	const toggleFpsButton = document.getElementById("toggle-fps");
	if (!toggleFpsButton) return;
	if (!showFps) {
		toggleFpsButton.style.display = "none";
		return;
	}

	toggleFpsButton.addEventListener("click", function () {
		toggleFps("button", {showFpsUi: showFps, checkShaders});
	});

	setFpsButtonState(toggleFpsButton, {showFpsUi: showFps, checkShaders});
}

/**
 * Position CSS debug overlays over the p5 canvas.
 * @param {Object} [opts]
 * @param {boolean} [opts.debugBounds]
 * @param {number} [opts.padding] - normalized artwork padding (0–1)
 * @param {Array} [opts.movers] - movers with minBoundX/Y maxBoundX/Y
 */
function updateDebugOverlay({debugBounds = false, padding = 0.1, movers = [], overlayId = "debug-bounds", basePaddingId = "debug-base-padding", moverBoundsId = "debug-mover-bounds"} = {}) {
	const debugOverlay = document.getElementById(overlayId);
	const basePaddingEl = document.getElementById(basePaddingId);
	const moverBoundsEl = document.getElementById(moverBoundsId);
	if (!debugOverlay) return;

	if (!debugBounds) {
		debugOverlay.classList.remove("visible");
		return;
	}

	debugOverlay.classList.add("visible");

	const canvas = document.querySelector("canvas");
	if (!canvas) return;

	const canvasRect = canvas.getBoundingClientRect();
	const canvasWidth = canvasRect.width;
	const canvasHeight = canvasRect.height;

	debugOverlay.style.left = canvasRect.left + "px";
	debugOverlay.style.top = canvasRect.top + "px";
	debugOverlay.style.width = canvasWidth + "px";
	debugOverlay.style.height = canvasHeight + "px";

	if (basePaddingEl) {
		let padX;
		let padY;
		if (padding && typeof padding === "object") {
			padX = Number(padding.x) || 0;
			padY = Number(padding.y) || 0;
		} else {
			// Single fraction of the shorter display edge → equal absolute border
			const pad = Math.max(0, Math.min(0.49, Number(padding) || 0));
			const shortEdge = Math.min(canvasWidth, canvasHeight) || 1;
			const padPx = pad * shortEdge;
			padX = padPx / (canvasWidth || 1);
			padY = padPx / (canvasHeight || 1);
		}
		basePaddingEl.style.left = padX * canvasWidth + "px";
		basePaddingEl.style.top = padY * canvasHeight + "px";
		basePaddingEl.style.width = (1 - 2 * padX) * canvasWidth + "px";
		basePaddingEl.style.height = (1 - 2 * padY) * canvasHeight + "px";
	}

	if (moverBoundsEl && movers.length > 0) {
		const m = movers[0];
		moverBoundsEl.style.left = m.minBoundX + "px";
		moverBoundsEl.style.top = m.minBoundY + "px";
		moverBoundsEl.style.width = m.maxBoundX - m.minBoundX + "px";
		moverBoundsEl.style.height = m.maxBoundY - m.minBoundY + "px";
	}
}
