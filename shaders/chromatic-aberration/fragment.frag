precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform float uTime;
uniform vec2 uResolution;

void main() {
    vec2 uv = vTexCoord;

    /*
        // Wave distortion
    float waveX = sin(uv.y * 1.0 + uTime) * 0.001;
    float waveY = cos(uv.x * 1.0 + uTime) * 0.001;
    vec2 waveOffset = vec2(waveX, waveY);

    // Chromatic aberration
    float aberrationAmount = 0.002;
    vec2 redOffset = uv + waveOffset + vec2(aberrationAmount, 0.0);
    vec2 blueOffset = uv + waveOffset - vec2(aberrationAmount, 0.0);
    vec2 greenOffset = uv + waveOffset;
    /*

    // Wave distortion
/*     float waveX = sin(uv.x * 100.0 + uTime) * tan(0.0025);
    float waveY = cos(uv.y * 100.0 - uTime) * tan(0.0025); */
    float waveX = tan(uv.y * 45.0 ) * tan(0.015);
    float waveY = tan(uv.x * 45.0 ) * tan(0.015);
    vec2 waveOffset = vec2(waveX, waveY);

    // Sample the original image at the center position
    vec4 originalColor = texture2D(uTexture, uv);

    // Chromatic aberration - slightly increased effect
    float aberrationAmount = 0.00001;
    vec2 redOffset = uv + waveOffset + vec2(aberrationAmount, 0.0);
    vec2 blueOffset = uv + waveOffset - vec2(aberrationAmount, 0.0);
    vec2 greenOffset = uv + waveOffset;

    // Sample colors with offsets
    vec4 redChannel = texture2D(uTexture, redOffset);
    vec4 greenChannel = texture2D(uTexture, greenOffset);
    vec4 blueChannel = texture2D(uTexture, blueOffset);

    // Calculate the chromatic aberration color difference
    float redDiff = redChannel.r - originalColor.r;
    float greenDiff = greenChannel.g - originalColor.g;
    float blueDiff = blueChannel.b - originalColor.b;

    // Apply 50% saturation to the color difference
    float saturationLevel = 1.0;
    redDiff *= saturationLevel;
    greenDiff *= saturationLevel;
    blueDiff *= saturationLevel;

    // Add the reduced aberration effect back to the original color
    vec4 color = vec4(
        originalColor.r + redDiff,
        originalColor.g + greenDiff,
        originalColor.b + blueDiff,
        1.0
    );

    gl_FragColor = color;
}