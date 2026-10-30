// The SCNView half of BalloonPreview.swift: `allowsCameraControl` with an inertial turntable
// around world y (:185-187), `rendersContinuously = false` (:198). Three.js renders on demand.

import type { OrthographicCamera, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Framing } from './framing';
import type { StageScene } from './scene';

const DAMPING = 0.08;
/** Straight down is a singular view for a y-up orbit; this small a tilt decides which way is up. */
const SINGULAR_VIEW_TILT = 1e-4;

/** `SCNCamera.orthographicScale` is half the visible height; the aspect only widens the view. */
export function setOrthographicScale(camera: OrthographicCamera, scale: number, aspect: number): void {
  camera.top = scale;
  camera.bottom = -scale;
  camera.left = -scale * aspect;
  camera.right = scale * aspect;
  camera.updateProjectionMatrix();
}

/**
 * Moves camera and controls to a framing, dropping any inertia and zoom. The camera's own up
 * stays world y, since OrbitControls fixes its orbit axis from it (:185); a framing that looks
 * along its up, top-down, leans a hair the other way to get the same picture.
 */
export function applyFraming(camera: OrthographicCamera, controls: OrbitControls, framing: Framing, aspect: number): void {
  const damping = controls.enableDamping;
  controls.enableDamping = false;
  controls.update();
  controls.enableDamping = damping;

  camera.zoom = 1;
  setOrthographicScale(camera, framing.orthographicScale, aspect);
  const { position, target, up } = framing;
  camera.position.set(position.x, position.y, position.z);
  if (up.y === 0) {
    const distance = Math.hypot(position.x - target.x, position.y - target.y, position.z - target.z);
    camera.position.x -= up.x * distance * SINGULAR_VIEW_TILT;
    camera.position.z -= up.z * distance * SINGULAR_VIEW_TILT;
  }
  controls.target.set(target.x, target.y, target.z);
  controls.update();
}

export function createOrbitControls(camera: OrthographicCamera, element?: HTMLElement): OrbitControls {
  const controls = element ? new OrbitControls(camera, element) : new OrbitControls(camera);
  controls.enableDamping = true;
  controls.dampingFactor = DAMPING;
  return controls;
}

export interface StageView {
  requestRender(): void;
  applyFraming(framing: Framing): void;
  dispose(): void;
}

/** Puts the renderer's canvas into `host` and keeps it sized, orbiting and drawn. */
export function createStageView(host: HTMLElement, stage: StageScene, renderer: WebGLRenderer): StageView {
  const { scene, camera } = stage;
  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  host.appendChild(canvas);

  const controls = createOrbitControls(camera, canvas);
  let scale = 1;
  let aspect = 1;
  let frame = 0;

  const draw = () => {
    frame = 0;
    // While it damps, update() fires 'change', which asks for the next frame.
    controls.update();
    renderer.render(scene, camera);
  };
  const requestRender = () => {
    if (frame === 0) frame = requestAnimationFrame(draw);
  };
  controls.addEventListener('change', requestRender);
  canvas.addEventListener('webglcontextrestored', requestRender);

  const resize = () => {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width === 0 || height === 0) return;
    aspect = width / height;
    renderer.setSize(width, height, false);
    setOrthographicScale(camera, scale, aspect);
    // Resizing clears the drawing buffer, so draw now rather than flash the page color.
    renderer.render(scene, camera);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  return {
    requestRender,
    applyFraming(framing) {
      scale = framing.orthographicScale;
      applyFraming(camera, controls, framing, aspect);
      requestRender();
    },
    dispose() {
      if (frame !== 0) cancelAnimationFrame(frame);
      observer.disconnect();
      controls.removeEventListener('change', requestRender);
      canvas.removeEventListener('webglcontextrestored', requestRender);
      controls.dispose();
      renderer.dispose();
      // Stages come and go with the tabs; browsers cap the live contexts at about 16.
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
