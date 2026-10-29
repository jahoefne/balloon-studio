"""Build a printable balloon envelope in Blender. Coordinates and STL are mm."""
import bpy
import bmesh
import math
import json
from pathlib import Path
from mathutils import Vector

OUT = Path(__file__).resolve().parent.parent / 'output'  # mac/output, next to the app's own exports
OUT.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 0.001
scene.unit_settings.length_unit = 'MILLIMETERS'

def bezier(points, t):
    s = 1-t
    return tuple(s**3*points[0][i]+3*s*s*t*points[1][i]+3*s*t*t*points[2][i]+t**3*points[3][i] for i in range(2))

# Radius/height profile: flat throat, gentle flare, broad shoulder, round crown.
profile = [(16.0, 0.0), (16.0, 2.0), (16.0, 4.0), (16.0, 6.0)]
segments = [
    ([(16,6),(16,17),(26,28),(33,38)], 40),
    ([(33,38),(56,71),(90,94),(90,142)], 120),
    ([(90,142),(90,184),(48,220),(0,220)], 140),
]
for points, steps in segments:
    for k in range(1, steps+1):
        if points is segments[-1][0] and k == steps:
            continue
        profile.append(bezier(points,k/steps))

N = 320
verts = []
for radius, z in profile:
    t = max(0.0,min(1.0,(z-6)/32))
    fade = t*t*(3-2*t)
    # The crown gradually becomes circular so there is no pinched pole.
    crown = max(0.0,min(1.0,radius/22))
    crown = crown*crown*(3-2*crown)
    for j in range(N):
        theta = 2*math.pi*j/N
        r = radius*(1 - 0.020*fade*crown*(1-math.cos(20*theta)))
        verts.append((r*math.cos(theta),r*math.sin(theta),z))
faces = []
for i in range(len(profile)-1):
    for j in range(N):
        k=(j+1)%N
        faces.append((i*N+j,i*N+k,(i+1)*N+k,(i+1)*N+j))
bottom = len(verts)
verts.append((0,0,0))
top = len(verts)
verts.append((0,0,220))
for j in range(N):
    k=(j+1)%N
    faces.append((bottom,k,j))
    last=(len(profile)-1)*N
    faces.append((last+j,last+k,top))

mesh=bpy.data.meshes.new('Envelope_20_gores_mm')
mesh.from_pydata(verts,[],faces)
mesh.update()
obj=bpy.data.objects.new('Balloon envelope • 180 × 180 × 220 mm',mesh)
scene.collection.objects.link(obj)
bpy.context.view_layer.objects.active=obj
obj.select_set(True)
bm=bmesh.new()
bm.from_mesh(mesh)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
bm.to_mesh(mesh)
bm.free()
for p in mesh.polygons:
    p.use_smooth = p.center.z > 0.01

def material(name,color,roughness=0.45):
    mat=bpy.data.materials.new(name)
    mat.diffuse_color=(*color,1)
    mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(*color,1)
    shader.inputs['Roughness'].default_value=roughness
    return mat

obj.data.materials.append(material('Warm saffron PLA',(0.65,0.235,0.055)))
obj['description']='Hot-air balloon envelope only; closed printable volume with 20 gores and flat 32 mm throat.'
obj['dimensions_mm']='180 × 180 × 220'
obj['print_orientation']='Flat throat down, crown up. Use brim.'
obj['slicer_starting_point']='0.20 mm layers, 3 walls, 5 top layers, 4 bottom layers, 10% gyroid infill, 8 mm brim.'
obj['construction']='Closed outer volume. Wall thickness and infill are set in the slicer.'

stl=OUT/'hot_air_balloon_envelope_180x220mm.stl'
bpy.ops.wm.stl_export(filepath=str(stl),export_selected_objects=True,apply_modifiers=True,global_scale=1.0,use_scene_unit=False,ascii_format=False)

