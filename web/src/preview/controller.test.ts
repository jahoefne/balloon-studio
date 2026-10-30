import { AmbientLight, BufferAttribute, Color, Mesh, MeshBasicMaterial, PointLight, ShaderChunk, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { applyFraming, createOrbitControls, setOrthographicScale } from './controls';
import { createStageController, stageLabel, type StageProps } from './controller';
import { frame } from './framing';
import type { MeshBuffers } from '../core/types';
import { BACKGROUND, BLINN_CALL, BODY_MATERIAL, createStageScene, lightIntensity, sceneKitBlinn, toColor } from './scene';

const tetra = (scale = 1, faceColors?: Uint8Array): MeshBuffers => ({
  positions: new Float32Array([0, 0, 0, scale, 0, 0, 0, scale, 0, 0, 0, scale]),
  indices: new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]),
  ...(faceColors ? { faceColors } : {}),
  maxOverhang: 0,
  dimensions: { x: scale, y: scale, z: scale },
});

const props = (change: Partial<StageProps> = {}): StageProps => ({
  mesh: tetra(),
  geometryKey: 'a',
  color: [1, 0, 0],
  showPlate: true,
  wireframe: false,
  resetCamera: 0,
  cutaway: false,
  inspectOpening: false,
  neckDiameter: 32,
  ...change,
});

const setup = () => {
  const stage = createStageScene();
  const target = { requestRender: vi.fn(), applyFraming: vi.fn() };
  return { stage, target, controller: createStageController(stage, target) };
};

describe('createStageScene', () => {
  it('replaces the Blinn-Phong term that this Three.js calls', () => {
    expect(ShaderChunk.lights_phong_pars_fragment.split(BLINN_CALL)).toHaveLength(2);
    const shader = { fragmentShader: 'before\n#include <lights_phong_pars_fragment>\nafter' };
    sceneKitBlinn.call(null as never, shader as never, null as never);
    expect(shader.fragmentShader).toContain('BRDF_SceneKitBlinn( directLight.direction');
    expect(shader.fragmentShader).not.toContain(BLINN_CALL);
    expect(BODY_MATERIAL).toEqual({ specular: 0x474747, shininess: 48.64 });
  });


  it('has the Swift lights, converted to Three.js intensities', () => {
    const { scene } = createStageScene();
    const ambient = scene.children.find((child) => child instanceof AmbientLight) as AmbientLight;
    expect(ambient.intensity).toBeCloseTo(0.408, 3);
    const omnis = scene.children.filter((child): child is PointLight => child instanceof PointLight);
    expect(omnis.map((light) => Number(light.intensity.toFixed(3)))).toEqual([2.67, 0.565, 1.728, 0.503]);
    expect(omnis.map((light) => light.position.toArray())).toEqual([
      [-220, 380, 260],
      [240, 200, 80],
      [0, 280, -260],
      [0, -100, 60],
    ]);
    expect(omnis.every((light) => light.decay === 0 && light.distance === 0)).toBe(true);
    expect(lightIntensity(1000)).toBeCloseTo(Math.PI, 12);
  });

  it('has a 256 mm plate with 13 + 13 grid lines every 20 mm', () => {
    const { plate } = createStageScene();
    const grid = plate.children.filter((child) => child instanceof Mesh && child.material instanceof MeshBasicMaterial);
    expect(grid).toHaveLength(26);
    expect(grid.map((line) => line.position.x).filter((x) => x !== 0)).toHaveLength(12);
    expect(grid.some((line) => line.position.x === 120)).toBe(true);
    const bed = plate.children.find((child) => !grid.includes(child)) as Mesh;
    bed.geometry.computeBoundingBox();
    const size = bed.geometry.boundingBox!.getSize(new Vector3());
    expect(size.x).toBeCloseTo(256, 5);
    expect(size.y).toBeCloseTo(1.4, 5);
    expect(size.z).toBeCloseTo(256, 5);
    expect(bed.position.y).toBe(-0.9);
  });

  it('uses the near and far planes of the Mac camera and its background', () => {
    const { camera, scene } = createStageScene();
    expect([camera.near, camera.far]).toEqual([0.1, 4000]);
    expect((scene.background as Color).equals(toColor(BACKGROUND))).toBe(true);
  });
});

