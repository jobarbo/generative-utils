precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform float uTime;
uniform vec2 uResolution;

void main() {
    // Flip the y coordinate to match p5js coordinate system
    vec2 uv = vec2(vTexCoord.x, 1.0 - vTexCoord.y);

    // Center UV coordinates without distorting aspect ratio
    vec2 centered_uv = uv * 2.0 - 1.0;  // Convert from [0,1] to [-1,1] range

    // Radial distance from center — smoothstep edges must be increasing (edge0 < edge1) or GLSL gives undefined / NaN → black frame.
    float dist = length(centered_uv);
    float centerWeight = 1.0 - smoothstep(0.0, 1.414, dist); // stronger toward center

    // Create pulsing effect
    float pulse = sin(uTime * 1.7) * 0.000015 + 0.015;

    // More intense wave effect that changes over time
/*     float waveX = tan(centered_uv.x * (20.0 + sin(uTime) * 0.00001)) * 0.000001 * centerWeight * (1.0 + pulse * 10.5);
    float waveY = tan(centered_uv.y * (8.0 + cos(uTime * 0.000001) * 0.000001) + uTime) * 0.000001 * centerWeight * (1.0 + pulse * 10.5); */

    float waveX = centered_uv.x * 0.00001;
    float waveY = centered_uv.y * 0.00001;

    // Add spiral effect
    float angle = atan(centered_uv.y, centered_uv.x);
    float spiral = cos(dist * 1.1 * sin(uTime* 0.02) * 12.0) + sin(dist / 0.19 - uTime * 0.2);

    vec2 waveOffset = vec2(waveX, waveY);
    vec2 spiralOffset = vec2(cos(angle), sin(angle)) * spiral * centerWeight;

    centered_uv += waveOffset + spiralOffset;

    // Convert back to texture space
    uv = clamp((centered_uv + 1.0) * 0.5, 0.0, 1.0);

    vec4 originalColor = texture2D(uTexture, uv);
    gl_FragColor = originalColor;
}