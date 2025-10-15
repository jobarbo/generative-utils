precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uDarkness; // How much to darken
uniform float uBrightness; // How much to brighten
uniform float uCellSize; // Size of cells
uniform float uGapDarkness; // CRT: Gap visibility/opacity (0.0 = no gaps visible, 1.0 = full dark gaps)
uniform float uRgbIntensity; // CRT: RGB color separation intensity (0.0 = no separation, 1.0 = full RGB isolation)
uniform float uDotRadius; // CRT: Size of phosphor dots (0.0-0.5, typical: 0.3-0.4)
uniform float uDotFalloff; // CRT: Softness of phosphor dot edges (0.0-1.0, typical: 0.1-0.5)
uniform bool uCrtMode; // true = CRT mode, false = Checkerboard mode

void main() {
	vec2 uv = vTexCoord;
	
	// Get pixel coordinates
	vec2 pixelCoord = uv * uResolution;

	if (uCrtMode) {
		// CRT MODE: Each cell contains RGB phosphor dots arranged horizontally
		// with alternating vertical offset (staggered pattern)
		// Each cell samples ONE color and displays it through three RGB phosphors
		
		// Apply alternating vertical offset for staggered/honeycomb pattern
		// Every other column is offset by 0.5 cells vertically
		float columnIndex = floor(pixelCoord.x / uCellSize);
		float verticalOffset = mod(columnIndex, 2.0) * 0.5 * uCellSize;
		
		// Adjust pixel coordinate with the offset
		vec2 adjustedPixelCoord = vec2(pixelCoord.x, pixelCoord.y - verticalOffset);
		
		// Determine which cell we're in
		vec2 cellCoord = adjustedPixelCoord / uCellSize;
		vec2 cellIndex = floor(cellCoord);
		
		// Sample color at the CENTER of the cell (not at current pixel position)
		// This mimics how a CRT pixel displays one color through its phosphors
		vec2 cellCenterCoord = (cellIndex + vec2(0.5)) * uCellSize;
		// Unapply the vertical offset to get back to original coordinate space
		vec2 originalCellCenter = vec2(cellCenterCoord.x, cellCenterCoord.y + verticalOffset);
		vec2 cellCenterUV = originalCellCenter / uResolution;
		vec4 cellColor = texture2D(uTexture, cellCenterUV);
		
		// Position within the cell (0.0 to 1.0)
		vec2 cellPos = fract(cellCoord);
		
		// Each cell is divided into 3 horizontal sections for R, G, B
		float subpixelWidth = 1.0 / 3.0;
		float subpixelIndex = floor(cellPos.x * 3.0); // 0, 1, or 2
		
		// Position within the subpixel (0.0 to 1.0)
		vec2 subpixelPos = vec2(
			fract(cellPos.x * 3.0),
			cellPos.y
		);
		
		// Create rounded phosphor dots with smooth falloff
		// Center the dot at (0.5, 0.5) within each subpixel
		vec2 dotCenter = vec2(0.5, 0.5);
		float distFromCenter = length(subpixelPos - dotCenter);
		
		// Smooth circular dot with soft edges (using uniforms)
		float dotMask = smoothstep(uDotRadius + uDotFalloff, uDotRadius - uDotFalloff, distFromCenter);
		
		// Determine which color channel based on subpixel
		vec3 phosphorMask = vec3(0.0);
		if (subpixelIndex < 0.5) {
			// Red phosphor
			phosphorMask = vec3(1.0, 0.0, 0.0);
		} else if (subpixelIndex < 1.5) {
			// Green phosphor
			phosphorMask = vec3(0.0, 1.0, 0.0);
		} else {
			// Blue phosphor
			phosphorMask = vec3(0.0, 0.0, 1.0);
		}
		
		// Use gapDarkness to control gap visibility/opacity
		// At 0.0: no gaps visible (effectiveDotMask = 1.0 everywhere)
		// At 1.0: full gaps (effectiveDotMask = actual dotMask with dark gaps)
		float effectiveDotMask = mix(1.0, dotMask, uGapDarkness);
		
		// Apply RGB color separation based on uRgbIntensity
		// At 0.0: no RGB separation (full color on all phosphors)
		// At 1.0: full RGB isolation (each phosphor shows only its color channel)
		vec3 isolatedColor = cellColor.rgb * phosphorMask;
		vec3 fullColor = cellColor.rgb;
		vec3 phosphorColor = mix(fullColor, isolatedColor, uRgbIntensity);
		
		// Boost phosphor intensity to compensate for channel isolation
		// The boost is scaled by RGB intensity since we only need it when colors are isolated
		float intensityBoost = mix(1.0, 2.8, uRgbIntensity);
		vec3 crtColor = phosphorColor * effectiveDotMask * intensityBoost;
		
		// Blend with base image to maintain overall brightness
		// This adds a subtle base layer so the image isn't only visible through phosphors
		float baseBlend = 0.3; // Amount of original image to blend in
		crtColor = mix(crtColor, cellColor.rgb * effectiveDotMask, baseBlend);
		
		// Very subtle scanlines (using adjusted coordinate for proper alignment)
		float scanlineFreq = uCellSize;
		float scanline = sin(adjustedPixelCoord.y / scanlineFreq * 3.14159 * 2.0) * 0.5 + 0.5;
		scanline = mix(0.95, 1.0, scanline); // Very subtle
		crtColor *= scanline;
		
		// Apply brightness boost
		crtColor *= (1.0 + uBrightness);
		
		// Apply darkness
		crtColor *= (1.0 - uDarkness);
		
		gl_FragColor = vec4(crtColor, cellColor.a);

	} else {
		// CHECKERBOARD MODE: Alternating dark/bright pixels
		// Sample texture at current pixel for checkerboard mode
		vec4 texColor = texture2D(uTexture, uv);
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
		
		gl_FragColor = texColor;
	}
}


