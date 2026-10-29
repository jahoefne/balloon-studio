"""Independent checks of the one-piece cable clip; run with Blender --background --python ... -- <folder>.

The folder is what `scripts/test.sh cable-clip` writes to .build/test-output/cable-clip: the print STL,
the settings, the clip as it sits on the wall (seated-clip.stl) and a cable through it (seated-cable.stl)."""
import bpy, bmesh, json, sys
from pathlib import Path
from mathutils.bvhtree import BVHTree

root = Path(sys.argv[sys.argv.index('--') + 1]).resolve() if '--' in sys.argv else Path(__file__).resolve().parents[1] / '.build/test-output/cable-clip'
settings = json.loads((root / 'cable-clip-settings.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
report = []

def load(path):
    bpy.ops.wm.stl_import(filepath=str(path))
    obj = bpy.context.object
    obj.name = path.stem
    return obj

def tree(obj):
    return BVHTree.FromPolygons([v.co.copy() for v in obj.data.vertices], [tuple(p.vertices) for p in obj.data.polygons], all_triangles=True)

def check(obj):
    bm = bmesh.new(); bm.from_mesh(obj.data)
    assert all(e.is_manifold and e.is_contiguous for e in bm.edges), (obj.name, 'non-manifold or inconsistent edges')
    volume = bm.calc_volume(signed=True)
    assert volume > 0, (obj.name, 'volume', volume)
    assert all(f.calc_area() > 1e-9 for f in bm.faces), (obj.name, 'degenerate face')
    remaining = set(bm.verts); stack = [remaining.pop()]
    while stack:
        for e in stack.pop().link_edges:
            for v in e.verts:
                if v in remaining:
                    remaining.remove(v); stack.append(v)
    assert not remaining, (obj.name, 'disconnected')
    verts = [v.co.copy() for v in obj.data.vertices]
    faces = [tuple(p.vertices) for p in obj.data.polygons]
    own = BVHTree.FromPolygons(verts, faces, all_triangles=True)
    crossings = [(a, b) for a, b in own.overlap(own) if a < b and not set(faces[a]) & set(faces[b])]
    assert not crossings, (obj.name, 'self intersections', crossings[:5])
    report.append({'file': obj.name + '.stl', 'dimensions_mm': [round(d, 4) for d in obj.dimensions],
                   'triangles': len(faces), 'volume_mm3': round(volume, 3)})
    bm.free()

printed = sorted(p for p in root.iterdir() if p.name.startswith('Cable-Clip-') and p.suffix == '.stl')
assert len(printed) == 1, printed
obj = load(printed[0])
check(obj)
assert min(v.co.z for v in obj.data.vertices) > -1e-5, (printed[0].name, 'below the bed')
clip, cable = load(root / 'seated-clip.stl'), load(root / 'seated-cable.stl')
check(clip); check(cable)
assert not tree(cable).overlap(tree(clip)), 'The cable intersects the clip'
# One piece, as wide as the strap's arch plus its wall, no wider than the nail head needs.
inner = settings['cableDiameter'] / 2 + 0.1
assert clip.dimensions.x >= 2 * (inner + settings['wall']) - 1e-4, 'Clip narrower than its strap'
print(json.dumps({'folder': str(root), 'cable_mm': settings['cableDiameter'], 'parts': report}, indent=1))
print(f"PASS cable clip: the print STL and the seated clip checked for topology and self-intersection, the cable clear of the clip")
