/**
 * Shader Manager Utility
 *
 * A utility class to manage shaders in p5.js projects
 * Makes it easy to load, apply, and reuse shaders from the library
 */
class ShaderManager {
	constructor() {
		this.shaders = {};
		this.defaultVertexPath = null;
		this.p5Instance = null;
		this.basePath = "";
	}

	/**
	 * Initialize the shader manager
	 * @param {p5} p5Instance - The p5 instance
	 * @param {string} basePath - Base path to the shader directory (default: "library/shaders/")
	 */
	init(p5Instance, basePath = "library/shaders/") {
		this.p5Instance = p5Instance;
		this.basePath = basePath;
		return this;
	}

	/**
	 * Set the default vertex shader path
	 * @param {string} path - Path to the vertex shader
	 */
	setDefaultVertex(path) {
		this.defaultVertexPath = this.basePath + path;
		return this;
	}

	/**
	 * Load a shader
	 * @param {string} name - Name to reference the shader
	 * @param {string} fragPath - Path to the fragment shader (relative to basePath)
	 * @param {string} vertPath - Path to the vertex shader (optional, uses default if not provided)
	 */
	loadShader(name, fragPath, vertPath = null) {
		const vertexPath = vertPath ? this.basePath + vertPath : this.defaultVertexPath;
		const fragmentPath = this.basePath + fragPath;

		if (!vertexPath) {
			console.error("No vertex shader specified and no default set");
			return this;
		}

		this.shaders[name] = this.p5Instance.loadShader(vertexPath, fragmentPath);
		return this;
	}

	/**
	 * Apply a shader with uniforms
	 * @param {string} name - Name of the shader to apply
	 * @param {object} uniforms - Object with uniform values to set
	 * @param {p5.Graphics} target - Optional target to render to
	 */
	apply(name, uniforms = {}) {
		if (!this.shaders[name]) {
			console.error(`Shader "${name}" not found`);
			return this;
		}

		const shader = this.shaders[name];
		this.p5Instance.shader(shader);

		// Set uniforms
		for (const [key, value] of Object.entries(uniforms)) {
			shader.setUniform(key, value);
		}

		return this;
	}

	/**
	 * Draw a fullscreen quad to render the shader
	 */
	drawFullscreenQuad() {
		this.p5Instance.push();
		this.p5Instance.noStroke();

		// Draw the quad with correct texture coordinates
		this.p5Instance.beginShape();
		// Format: vertex(x, y, z, textureU, textureV)
		this.p5Instance.vertex(-1, 1, 0, 0, 0); // top-left
		this.p5Instance.vertex(1, 1, 0, 1, 0); // top-right
		this.p5Instance.vertex(1, -1, 0, 1, 1); // bottom-right
		this.p5Instance.vertex(-1, -1, 0, 0, 1); // bottom-left
		this.p5Instance.endShape(this.p5Instance.CLOSE);

		this.p5Instance.pop();
		return this;
	}
}

// Create a global instance
const shaderManager = new ShaderManager();
