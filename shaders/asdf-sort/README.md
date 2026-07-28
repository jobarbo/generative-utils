# asdf-sort — real pixel sort

A genuine pixel sort in a single fragment pass, after Kim Asendorf's *ASDF Pixel Sort*.
Spans of pixels passing a threshold test are **actually permuted** along the sort axis,
ordered by a key (luma, hue, saturation, lightness, R, G or B).

> Not to be confused with `library/shaders/pixel-sort`, which is a brightness-weighted
> directional **smear** — it displaces pixels but never sorts them. Both are kept; they
> look different and `pixel-sort` is cheaper.

Effect key: `asdfSort`. Loaded in `sketch-shaders.js` `preload()`:

```js
shaderManager.loadShader("asdfSort", "asdf-sort/fragment.frag", "asdf-sort/vertex.vert");
```

## How it works

A fragment shader can only *gather* (read), never *scatter* (write elsewhere), so the
obvious "compute my rank, write me there" sort is impossible. Computing your rank and
reading `spanStart + rank` gives the **inverse** permutation — visually noise, not a sort.
Searching for "the pixel whose rank equals my index" costs O(L²) per pixel.

So each span is bucket-sorted instead:

1. Walk both ways along the sort axis, stopping when the threshold test flips. Build a
   **16-bin histogram** of the span in the same loop (L texture fetches).
2. Prefix-sum the histogram to find which bin my index falls into, and my offset inside
   that bin.
3. Rescan the span in index order and take the n-th member of that bin (L fetches).

Total **2·L fetches** for a span of length L, and only for pixels inside the band —
everything else costs a single fetch. The histogram is packed into four `vec4` and
incremented with `step()` products, so there is no dynamic array indexing and the shader
stays valid GLSL ES 1.00 like the rest of the library.

The result is a true **bijection**: no holes, no duplicated pixels. It is monotone in the
key to 1/16 resolution and stable by index inside a bin. Verified numerically — a
full-span sort of a random image reproduces the input histogram exactly (Δ = 0) and every
column comes out monotone.

### Span blocks

Spans are clipped to blocks along the sort axis. This matters: a plain "walk until the
threshold flips" truncates differently depending on where in a long band you stand, so
neighbours disagree on the span bounds and the permutation breaks (holes and duplicates).

Block boundaries are **not** on a regular grid — `floor(t / maxSpan) * maxSpan` puts a
seam every `maxSpan` pixels on every line, which reads as a lattice immediately. Each
boundary is instead pushed by a hash of (boundary index, line), so block lengths wander
between 0.3x and 1.7x and no two lines cut in the same place. The push stays under half a
block, which keeps the boundary function monotone — so "which block am I in" is resolved
by testing four candidates rather than searching, and every pixel of a span agrees.
`spanJitter` scales that irregularity (0 = regular grid).

`spanJitter` only moves whole lines within a hash band, so on its own the seams still read
as straight segments. `edgeWobble` shifts a line's entire boundary set by a continuous FBM
of the perpendicular coordinate, so neighbouring lines cut at slightly different places
and the seam becomes a curve. A uniform shift per line keeps the boundaries monotone and
constant along the axis, so the permutation is untouched.

`center` is where that lattice is anchored: block boundaries and the per-line fields are
measured from it, so changing `angle` pivots the whole structure around that point rather
than around the texture corner. Its offset along the sort axis is snapped to a whole
number of steps — a fractional shift would pull every sample off the texel grid and
bilinear blending would quietly stop the result being a permutation. Note that a block
boundary always falls on `center`, so a span never straddles it.

### Why the threshold gets a second dimension

Anything that shifts the threshold band must be identical for every pixel of a span. The
obvious reading of that is "constant along the whole sort axis", which is what the sweep
originally was — a function of the perpendicular coordinate alone. The consequence is that
its iso-lines are dead-straight lines running parallel to the sort axis, so the sweep front
arrives as a ruled edge.

