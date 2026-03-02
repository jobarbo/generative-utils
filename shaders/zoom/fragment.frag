precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uZoomSpeed;
uniform float uZoomAmount;     // static absolute zoom (1.0 = 1x, 2.0 = 2x in, 0.5 = 2x out)
uniform float uZoomOutAmount;  // min zoom when animating
uniform float uZoomInAmount;   // max zoom when animating
uniform float uAnimateZoom;    // 0.0 = static, 1.0 = animate between out/in
uniform vec2 uCenter;

// Infinite mirrored tiling:
// - Inside [0,1]x[0,1], UVs are untouched (no added symmetry).
// - Outside, we tile and mirror on every odd tile index so the image
//   extends infinitely with mirrored copies.
vec2 mirrorInfinite(vec2 uv) {
	// Keep the original image unsymmetrized in the main tile
	if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
		return uv;
	}

	vec2 tile = floor(uv);   // ..., -2, -1, 0, 1, 2, ...
	vec2 local = fract(uv);  // 0..1 inside each tile

	// Mirror on odd tiles along X
	if (mod(tile.x, 2.0) != 0.0) {
		local.x = 1.0 - local.x;
	}
	// Mirror on odd tiles along Y
	if (mod(tile.y, 2.0) != 0.0) {
		local.y = 1.0 - local.y;
	}

	return local;
}

void main() {
	// Base UVs
	vec2 uv = vTexCoord;

	// Choose zoom factor:
	// - If animation disabled, use absolute zoomAmount directly.
	// - If animation enabled, oscillate smoothly between zoomOutAmount and zoomInAmount.
	float zoom;
	if (uAnimateZoom > 0.5) {
		float t = 0.5 + 0.5 * sin(uTime * uZoomSpeed);
		zoom = mix(uZoomOutAmount, uZoomInAmount, t);
	} else {
		zoom = uZoomAmount;
	}

	// Avoid degenerate scale
	zoom = max(zoom, 0.0001);

	// Re-center and apply zoom around the chosen center point
	vec2 offset = uv - uCenter;
	vec2 zoomedUV = uCenter + offset / zoom;

	// Infinite mirrored tiling outside the original canvas, while leaving the
	// core image (0..1) unchanged.
	vec2 finalUV = mirrorInfinite(zoomedUV);

	// Sample the texture
	vec4 baseColor = texture2D(uTexture, finalUV);
	gl_FragColor = baseColor;
}


