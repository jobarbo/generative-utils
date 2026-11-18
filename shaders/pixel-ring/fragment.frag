precision highp float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform float uTime; // jump-free phase (_phase), advances at timeMultiplier
uniform vec2 uResolution;
uniform vec2 uCenter; // rotation centre in UV (0–1)

uniform float uRingBands;     // number of concentric rings (1 = whole disc turns as one)
uniform float uRingRadius;    // outer radius, in short-edge units (0.5 = touches the short side)
uniform float uRingDirection; // 0 = counter-clockwise, 1 = clockwise, 2 = alternate per ring, 3 = random per ring
uniform float uRingSpread;    // 0 = every ring same speed, 1 = fully random speed per ring
uniform float uRingGradient;  // -1..1 — speed ramp centre→edge (0 = flat)
uniform float uRingSeed;      // reroll the per-ring random speeds/directions
uniform float uMix;           // 0 = original, 1 = full effect

// Base speed at timeMultiplier = 1: a tenth of a turn per second.
const float BASE_SPEED = 0.1;
const float TAU = 6.28318530718;

float hash11(float n) {
	return fract(sin(n * 127.1 + 311.7) * 43758.5453123);
}

// Identity on [0,1]; reflects samples that rotate past the frame edge.
vec2 mirrorRepeat(vec2 u) {
	vec2 m = mod(mod(u, 2.0) + 2.0, 2.0);
	return mix(m, 2.0 - m, step(1.0, m));
}

void main() {
	vec2 uv = vTexCoord;
	vec4 original = texture2D(uTexture, uv);

	// Aspect-correct space: units of the short edge, so rings stay circular.
	float shortEdge = max(min(uResolution.x, uResolution.y), 1.0);
	vec2 aspect = uResolution / shortEdge;
	vec2 p = (uv - uCenter) * aspect;
	float r = length(p);

	float radius = max(uRingRadius, 0.001);
	if (r > radius) {
		gl_FragColor = original; // outside the outermost ring: untouched
		return;
	}

	float bands = max(floor(uRingBands + 0.5), 1.0);
	float ring = floor(min(r / radius, 0.99999) * bands);
	float seed = floor(uRingSeed + 0.5) * 17.31;

	// Per-ring speed factor: 1 when spread = 0, random in [0.1, 2] when spread = 1
	float rnd = hash11(ring + seed);
	float factor = mix(1.0, 0.1 + rnd * 1.9, clamp(uRingSpread, 0.0, 1.0));

	// Linear ramp: gradient 1 → centre still, outer ring 2× (−1 reverses)
	float ringPos = (ring + 0.5) / bands; // 0..1
	factor *= 1.0 + clamp(uRingGradient, -1.0, 1.0) * (ringPos * 2.0 - 1.0);

	float mode = floor(uRingDirection + 0.5);
	float dir = 1.0;
	if (mode > 0.5 && mode < 1.5) {
		dir = -1.0;
	} else if (mode > 1.5 && mode < 2.5) {
		dir = mod(ring, 2.0) < 0.5 ? 1.0 : -1.0;
	} else if (mode > 2.5) {
		dir = hash11(ring * 3.7 + seed + 91.0) < 0.5 ? 1.0 : -1.0;
	}

	// fract() keeps the angle small as _phase grows
	float angle = fract(uTime * BASE_SPEED * factor) * TAU * dir;
	float c = cos(angle);
	float s = sin(angle);
	vec2 rotated = vec2(c * p.x - s * p.y, s * p.x + c * p.y);

	vec2 sampleUV = mirrorRepeat(rotated / aspect + uCenter);
	vec4 moved = texture2D(uTexture, sampleUV);
	gl_FragColor = mix(original, moved, clamp(uMix, 0.0, 1.0));
}
