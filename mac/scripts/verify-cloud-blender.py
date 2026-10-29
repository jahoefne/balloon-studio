"""Independent STL and seated-assembly checks; run with Blender --background --python."""
import bpy, bmesh, json, sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

root = Path(sys.argv[sys.argv.index('--') + 1]).resolve() if '--' in sys.argv else Path(__file__).resolve().parents[1] / '.build/test-output/cloud'
settings_path = root / ('sun-settings.json' if (root / 'sun-settings.json').exists() else 'cloud-settings.json')
settings = json.loads(settings_path.read_text())
kind = settings.get('kind', 'cloud')
bpy.ops.wm.read_factory_settings(use_empty=True)
objects = []
report = []
names = [f'A-{kind}-back-opaque.stl', 'B-sun-front-diffuser.stl' if kind == 'sun' else 'B-cloud-front-white-PLA.stl']
sides = [settings.get('cableSide', 'right')]
for key in ['secondCableSide', 'thirdCableSide', 'fourthCableSide']:
    side = settings.get(key)
    if side is not None and side not in sides:
        sides.append(side)
for side in sides:
    suffix = f'-{side}' if len(sides) > 1 else ''
    names.append(f'C-cable-seal-TPU{suffix}.stl')
    # Each outlet with room for a strain relief gets a bar and an anvil.
    clamp = [f'D-cable-clamp-bar{suffix}.stl', f'E-cable-clamp-anvil{suffix}.stl']
    if (root / clamp[0]).exists():
        names += clamp
# The small parts as they sit in the back, where the tests have written them.
seated = ['seated-seal.stl', 'seated-anvil.stl', 'seated-bar.stl']
if (root / seated[0]).exists():
    names += seated
# The slot insert, as printed and in its pocket.
insert = ['F-nail-slot-insert.stl', 'seated-insert.stl']
if (root / insert[0]).exists():
    names += insert[:1] + ([insert[1]] if (root / insert[1]).exists() else [])

def tree(obj):
    return BVHTree.FromPolygons([v.co.copy() for v in obj.data.vertices], [tuple(p.vertices) for p in obj.data.polygons], all_triangles=True)

for filename in names:
    bpy.ops.wm.stl_import(filepath=str(root / filename))
    obj = bpy.context.object
    objects.append(obj)
    bm = bmesh.new(); bm.from_mesh(obj.data)
    assert all(e.is_manifold and e.is_contiguous for e in bm.edges), filename
    assert bm.calc_volume(signed=True) > 0, filename
    assert all(f.calc_area() > 1e-9 for f in bm.faces), filename
    remaining = set(bm.verts); stack = [remaining.pop()]
    while stack:
        for e in stack.pop().link_edges:
            for v in e.verts:
                if v in remaining:
                    remaining.remove(v); stack.append(v)
    assert not remaining, (filename, 'disconnected')
    verts = [v.co.copy() for v in obj.data.vertices]
    faces = [tuple(p.vertices) for p in obj.data.polygons]
    own = BVHTree.FromPolygons(verts, faces, all_triangles=True)
    intersections = [(a,b) for a,b in own.overlap(own) if a < b and not set(faces[a]) & set(faces[b])]
    assert not intersections, (filename, 'self intersections', intersections[:5])
    report.append({'file': filename, 'dimensions_mm': list(obj.dimensions),
                   'triangles': len(faces), 'volume_mm3': bm.calc_volume(signed=True),
                   'nonmanifold_edges': 0, 'self_intersections': 0})
    bm.free()
# The seal is pressed into its pocket; its fit is checked by the geometry tests.
back, front = objects[0], objects[1]
# Slightly separate the nominal contact plane to exclude coplanar seating faces.
for v in front.data.vertices:
    if settings.get('surface') == 'sculpted':
        v.co.z += settings['depth'] - 12 + 0.001
    else:
        v.co = Vector((v.co.x, -v.co.y, settings['depth'] + settings['diffuserThickness'] - v.co.z + 0.001))
assert not tree(back).overlap(tree(front)), 'Front intersects back when seated'
checked = 'topology, self-intersection and seated assembly checks'
if seated[0] in names:
    seal, anvil, bar = objects[-3:]
    # The anvil lies on the floor, the bar rests on the posts.
    for obj in [anvil, bar]:
        for v in obj.data.vertices:
            v.co.z += 0.001
    for name, obj in [('anvil', anvil), ('bar', bar)]:
        for other_name, other in [('back', back), ('front', front), ('seal', seal)]:
            assert not tree(obj).overlap(tree(other)), f'The {name} intersects the {other_name} when seated'
    assert not tree(bar).overlap(tree(anvil)), 'The bar intersects the anvil when seated'
    checked += ', cable clamp seated clear of back, front and seal'
if insert[1] in names:
    placed = objects[names.index(insert[1])]
    # It rests on the lip and against the top of the chamber: part it from both.
    for v in placed.data.vertices:
        v.co.y -= 0.001; v.co.z += 0.001
    # Only the finger tips press on the chamber's walls, by design. The plate,
    # the slot and the way of the head are clear of the back.
    width = settings.get('nailHead', 8) / 2
    pv = placed.data.vertices
    pf = [tuple(p.vertices) for p in placed.data.polygons]
    contacts = tree(placed).overlap(tree(back))
    assert contacts, 'The insert\'s fingers do not reach the chamber\'s walls'
    for a, _ in contacts:
        corners = [pv[i].co for i in pf[a]]
        assert min(abs(c.x) for c in corners) > width - 0.8, ('The insert intersects the back', [tuple(c) for c in corners])
    assert not tree(placed).overlap(tree(front)), 'The insert intersects the front'
    checked += ', slot insert seated clear of the back but for its finger tips'
(root / 'blender-validation.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2), flush=True)
print(f'PASS independent Blender {checked}', flush=True)
