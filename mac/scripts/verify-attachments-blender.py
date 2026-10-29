"""Run after scripts/test.sh with Blender --background --factory-startup --python."""
import bpy, bmesh, json, math
from pathlib import Path
from mathutils import Vector
root = Path(__file__).resolve().parents[1] / '.build/test-output'
# Default reinforced eyelet: material under/around the bore and half thickness.
LOOP_FOOT, LOOP_WALL, LOOP_HALF = 6.0, 6.0, 6.0
reports = []
cases = [
    ('filled-tethers', False, True, 220, 3, None),
    ('filled-tethers-small', False, True, 80, 5, None),
    ('filled-tethers-wide-neck', False, True, 80, 2, 4),
    ('hanger-filled-plain', False, False, 220, 3, 4),
    ('hanger-filled-tethers', False, True, 220, 3, 4),
    ('hanger-hollow-plain', True, False, 220, 3, 4),
    ('hanger-hollow-tethers', True, True, 220, 3, 4),
    ('hanger-small', True, True, 80, 5, 5),
    ('hanger-tall', True, True, 242, 3, 2),
    ('hanger-wide', True, False, 80, 3, 5),
]
for name, hollow, tethers, height, cord, hanging in cases:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.stl_import(filepath=str(root/(name+'.stl')))
    obj = bpy.context.object
    bm = bmesh.new(); bm.from_mesh(obj.data)
    assert all(e.is_manifold and e.is_contiguous for e in bm.edges), name
    expected_euler = 2 - (8 if hollow else 6)*int(tethers) - 2*int(hanging is not None)
    assert len(bm.verts)-len(bm.edges)+len(bm.faces) == expected_euler, name
    assert bm.calc_volume(signed=True) > 0
    remaining = set(bm.verts); stack = [remaining.pop()]
    while stack:
        vertex = stack.pop()
        for edge in vertex.link_edges:
            neighbor = edge.other_vert(vertex)
            if neighbor in remaining:
                remaining.remove(neighbor); stack.append(neighbor)
    assert not remaining, (name, 'disconnected')
    checks = 0
    neck_mid = 6  # All tether cases normalize to a 12 mm neck, including the 80 mm tall body.
    if tethers:
        for side in range(4):
            theta = side*math.pi/2
            direction = Vector((math.cos(theta), math.sin(theta), 0))
            tangent = Vector((-math.sin(theta), math.cos(theta), 0))
            for sample in range(33):
                angle = 2*math.pi*sample/32
                offset = cord*0.49 if sample < 32 else 0
                origin = tangent*(math.cos(angle)*offset)+Vector((0,0,neck_mid+math.sin(angle)*offset))
                hit, location, normal, index = obj.ray_cast(origin, direction)
                assert not hit, (name, 'neck', side, sample, list(location))
                checks += 1
    if hanging is not None:
        center = height + LOOP_FOOT + hanging/2
        for sample in range(33):
            angle = 2*math.pi*sample/32
            offset = hanging*0.49 if sample < 32 else 0
            origin = Vector((math.cos(angle)*offset, -15, center+math.sin(angle)*offset))
            hit, location, normal, index = obj.ray_cast(origin, Vector((0,1,0)))
            assert not hit, (name, 'eyelet', sample, list(location))
            checks += 1
        # The lug keeps its full thickness beside and above the bore, with flat faces.
        inset = hanging/2 + LOOP_WALL*0.4
        for x, z in [(0, center+inset), (inset, center), (-inset, center)]:
            for side in (-1, 1):
                hit, location, normal, index = obj.ray_cast(Vector((x, -15*side, z)), Vector((0, side, 0)))
                assert hit and abs(location.y+side*LOOP_HALF)<0.001, (name, 'eyelet face', list(location))
                checks += 1
        # The foot flares into the crown pad instead of meeting it at a corner.
        hit, location, normal, index = obj.ray_cast(Vector((0,-15,height+0.3)), Vector((0,1,0)))
        assert hit and location.y < -LOOP_HALF-1, (name, 'eyelet fillet', list(location))
        assert abs(obj.dimensions.z-(height+hanging+LOOP_FOOT+LOOP_WALL))<0.001
    hit, location, normal, index = obj.ray_cast(Vector((0,0,-1)), Vector((0,0,1)))
    assert hit
    if hollow:
        assert abs(location.z-(height-5.0))<0.01, (name, 'reinforced crown', list(location))
    else:
        assert abs(location.z)<0.001
    if not hollow:
        # Check the center and a disk of points under the neck; none may enter a pocket.
        for ring in range(1,5):
            for sample in range(16):
                angle=2*math.pi*sample/16
                origin=Vector((ring*1.5*math.cos(angle),ring*1.5*math.sin(angle),-1))
                hit, bottom_hit, _, _ = obj.ray_cast(origin,Vector((0,0,1)))
                assert hit and abs(bottom_hit.z)<0.001, (name,'closed bottom',list(bottom_hit))
        if tethers:
            # Rays traverse each entire bore from outside, through the shared
            # intersection, and out the opposite mouth without meeting material.
            for axis in [Vector((1,0,0)),Vector((0,1,0))]:
                tangent=Vector((-axis.y,axis.x,0))
                for sample in range(32):
                    angle=2*math.pi*sample/32
                    origin=-axis*100+tangent*(cord*0.49*math.cos(angle))+Vector((0,0,neck_mid+cord*0.49*math.sin(angle)))
                    hit, bore_hit, _, _=obj.ray_cast(origin,axis,distance=200)
                    assert not hit,(name,'full through-bore',list(bore_hit))
                    checks += 1
    assert max(obj.dimensions) <= 256.001
    reports.append({'file':name+'.stl', 'dimensions_mm':list(obj.dimensions),
                    'euler_characteristic':expected_euler, 'clearance_ray_checks':checks,
                    'bottom_axis_material_starts_at_z_mm':location.z})
    print(json.dumps(reports[-1]), flush=True)
    bm.free()
(root/'attachment-blender-validation.json').write_text(json.dumps(reports, indent=2))
print('PASS all attachment imports and clearance checks', flush=True)