describe('createStageController', () => {
  it('builds and frames on the first update', () => {
    const { stage, target, controller } = setup();
    controller.update(props());
    expect(stage.body.geometry.getAttribute('position').count).toBe(12);
    expect(target.applyFraming).toHaveBeenCalledOnce();
    expect(target.requestRender).toHaveBeenCalledOnce();
  });

  it('does nothing when nothing changed', () => {
    const { target, controller } = setup();
    controller.update(props());
    target.requestRender.mockClear();
    target.applyFraming.mockClear();
    controller.update(props());
    expect(target.requestRender).not.toHaveBeenCalled();
    expect(target.applyFraming).not.toHaveBeenCalled();
  });

  it('a new mesh object with the same key changes nothing, like a Swift revision', () => {
    const { stage, target, controller } = setup();
    controller.update(props());
    const geometry = stage.body.geometry;
    target.requestRender.mockClear();
    controller.update(props({ mesh: tetra(9) }));
    expect(stage.body.geometry).toBe(geometry);
    expect(target.requestRender).not.toHaveBeenCalled();
  });

  it('a new key rewrites equal-sized attributes in place and keeps the camera', () => {
    const { stage, target, controller } = setup();
    controller.update(props());
    const geometry = stage.body.geometry;
    const position = geometry.getAttribute('position') as BufferAttribute;
    const version = position.version;
    target.applyFraming.mockClear();
    controller.update(props({ mesh: tetra(2), geometryKey: 'b' }));
    expect(stage.body.geometry).toBe(geometry);
    expect(geometry.getAttribute('position')).toBe(position);
    expect(position.version).toBeGreaterThan(version);
    expect(position.getX(1)).toBe(0); // triangle 0,2,1: corner 1 is vertex 2 at (0,2,0) → (0,0,−2)
    expect(position.getZ(1)).toBe(-2);
    expect(target.applyFraming).not.toHaveBeenCalled();
  });

  it('a new size gets a new geometry and disposes the old one', () => {
    const { stage, controller } = setup();
    controller.update(props());
    const geometry = stage.body.geometry;
    const disposed = vi.fn();
    geometry.addEventListener('dispose', disposed);
    const smaller: MeshBuffers = { ...tetra(), indices: new Uint32Array([0, 2, 1]) };
    controller.update(props({ mesh: smaller, geometryKey: 'b' }));
    expect(stage.body.geometry).not.toBe(geometry);
    expect(stage.body.geometry.getAttribute('position').count).toBe(3);
    expect(disposed).toHaveBeenCalledOnce();
  });

  it('cutaway rebuilds without a new key', () => {
    const { stage, controller } = setup();
    const moved: MeshBuffers = { ...tetra(), positions: new Float32Array([0, -2, 0, 1, -2, 0, 0, -1, 0, 0, -2, 1]) };
    controller.update(props({ mesh: moved }));
    expect(stage.body.visible).toBe(true);
    controller.update(props({ mesh: moved, cutaway: true }));
    expect(stage.body.visible).toBe(false);
    controller.update(props({ mesh: moved }));
    expect(stage.body.visible).toBe(true);
  });

  it('assigns four colors to the four groups, with the Swift defaults', () => {
    const { stage, controller } = setup();
    controller.update(props({ mesh: tetra(1, new Uint8Array([0, 1, 2, 3])), faceColors: [0, 1, 2, 3] }));
    expect(stage.body.geometry.groups.map((group) => group.materialIndex)).toEqual([0, 1, 2, 3]);
    expect(stage.materials[0].color.equals(toColor([1, 0, 0]))).toBe(true);
    expect(stage.materials[1].color.equals(toColor([1, 1, 1]))).toBe(true);
    expect(stage.materials[2].color.equals(toColor([0, 0, 0]))).toBe(true);
    expect(stage.materials[3].color.equals(toColor([0.5, 0.5, 0.5]))).toBe(true);
  });

  it('ignores mesh.faceColors unless passed as a prop, like Swift', () => {
    const { stage, controller } = setup();
    controller.update(props({ mesh: tetra(1, new Uint8Array([1, 1, 1, 1])) }));
    expect(stage.body.geometry.groups[0]!.count).toBe(12);
  });

  it('applies colors, wireframe and plate without touching the geometry', () => {
    const { stage, target, controller } = setup();
    controller.update(props());
    const geometry = stage.body.geometry;
    target.requestRender.mockClear();
    controller.update(props({ color: '#00ff00', wireframe: true, showPlate: false }));
    expect(stage.body.geometry).toBe(geometry);
    expect(stage.materials[0].color.equals(new Color('#00ff00'))).toBe(true);
    expect(stage.materials.every((material) => material.wireframe)).toBe(true);
    expect(stage.plate.visible).toBe(false);
    expect(target.requestRender).toHaveBeenCalledOnce();
  });

  it('frames from the current mesh when asked, and only then', () => {
    const { target, controller } = setup();
    controller.update(props());
    target.applyFraming.mockClear();
    controller.update(props({ mesh: tetra(300), geometryKey: 'b' }));
    expect(target.applyFraming).not.toHaveBeenCalled();
    controller.update(props({ mesh: tetra(300), geometryKey: 'b', resetCamera: 1 }));
    expect(target.applyFraming).toHaveBeenCalledOnce();
    expect(target.applyFraming.mock.calls[0]![0].orthographicScale).toBeCloseTo(216, 10); // 300*0.72
  });

  it('remembers a filled neck change only once it has framed for it', () => {
    const { target, controller } = setup();
    controller.update(props());
    controller.update(props({ filledNeck: true })); // not inspecting: no frame, Swift keeps its old value
    target.applyFraming.mockClear();
    controller.update(props({ filledNeck: true, inspectOpening: true }));
    expect(target.applyFraming).toHaveBeenCalledOnce();
    expect(target.applyFraming.mock.calls[0]![0].target).toEqual({ x: 0, y: 6, z: 0 });
  });

  it('waits for the first mesh, then frames it', () => {
    const { stage, target, controller } = setup();
    controller.update(props({ mesh: null }));
    expect(stage.body.visible).toBe(false);
    expect(target.applyFraming).not.toHaveBeenCalled();
    controller.update(props());
    expect(stage.body.visible).toBe(true);
    expect(target.applyFraming).toHaveBeenCalledOnce();
  });

  it('keeps the last mesh while the next is on its way', () => {
    const { stage, controller } = setup();
    controller.update(props());
    controller.update(props({ mesh: null, geometryKey: 'b' }));
    expect(stage.body.visible).toBe(true);
    expect(stage.body.geometry.getAttribute('position').count).toBe(12);
  });
});