But the requirement is only "constant *within a block*", and blocks are already bounded.
So the band is sampled at `axial` — the block's midpoint along the axis — which is constant
inside a block and free to change from one block to the next. That buys back a second
dimension: `sweepMode` 3 and 4 are genuinely 2D fields, and the two wave modes get their
coordinate warped by an FBM of `axial` scaled by `edgeWobble`. The front becomes a ragged
staircase at block granularity instead of a straight line. The same treatment is applied to
the per-block threshold offset from `organicAmount`.

A radial sweep would still be impossible: it varies *continuously* along the span rather
than per block, and would shred the permutation.

### Mixing axes

The four axis checkboxes combine freely. With exactly one ticked the axis is a constant
and the region lookup is skipped entirely. With several, the image is diced into cells of
a hashed grid (`axisRegionScale`) and each cell draws one of the enabled axes. Spans are
cut wherever the axis changes, so a span never leaves its region and the whole thing stays
a bijection — and neighbouring cells that happen to draw the same axis simply merge, which
is why the patches do not read as a grid.

`angle` is now an extra rotation applied on top of whichever axis a region picked, so it
tilts the entire arrangement without breaking the combination.

The diagonal axes step by `sqrt(2)` so they land back on whole pixels, but a diagonal
lattice still maps several pixels to the same index — diagonal regions are a chunky
approximation, not a strict permutation. Vertical and horizontal are exact.

### Organic variation

`organicAmount` is a master knob for everything a per-line field is allowed to touch
without breaking the permutation. At 0 the shader is strictly uniform; at 1 each line gets:

- its own **span length**, 0.25x to 1.75x — a uniform `maxSpan` everywhere is the single
  biggest source of visual regularity;
- its own **threshold offset** (±0.3), so runs break at a different luminance on every
  line rather than all at the same one;
- its own **animation phase**, so lines stop pulsing in lockstep — this is most of the
  "the whole image breathes as one block" feeling.

The first two come from a 4-octave FBM of the perpendicular coordinate; the third from a
per-line hash. `organicScale` sets how wide the coherent bands are — low values give broad
regions that share a character, high values give line-to-line churn.

`organicSpeed` makes that FBM drift, which moves the seams sideways over time. It is an
**animation** knob and defaults to 0 — with every `animate*` box unticked and no sweep,
the output is bit-identical frame to frame. Raise it only when you want the structure
itself to crawl.

## Uniforms

| uniform | panel param | notes |
|---|---|---|
| `uTexture`, `uResolution` | — | source + physical resolution |
| `uTime` | `timeMultiplier` | fed by `_phase`, an accumulated clock — changing the speed does not jump |
| `uAxisVertical` … `uAxisAntiDiagonal` | `axisVertical`, `axisHorizontal`, `axisDiagonal`, `axisAntiDiagonal` | checkboxes, any combination |
| `uAxisRegionScale` | `axisRegionScale` | patch size when several axes are on |
| `uAngle` | `angle` | extra rotation applied on top of the chosen axis |
| `uCenter` | `center` | pivot the axis turns around, normalised 0–1 |
| `uSortKey`, `uGateKey` | `sortKey`, `gateKey` | 0 luma, 1 hue, 2 saturation, 3 lightness, 4 R, 5 G, 6 B |
| `uThresholdLow`, `uThresholdHigh` | `thresholdLow`, `thresholdHigh` | band; generalises Asendorf's black / brightness / white modes |
| `uInvertGate` | `invertGate` | sort what falls *outside* the band |
| `uInvertOrder` | `invertOrder` | descending |
| `uMaxSpan` | `maxSpan` | nominal span length in **canvas pixels** (density-independent); JS multiplies by `renderDensity` before upload. Capped at 64 steps |
| `uSpanStep` | `spanStep` | sampling stride in **canvas pixels** — same density scaling. **Main perf lever** |
| `uSpanJitter` | `spanJitter` | 0–1, irregularity of the block boundaries |
| `uEdgeWobble` | `edgeWobble` | 0–1, bends the block seams *and* the sweep front into curves |
| `uOrganicAmount` | `organicAmount` | master de-regulariser: per-line span, threshold and phase |
| `uOrganicScale`, `uOrganicSpeed` | idem | width and drift of the per-line field |
| `uAnimateThreshold`, `uThresholdAnimMode`, `uThresholdAnimAmount` | idem | global pulse: 0 sine, 1 noise, 2 FBM |
| `uSweepMode`, `uSweepAmount`, `uSweepScale`, `uSweepSpeed` | idem | sweep: 0 off, 1 sine, 2 scrolling ramp, 3 noise 2D, 4 FBM 2D. Front shape is bent by `edgeWobble` |
| `uAnimateSpan`, `uSpanAnimAmount`, `uSpanAnimSpeed` | idem | span length breathes |
| `uMix` | `mix` | blend original ↔ sorted |

