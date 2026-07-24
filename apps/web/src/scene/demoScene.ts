import * as THREE from 'three';

export interface DemoSceneOptions {
  /** Accent colour for the demo mesh (hex string). */
  accentColor?: string;
  /** Optional clip identifier — reserved for driving named demo animations. */
  demoClip?: string;
}

/** Handle for controlling a running demo scene and releasing its GPU resources. */
export interface DemoSceneHandle {
  /** Stop the animation loop and release all WebGL/GPU resources. Idempotent. */
  dispose(): void;
  /** Whether the render loop is currently active. */
  readonly running: boolean;
}

/**
 * Create a self-contained, autoplaying + looping 3D demo scene bound to `canvas`.
 *
 * The demo has no player controls and no tracking — it simply loops. All GPU
 * resources (geometry, material, renderer, animation frame) are released by
 * {@link DemoSceneHandle.dispose}, which is safe to call multiple times.
 */
export function createDemoScene(
  canvas: HTMLCanvasElement,
  options: DemoSceneOptions = {},
): DemoSceneHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 4);

  const accent = new THREE.Color(options.accentColor ?? '#4f46e5');
  const geometry = new THREE.TorusKnotGeometry(0.8, 0.28, 128, 24);
  const material = new THREE.MeshStandardMaterial({
    color: accent,
    roughness: 0.35,
    metalness: 0.4,
  });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
  keyLight.position.set(3, 4, 5);
  scene.add(keyLight);
  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(ambient);

  const resize = () => {
    const width = canvas.clientWidth || 640;
    const height = canvas.clientHeight || 480;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  globalThis.addEventListener?.('resize', resize);

  let frameId = 0;
  let disposed = false;
  const clock = new THREE.Clock();

  const tick = () => {
    // Continuous, looping demo rotation — no user interaction required.
    const t = clock.getElapsedTime();
    mesh.rotation.x = t * 0.6;
    mesh.rotation.y = t * 0.9;
    renderer.render(scene, camera);
    frameId = globalThis.requestAnimationFrame(tick);
  };
  frameId = globalThis.requestAnimationFrame(tick);

  return {
    get running() {
      return !disposed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frameId) globalThis.cancelAnimationFrame(frameId);
      globalThis.removeEventListener?.('resize', resize);
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      // Release the backing WebGL context so the GPU frees memory immediately.
      renderer.forceContextLoss?.();
    },
  };
}