describe('stageLabel', () => {
  it('names the part as the Mac app does', () => {
    expect(stageLabel({})).toBe('Interactive balloon preview. Drag to rotate, scroll to zoom.');
    expect(stageLabel({ compactObject: true })).toBe('Interactive basket preview. Drag to rotate, scroll to zoom.');
    expect(stageLabel({ compactObject: true, objectName: 'cloud lamp' })).toBe('Interactive cloud lamp preview. Drag to rotate, scroll to zoom.');
  });
});

describe('applyFraming', () => {
  const lookAlong = (camera: ReturnType<typeof createStageScene>['camera']) => new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const screenUp = (camera: ReturnType<typeof createStageScene>['camera']) => new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const input = { height: 100, neck: 32, opening: false, compact: true, width: 80, top: false, neckHeight: 12, filledNeck: false, topDown: false };

  it('half the visible height is the orthographic scale, whatever the aspect', () => {
    const { camera } = createStageScene();
    setOrthographicScale(camera, 145, 1.5);
    expect([camera.top, camera.bottom, camera.left, camera.right]).toEqual([145, -145, -217.5, 217.5]);
  });

  it('points the camera at the target and resets the zoom', () => {
    const { camera } = createStageScene();
    const controls = createOrbitControls(camera);
    camera.zoom = 3;
    const framing = frame(input);
    applyFraming(camera, controls, framing, 2);
    expect(camera.zoom).toBe(1);
    expect(camera.position.distanceTo(new Vector3(160, 196, 192))).toBeLessThan(1e-9);
    expect(controls.target.toArray()).toEqual([0, 48, 0]);
    const toTarget = controls.target.clone().sub(camera.position).normalize();
    expect(lookAlong(camera).distanceTo(toTarget)).toBeLessThan(1e-9);
    expect(camera.top).toBe(framing.orthographicScale);
    expect(camera.right).toBe(framing.orthographicScale * 2);
  });

  it('top down looks straight down with −z at the top of the screen, yet orbits around y', () => {
    const { camera } = createStageScene();
    const controls = createOrbitControls(camera);
    applyFraming(camera, controls, frame({ ...input, topDown: true }), 1);
    expect(lookAlong(camera).distanceTo(new Vector3(0, -1, 0))).toBeLessThan(1e-3);
    expect(screenUp(camera).distanceTo(new Vector3(0, 0, -1))).toBeLessThan(1e-3);
    expect(camera.up.toArray()).toEqual([0, 1, 0]);
  });

  it('drops the leftover inertia of a previous drag', () => {
    const { camera } = createStageScene();
    const controls = createOrbitControls(camera);
    applyFraming(camera, controls, frame(input), 1);
    const internals = controls as unknown as { _sphericalDelta: { theta: number } };
    internals._sphericalDelta.theta = 0.5;
    applyFraming(camera, controls, frame(input), 1);
    expect(internals._sphericalDelta.theta).toBe(0);
    expect(camera.position.distanceTo(new Vector3(160, 196, 192))).toBeLessThan(1e-9);
    controls.update();
    expect(camera.position.distanceTo(new Vector3(160, 196, 192))).toBeLessThan(1e-9);
  });
});
