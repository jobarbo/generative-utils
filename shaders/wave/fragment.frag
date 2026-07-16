precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uCenter;

// Personalization
uniform float uAmount; // overall mix [0..1] — 0 = original, 1 = full effect
uniform float uSpiralAmount; // spiral offset amplitude (legacy feel ≈ 1.0)
uniform float uSpiralFrequency; // ring density along radius (legacy ≈ 12.0)
uniform float uSpiralSpeed; // how fast spiral evolves with time (legacy ≈ 1.0)
uniform float uFalloff; // radial falloff size [0.1..2] — smaller = tighter to center (legacy ≈ 1.414)
uniform float uPulseAmount; // pulse modulation of spiral [0..] (legacy ≈ 0)
uniform float uPulseSpeed; // pulse rate (legacy ≈ 1.7)
uniform float uWaveAmount; // cartesian ripple amplitude (legacy ≈ 0.00001 — nearly off)
uniform float uWaveFrequency; // cartesian ripple frequency (legacy ≈ 1.0)

void main() {
	// UV orientation is corrected in shaderManager.renderPass / drawFullscreenQuad
	vec2 uv = vTexCoord;
	vec2 originalUV = uv;

	// Offset from configurable center (default 0.5, 0.5 = canvas center)
	vec2 centered_uv = (uv - uCenter) * 2.0;

	// Radial distance from center — smoothstep edges must be increasing
	float dist = length(centered_uv);
	float falloffEnd = max(uFalloff, 0.001);
	float centerWeight = 1.0 - smoothstep(0.0, falloffEnd, dist);

	float pulseSpeed = uPulseSpeed;
	float pulse = sin(uTime * pulseSpeed) * uPulseAmount;
	float pulseMul = 1.0 + pulse;

	// Soft cartesian ripple (legacy hardcodes were ~0 — bump waveAmount to bring it in)
	float waveAmt = uWaveAmount * pulseMul;
	float waveFreq = max(uWaveFrequency, 0.0);
	float waveX = sin(centered_uv.x * waveFreq * 20.0 + uTime) * waveAmt * centerWeight;
	float waveY = cos(centered_uv.y * waveFreq * 8.0 + uTime * 0.7) * waveAmt * centerWeight;

	// Spiral — legacy look @ spiralAmount=1, spiralFrequency=12, spiralSpeed=1
	float angle = atan(centered_uv.y, centered_uv.x);
	float spiralFreq = uSpiralFrequency;
	float spiralSpeed = uSpiralSpeed;
	float spiral =
		cos(dist * 1.1 * sin(uTime * 0.02 * spiralSpeed) * spiralFreq) +
		sin(dist / 0.19 - uTime * 0.2 * spiralSpeed);

	vec2 waveOffset = vec2(waveX, waveY);
	vec2 spiralOffset = vec2(cos(angle), sin(angle)) * spiral * centerWeight * uSpiralAmount * pulseMul;

	centered_uv += waveOffset + spiralOffset;

	// Convert back to texture space
	uv = clamp((centered_uv + 1.0) * 0.5, 0.0, 1.0);

	vec4 warpedColor = texture2D(uTexture, uv);
	vec4 originalColor = texture2D(uTexture, originalUV);
	float blend = clamp(uAmount, 0.0, 1.0);
	gl_FragColor = mix(originalColor, warpedColor, blend);
}
