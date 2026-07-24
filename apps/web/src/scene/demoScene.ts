import * as THREE from 'three';
import {
  requestImmersiveSession,
  type ImmersiveSessionResult,
} from '../lib/deviceCapabilities';

export interface DemoSceneOptions {
  /** Accent colour for the demo avatar (hex string). */
  accentColor?: string;
  /** Optional clip identifier — selects the looping demo motion. */
  demoClip?: string;
}

/** Handle for controlling a running demo scene and releasing its GPU resources. */
export interface DemoSceneHandle {
  /** Stop the animation loop and release all WebGL/GPU resources. Idempotent. */
  dispose(): void;
  /** Whether the render loop is currently active. */
  readonly running: boolean;
  /**
   * Request an immersive WebXR session and, if granted, present this scene in
   * it. Resolves with the classified outcome; never rejects, so the caller can
   * keep the inline demo running when immersive entry fails or is unsupported.
   */
  enterVR(mode?: string): Promise<ImmersiveSessionResult>;
}

/** A rigged part of the demo avatar we animate. */
interface AvatarRig {
  root: THREE.Group;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  /** Hip group whose Y offset drives squat-style clips. */
  hips: THREE.Object3D;
}

/**
 * Build a lightweight, primitive-based humanoid avatar centred at the origin.
 *
 * It is deliberately not a loaded GLTF model: a procedural rig keeps the demo
 * dependency-free and lets us drive a looping exercise motion analytically.
 * Every geometry/material created here is registered via `track` so the scene
 * can release them on dispose.
 */
function buildAvatar(
  accent: THREE.Color,
  track: (obj: { dispose(): void }) => void,
): AvatarRig {
  const root = new THREE.Group();

  const skin = new THREE.MeshStandardMaterial({ color: '#f2c9a0', roughness: 0.8, metalness: 0.05 });
  const kit = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4, metalness: 0.25 });
  track(skin);
  track(kit);

  const meshOf = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    track(geometry);
    return new THREE.Mesh(geometry, material);
  };

  const hips = new THREE.Group();
  root.add(hips);

  const torso = meshOf(new THREE.CapsuleGeometry(0.32, 0.7, 6, 12), kit);
  torso.position.y = 0.75;
  hips.add(torso);

  const head = meshOf(new THREE.SphereGeometry(0.26, 24, 16), skin);
  head.position.y = 1.4;
  hips.add(head);

  const makeArm = (side: 1 | -1) => {
    // Shoulder pivot so the whole arm swings from the shoulder joint.
    const pivot = new THREE.Group();
    pivot.position.set(0.42 * side, 1.05, 0);
    const limb = meshOf(new THREE.CapsuleGeometry(0.11, 0.6, 6, 10), skin);
    limb.position.y = -0.35;
    pivot.add(limb);
    hips.add(pivot);
    return pivot;
  };
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  const makeLeg = (side: 1 | -1) => {
    const leg = meshOf(new THREE.CapsuleGeometry(0.13, 0.7, 6, 10), kit);
    leg.position.set(0.18 * side, 0, 0);
    hips.add(leg);
  };
  makeLeg(-1);
  makeLeg(1);

  root.position.y = -0.6;
  return { root, leftArm, rightArm, hips };
}

/**
 * Create a self-contained, autoplaying + looping 3D demo scene bound to `canvas`.
 *
 * The scene shows a procedural demo avatar performing a looping exercise motion
 * (selected by `demoClip`). It renders through `renderer.setAnimationLoop`, so
 * the same loop drives both the inline 2D-screen demo and an immersive WebXR
 * session started via {@link DemoSceneHandle.enterVR}. All GPU resources
 * (geometry, material, renderer, animation loop) are released by
 * {@link DemoSceneHandle.dispose}, which is safe to call multiple times.
 */
export function createDemoScene(
  canvas: HTMLCanvasElement,
  options: DemoSceneOptions = {},
): DemoSceneHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2));
  // Enable the XR path so an immersive session can present through this renderer.
  renderer.xr.enabled = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0.2, 3.6);

  const accent = new THREE.Color(options.accentColor ?? '#4f46e5');

  // Collect every geometry/material so dispose() can release them all.
  const disposables: Array<{ dispose(): void }> = [];
  const track = (obj: { dispose(): void }) => {
    disposables.push(obj);
  };

  const avatar = buildAvatar(accent, track);
  scene.add(avatar.root);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
  keyLight.position.set(3, 4, 5);
  scene.add(keyLight);
  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
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

  let disposed = false;
  const clock = new THREE.Clock();

  // `squat` bobs the hips; every other clip runs the arm-raise cycle.
  const clip = options.demoClip ?? 'arm-raise';

  const tick = () => {
    const t = clock.getElapsedTime();
    // Gentle idle turn so the avatar reads as 3D on a flat screen.
    avatar.root.rotation.y = Math.sin(t * 0.4) * 0.5;

    if (clip === 'squat') {
      avatar.hips.position.y = (Math.cos(t * 1.6) - 1) * 0.18; // 0 → -0.36 → 0
      avatar.leftArm.rotation.x = -1.2;
      avatar.rightArm.rotation.x = -1.2;
    } else {
      // Looping arm raise: 0 (down) → -π/2 (overhead) → 0.
      const raise = -(1 - Math.cos(t * 1.8)) * (Math.PI / 2);
      avatar.leftArm.rotation.x = raise;
      avatar.rightArm.rotation.x = raise;
      avatar.hips.position.y = 0;
    }

    renderer.render(scene, camera);
  };
  renderer.setAnimationLoop(tick);

  return {
    get running() {
      return !disposed;
    },
    async enterVR(mode = 'immersive-vr') {
      const result = await requestImmersiveSession(mode);
      if (result.status === 'started' && result.session) {
        try {
          // The session comes from the same navigator.xr the renderer uses, so
          // handing it to the XRManager is safe at runtime.
          await renderer.xr.setSession(
            result.session as Parameters<typeof renderer.xr.setSession>[0],
          );
        } catch {
          return { status: 'rejected' as const };
        }
      }
      return result;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      renderer.setAnimationLoop(null);
      globalThis.removeEventListener?.('resize', resize);
      scene.remove(avatar.root);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      // Release the backing WebGL context so the GPU frees memory immediately.
      renderer.forceContextLoss?.();
    },
  };
}
