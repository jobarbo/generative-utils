precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform float uTime;
uniform vec2 uResolution;

// Simple 2D noise function
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

// 2D Noise based on Morgan McGuire @morgan3d
float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    // Four corners in 2D of a tile
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) +
           (c - a) * u.y * (1.0 - u.x) +
           (d - b) * u.x * u.y;
}

// Fractal Brownian Motion for more complex noise
float fbm(vec2 st) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int i = 0; i < 4; i++) {
        value += amplitude * noise(st);
        st *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

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
    float waveX = tan(uv.y * 0.0 ) * tan(0.0075);
    float waveY = tan(uv.x * 0.0 ) * tan(0.0075);
    vec2 waveOffset = vec2(waveX, waveY);

    // Sample the original image at the center position
    vec4 originalColor = texture2D(uTexture, uv);

    // Chromatic aberration - noisy, organic effect
    float aberrationAmount = 0.003; // Increased for more visible effect

    // Create noise-based direction vectors using proper noise functions
    float noiseScale = 6.0;
    vec2 noiseCoord = uv * noiseScale + uTime * 0.2;

    // Generate directional noise for X and Y
    float noiseX = fbm(noiseCoord) * 2.0 - 1.0; // Convert from [0,1] to [-1,1]
    float noiseY = fbm(noiseCoord + vec2(100.0, 100.0)) * 2.0 - 1.0; // Offset for different pattern

    // Create varying aberration intensity using layered noise
    vec2 intensityCoord = uv * 10.0 + uTime * 0.1;
    float noiseIntensity = fbm(intensityCoord);
    float scaledAberration = aberrationAmount * (0.5 + noiseIntensity * 1.5);

    // Apply noise-based directional offsets
    vec2 redOffset = uv + waveOffset + vec2(noiseX, noiseY) * scaledAberration;
    vec2 blueOffset = uv + waveOffset - vec2(noiseX, noiseY) * scaledAberration;
    vec2 greenOffset = uv + waveOffset + vec2(noiseY * 0.5, noiseX * 0.5) * scaledAberration;

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