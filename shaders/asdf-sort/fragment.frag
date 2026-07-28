// ASDF Pixel Sort — a real pixel sort (Kim Asendorf's algorithm), GPU single pass.
//
// Unlike library/shaders/pixel-sort (a brightness-weighted directional smear), this
// shader actually permutes pixels: each span of pixels passing a threshold test is
// sorted along the sort axis by a key (luma / hue / saturation / lightness / R / G / B).
//
// A fragment shader can only gather (read), never scatter (write elsewhere), so an
// exact "compute my rank, write me there" sort is impossible. Instead we do a
// bucket sort per span: build a 16-bin histogram of the span, prefix-sum it to find
// which bin my index falls in, then rescan the span for the n-th member of that bin.
// That is 2*L texture fetches for a span of length L, and the result is a true
// bijection (no holes, no duplicates) — monotone in the key, stable by index inside
// a bin.
//
// Spans are clipped to blocks of uMaxSpan pixels aligned on a jittered global grid.
// This is what keeps every pixel of a span agreeing on the same span bounds (a plain
// "walk until the threshold flips" would truncate differently depending on where in
// a long band you stand, which breaks the bijection and punches holes).

precision highp float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uTime; // continuous accumulated phase (see _phase in sketch-shaders.js)

// —— Sort axis ——
// Any combination of the four can be on. With more than one, the image is split into
// patches and each patch sorts along one of the enabled axes.
uniform float uAxisVertical;
uniform float uAxisHorizontal;
uniform float uAxisDiagonal; // ↘
uniform float uAxisAntiDiagonal; // ↗
uniform float uAxisRegionScale; // patch size when several axes are on
uniform float uAngle; // extra rotation applied on top of the chosen axis
uniform vec2 uCenter; // pivot the axis turns around, normalised 0-1

// —— Keys —— 0 luma, 1 hue, 2 saturation, 3 lightness, 4 R, 5 G, 6 B
uniform float uSortKey;
uniform float uGateKey;

// —— Threshold band (generalises Asendorf's black/brightness/white modes) ——
uniform float uThresholdLow;
uniform float uThresholdHigh;
uniform float uInvertGate;
uniform float uInvertOrder;

// —— Span ——
uniform float uMaxSpan; // max span length in pixels
uniform float uSpanStep; // sampling stride in pixels (main perf lever)
uniform float uSpanJitter; // 0..1, breaks up the block grid seams
uniform float uEdgeWobble; // 0..1, bends the block seams into curves

// —— Animation: global pulsing threshold ——
uniform float uAnimateThreshold;
uniform float uThresholdAnimMode; // 0 sine, 1 noise, 2 FBM
uniform float uThresholdAnimAmount;

// —— Animation: threshold sweeping across the image ——
uniform float uSweepMode; // 0 off, 1 sine, 2 scroll ramp, 3 noise, 4 FBM
uniform float uSweepAmount;
uniform float uSweepScale;
uniform float uSweepSpeed;

// —— Animation: span length ——
uniform float uAnimateSpan;
uniform float uSpanAnimAmount;
uniform float uSpanAnimSpeed;

// —— Organic variation ——
// Master knob that de-regularises everything a per-line field is allowed to touch:
// span length, threshold offset, block boundaries and animation phase.
uniform float uOrganicAmount;
uniform float uOrganicScale; // spatial frequency of the per-line field
uniform float uOrganicSpeed; // how fast that field evolves

uniform float uMix;

#define NBINS 16.0
#define TAU 6.28318530718
#define HALF_PI 1.57079633
#define QUARTER_PI 0.78539816

// Block boundaries are pushed by up to ±BLOCK_JITTER of a block, so a jittered block can
// reach (1 + 2*jitter) times its nominal length. The nominal length is capped by exactly
// that factor, so the reach stays at MAX_HALF steps whatever the jitter.
#define BLOCK_JITTER 0.35

const int MAX_HALF = 64; // max steps walked each way
const int MAX_FULL = 130; // max steps of the rescan (2 * MAX_HALF + slack)

const vec4 IDX0 = vec4(0.0, 1.0, 2.0, 3.0);
const vec4 IDX1 = vec4(4.0, 5.0, 6.0, 7.0);
const vec4 IDX2 = vec4(8.0, 9.0, 10.0, 11.0);
const vec4 IDX3 = vec4(12.0, 13.0, 14.0, 15.0);

// Band bounds for the current span — written once in main(), read by inBand().
// These MUST be constant along the sort axis, otherwise the span bounds disagree
// between neighbours and the permutation stops being a bijection.
float gLow;
float gHigh;

