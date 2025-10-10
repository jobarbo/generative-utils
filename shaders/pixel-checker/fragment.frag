precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uDarkness; // How much to darken (0.0 = no effect, 1.0 = black)
uniform float uBrightness; // How much to brighten (0.0 = no effect, higher = brighter)
uniform float uCellSize; // Size of each cell in pixels (1.0 = 1 pixel, 2.0 = 2x2 pixels, etc.)

void main() {
	vec2 uv = vTexCoord;
	vec4 texColor = texture2D(uTexture, uv);

	// Get pixel coordinates
	vec2 pixelCoord = uv * uResolution;

	// Scale by cell size to create larger or smaller cells
	vec2 cellCoord = pixelCoord / uCellSize;

	// Create checkerboard pattern
	// Check if the sum of x and y coordinates is even or odd
	float checker = mod(floor(cellCoord.x) + floor(cellCoord.y), 2.0);

	// Apply darkening to one set of pixels, brightening to the other
	if (checker > 0.5) {
		// Darken these pixels
		texColor.rgb *= (1.0 - uDarkness);
	} else {
		// Brighten these pixels
		texColor.rgb += uBrightness;
	}

	gl_FragColor = texColor;
}


