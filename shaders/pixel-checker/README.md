# Pixel Checker Shader

Creates a subtle checkerboard pattern where alternating pixels are darkened, creating a retro low-res dithering effect.

## Uniforms

- `uTexture` (sampler2D) - The input texture
- `uResolution` (vec2) - Canvas resolution [width, height]
- `uDarkness` (float) - How much to darken alternating pixels (0.0 - 1.0)
  - 0.0 = no effect
  - 0.35 = subtle darkening (35% darker)
  - 1.0 = maximum darkening (black)
- `uBrightness` (float) - How much to brighten the other alternating pixels (0.0+)
  - 0.0 = no effect
  - 0.15 = subtle brightening
  - Higher values = more brightness added
- `uCellSize` (float) - Size of each cell in pixels
  - 1.0 = 1x1 pixel cells (finest detail)
  - 2.0 = 2x2 pixel cells
  - 4.0 = 4x4 pixel cells (more visible pattern)

## Features

- **Pixel-perfect**: Each cell in the checkerboard is exactly 1 pixel
- **Resolution-aware**: Automatically adapts to canvas size
- **Adjustable intensity**: Control the darkness amount
- **Subtle effect**: Creates a retro dithering/halftone look

## Example Usage

```javascript
shaderEffects.addEffect("pixelChecker", {
	enabled: true,
	darkness: 0.35,
	brightness: 0.15,
	cellSize: 1.0,
	uniforms: {
		uResolution: "[width, height]",
		uDarkness: "darkness",
		uBrightness: "brightness",
		uCellSize: "cellSize",
	},
});
```

## Tips

- Lower darkness (0.15-0.35) for subtle vintage effect
- Higher darkness (0.5-0.8) for more pronounced dithering
- Works great as a final pass after other effects
- Combines well with grain and chromatic aberration for retro look
