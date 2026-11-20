"""Blender scene: MedSpa App feature graphic (2048x1000, later downscaled to 1024x500).
Two 3D phones showing the app + a gold 3D sparkle on a champagne studio backdrop.
Run: blender -b -P feature_scene.py -- <scratchpad_dir> <out_png>
"""
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
SP, OUT = argv[0], argv[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (*lin, 1.0)


def mat_principled(name, color, metallic=0.0, rough=0.5, coat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = srgb(color)
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = rough
    if "Coat Weight" in b.inputs:
        b.inputs["Coat Weight"].default_value = coat
    return m


def mat_screen(name, img_path):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(img_path)
    tex.interpolation = "Cubic"
    emis = nt.nodes.new("ShaderNodeEmission")
    emis.inputs["Strength"].default_value = 1.0
    gloss = nt.nodes.new("ShaderNodeBsdfGlossy")
    gloss.inputs["Roughness"].default_value = 0.08
    mix_g = nt.nodes.new("ShaderNodeMixShader")
    mix_g.inputs["Fac"].default_value = 0.03  # a little glass reflection
    transp = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix_a = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(tex.outputs["Color"], emis.inputs["Color"])
    nt.links.new(emis.outputs[0], mix_g.inputs[1])
    nt.links.new(gloss.outputs[0], mix_g.inputs[2])
    nt.links.new(tex.outputs["Alpha"], mix_a.inputs["Fac"])
    nt.links.new(transp.outputs[0], mix_a.inputs[1])
    nt.links.new(mix_g.outputs[0], mix_a.inputs[2])
    nt.links.new(mix_a.outputs[0], out.inputs["Surface"])
    return m


BODY = mat_principled("body", "#1C1A18", metallic=0.6, rough=0.28, coat=0.6)
RIM = mat_principled("rim", "#8A7A68", metallic=1.0, rough=0.22)
GOLD = mat_principled("gold", "#C29A5B", metallic=1.0, rough=0.2)
BACK = mat_principled("backdrop", "#E9E0D3", rough=0.9)

PW, PH, PD = 0.80, 1.80, 0.07  # phone width / height / depth


def rounded_rect_mesh(name, w, h, r, segs=20):
    import bmesh
    pts = []
    corners = [(w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)]
    for cx, cz, a0 in corners:
        for i in range(segs + 1):
            a = math.radians(a0 + 90 * i / segs)
            pts.append((cx + r * math.cos(a), 0, cz + r * math.sin(a)))
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in pts]
    bm.faces.new(vs)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def phone(name, img, loc, rot_deg):
    body = rounded_rect_mesh(name, PW, PH, 0.13)
    sol = body.modifiers.new("solid", "SOLIDIFY")
    sol.thickness = PD
    sol.offset = 0
    bev = body.modifiers.new("bevel", "BEVEL")
    bev.width = 0.018
    bev.segments = 6
    bev.limit_method = "ANGLE"
    bev.angle_limit = math.radians(50)
    body.data.materials.append(BODY)
    for poly in body.data.polygons:
        poly.use_smooth = True
    sw = PW - 0.055
    sh = sw * 2424 / 1080
    bpy.ops.mesh.primitive_plane_add(size=1)
    scr = bpy.context.object
    scr.name = name + "_screen"
    scr.scale = (sw, sh, 1)
    scr.rotation_euler = (math.radians(90), 0, 0)
    scr.location = (0, -PD / 2 - 0.002, 0)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    scr.data.materials.append(mat_screen(name + "_mat", img))
    scr.parent = body
    body.location = loc
    body.rotation_euler = tuple(math.radians(a) for a in rot_deg)
    return body


phone("phoneA", os.path.join(SP, "screen_rewards.png"), (1.35, 0.45, -0.05), (4, 0, -24))
phone("phoneB", os.path.join(SP, "screen_home.png"), (0.55, -0.15, -0.28), (-3, 0, 20))

# gold sparkle (bezier curve, extruded)
BIG = [(50, 19), (81, 50), (50, 81), (19, 50)]
HR = [(53, 41), (59, 53), (47, 59), (41, 47)]   # handle_right of point i
HL = [(41, 47), (59, 47), (53, 59), (41, 53)]   # handle_left of point i (c2 of previous segment)
# previous segment c2 values: seg3 c2=(41,47)->P0, seg0 c2=(59,47)->P1, seg1 c2=(53,59)->P2, seg2 c2=(41,53)->P3


def sparkle_obj(name, scale, loc, rot):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "2D"
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(3)
    for i, bp in enumerate(sp.bezier_points):
        p = BIG[i]
        bp.co = ((p[0] - 50) / 62, -(p[1] - 50) / 62, 0)
        bp.handle_right = ((HR[i][0] - 50) / 62, -(HR[i][1] - 50) / 62, 0)
        bp.handle_left = ((HL[i][0] - 50) / 62, -(HL[i][1] - 50) / 62, 0)
        bp.handle_left_type = bp.handle_right_type = "FREE"
    sp.use_cyclic_u = True
    cu.fill_mode = "BOTH"
    cu.extrude = 0.05
    cu.bevel_depth = 0.012
    cu.bevel_resolution = 6
    cu.resolution_u = 48
    ob = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(GOLD)
    ob.scale = (scale, scale, scale)
    ob.location = loc
    ob.rotation_euler = tuple(math.radians(a) for a in rot)
    return ob


sparkle_obj("sparkle", 0.5, (-0.25, -0.6, 0.55), (90, 22, -12))
sparkle_obj("sparkle_small", 0.17, (-0.02, -0.9, -0.22), (90, -18, 20))

# backdrop: a curved sweep behind and under the phones
bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 1.2, 0), rotation=(math.radians(90), 0, 0))
bpy.context.object.data.materials.append(BACK)
bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, -1.6))
bpy.context.object.data.materials.append(BACK)

