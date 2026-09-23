"""Shared helpers for Maple Line asset build scripts (Blender 5.2, bpy).

Every build script starts from an empty scene, creates its asset from data, writes a
JSON report and exports one GLB. Run a script with:

    blender -b --factory-startup --python-exit-code 1 --python <build.py> -- --out <glb> --report <json>

or through the Blender MCP with execute_blender_code. Nothing here reads the current
selection or depends on user preferences, so two runs produce the same report.
"""

import argparse
import json
import math
import sys

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def parse_args(defaults):
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=defaults["out"])
    parser.add_argument("--report", default=defaults["report"])
    parser.add_argument("--render", default=None, help="Optional folder for review renders.")
    return parser.parse_args(argv)


def reset_scene():
    """Remove every object and orphan datablock so the build starts from nothing."""
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in (
        bpy.data.meshes,
        bpy.data.armatures,
        bpy.data.materials,
        bpy.data.actions,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.images,
    ):
        for block in list(collection):
            collection.remove(block)
    scene = bpy.context.scene
    scene.render.fps = 30
    scene.frame_start = 1
    return scene


def hex_color(value):
    value = value.lstrip("#")
    srgb = [int(value[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    # Colour attributes are linear; convert from sRGB so the game shows the intended tone.
    return tuple(
        (c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4) for c in srgb
    ) + (1.0,)


def vertex_color_material(name, roughness=0.82):
    """One material per asset: base colour comes from the colour attribute 'Col'."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    principled = nodes.get("Principled BSDF")
    principled.inputs["Roughness"].default_value = roughness
    attribute = nodes.new("ShaderNodeVertexColor")
    attribute.layer_name = "Col"
    material.node_tree.links.new(attribute.outputs["Color"], principled.inputs["Base Color"])
    return material


def mesh_from_bmesh(name, bm, face_colors, material):
    """Create a mesh object from a bmesh and a per-face colour list (linear RGBA)."""
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    colors = mesh.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    for polygon in mesh.polygons:
        color = face_colors[polygon.index]
        for loop_index in polygon.loop_indices:
            colors.data[loop_index].color = color
    mesh.color_attributes.active_color = colors
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def triangle_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def ambient_occlusion(obj, samples=24, distance=1.6, strength=0.55, extra=()):
    """Deterministic ray-cast AO baked into the 'Col' attribute (no Cycles, no noise)."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    trees = [BVHTree.FromObject(o, depsgraph) for o in (obj, *extra)]
    mesh = obj.data
    colors = mesh.color_attributes["Col"]
    golden = math.pi * (3 - math.sqrt(5))
    directions = []
    for i in range(samples):
        z = 1 - (i + 0.5) / samples
        r = math.sqrt(1 - z * z)
        directions.append(Vector((math.cos(golden * i) * r, math.sin(golden * i) * r, z)))
    occlusion = {}
    for vertex in mesh.vertices:
        normal = vertex.normal
        origin = vertex.co + normal * 0.01
        hits = 0
        for direction in directions:
            d = direction if direction.dot(normal) > 0 else -direction
            if any(tree.ray_cast(origin, d, distance)[0] is not None for tree in trees):
                hits += 1
        occlusion[vertex.index] = 1 - strength * hits / samples
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            shade = occlusion[mesh.loops[loop_index].vertex_index]
            c = colors.data[loop_index].color
            colors.data[loop_index].color = (c[0] * shade, c[1] * shade, c[2] * shade, 1.0)


def export_glb(path, objects, apply=True):
    """Export GLB. Pass apply=False for meshes with shape keys; applying drops them."""
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=apply,
        export_extras=True,
        export_animation_mode="ACTIONS",
        export_anim_single_armature=True,
        export_reset_pose_bones=True,
        export_force_sampling=True,
        export_frame_step=1,
        export_anim_slide_to_zero=True,
        export_optimize_animation_size=True,
        export_def_bones=True,
        export_influence_nb=4,
        export_morph=True,
        export_morph_normal=True,
        export_morph_animation=False,
        export_try_sparse_sk=True,
        export_meshopt_compression_enable=True,
        export_meshopt_extension="EXT_meshopt_compression",
        export_materials="EXPORT",
    )


def write_report(path, report):
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, sort_keys=True)
        handle.write("\n")


def render_views(folder, target, views, resolution=(640, 640)):
    """Workbench review renders from fixed cameras; returns the written paths."""
    import os

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "VERTEX"
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.film_transparent = False
    camera_data = bpy.data.cameras.new("review")
    camera = bpy.data.objects.new("review", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    paths = []
    for name, (eye, lens) in views.items():
        camera.location = Vector(eye)
        direction = Vector(target) - camera.location
        camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        camera_data.lens = lens
        scene.render.filepath = os.path.join(folder, f"{name}.png")
        # Re-evaluate animation and shape keys so the render never shows a stale pose.
        scene.frame_set(scene.frame_current)
        bpy.context.view_layer.update()
        bpy.ops.render.render(write_still=True)
        paths.append(scene.render.filepath)
    bpy.data.objects.remove(camera, do_unlink=True)
    return paths
