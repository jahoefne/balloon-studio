// The SceneKit scene of mac/Sources/BalloonStudio/BalloonPreview.swift:47-107 in Three.js.
// The scene graph needs no WebGL, so it is testable in Node; only `createRenderer` touches a canvas.

import {
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  OrthographicCamera,
  PointLight,
  Scene,
  ShaderChunk,
  SRGBColorSpace,
  WebGLRenderer,
  type Material,
} from 'three';
import { calibrated, type PreviewColor } from './colors';
import type { DisplayGeometry } from './displayGeometry';

export const toColor = (color: PreviewColor, into = new Color()): Color =>
  typeof color === 'string' ? into.set(color) : into.setRGB(color[0], color[1], color[2], SRGBColorSpace);

/** `SCNLight.intensity` 1000 is a factor of one; Three.js divides diffuse light by π. */
export const lightIntensity = (sceneKit: number): number => (Math.PI * sceneKit) / 1000;

/**
 * Specular white 0.28 and shininess 0.38 from :50-51. SceneKit's exponent is `shininess × 128`:
 * a sweep against SceneKit renders has its minimum at 48 (WP-U4 PR). Mutable for the demo's sweep.
 */
export const BODY_MATERIAL = { specular: 0x474747, shininess: 0.38 * 128 };

/** The term of `ShaderChunk.bsdfs` that `sceneKitBlinn` replaces; scene.test.ts notices a Three.js update changing it. */
export const BLINN_CALL = 'BRDF_BlinnPhong(';

/**
 * SceneKit's Blinn is `specular · (N·H)^shininess`. Three.js normalizes the lobe and adds
 * Fresnel, which puts white streaks on every back-lit slope. The π cancels `lightIntensity`.
 */
const SCENEKIT_BLINN = `
vec3 BRDF_SceneKitBlinn( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	return specularColor * pow( saturate( dot( normal, halfDir ) ), shininess ) * RECIPROCAL_PI;
}
`;

export const sceneKitBlinn: Material['onBeforeCompile'] = (shader) => {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <lights_phong_pars_fragment>',
    SCENEKIT_BLINN + ShaderChunk.lights_phong_pars_fragment.replace(BLINN_CALL, 'BRDF_SceneKitBlinn('),
  );
};

export const BACKGROUND = calibrated(0.075, 0.09, 0.12);

const BED_WIDTH = 256;
const BED_HEIGHT = 1.4;
const BED_Y = -0.9;
const GRID_LINE = { width: 0.28, height: 0.06, length: 248, y: -0.14, pitch: 20, reach: 6 };

export interface StageScene {
  scene: Scene;
  camera: OrthographicCamera;
  /** Body, detail, accent, hardware. */
  materials: [MeshPhongMaterial, MeshPhongMaterial, MeshPhongMaterial, MeshPhongMaterial];
  body: Mesh<BufferGeometry, Material[]>;
  plate: Group;
  setDisplayGeometry(display: DisplayGeometry): void;
  dispose(): void;
}

export function createStageScene(): StageScene {
  const scene = new Scene();
  scene.background = toColor(BACKGROUND);

  const materials = [0, 1, 2, 3].map(() => {
    const material = new MeshPhongMaterial(BODY_MATERIAL);
    material.onBeforeCompile = sceneKitBlinn;
    return material;
  }) as StageScene['materials'];
  let geometry = new BufferGeometry();
  const body = new Mesh<BufferGeometry, Material[]>(geometry, materials);
  // The attributes change in place, so a bounding sphere would go stale; the camera always frames the part.
  body.frustumCulled = false;
  body.visible = false;
  scene.add(body);

  const plate = new Group();
  const bedMaterial = new MeshLambertMaterial({ color: toColor(calibrated(0.12, 0.15, 0.19)) });
  // SCNBox's chamfer 3 is limited by the 1.4 mm height: from any Mac view the corners read as square.
  const bed = new Mesh(new BoxGeometry(BED_WIDTH, BED_HEIGHT, BED_WIDTH), bedMaterial);
  bed.position.y = BED_Y;
  plate.add(bed);
  const gridMaterial = new MeshBasicMaterial({ color: toColor([0.42, 0.42, 0.42]), transparent: true, opacity: 0.35 });
  const alongZ = new BoxGeometry(GRID_LINE.width, GRID_LINE.height, GRID_LINE.length);
  const alongX = new BoxGeometry(GRID_LINE.length, GRID_LINE.height, GRID_LINE.width);
  for (let i = -GRID_LINE.reach; i <= GRID_LINE.reach; i++) {
    const a = new Mesh(alongZ, gridMaterial);
    a.position.set(i * GRID_LINE.pitch, GRID_LINE.y, 0);
    plate.add(a);
    const b = new Mesh(alongX, gridMaterial);
    b.position.set(0, GRID_LINE.y, i * GRID_LINE.pitch);
    plate.add(b);
  }
  scene.add(plate);

  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
  scene.add(camera);

  scene.add(new AmbientLight(toColor(calibrated(0.73, 0.81, 1)), lightIntensity(130)));
  const omni = (x: number, y: number, z: number, intensity: number, color: PreviewColor) => {
    // SceneKit omni lights do not fall off unless given attenuation distances.
    const light = new PointLight(toColor(color), lightIntensity(intensity), 0, 0);
    light.position.set(x, y, z);
    scene.add(light);
  };
  omni(-220, 380, 260, 850, calibrated(1, 0.91, 0.78));
  omni(240, 200, 80, 180, [1, 1, 1]);
  omni(0, 280, -260, 550, calibrated(0.74, 0.84, 1));
  omni(0, -100, 60, 160, [1, 1, 1]);

  let current: DisplayGeometry | null = null;
  return {
    scene,
    camera,
    materials,
    body,
    plate,
    setDisplayGeometry(display) {
      const inPlace = current !== null && current.positions === display.positions && current.normals === display.normals;
      if (inPlace) {
        const position = geometry.getAttribute('position') as BufferAttribute;
        const normal = geometry.getAttribute('normal') as BufferAttribute;
        position.needsUpdate = true;
        normal.needsUpdate = true;
      } else {
        // Three.js cannot resize a GPU buffer: start over with a new geometry.
        geometry.dispose();
        geometry = new BufferGeometry();
        geometry.setAttribute('position', new BufferAttribute(display.positions, 3));
        geometry.setAttribute('normal', new BufferAttribute(display.normals, 3));
        body.geometry = geometry;
      }
      geometry.clearGroups();
      for (const group of display.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
      body.visible = display.positions.length > 0;
      current = display;
    },
    dispose() {
      geometry.dispose();
      for (const material of materials) material.dispose();
      bed.geometry.dispose();
      bedMaterial.dispose();
      alongZ.dispose();
      alongX.dispose();
      gridMaterial.dispose();
    },
  };
}

/** Throws when the browser has no WebGL; `Stage` shows its fallback text then. */
export function createRenderer(): WebGLRenderer {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  return renderer;
}