// —————————————————————————————————————————————————————————————
// Noise (same implementation as library/shaders/pixel-sort)
// —————————————————————————————————————————————————————————————

float random(vec2 st, float seed) {
	return fract(sin(dot(st.xy + seed, vec2(12.9898, 78.233))) * 43758.5453123);
}

float noise(vec2 st) {
	vec2 i = floor(st);
	vec2 f = fract(st);

	float a = random(i, 0.0);
	float b = random(i + vec2(1.0, 0.0), 0.0);
	float c = random(i + vec2(0.0, 1.0), 0.0);
	float d = random(i + vec2(1.0, 1.0), 0.0);

	vec2 u = f * f * (3.0 - 2.0 * f);

	return mix(a, b, u.x) +
		   (c - a) * u.y * (1.0 - u.x) +
		   (d - b) * u.x * u.y;
}

float fbm(vec2 st, float time) {
	float timeOffset = time * 0.3;
	float value = 0.5 * noise(st + timeOffset);
	value += 0.25 * noise(st * 2.0 + timeOffset);
	value += 0.125 * noise(st * 4.0 + timeOffset);
	value += 0.0625 * noise(st * 8.0 + timeOffset);
	return value;
}

// —————————————————————————————————————————————————————————————
// Sort / gate keys
// —————————————————————————————————————————————————————————————

float hueOf(vec3 c) {
	float mx = max(c.r, max(c.g, c.b));
	float mn = min(c.r, min(c.g, c.b));
	float d = mx - mn;
	if (d < 0.00001) return 0.0;

	float h;
	if (mx == c.r) {
		h = mod((c.g - c.b) / d, 6.0);
	} else if (mx == c.g) {
		h = (c.b - c.r) / d + 2.0;
	} else {
		h = (c.r - c.g) / d + 4.0;
	}
	return h / 6.0;
}

float keyOf(vec3 c, float which) {
	int k = int(which);
	if (k == 1) return hueOf(c);

	float mx = max(c.r, max(c.g, c.b));
	float mn = min(c.r, min(c.g, c.b));

	if (k == 2) {
		// HSL saturation
		float l = (mx + mn) * 0.5;
		float d = mx - mn;
		if (d < 0.00001) return 0.0;
		return d / (1.0 - abs(2.0 * l - 1.0) + 0.00001);
	}
	if (k == 3) return (mx + mn) * 0.5;
	if (k == 4) return c.r;
	if (k == 5) return c.g;
	if (k == 6) return c.b;

	// 0 (and fallback): luma
	return dot(c, vec3(0.299, 0.587, 0.114));
}

// Value used for ordering — inverted for a descending sort.
float sortVal(vec3 c) {
	float v = clamp(keyOf(c, uSortKey), 0.0, 1.0);
	return (uInvertOrder > 0.5) ? 1.0 - v : v;
}

float binOf(vec3 c) {
	return clamp(floor(sortVal(c) * NBINS), 0.0, NBINS - 1.0);
}

bool inBand(vec3 c) {
	float k = keyOf(c, uGateKey);
	bool b = (k >= gLow && k <= gHigh);
	return (uInvertGate > 0.5) ? !b : b;
}

// —————————————————————————————————————————————————————————————
// Histogram packed into 4 vec4 — no dynamic array indexing, so this stays
// valid GLSL ES 1.00. step(IDX, b) * step(b, IDX) is 1.0 only where b == IDX.
// —————————————————————————————————————————————————————————————

void addBin(float b, inout vec4 h0, inout vec4 h1, inout vec4 h2, inout vec4 h3) {
	vec4 v = vec4(b);
	h0 += step(IDX0, v) * step(v, IDX0);
	h1 += step(IDX1, v) * step(v, IDX1);
	h2 += step(IDX2, v) * step(v, IDX2);
	h3 += step(IDX3, v) * step(v, IDX3);
}

// —————————————————————————————————————————————————————————————
// Animation helpers. Both must be constant along the sort axis:
// - the pulsing threshold depends on time only
// - the sweep depends only on the coordinate PERPENDICULAR to the sort axis,
//   so a whole span always shares one value. (A radial sweep would vary along
//   the span and shred the permutation, hence the perpendicular-only modes.)
// —————————————————————————————————————————————————————————————

float thresholdWave(float time) {
	int m = int(uThresholdAnimMode);
	if (m == 1) return noise(vec2(time * 0.5, 37.0)) * 2.0 - 1.0;
	if (m == 2) return fbm(vec2(time * 0.5, 37.0), time) * 2.0 - 1.0;
	return sin(time * TAU);
}

