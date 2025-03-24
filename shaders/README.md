# Shader Library

A collection of GLSL shaders for creative coding projects.

## Available Shaders

- [Chromatic Aberration](./chromatic-aberration) - Adds RGB color separation and subtle wave distortion effects

## Usage

Each shader directory contains:

- The GLSL shader files (vertex + fragment)
- A README with documentation and usage examples

These shaders are designed to work with WebGL environments like p5.js, Three.js, or other WebGL frameworks.

## Shader Manager

For easier integration, a shader manager utility is included in the `library/utils/` directory:

```js
// Initialize
shaderManager.init(this);

// Set default vertex shader
shaderManager.setDefaultVertex("chromatic-aberration/vertex.vert");

// Load shaders
shaderManager.loadShader("chromatic", "chromatic-aberration/fragment.frag");

// Apply shader with uniforms
shaderManager
	.apply("chromatic", {
		uTexture: myCanvas,
		uTime: millis() / 1000.0,
		uResolution: [width, height],
	})
	.drawFullscreenQuad();
```

See individual shader documentation for more specific examples.
