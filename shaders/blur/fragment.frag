precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uBlurMode;      // 0=gaussian, 1=radial, 2=directional
uniform float uBlurAmount;    // Blur radius/intensity in pixels
uniform float uBlurQuality;   // Number of sampling rings/steps (1-8, higher = better quality)
uniform float uBlurDirection; // Angle in radians for directional mode
uniform vec2 uBlurCenter;     // Center point for radial mode (normalized 0-1)

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

// ─── Gaussian blur (single-pass spiral sampling) ───
vec4 gaussianBlur(vec2 uv, vec2 texelSize) {
	vec4 color = texture2D(uTexture, uv);
	float totalWeight = 1.0;

	float quality = max(1.0, floor(uBlurQuality));
	float directions = 16.0; // Number of directions to sample

	for (float d = 0.0; d < 16.0; d++) {
		if (d >= directions) break;
		float angle = d * TAU / directions;
		vec2 dir = vec2(cos(angle), sin(angle));

		for (float q = 1.0; q <= 8.0; q++) {
			if (q > quality) break;
			float offset = q / quality;
			vec2 sampleUV = uv + dir * texelSize * uBlurAmount * offset;
			float weight = 1.0 - offset * 0.5; // Gaussian-like falloff
			color += texture2D(uTexture, sampleUV) * weight;
			totalWeight += weight;
		}
	}

	return color / totalWeight;
}

// ─── Radial blur (zoom blur from center) ───
vec4 radialBlur(vec2 uv) {
	vec2 dir = uv - uBlurCenter;
	float dist = length(dir);

	vec4 color = texture2D(uTexture, uv);
	float totalWeight = 1.0;

	float steps = max(1.0, floor(uBlurQuality)) * 4.0;

	for (float i = 1.0; i <= 32.0; i++) {
		if (i > steps) break;
		float t = i / steps;
		float strength = uBlurAmount * 0.01; // Scale down for usable range
		vec2 sampleUV = uv - dir * strength * t;
		float weight = 1.0 - t * 0.5;
		color += texture2D(uTexture, sampleUV) * weight;
		totalWeight += weight;
	}

	return color / totalWeight;
}

// ─── Directional blur (motion blur along an angle) ───
vec4 directionalBlur(vec2 uv, vec2 texelSize) {
	vec2 dir = vec2(cos(uBlurDirection), sin(uBlurDirection));

	vec4 color = texture2D(uTexture, uv);
	float totalWeight = 1.0;

	float steps = max(1.0, floor(uBlurQuality)) * 4.0;

	for (float i = 1.0; i <= 32.0; i++) {
		if (i > steps) break;
		float t = i / steps;
		vec2 offset = dir * texelSize * uBlurAmount * t;

		// Sample in both directions along the line
		float weight = 1.0 - t * 0.5;
		color += texture2D(uTexture, uv + offset) * weight;
		color += texture2D(uTexture, uv - offset) * weight;
		totalWeight += weight * 2.0;
	}

	return color / totalWeight;
}

void main() {
	vec2 uv = vTexCoord;
	vec2 texelSize = 1.0 / uResolution;

	// Early exit if no blur
	if (uBlurAmount <= 0.0) {
		gl_FragColor = texture2D(uTexture, uv);
		return;
	}

	int mode = int(uBlurMode);

	if (mode == 0) {
		gl_FragColor = gaussianBlur(uv, texelSize);
	} else if (mode == 1) {
		gl_FragColor = radialBlur(uv);
	} else if (mode == 2) {
		gl_FragColor = directionalBlur(uv, texelSize);
	} else {
		gl_FragColor = texture2D(uTexture, uv);
	}
}