// How many axes are enabled.
float axisCount() {
	return step(0.5, uAxisVertical) + step(0.5, uAxisHorizontal) + step(0.5, uAxisDiagonal) + step(0.5, uAxisAntiDiagonal);
}

// Which sort axis rules at this position, before uAngle is added.
//
// With one axis enabled this is a constant and costs nothing. With several, the image is
// diced into cells of a hashed grid and each cell draws one of the enabled axes. Spans
// are cut wherever the axis changes, so a span never leaves its region and the whole
// thing stays a bijection — neighbouring cells that happen to draw the same axis simply
// merge, which is why the patches do not read as a grid.
float axisAt(vec2 p, float n) {
	if (n < 1.5) {
		if (uAxisHorizontal > 0.5) return HALF_PI;
		if (uAxisDiagonal > 0.5) return -QUARTER_PI;
		if (uAxisAntiDiagonal > 0.5) return QUARTER_PI;
		return 0.0; // vertical, and the fallback when nothing is checked
	}

	float k = min(floor(random(floor(p * uAxisRegionScale), 7.0) * n), n - 1.0);
	float idx = 0.0;

	if (uAxisVertical > 0.5) {
		if (idx == k) return 0.0;
		idx += 1.0;
	}
	if (uAxisHorizontal > 0.5) {
		if (idx == k) return HALF_PI;
		idx += 1.0;
	}
	if (uAxisDiagonal > 0.5) {
		if (idx == k) return -QUARTER_PI;
		idx += 1.0;
	}
	return QUARTER_PI;
}

// Diagonal axes only land back on whole pixels every sqrt(2) units, so their stride is
// scaled to match — otherwise every tap falls between texels and the sort goes soft.
float axisStrideScale(float axis) {
	return (abs(abs(axis) - QUARTER_PI) < 0.01) ? 1.41421356 : 1.0;
}

// Position of block boundary n on this line, in step units.
// Monotone in n as long as the jitter stays under half a block, which is what makes
// "which block am I in" resolvable by testing a handful of candidates instead of
// searching — every pixel of a span lands on the same answer.
float blockEdge(float n, float lineSeed, float maxK, float jit) {
	return (n + (random(vec2(n, lineSeed), 0.0) - 0.5) * 2.0 * jit) * maxK;
}

// `axial` is the block's position along the sort axis — constant inside a block, so the
// field may use it as a second dimension without ever varying within a span.
float sweepField(float perp, float axial, float time) {
	int m = int(uSweepMode);
	float t = time * uSweepSpeed;

	// Bend the front. The wave modes are 1D by nature, so warp their coordinate by an FBM
	// of `axial`; otherwise the front is a perfectly ruled line.
	float p = perp * uSweepScale + (fbm(vec2(axial * uSweepScale * 1.5, 71.0), t) * 1.06 - 0.5) * uEdgeWobble * 2.0;

	if (m == 1) return sin((p - t) * TAU) * 0.5;
	if (m == 2) return fract(p - t) - 0.5; // hard scrolling front
	if (m == 3) return noise(vec2(p * 4.0 + t, axial * 4.0 + 11.0)) - 0.5;
	if (m == 4) return fbm(vec2(p * 4.0, axial * 4.0 + 11.0), t) - 0.5;
	return 0.0;
}

