# Chromatic Aberration Shader

A GLSL shader that adds chromatic aberration and subtle wave distortion effects to images or textures.

## Usage

Include both the vertex and fragment shaders in your project:

- `vertex.vert` - Standard vertex shader for texture coordinates
- `fragment.frag` - Fragment shader with chromatic aberration and distortion effects

## Uniforms

- `uTexture` - Input texture/image
- `uTime` - Time value for animation (in seconds)
- `uResolution` - Resolution of the canvas/viewport

## Example

### Basic Usage (Direct)

```js
// P5.js example
let myShader;

function preload() {
	myShader = loadShader("chromatic-aberration/vertex.vert", "chromatic-aberration/fragment.frag");
}

function setup() {
	createCanvas(windowWidth, windowHeight, WEBGL);
}

function draw() {
	shader(myShader);
	myShader.setUniform("uTexture", img);
	myShader.setUniform("uTime", millis() / 1000.0);
	myShader.setUniform("uResolution", [width, height]);
	rect(0, 0, width, height);
}
```

### With Shader Manager (Recommended)

```js
// P5.js example with shader manager
function preload() {
	// Initialize shader manager
	shaderManager.init(this);

	// Set default vertex shader
	shaderManager.setDefaultVertex("chromatic-aberration/vertex.vert");

	// Load the shader
	shaderManager.loadShader("chromatic", "chromatic-aberration/fragment.frag");
}

function setup() {
	createCanvas(windowWidth, windowHeight, WEBGL);
}

function draw() {
	// Apply shader with uniform values
	shaderManager
		.apply("chromatic", {
			uTexture: img,
			uTime: millis() / 1000.0,
			uResolution: [width, height],
		})
		.drawFullscreenQuad();
}
```