# Verify the exported file, rather than only the source mesh.
obj.select_set(False)
bpy.ops.wm.stl_import(filepath=str(stl),use_mesh_validate=True)
check=bpy.context.object
bm=bmesh.new()
bm.from_mesh(check.data)
bad_edges=sum(not e.is_manifold for e in bm.edges)
bad_winding=sum(not e.is_contiguous for e in bm.edges)
degenerate=sum(f.calc_area()<1e-9 for f in bm.faces)
seen=set()
components=0
for v in bm.verts:
    if v in seen:
        continue
    components+=1
    stack=[v]
    seen.add(v)
    while stack:
        current=stack.pop()
        for e in current.link_edges:
            other=e.other_vert(current)
            if other not in seen:
                seen.add(other)
                stack.append(other)
volume=bm.calc_volume(signed=True)
dims=list(check.dimensions)
max_slope=0
for j in range(N):
    for i in range(len(profile)-1):
        a=Vector(verts[i*N+j]); b=Vector(verts[(i+1)*N+j])
        dr=math.hypot(b.x,b.y)-math.hypot(a.x,a.y)
        max_slope=max(max_slope,dr/(b.z-a.z))
report={
    'file':stl.name,'units':'mm','dimensions_mm':[round(x,4) for x in dims],
    'vertices':len(bm.verts),'triangles':len(bm.faces),
    'connected_components':components,'nonmanifold_edges':bad_edges,
    'inconsistent_winding_edges':bad_winding,'degenerate_triangles':degenerate,
    'signed_enclosed_volume_mm3':round(volume,2),
    'build_volume_mm':[256,256,256], 'fits_P2S':all(x<256 for x in dims),
    'maximum_outward_overhang_degrees_from_vertical':round(math.degrees(math.atan(max_slope)),2),
    'self_intersection_check':'Analytic construction: strictly increasing ring heights and positive radii, disjoint angular sectors; no intersecting surfaces.',
    'physical_print_tested':False,
}
assert bad_edges==0 and bad_winding==0 and degenerate==0 and components==1 and volume>0
assert all(abs(a-b)<0.01 for a,b in zip(dims,[180,180,220]))
(OUT/'mesh_validation.json').write_text(json.dumps(report,indent=2)+'\n')
print('VALIDATION '+json.dumps(report))
bm.free()
bpy.data.objects.remove(check,do_unlink=True)

# Studio presentation, kept out of the printable STL.
stage=bpy.data.collections.new('Preview studio (not exported)')
scene.collection.children.link(stage)
def move_to_stage(ob):
    for coll in list(ob.users_collection): coll.objects.unlink(ob)
    stage.objects.link(ob)
bpy.ops.mesh.primitive_plane_add(size=20000, location=(0,0,-0.08))
ground=bpy.context.object
ground.name='Preview ground only'
ground.data.materials.append(material('Sand backdrop',(0.17,0.19,0.21),0.8))
move_to_stage(ground)
def aim(ob,point): ob.rotation_euler=(Vector(point)-ob.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(340,-550,300))
cam=bpy.context.object
aim(cam,(0,0,111))
cam.data.type='ORTHO'
cam.data.ortho_scale=285
scene.camera=cam
move_to_stage(cam)
for name,location,power,size in [
    ('Large softbox',(-220,-280,420),2400000,260),
    ('Fill',(280,-80,240),1000000,220),
    ('Rim',(80,230,360),3000000,200),
]:
    bpy.ops.object.light_add(type='AREA',location=location)
    light=bpy.context.object
    light.name=name
    light.data.energy=power
    light.data.shape='DISK'
    light.data.size=size
    aim(light,(0,0,110))
    move_to_stage(light)
scene.world.color=(0.25,0.25,0.25)
scene.render.engine='CYCLES'
scene.cycles.samples=48
scene.cycles.use_denoising=True
scene.render.resolution_x=1100
scene.render.resolution_y=1100
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(OUT/'balloon_preview.png')
scene.view_settings.view_transform='AgX'
bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.context.view_layer.objects.active=obj
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_distance=340
            area.spaces.active.region_3d.view_location=(0,0,110)
            area.spaces.active.clip_end=10000
            area.spaces.active.region_3d.view_rotation=cam.rotation_euler.to_quaternion()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'hot_air_balloon_envelope.blend'))
bpy.ops.render.render(write_still=True)