void main() {
	// UV orientation is corrected in shaderManager.drawFullscreenQuad / renderPass
	vec2 uv = vTexCoord;
	vec4 original = texture2D(uTexture, uv);

	float nAxes = axisCount();
	bool multiAxis = nAxes > 1.5;
	float axis = axisAt(uv, nAxes);

	float ang = axis + uAngle; // axis 0 → straight down the columns
	vec2 dir = vec2(sin(ang), cos(ang));
	vec2 perpDir = vec2(dir.y, -dir.x);

	// Everything downstream is measured from uCenter, so the block lattice and the
	// per-line fields pivot around that point instead of around the texture origin.
	vec2 px = uv * uResolution;
	vec2 ctr = uCenter * uResolution;
	float perp = (dot(px, perpDir) - dot(ctr, perpDir)) / max(uResolution.x, uResolution.y);

	// —— Organic per-line fields ——
	// The span length has to be settled before the block grid can be laid out, so it can
	// only depend on `perp` and time — rigorously constant ALONG the sort axis, which is
	// the one thing the permutation cannot tolerate varying.
	float org = clamp(uOrganicAmount, 0.0, 1.0);
	float oScale = max(uOrganicScale, 0.01);
	float oTime = uTime * uOrganicSpeed;

	float lineSeed = floor(perp * oScale * 24.0); // discrete line groups, for hashes
	float fSpan = fbm(vec2(perp * oScale, 5.0), oTime) * 1.06; // ≈[0,1]
	float hLine = random(vec2(lineSeed, 17.0), 0.0);

	// Per-line clock: without it every line pulses in lockstep, which is most of the
	// "it breathes as one block" feeling.
	float tLoc = uTime + hLine * 6.0 * org;

	// —— Span geometry ——
	float stride = max(uSpanStep, 0.25) * axisStrideScale(axis);
	float span = uMaxSpan;
	if (uAnimateSpan > 0.5) {
		span *= 1.0 + sin(tLoc * uSpanAnimSpeed * TAU) * clamp(uSpanAnimAmount, 0.0, 0.95);
	}

	// Per-line span length: 0.25x to 1.75x. A uniform maxSpan everywhere is the single
	// biggest source of visual regularity.
	span *= mix(1.0, 0.25 + fSpan * 1.5, org);

	float jit = clamp(uSpanJitter, 0.0, 1.0) * BLOCK_JITTER;

	// Nominal block length in steps, capped so even the longest jittered block fits in
	// MAX_HALF — the walks and the rescan must never run out of iterations mid-span.
	float maxK = clamp(floor(span / stride), 1.0, float(MAX_HALF) / (1.0 + 2.0 * jit));

	vec2 stepUV = dir * stride / uResolution;

	// Position along the sort axis, in step units: advances by exactly 1.0 per stepUV.
	// Snapped to the step lattice so every fragment of a cell shares one sample chain —
	// with stride > 1 that turns the sort into a clean blocky one (cells of `stride`
	// pixels move together) instead of interleaved lattices fighting each other.
	// The origin shift along the axis is snapped to a whole number of steps. A fractional
	// shift would pull the sample lattice off the texel grid, every tap would land between
	// two texels, and bilinear blending would quietly stop the result being a permutation.
	float originT = floor(dot(ctr, dir) / stride) * stride;
	float tRaw = (dot(px, dir) - originT) / stride;
	float t = floor(tRaw) + 0.5;
	vec2 base = uv + dir * (t - tRaw) * stride / uResolution;

	// Block boundaries. A plain `floor(t / maxK) * maxK` grid puts a seam every maxK
	// pixels on every line — a lattice you cannot unsee. Instead each boundary is pushed
	// by a hash of (boundary index, line), so block lengths wander between 0.3x and 1.7x
	// and no two lines cut in the same place.
	//
	// The jitter stays under half a block, so the boundary function is still monotone and
	// my block is bracketed by candidates gi-1 … gi+2. Four evaluations, no search, and
	// every pixel of a span resolves the same pair.
	// The seam of a block is a straight line unless it is pushed by something that varies
	// smoothly ACROSS the lines. `spanJitter` alone only moves whole lines in lockstep
	// within a hash band, which is what makes the separations read as straight segments.
	// This shifts the entire boundary set of a line by a continuous FBM of `perp`, so
	// neighbouring lines cut at slightly different places and the seam becomes a curve.
	// A uniform shift keeps the boundaries monotone and constant along the axis, so the
	// permutation is untouched.
	float wobble = (fbm(vec2(perp * oScale * 3.0, 61.0), oTime) * 1.06 - 0.5) * 2.0 * uEdgeWobble * maxK;
	float tg = t - wobble;

	float gi = floor(tg / maxK);

	float blockStart = blockEdge(gi - 1.0, lineSeed, maxK, jit);
	float blockEnd = blockEdge(gi + 2.0, lineSeed, maxK, jit);

	for (int c = 0; c < 2; c++) {
		float e = blockEdge(gi + float(c), lineSeed, maxK, jit);
		if (e <= tg) blockStart = max(blockStart, e);
		else blockEnd = min(blockEnd, e);
	}

	float backLimit = tg - blockStart; // steps available before the block start
	float fwdLimit = blockEnd - tg; // steps available after me inside the block

	// —— Threshold band for this span ——
	// Anything that shifts the band has to be identical for every pixel of a span. That
	// does NOT mean it has to be constant along the whole axis — only within a block. So
	// the band is allowed a second dimension, sampled at the block's midpoint: constant
	// inside a block, free to change from one block to the next. Without it the band was
	// a function of `perp` alone and its iso-lines were dead-straight lines running
	// parallel to the sort axis — which is what made the sweep front look ruled.
	float axial = (blockStart + blockEnd) * 0.5 * stride / max(uResolution.x, uResolution.y);

	float lo = uThresholdLow;
	float hi = uThresholdHigh;

	if (uAnimateThreshold > 0.5) {
		float w = thresholdWave(tLoc) * uThresholdAnimAmount;
		lo += w;
		hi += w;
	}
	if (uSweepMode >= 0.5) {
		float s = sweepField(perp, axial, tLoc) * uSweepAmount;
		lo += s;
		hi += s;
	}

	// Per-block band offset — breaks runs at a different luminance all over the image
	float fThreshold = fbm(vec2(perp * oScale + 13.0, axial * oScale + 91.0), oTime * 0.7) * 1.06;
	float thrOffset = (fThreshold - 0.5) * 0.6 * org;
	lo += thrOffset;
	hi += thrOffset;

	gLow = min(lo, hi);
	gHigh = max(lo, hi);

	vec3 myColor = texture2D(uTexture, base).rgb;
	if (!inBand(myColor)) {
		gl_FragColor = original;
		return;
	}

	vec4 h0 = vec4(0.0);
	vec4 h1 = vec4(0.0);
	vec4 h2 = vec4(0.0);
	vec4 h3 = vec4(0.0);
	addBin(binOf(myColor), h0, h1, h2, h3);

	// Scan A — walk both ways: find the span bounds and build the histogram in one go.
	float back = 0.0;
	for (int i = 1; i <= MAX_HALF; i++) {
		float fi = float(i);
		if (fi > backLimit) break;

		vec2 p = base - stepUV * fi;
		if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) break;
		if (multiAxis && abs(axisAt(p, nAxes) - axis) > 0.001) break;

		vec3 c = texture2D(uTexture, p).rgb;
		if (!inBand(c)) break;

		addBin(binOf(c), h0, h1, h2, h3);
		back = fi;
	}

	float fwd = 0.0;
	for (int i = 1; i <= MAX_HALF; i++) {
		float fi = float(i);
		if (fi >= fwdLimit) break;

		vec2 p = base + stepUV * fi;
		if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) break;
		if (multiAxis && abs(axisAt(p, nAxes) - axis) > 0.001) break;

		vec3 c = texture2D(uTexture, p).rgb;
		if (!inBand(c)) break;

		addBin(binOf(c), h0, h1, h2, h3);
		fwd = fi;
	}

	float myIdx = back; // my 0-based position inside the span
	float spanLen = back + fwd;

	// Inclusive prefix sums of the histogram, unrolled.
	vec4 I0, I1, I2, I3;
	I0.x = h0.x;
	I0.y = I0.x + h0.y;
	I0.z = I0.y + h0.z;
	I0.w = I0.z + h0.w;
	I1.x = I0.w + h1.x;
	I1.y = I1.x + h1.y;
	I1.z = I1.y + h1.z;
	I1.w = I1.z + h1.w;
	I2.x = I1.w + h2.x;
	I2.y = I2.x + h2.y;
	I2.z = I2.y + h2.z;
	I2.w = I2.z + h2.w;
	I3.x = I2.w + h3.x;
	I3.y = I3.x + h3.y;
	I3.z = I3.y + h3.z;
	I3.w = I3.z + h3.w;

	// Target bin = number of bins whose inclusive count is still <= my index.
	// Empty bins are skipped for free (their inclusive count equals the previous one).
	vec4 m = vec4(myIdx);
	float targetBin = dot(step(I0, m), vec4(1.0)) + dot(step(I1, m), vec4(1.0)) + dot(step(I2, m), vec4(1.0)) + dot(step(I3, m), vec4(1.0));
	targetBin = min(targetBin, NBINS - 1.0);

	// Exclusive prefix at targetBin = pixels in strictly lower bins.
	vec4 tb = vec4(targetBin);
	float lower = dot(h0 * step(IDX0 + 1.0, tb), vec4(1.0)) + dot(h1 * step(IDX1 + 1.0, tb), vec4(1.0)) + dot(h2 * step(IDX2 + 1.0, tb), vec4(1.0)) + dot(h3 * step(IDX3 + 1.0, tb), vec4(1.0));

	float need = myIdx - lower; // I want the need-th member of targetBin

	// Scan B — rescan the span in index order and take the need-th pixel of targetBin.
	vec2 spanStart = base - stepUV * back;
	vec3 sorted = myColor;
	float seen = 0.0;

	for (int j = 0; j <= MAX_FULL; j++) {
		float fj = float(j);
		if (fj > spanLen) break;

		vec2 p = spanStart + stepUV * fj;
		vec3 c = texture2D(uTexture, p).rgb;

		if (abs(binOf(c) - targetBin) < 0.5) {
			if (seen >= need) {
				sorted = c;
				break;
			}
			seen += 1.0;
		}
	}

	gl_FragColor = vec4(mix(original.rgb, sorted, clamp(uMix, 0.0, 1.0)), original.a);
}
