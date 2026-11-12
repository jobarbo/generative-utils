precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform float uHue;        // hue rotation in degrees (0–360)
uniform float uSaturation; // 0 = grayscale, 1 = unchanged, 2 = boosted
uniform vec3 uTintColor;   // filter color (0–1 per channel), like a gel
uniform float uTintAmount; // 0 = no filter, 1 = full multiply by uTintColor
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

void main() {
	vec4 tex = texture2D(uTexture, vTexCoord);
	vec3 col = tex.rgb;

	vec3 c = hueRotate(col, uHue);

	float l = dot(c, LUMA);
	c = mix(vec3(l), c, max(uSaturation, 0.0));

	vec3 filtered = c * clamp(uTintColor, 0.0, 1.0);
	c = mix(c, filtered, clamp(uTintAmount, 0.0, 1.0));

	c = clamp(c, 0.0, 1.0);
	gl_FragColor = vec4(mix(col, c, clamp(uMix, 0.0, 1.0)), tex.a);
}
