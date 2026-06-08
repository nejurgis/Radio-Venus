# Moon square/rectangle box on iOS Safari — regressed twice

## Problem
A visible square/rectangle box renders around the moon on mobile Safari.

## Root cause
`ctx.filter` (blur) AND `ctx.shadowBlur` on a `drawImage` call both render
against the **image's bounding rectangle** on WebKit/iOS — not the image's
alpha shape. Either one alone is enough to draw the box; combining them
forces layer rasterization and makes it worse.

## Proven fix (original: commit cdcc21f, 2026-02-19)
- Bake the edge-softening blur INTO the cached `getMoonPhaseCanvas` once per
  phase cache miss (`bc.filter = 'blur(48px)'` on an offscreen canvas).
- Main visible draw is a PLAIN `drawImage` — no `ctx.filter`, no `ctx.shadowBlur`.
- Surrounding glow comes from the `mGlow` radial-gradient haze, drawn separately.

## How it regressed
The three-phase compositing refactor (7e91ffd) re-introduced `ctx.filter` +
`ctx.shadowBlur` on the moon draw and dropped the baked blur. Then 243d5e2
piled on a bogus `* devicePixelRatio` multiply (separate oversize bug).

First re-fix attempt (c8f640e, 2026-06-08) removed only `ctx.filter` and kept
`shadowBlur` — INCOMPLETE, because shadowBlur alone still draws the box.

## Final fix (2026-06-08)
Restored cdcc21f approach fully: baked blur(48px) back into the phase canvas,
plain drawImage in the main loop, rim fade back to R*0.92.

## RULE
Never put `ctx.filter` or `ctx.shadowBlur` on the moon's main-loop `drawImage`.
Bake softness into the offscreen phase canvas. Glow = separate radial gradient.
