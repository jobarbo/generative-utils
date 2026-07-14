/**
 * Artwork layout helpers — constant-area canvas sizing from orientation + ratio.
 *
 * ratio = long edge : short edge (e.g. 3 → 3:1 strip). Pixel area stays ~viewportMin².
 *
 * Usage:
 *   const layout = { orientation: "horizontal", ratio: 3, baseSize: 400 };
 *   const { width, height, aspect, multiplier } = computeArtworkLayout(viewportMin, layout);
 */

/** @returns {number} width / height */
function getArtworkAspectRatio(layout) {
	const r = Math.max(Number(layout?.ratio) || 1, 0.01);
	return layout?.orientation === "vertical" ? 1 / r : r;
}

/**
 * Canvas size with ~constant pixel area regardless of aspect ratio.
 * @param {number} viewportMin - min(windowWidth, windowHeight)
 * @param {object} layout - { orientation, ratio, baseSize }
 */
function computeArtworkLayout(viewportMin, layout) {
	const aspect = getArtworkAspectRatio(layout);
	const height = viewportMin / Math.sqrt(aspect);
	const width = viewportMin * Math.sqrt(aspect);
	const baseSize = Number(layout?.baseSize) || 400;
	return {
		width,
		height,
		aspect,
		multiplier: viewportMin / baseSize,
	};
}
