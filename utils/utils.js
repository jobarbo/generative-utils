let noiseCanvasWidth = 1;
let noiseCanvasHeight = 1;

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

let clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
let smoothstep = (a, b, x) => (((x -= a), (x /= b - a)) < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));
let mix = (a, b, p) => a + p * (b - a);
function dot(v1, v2) {
	if (v1.length !== 2 || v2.length !== 2) {
		throw new Error("Both vectors should have exactly 2 elements.");
	}
	return v1[0] * v2[0] + v1[1] * v2[1];
}
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
	let external = L(max(dx, 0), max(dy, 0)) - r;
	// Internal distance
	let internal = min(max(dx, dy), 0);
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

// if cmd + s is pressed, save the canvas'
function saveCanvas(event) {
	const logger = window.Logger || console;
	logger.debug ? logger.debug("saveCanvas function called") : logger.log("saveCanvas function called");
	if (event.key === "s" && (event.metaKey || event.ctrlKey)) {
		logger.info ? logger.info("Save shortcut detected") : logger.log("Save shortcut detected");
		saveArtwork();
		event.preventDefault();
		return false;
	}
}

// Example usage to add an event listener for key presses
document.addEventListener("keydown", saveCanvas);
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

// make a function to save the canvas as a png file with the git branch name and a timestamp
function saveArtwork() {
	const logger = window.Logger || console;
	var dom_spin = document.querySelector(".spin-container");
	var output_hash = fxhash;
	logger.debug ? logger.debug("Hash for save: " + output_hash) : logger.log("Hash for save:", output_hash);
	var canvas = document.getElementById("defaultCanvas0");
	var d = new Date();
	var datestring = `${d.getMonth() + 1}` + "_" + d.getDate() + "_" + d.getFullYear() + "_" + `${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}_${fxhash}`;
	logger.debug ? logger.debug("Canvas element: " + (canvas ? "Found" : "Not found")) : logger.log("Canvas element:", canvas);
	var fileName = datestring + ".png";

	// Standard download for other browsers
	const imageUrl = canvas.toDataURL("image/png").replace("image/png", "image/octet-stream");
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

	// Wait a bit for the canvas to be ready
	setTimeout(() => {
		const canvas = document.getElementById("defaultCanvas0");
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

function max(a, b) {
	return a > b ? a : b;
}

function min(a, b) {
	return a < b ? a : b;
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
	const {items, maxFrames, startTime, cycleLength, renderItem, moveItem, onComplete} = config;

	let elapsedTime = 0;
	let framesRendered = 0;
	let renderStart = Date.now();
	let drawing = true;
	let totalOperations = items.length * maxFrames;
	let operationsCompleted = 0;
	let currentFrame = 0;

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