## Performance

Cost is `2 × span length` fetches for gated pixels, 1 fetch otherwise. Two levers:

- **`maxSpan`** — linear. 24 canvas px is a good default; 64 steps is the hard cap (`MAX_HALF`).
- **`spanStep`** — divides the cost by the stride for the same reach. Above `1.0` the
  sort becomes *blocky*: cells of `spanStep` pixels are snapped to a shared lattice and
  move together, which is a clean chunky look rather than noise. Use `spanStep 3` +
  `maxSpan 72` to get a 72 px reach for the price of a 24 px one.

Both are authored in canvas pixels (density 1). `sketch-shaders.js` scales them by
`renderDensity` (= sketch `pixelDensity` × panel density scale) so the visual size stays
the same at any DPR; the shader still sees physical framebuffer pixels matching
`uResolution`.

Tightening the threshold band also cuts the cost directly, since out-of-band pixels exit
after a single fetch.

## Presets

```js
// Classic Asendorf: bright vertical runs bounded by dark pixels
{ angle: 0, sortKey: 0, gateKey: 0, thresholdLow: 0.3, thresholdHigh: 1.0, maxSpan: 48,
  organicAmount: 0.5, spanJitter: 0.7 }

// Long irregular drips, no two the same length
{ thresholdLow: 0.0, thresholdHigh: 1.0, maxSpan: 64, spanStep: 2,
  organicAmount: 1.0, organicScale: 2.0, spanJitter: 1.0 }

// Rigid / graphic — everything uniform, hard block seams
{ maxSpan: 32, organicAmount: 0.0, spanJitter: 0.0 }

// Sorted wave travelling across the image, lines out of phase
{ maxSpan: 40, sweepMode: 4, sweepAmount: 0.45, sweepScale: 1.5, sweepSpeed: 0.4,
  organicAmount: 0.8, organicSpeed: 0.4, timeMultiplier: 1.0 }

// Rainbow bands
{ sortKey: 1, gateKey: 0, thresholdLow: 0.15, thresholdHigh: 0.9, maxSpan: 32,
  organicAmount: 0.6 }
```

## Limits

- Ordering resolution is 16 bins (`NBINS`). Bump it to 32 by adding four more `vec4` to
  the histogram and the prefix sum if you ever need finer ordering.
- Reach is capped at 64 steps (`MAX_HALF`) so the loops stay bounded. `maxSpan` is the
  *nominal* block length and is clamped by `64 / (1 + 2·spanJitter·0.35)`, so a jittered
  block never exceeds the budget — raising `spanJitter` shortens the nominal block but
  the longest blocks still reach 64 steps. Use `spanStep` for reach beyond that.
- Non axis-aligned angles resample on a rotated lattice, so the permutation is only
  approximate there (same tradeoff as any rotated resample). `angle` 0 and `PI/2` are exact.
