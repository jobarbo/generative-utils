precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uDarkness; // How much to darken
uniform float uBrightness; // How much to brighten
uniform float uCellSize; // Size of cells
uniform bool uCrtMode; // true = CRT mode, false = Checkerboard mode

void main() {
	vec2 uv = vTexCoord;
	vec4 texColor = texture2D(uTexture, uv);

	// Get pixel coordinates
	vec2 pixelCoord = uv * uResolution;

	if (uCrtMode) {
		// CRT MODE: RGB subpixel structure with scanlines
		float subpixelWidth = uCellSize / 3.0;
		float xPos = pixelCoord.x / subpixelWidth;
		float yPos = pixelCoord.y / uCellSize;

		// Determine which subpixel we're in (0=R, 1=G, 2=B)
		float subpixel = mod(floor(xPos), 3.0);

		// Create RGB mask for subpixels
		vec3 mask = vec3(0.0);
		if (subpixel < 0.5) {
			// Red subpixel
			mask = vec3(1.0, 0.0, 0.0);
		} else if (subpixel < 1.5) {
			// Green subpixel
			mask = vec3(0.0, 1.0, 0.0);
		} else {
			// Blue subpixel
			mask = vec3(0.0, 0.0, 1.0);
		}

		// Apply the CRT mask
		texColor.rgb *= mask + vec3(1.0 - uDarkness);

		// Add slight horizontal scanlines
		float scanline = sin(yPos * 3.14159) * 0.5 + 0.5;
		texColor.rgb *= mix(1.0, scanline, uDarkness * 0.3);

		// Optional brightness boost for subpixels
		texColor.rgb += uBrightness * mask;

	} else {
		// CHECKERBOARD MODE: Alternating dark/bright pixels
		vec2 cellCoord = pixelCoord / uCellSize;

		// Create checkerboard pattern
		float checker = mod(floor(cellCoord.x) + floor(cellCoord.y), 2.0);

		// Apply darkening to one set of pixels, brightening to the other
		if (checker > 0.5) {
			// Darken these pixels
			texColor.rgb *= (1.0 - uDarkness);
		} else {
			// Brighten these pixels
			texColor.rgb += uBrightness;
		}
	}

	gl_FragColor = texColor;
}


