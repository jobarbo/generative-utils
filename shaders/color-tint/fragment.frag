precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform float uHue;        // hue rotation in degrees (0–360)
uniform float uSaturation; // 0 = grayscale, 1 = unchanged, 2 = boosted
uniform vec3 uTintColor;   // filter color (0–1 per channel), like a gel
uniform float uTintAmount; // 0 = no filter, 1 = full blend with uTintColor
uniform float uTintMode;   // 0 = multiply (gel), 1 = screen, 2 = soft light, 3 = colorize
uniform float uMix;        // 0 = original, 1 = full effect

const vec3 LUMA = vec3(0.299, 0.587, 0.114);

// Rotate hue around the gray axis (keeps luminance roughly stable).
vec3 hueRotate(vec3 c, float deg) {
	float a = radians(deg);
	float cs = cos(a);
	float sn = sin(a);
	vec3 k = vec3(0.57735); // normalized (1,1,1)
	return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// Blend the tint colour onto c. Only multiply and colorize discard the
// channels the tint lacks; screen and soft light keep per-channel detail
// (e.g. chromatic-aberration fringes) while still colouring the image.
vec3 tintBlend(vec3 c, vec3 t, float mode) {
	if (mode < 0.5) {
		return c * t; // multiply — colour gel in front of the lens
	} else if (mode < 1.5) {
		return 1.0 - (1.0 - c) * (1.0 - t); // screen — lightens toward t
	} else if (mode < 2.5) {
		return (1.0 - 2.0 * t) * c * c + 2.0 * t * c; // soft light (pegtop) — tints midtones, keeps contrast
	}
	// colorize — luminance carried by the tint hue
	float l = dot(c, LUMA);
	return clamp(t * (l / max(dot(t, LUMA), 0.001)), 0.0, 1.0);
}

void main() {
	vec4 tex = texture2D(uTexture, vTexCoord);
	vec3 col = tex.rgb;

	vec3 c = hueRotate(col, uHue);

	float l = dot(c, LUMA);
	c = mix(vec3(l), c, max(uSaturation, 0.0));

	vec3 t = clamp(uTintColor, 0.0, 1.0);
	float mode = floor(uTintMode + 0.5);
	// Multiply stays unclamped so mode 0 matches the original look exactly;
	// the other blends assume 0–1 input (saturation > 1 can overshoot).
	vec3 filtered = mode < 0.5 ? c * t : tintBlend(clamp(c, 0.0, 1.0), t, mode);
	c = mix(c, filtered, clamp(uTintAmount, 0.0, 1.0));

	c = clamp(c, 0.0, 1.0);
	gl_FragColor = vec4(mix(col, c, clamp(uMix, 0.0, 1.0)), tex.a);
}
