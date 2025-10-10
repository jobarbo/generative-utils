precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uSeed;
uniform float uAngle; // Sorting direction in radians
uniform float uThreshold; // Brightness threshold for sorting
uniform float uSortAmount; // How much to sort (0.0 = none, 1.0 = full)
uniform float uSampleCount; // Number of samples for sorting quality (higher = better quality, slower)
uniform vec2 uResolution;

// Random function
float random(vec2 st, float seed) {
	return fract(sin(dot(st.xy + seed, vec2(12.9898, 78.233))) * 43758.5453123);
}

// Get brightness of a color
float getBrightness(vec3 color) {
	return dot(color, vec3(0.299, 0.587, 0.114));
}

// Rotate UV coordinates
vec2 rotate(vec2 uv, float angle) {
	float s = sin(angle);
	float c = cos(angle);
	mat2 rotMat = mat2(c, -s, s, c);
	return rotMat * (uv - 0.5) + 0.5;
}

void main() {
	vec2 uv = vTexCoord;

	// Rotate UV based on angle to control sort direction
	vec2 sortUV = rotate(uv, uAngle);

	// Get the current pixel's position along the sort axis
	float sortPos = sortUV.y;

	// Animated wave that moves through the image
	float wave = sin(sortPos * 10.0 + uTime * 2.0) * 0.5 + 0.5;

	// Sample current pixel
	vec4 currentColor = texture2D(uTexture, uv);
	float currentBrightness = getBrightness(currentColor.rgb);

	// Only sort if above threshold
	if (currentBrightness > uThreshold) {
		// Sample along the sort direction
		float displacement = 0.0;
		float totalWeight = 0.0;

		// Create sorting effect by sampling and comparing brightness
		// Loop has fixed max of 64, but actual samples controlled by uSampleCount
		for (float i = 0.0; i < 64.0; i++) {
			// Only process if within the desired sample count
			if (i < uSampleCount) {
				float offset = (i / uSampleCount - 0.5) * 0.3;
				vec2 sampleUV = uv + vec2(0.0, offset) * wave * uSortAmount;

				// Clamp to valid UV range
				if (sampleUV.x >= 0.0 && sampleUV.x <= 1.0 && sampleUV.y >= 0.0 && sampleUV.y <= 1.0) {
					vec4 sampleColor = texture2D(uTexture, sampleUV);
					float sampleBrightness = getBrightness(sampleColor.rgb);

					// Weight based on brightness difference
					float weight = exp(-abs(sampleBrightness - currentBrightness) * 10.0);

					displacement += offset * weight * sampleBrightness;
					totalWeight += weight;
				}
			}
		}

		if (totalWeight > 0.0) {
			displacement /= totalWeight;
		}

		// Apply animated displacement
		vec2 sortedUV = uv + vec2(0.0, displacement * uSortAmount * wave);

		// Clamp and sample
		sortedUV = clamp(sortedUV, 0.0, 1.0);
		gl_FragColor = texture2D(uTexture, sortedUV);
	} else {
		// Below threshold, don't sort
		gl_FragColor = currentColor;
	}
}