# lights
def area(name, loc, target, size, energy, color="#FFFFFF"):
    bpy.ops.object.light_add(type="AREA", location=loc)
    lt = bpy.context.object
    lt.name = name
    lt.data.size = size
    lt.data.energy = energy
    lt.data.color = srgb(color)[:3]
    d = Vector(target) - Vector(loc)
    lt.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return lt

area("key", (-4.0, -4.0, 3.0), (0.8, 0, 0), 3.0, 380)
area("fill", (4.5, -4.0, 0.8), (0.8, 0, 0), 6.0, 120, "#FFFFFF")
area("rim", (1.5, 2.5, 3.5), (0.7, 0, 0), 2.0, 200, "#FFF4E4")

world = bpy.data.worlds.new("w")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = srgb("#F4F0EA")
world.node_tree.nodes["Background"].inputs[1].default_value = 0.12

# camera
bpy.ops.object.camera_add(location=(0.0, -9.0, 0.35))
cam = bpy.context.object
cam.data.lens = 85
cam.data.shift_x = 0.0
d = Vector((0.0, 0.0, 0.1)) - cam.location
cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
scene.camera = cam

# render settings
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
device = "CPU"
for t in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = t
        prefs.get_devices()
        if any(dv.type == t for dv in prefs.devices):
            for dv in prefs.devices:
                dv.use = dv.type == t
            device = "GPU"
            break
    except Exception:
        pass
scene.cycles.device = device
scene.cycles.samples = 256
scene.cycles.use_denoising = True
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "AgX - Base Contrast" if "AgX - Base Contrast" in [l.identifier for l in bpy.types.ColorManagedViewSettings.bl_rna.properties["look"].enum_items] else "None"
scene.render.resolution_x = 2048
scene.render.resolution_y = 1000
scene.render.film_transparent = False
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = OUT
print("RENDER DEVICE:", device)
bpy.ops.render.render(write_still=True)
print("WROTE", OUT)
