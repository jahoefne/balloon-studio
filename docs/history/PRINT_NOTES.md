# Hot-air balloon envelope

Created in Blender 5.0.1. Envelope only, with 20 rounded vertical gores, a round crown, and a flat 32 mm diameter throat. No basket or suspension lines.

## Files

- `hot_air_balloon_envelope_180x220mm.stl`: printable model, coordinates in millimetres.
- `hot_air_balloon_envelope.blend`: editable Blender scene; the balloon is selected. The separate preview studio collection is not part of the STL.
- `balloon_preview.png`: single-colour render. STL files do not contain material colours.
- `mesh_validation.json`: checks performed on the exported and reimported STL.

## Size and fit

The model measures **180 × 180 × 220 mm**. Import at **100% scale**, in millimetres, into Bambu Studio and centre it on the build plate. It fits within the P2S's **256 × 256 × 256 mm** build volume, leaving 38 mm on either side and 36 mm above.

Manufacturer specification: https://blog.bambulab.com/the-icon-redefined-meet-the-p2s-a-completely-reengineered-version-of-the-ultra-productive-p1-series/

## Suggested starting settings

For PLA with a 0.4 mm nozzle:

- Orientation: flat narrow end on the plate, rounded crown up (the supplied orientation).
- Layer height: 0.20 mm.
- Walls: 3.
- Top layers: 5; bottom layers: 4.
- Infill: 10% gyroid.
- Outer brim: 8 mm, for the relatively narrow footprint.
- Supports: start disabled and inspect the layer preview. The maximum outward surface angle is approximately 40.4° from vertical; the crown closes over infill.
- Use the printer's filament profile for temperatures and speeds.

This is a **closed outer volume with a capped bottom**. The slicer generates the walls and internal infill; it is not a pre-hollowed shell. Avoid vase mode and zero infill for this version because the crown needs internal support.

These are starting settings, not a tested print profile. The model has not been physically printed or sliced as part of this delivery.

## Validation

The exported STL was reimported into Blender and checked:

- One connected component.
- Zero nonmanifold edges.
- Zero inconsistent winding edges.
- Zero degenerate triangles.
- Positive enclosed volume.
- Exact dimensions: 180 × 180 × 220 mm.

The surface construction uses strictly increasing ring heights and nonintersecting angular sectors. The flat cap and rounded pole close the volume.
