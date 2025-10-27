precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uSeed;
uniform float uSymmetryMode; // 0=horizontal, 1=vertical, 2=2-line, 3=4-line, 4=8-line, 5=radial
uniform float uAmount; // blend strength [0..1]

float random(vec2 st, float seed) {
	return fract(sin(dot(st.xy + seed, vec2(12.9898, 78.233))) * 43758.5453123);
}

// Horizontal symmetry: mirror across horizontal center line (top half reflects to bottom)
vec2 horizontalSymmetry(vec2 uv) {
	vec2 center = vec2(0.5, 0.5);
	vec2 offset = uv - center;
	// Mirror the Y coordinate across the horizontal center
	vec2 mirrored = vec2(offset.x, abs(offset.y));
	return mirrored + center;
}

// Vertical symmetry: mirror across vertical center line (left half reflects to right)
vec2 verticalSymmetry(vec2 uv) {
	vec2 center = vec2(0.5, 0.5);
	vec2 offset = uv - center;
	// Mirror the X coordinate across the vertical center
	vec2 mirrored = vec2(abs(offset.x), offset.y);
	return mirrored + center;
}

// 2-line symmetry: mirror across both horizontal and vertical center lines (one quadrant reflects to all four)
vec2 twoLineSymmetry(vec2 uv) {
	vec2 center = vec2(0.5, 0.5);
	vec2 offset = uv - center;
	// Mirror both X and Y coordinates
	vec2 mirrored = vec2(abs(offset.x), abs(offset.y));
	return mirrored + center;
}

// 4-line symmetry: create 4 quadrants with symmetry
vec2 fourLineSymmetry(vec2 uv) {
	vec2 center = vec2(0.5, 0.5);
	vec2 offset = uv - center;

	// Determine which quadrant we're in
	float quadX = step(0.0, offset.x);
	float quadY = step(0.0, offset.y);

	// Map to first quadrant (top-right)
	vec2 firstQuad = vec2(
		abs(offset.x),
		abs(offset.y)
	);

	return firstQuad + center;
}

// 8-line symmetry: create 8 sections with symmetry
vec2 eightLineSymmetry(vec2 uv) {
	vec2 center = vec2(0.5, 0.5);
	vec2 offset = uv - center;

	// Take absolute values to fold into one quadrant
	vec2 absOffset = abs(offset);

	// Now fold along the diagonal to create 8-fold symmetry
	// If absOffset.x < absOffset.y, swap them
	vec2 folded = (absOffset.x < absOffset.y) ? vec2(absOffset.y, absOffset.x) : absOffset;

	return folded + center;
}

// Radial symmetry: create radial pattern
vec2 radialSymmetry(vec2 uv) {
	vec2 center = vec2(0.5, 0.5);
	vec2 offset = uv - center;

	// Take absolute values to fold into one quadrant
	vec2 absOffset = abs(offset);

	// Fold along multiple diagonals to create 16-fold symmetry
	// First fold along main diagonal
	vec2 folded1 = (absOffset.x < absOffset.y) ? vec2(absOffset.y, absOffset.x) : absOffset;

	// Second fold at 22.5 degrees
	float tan225 = 0.41421356; // tan(22.5 degrees) = sqrt(2) - 1
	vec2 folded2 = (folded1.y < folded1.x * tan225) ?
		vec2(folded1.x + folded1.y * tan225, folded1.y + folded1.x * tan225) / sqrt(1.0 + tan225 * tan225) :
		folded1;


	return folded2 + center;
}

void main() {
	vec2 uv = vTexCoord;
	vec4 originalColor = texture2D(uTexture, uv);

	// Determine which symmetry mode to apply
	vec2 symmetricUV;
	int mode = int(uSymmetryMode);

	if (mode == 0) {
		symmetricUV = horizontalSymmetry(uv);
	} else if (mode == 1) {
		symmetricUV = verticalSymmetry(uv);
	} else if (mode == 2) {
		symmetricUV = twoLineSymmetry(uv);
	} else if (mode == 3) {
		symmetricUV = fourLineSymmetry(uv);
	} else if (mode == 4) {
		symmetricUV = eightLineSymmetry(uv);
	} else if (mode == 5) {
		symmetricUV = radialSymmetry(uv);
	} else {
		// Default to horizontal symmetry
		symmetricUV = horizontalSymmetry(uv);
	}

	// Clamp UV coordinates to prevent sampling outside texture bounds
	symmetricUV = clamp(symmetricUV, 0.0, 1.0);

	vec4 symmetricColor = texture2D(uTexture, symmetricUV);

	// Blend between original and symmetric version
	float blendAmount = clamp(uAmount, 0.0, 1.0);
	vec4 finalColor = mix(originalColor, symmetricColor, blendAmount);

	gl_FragColor = finalColor;
}
