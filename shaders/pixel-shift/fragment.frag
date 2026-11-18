precision highp float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform float uTime; // jump-free phase (_phase), advances at timeMultiplier

uniform float uShiftAxis;      // 0 = horizontal bands sliding left/right, 1 = vertical columns sliding up/down
uniform float uShiftBands;     // number of bands/columns (1 = whole image)
uniform float uShiftDirection; // 0 = left/up, 1 = right/down, 2 = alternate per band, 3 = random per band
uniform float uShiftSpread;    // 0 = every band same speed, 1 = fully random speed per band
uniform float uShiftGradient;  // -1..1 — speed ramp across bands (top→bottom or left→right, 0 = flat)
uniform float uShiftSeed;      // reroll the per-band random speeds/directions
uniform float uMix;            // 0 = original, 1 = full effect

// Base speed at timeMultiplier = 1: a tenth of the image width per second.
const float BASE_SPEED = 0.1;

float hash11(float n) {
	return fract(sin(n * 127.1 + 311.7) * 43758.5453123);
}

void main() {
	vec2 uv = vTexCoord;

	// Work in (along, across): `along` is the travel axis, `across` picks the band.
	bool vertical = uShiftAxis > 0.5;
	float along = vertical ? uv.y : uv.x;
	float across = vertical ? uv.x : uv.y;

	float bands = max(floor(uShiftBands + 0.5), 1.0);
	float band = floor(clamp(across, 0.0, 0.99999) * bands);
	float seed = floor(uShiftSeed + 0.5) * 17.31;

	// Per-band speed factor: 1 when spread = 0, random in [0.1, 2] when spread = 1
	float r = hash11(band + seed);
	float factor = mix(1.0, 0.1 + r * 1.9, clamp(uShiftSpread, 0.0, 1.0));

	// Linear ramp across bands: gradient 1 → first band still, last 2× (−1 reverses)
	float bandPos = (band + 0.5) / bands; // 0..1
	factor *= 1.0 + clamp(uShiftGradient, -1.0, 1.0) * (bandPos * 2.0 - 1.0);

	// Direction: +1 slides content left/up (we sample further along), −1 right/down
	float mode = floor(uShiftDirection + 0.5);
	float dir = 1.0;
	if (mode > 0.5 && mode < 1.5) {
		dir = -1.0;
	} else if (mode > 1.5 && mode < 2.5) {
		dir = mod(band, 2.0) < 0.5 ? 1.0 : -1.0;
	} else if (mode > 2.5) {
		dir = hash11(band * 3.7 + seed + 91.0) < 0.5 ? 1.0 : -1.0;
	}

	// fract() of the phase product first keeps precision as _phase grows
	float offset = fract(uTime * BASE_SPEED * factor) * dir;
	float moved_along = fract(along + offset);
	vec2 shifted = vertical ? vec2(uv.x, moved_along) : vec2(moved_along, uv.y);

	vec4 original = texture2D(uTexture, uv);
	vec4 moved = texture2D(uTexture, shifted);
	gl_FragColor = mix(original, moved, clamp(uMix, 0.0, 1.0));
}
