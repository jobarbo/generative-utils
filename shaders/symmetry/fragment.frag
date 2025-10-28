precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uSeed;
uniform float uSymmetryMode; // 0=horizontal, 1=vertical, 2=2-line, 3=4-line, 4=8-line, 5=radial
uniform float uAmount; // blend strength [0..1]
uniform float uDebug; // 0.0 = normal, 1.0 = debug mode
uniform float uTime; // time for animation
uniform float uTranslationSpeed; // speed of horizontal/vertical movement
uniform float uRotationSpeed; // speed of rotation
uniform float uRotationOscillationSpeed; // speed of oscillation (controls how fast it alternates between positive/negative)
uniform float uTranslationMode; // 0=sine, 1=noise, 2=FBM, 3=vector field
uniform float uRotationMode; // 0=cosine, 1=noise, 2=FBM
uniform float uTranslationNoiseScale; // scale of noise variation (lower = smoother, higher = more frequent changes)
uniform float uRotationNoiseScale; // scale of rotation noise (lower = smoother, higher = more frequent changes)

float random(vec2 st, float seed) {
	return fract(sin(dot(st.xy + seed, vec2(12.9898, 78.233))) * 43758.5453123);
}

// 2D Noise function
float noise(vec2 st) {
	vec2 i = floor(st);
	vec2 f = fract(st);

	// Four corners in 2D of a tile
	float a = random(i, 0.0);
	float b = random(i + vec2(1.0, 0.0), 0.0);
	float c = random(i + vec2(0.0, 1.0), 0.0);
	float d = random(i + vec2(1.0, 1.0), 0.0);

	// Smooth interpolation
	vec2 u = f * f * (3.0 - 2.0 * f);

	return mix(a, b, u.x) +
		   (c - a) * u.y * (1.0 - u.x) +
		   (d - b) * u.x * u.y;
}

// Fractal Brownian Motion (layered noise)
float fbm(vec2 st, float time) {
	float timeOffset = time * 0.3;
	float value = 0.5 * noise(st + timeOffset);
	value += 0.25 * noise(st * 2.0 + timeOffset);
	value += 0.125 * noise(st * 4.0 + timeOffset);
	value += 0.0625 * noise(st * 8.0 + timeOffset);
	return value;
}

// Vector field function - returns direction and magnitude
vec2 vectorField(vec2 pos, float time) {
	// Swirling vector field
	vec2 center = vec2(0.5);
	vec2 toCenter = pos - center;
	float dist = length(toCenter);

	// Rotating vector field with noise perturbation
	float angle = atan(toCenter.y, toCenter.x) + time * 0.5;
	float radius = dist + noise(pos * 5.0 + time * 0.3) * 0.2;

	vec2 direction = vec2(cos(angle + radius * 3.0), sin(angle + radius * 3.0));
	float magnitude = (noise(pos * 3.0 + time * 0.5) * 0.5 + 0.5);

	return direction * magnitude;
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

	// Determine which symmetry mode to apply (keep folds stable)
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

	// Apply translation and rotation to the source image - this moves the image under the symmetry
	// The symmetry folds stay in the same place, but different parts of the image pass through
	
	// Translation: apply mode-based offset (affects entire canvas uniformly, no per-pixel deformation)
	vec2 offset;
	float noiseTime = uTime * uTranslationNoiseScale; // Time for noise sampling (controls variation frequency)
	float moveAmount = uTranslationSpeed * 1.0; // Amount/amplitude of movement (scaled to match sine mode)
	int transMode = int(uTranslationMode);
	
	if (transMode == 0) {
		// Sine wave mode
		float t = uTime * uTranslationSpeed;
		offset = vec2(
			sin(t) * 0.3,
			cos(t * 0.7) * 0.3
		);
	} else if (transMode == 1) {
		// Noise influences movement direction and speed (global, not per-pixel)
		float noiseX = noise(vec2(noiseTime, 0.0)) * 2.0 - 1.0;
		float noiseY = noise(vec2(noiseTime, 100.0)) * 2.0 - 1.0;
		offset = vec2(noiseX, noiseY) * moveAmount;
	} else if (transMode == 2) {
		// FBM influences movement (global, not per-pixel)
		float fbmX = fbm(vec2(noiseTime, 0.0), noiseTime) * 2.0 - 1.0;
		float fbmY = fbm(vec2(noiseTime, 100.0), noiseTime) * 2.0 - 1.0;
		offset = vec2(fbmX, fbmY) * moveAmount;
	} else if (transMode == 3) {
		// Vector field at center influences movement (global, not per-pixel)
		vec2 vf = vectorField(vec2(0.5), noiseTime);
		offset = vf * moveAmount;
	} else {
		// Default to sine
		float t = uTime * uTranslationSpeed;
		offset = vec2(
			sin(t) * 0.3,
			cos(t * 0.7) * 0.3
		);
	}
	
	// Rotation: apply mode-based angle (affects entire canvas uniformly, no per-pixel deformation)
	float rotationAngle;
	float rotNoiseTime = uTime * uRotationNoiseScale; // Time for noise sampling (controls variation frequency)
	float rotateAmount = uRotationSpeed * 1.0; // Amount/amplitude of rotation
	int rotMode = int(uRotationMode);
	
	if (rotMode == 0) {
		// Cosine oscillation mode
		float oscillation = -cos(uTime * uRotationOscillationSpeed);
		rotationAngle = oscillation * uRotationSpeed;
	} else if (rotMode == 1) {
		// Noise influences rotation (global, not per-pixel)
		float noiseRotation = noise(vec2(rotNoiseTime, 200.0)) * 2.0 - 1.0;
		rotationAngle = noiseRotation * rotateAmount;
	} else if (rotMode == 2) {
		// FBM influences rotation (global, not per-pixel)
		float fbmRotation = fbm(vec2(rotNoiseTime, 200.0), rotNoiseTime) * 2.0 - 1.0;
		rotationAngle = fbmRotation * rotateAmount;
	} else {
		// Default to cosine
		float oscillation = -cos(uTime * uRotationOscillationSpeed);
		rotationAngle = oscillation * uRotationSpeed;
	}
	
	float cosAngle = cos(rotationAngle);
	float sinAngle = sin(rotationAngle);
	
	// Move to center, rotate, move back
	vec2 centeredUV = symmetricUV - vec2(0.5);
	vec2 rotatedUV = vec2(
		centeredUV.x * cosAngle - centeredUV.y * sinAngle,
		centeredUV.x * sinAngle + centeredUV.y * cosAngle
	);
	
	// Combine rotation with translation
	vec2 transformedUV = rotatedUV + vec2(0.5) + offset;

	// Use fract() to wrap around smoothly and ensure UVs stay within bounds
	vec2 sourceUV = fract(transformedUV);

	// Ensure sourceUV is clamped to valid texture coordinates
	sourceUV = clamp(sourceUV, 0.0, 1.0);

	vec4 symmetricColor = texture2D(uTexture, sourceUV);

	// Blend between original and symmetric version
	float blendAmount = clamp(uAmount, 0.0, 1.0);
	vec4 finalColor = mix(originalColor, symmetricColor, blendAmount);

	// Debug mode: draw fold lines and center point
	if (uDebug > 0.5) {
		vec4 debugColor = finalColor;

		// Draw center point
		float distFromCenter = distance(uv, vec2(0.5));
		if (distFromCenter < 0.005) {
			debugColor = vec4(1.0, 0.0, 0.0, 1.0); // Red center point
		}

		// Draw fold lines based on symmetry mode
		float lineThickness = 0.002;

		if (mode == 0) {
			// Horizontal line
			if (abs(uv.y - 0.5) < lineThickness) {
				debugColor = vec4(0.0, 1.0, 0.0, 1.0); // Green
			}
		} else if (mode == 1) {
			// Vertical line
			if (abs(uv.x - 0.5) < lineThickness) {
				debugColor = vec4(0.0, 1.0, 0.0, 1.0); // Green
			}
		} else if (mode == 2) {
			// Both horizontal and vertical lines
			if (abs(uv.y - 0.5) < lineThickness || abs(uv.x - 0.5) < lineThickness) {
				debugColor = vec4(0.0, 1.0, 0.0, 1.0); // Green
			}
		} else if (mode == 3) {
			// Both horizontal and vertical lines
			if (abs(uv.y - 0.5) < lineThickness || abs(uv.x - 0.5) < lineThickness) {
				debugColor = vec4(0.0, 1.0, 0.0, 1.0); // Green
			}
		} else if (mode == 4) {
			// Horizontal, vertical, and two diagonal lines (8-fold)
			if (abs(uv.y - 0.5) < lineThickness || abs(uv.x - 0.5) < lineThickness ||
				abs(uv.x - uv.y) < lineThickness || abs(uv.x + uv.y - 1.0) < lineThickness) {
				debugColor = vec4(0.0, 1.0, 0.0, 1.0); // Green
			}
		} else if (mode == 5) {
			// Radial - draw center circle and radial lines
			// Center circle
			if (distFromCenter > 0.02 && distFromCenter < 0.025) {
				debugColor = vec4(0.0, 0.0, 1.0, 1.0); // Blue circle
			}
		}

		gl_FragColor = debugColor;
	} else {
		gl_FragColor = finalColor;
	}
}
