import type { Draw, Geometry, Gpu, Surface } from "vgpu";
import { draw, frame, geometry, surface } from "vgpu";
import { perspectiveCamera, sphere } from "vgpu/scene";
import { loadHeroGlassAssets, type HeroGlassAssets } from "./hero-glass-assets";
import {
  createCameraControls,
  createHeroFractalScene,
  HERO_FLOOR_AO_DEFAULTS,
  modelMatrix,
  renderHeroFractalScene,
  resizeHeroFractalScene,
  setHeroFractalSceneSettings,
  type HeroFractalScene,
} from "./scene";
import heroDebugAxesWgsl from "./hero-debug-axes.wgsl";
import heroGlassEnvironmentDebugWgsl from "./hero-glass-environment-debug.wgsl";
import heroGlassWireframeWgsl from "./hero-glass-wireframe.wgsl";
import heroFractalWireframeWgsl from "./hero-fractal-wireframe.wgsl";
import {
  HERO_CUBE_MATERIAL,
  HERO_FRACTAL_CAMERA,
  HERO_FRACTAL_GLASS,
  HERO_FRACTAL_MATERIAL,
  HERO_ORB_MATERIAL,
  type HeroFractalMaterial,
} from "./settings";

const HERO_LIGHT_CLEAR = 250 / 255;
const ENVIRONMENT_SPHERE_MODEL = modelMatrix(1, [0, 0, 0]);
const GLASS_MODEL_MATRIX = modelMatrix(1, [0, 0, 0]);
const ENVIRONMENT_DEBUG_CAMERA_POSITION = [0, 0, 3] as const;
const WORLD_AXES_MODEL_MATRIX = modelMatrix(1.45, [0, 0, 0]);
const CAMERA_TARGET_AXES_SCALE = 0.22;
const SPHERE_MORPH_DURATION_MS = 1040;
const ORBIT_ZOOM_MIN = 0.42;
const ORBIT_ZOOM_MAX = 3.2;
const ORBIT_PITCH_LIMIT = 1.35;
const ORBIT_YAW_PER_PX = 0.0055;
const ORBIT_PITCH_PER_PX = 0.0042;
const ORBIT_WHEEL_ZOOM = 0.00135;
const ORBIT_PAN_PER_PX = 0.00155;
const ORBIT_PAN_LIMIT = 2.4;
const ORBIT_FOV_MIN = 12;
const ORBIT_FOV_MAX = 42;
const ORBIT_WHEEL_FOV = 0.0011;
const ORBIT_AUTO_YAW_PER_MS = 0.00028;
const ORBIT_LERP = 0.14;
const ORBIT_DOUBLE_TAP_MS = 320;
const SHAPE_ORDER = ["fractal", "orb", "cube"] as const;
const AUTO_MORPH_HOLD_MS = 2600;

const SHAPE_WEIGHTS = {
  fractal: [1, 0, 0],
  orb: [0, 1, 0],
  cube: [0, 0, 1],
} as const satisfies Record<
  (typeof SHAPE_ORDER)[number],
  readonly [number, number, number]
>;

type HeroShape = (typeof SHAPE_ORDER)[number];

function copyWeights(
  weights: readonly [number, number, number]
): [number, number, number] {
  return [weights[0], weights[1], weights[2]];
}

function weightsEqual(
  a: readonly [number, number, number],
  b: readonly [number, number, number]
): boolean {
  return (
    Math.abs(a[0] - b[0]) < 0.0001 &&
    Math.abs(a[1] - b[1]) < 0.0001 &&
    Math.abs(a[2] - b[2]) < 0.0001
  );
}

interface RendererOptions {
  readonly canvas: HTMLCanvasElement;
  readonly onShapeChange?: (shape: HeroShape) => void;
}

interface Renderer {
  readonly ready: Promise<void>;
  setShape(shape: HeroShape): void;
  setAutoMorph(enabled: boolean): void;
  resetView(): void;
  setAutoRotate(enabled: boolean): void;
  dispose(): void;
}

type DebugView = "final" | "environment" | "reflection";

interface HeroFractalDraws {
  readonly glassWireframe: Draw;
  readonly fractalWireframe: Draw;
  readonly environmentSphere: Draw;
  readonly worldAxes: Draw;
  readonly cameraTargetAxes: Draw;
}

interface MutableHeroFractalMaterial {
  baseColor: [number, number, number];
  roughness: number;
  diffuseStrength: number;
  specularStrength: number;
  ambientStrength: number;
}

function copyMaterial(
  material: Readonly<HeroFractalMaterial>
): MutableHeroFractalMaterial {
  return {
    baseColor: [...material.baseColor],
    roughness: material.roughness,
    diffuseStrength: material.diffuseStrength,
    specularStrength: material.specularStrength,
    ambientStrength: material.ambientStrength,
  };
}

/** Static, event-driven renderer owned exclusively by the Glass Fractal example. */
export function createRenderer(options: RendererOptions): Renderer {
  let disposed = false;
  let failureStarted = false;
  const abort = new AbortController();
  let gpu: Gpu | undefined;
  let canvasSurface: Surface | undefined;
  let draws: HeroFractalDraws | undefined;
  let coreScene: HeroFractalScene | undefined;
  let assets: HeroGlassAssets | undefined;
  let observer: ResizeObserver | undefined;
  let resizeFrame = 0;
  let materialFrame = 0;
  let cameraFrame = 0;
  let morphFrame = 0;
  let orbFrame = 0;
  let morphStartTime = 0;
  let morphStartWeights = copyWeights(HERO_FRACTAL_GLASS.shapeWeights);
  let morphTargetWeights = copyWeights(HERO_FRACTAL_GLASS.shapeWeights);
  let morphDirection = 1;
  let autoMorph = true;
  let autoMorphIndex = 0;
  let autoMorphTimer = 0;
  const orbEpoch = performance.now();
  let orbTime = 0;
  let isCanvasVisible = true;
  let visibilityObserver: IntersectionObserver | undefined;
  let lastDpr = typeof window === "undefined" ? 1 : window.devicePixelRatio;
  const fractalMaterial = copyMaterial(HERO_FRACTAL_MATERIAL);
  const orbMaterial = copyMaterial(HERO_ORB_MATERIAL);
  const cubeMaterial = copyMaterial(HERO_CUBE_MATERIAL);
  const floorAo = { ...HERO_FLOOR_AO_DEFAULTS };
  const glass = {
    ...HERO_FRACTAL_GLASS,
    absorption: [...HERO_FRACTAL_GLASS.absorption] as [number, number, number],
    environmentRotation: [...HERO_FRACTAL_GLASS.environmentRotation] as [
      number,
      number,
      number
    ],
    shapeWeights: copyWeights(HERO_FRACTAL_GLASS.shapeWeights),
  };
  const cameraControls = createCameraControls(HERO_FRACTAL_CAMERA);
  // Free orbit is applied by rewriting position; keep parallax path idle.
  cameraControls.maxMouseRotation = 0;
  const orbitHomeTarget = [...cameraControls.target] as [number, number, number];
  const orbitBaseOffset = [
    cameraControls.position[0] - orbitHomeTarget[0],
    cameraControls.position[1] - orbitHomeTarget[1],
    cameraControls.position[2] - orbitHomeTarget[2],
  ] as [number, number, number];
  const orbitBaseDistance = Math.max(
    0.001,
    Math.hypot(orbitBaseOffset[0], orbitBaseOffset[1], orbitBaseOffset[2])
  );
  const orbitUp = [...cameraControls.up] as [number, number, number];
  const orbitHomeFov = cameraControls.fov;
  let orbitYawTarget = 0;
  let orbitPitchTarget = 0;
  let orbitZoomTarget = 1;
  let orbitFovTarget = orbitHomeFov;
  let orbitPanTarget = [...orbitHomeTarget] as [number, number, number];
  let orbitYaw = 0;
  let orbitPitch = 0;
  let orbitZoom = 1;
  let orbitFov = orbitHomeFov;
  let orbitPan = [...orbitHomeTarget] as [number, number, number];
  let framingZoom = 1;
  let framingFov = orbitHomeFov;
  let framingPan = [...orbitHomeTarget] as [number, number, number];
  let autoRotate = false;
  let lastOrbitTick = performance.now();
  const activePointers = new Map<number, { x: number; y: number }>();
  let dragPointerId: number | null = null;
  let dragMode: "orbit" | "pan" = "orbit";
  let lastDragX = 0;
  let lastDragY = 0;
  let pinchLastDistance = 0;
  let pinchLastMid: { x: number; y: number } | null = null;
  let lastTapTime = 0;
  let dragMoved = false;
  const debugQuery = new URLSearchParams(window.location.search);
  const debug = {
    view: (debugQuery.get("debug") === "reflection"
      ? "reflection"
      : "final") as DebugView,
    wireframe: false,
    floorGrid: false,
    coloredAxes: false,
    cameraTarget: false,
  };

  const getOrbitOffset = (
    yaw: number,
    pitch: number,
    zoom: number
  ): [number, number, number] => {
    const scaledOffset: [number, number, number] = [
      orbitBaseOffset[0] * zoom,
      orbitBaseOffset[1] * zoom,
      orbitBaseOffset[2] * zoom,
    ];
    const upAxis = normalizeOrbit(orbitUp, [0, 1, 0]);
    const yawed = rotateAroundAxisOrbit(scaledOffset, upAxis, -yaw);
    const rightAxis = normalizeOrbit(
      crossOrbit([-yawed[0], -yawed[1], -yawed[2]], upAxis),
      [0, 0, 1]
    );
    return rotateAroundAxisOrbit(yawed, rightAxis, pitch);
  };

  const getOrbitBasis = () => {
    const offset = getOrbitOffset(orbitYaw, orbitPitch, orbitZoom);
    const forward = normalizeOrbit(
      [-offset[0], -offset[1], -offset[2]],
      [0, 0, -1]
    );
    const right = normalizeOrbit(crossOrbit(forward, orbitUp), [1, 0, 0]);
    const up = normalizeOrbit(crossOrbit(right, forward), [0, 1, 0]);
    return {
      right,
      up,
      distance: Math.max(0.001, orbitBaseDistance * orbitZoom),
    };
  };

  const clampPanTarget = (
    target: readonly [number, number, number]
  ): [number, number, number] => {
    const offset: [number, number, number] = [
      target[0] - orbitHomeTarget[0],
      target[1] - orbitHomeTarget[1],
      target[2] - orbitHomeTarget[2],
    ];
    const length = Math.hypot(offset[0], offset[1], offset[2]);
    if (length <= ORBIT_PAN_LIMIT) return [...target];
    const scale = ORBIT_PAN_LIMIT / length;
    return [
      orbitHomeTarget[0] + offset[0] * scale,
      orbitHomeTarget[1] + offset[1] * scale,
      orbitHomeTarget[2] + offset[2] * scale,
    ];
  };

  const applyOrbitPosition = () => {
    const pitched = getOrbitOffset(orbitYaw, orbitPitch, orbitZoom);
    cameraControls.target[0] = orbitPan[0];
    cameraControls.target[1] = orbitPan[1];
    cameraControls.target[2] = orbitPan[2];
    cameraControls.position[0] = orbitPan[0] + pitched[0];
    cameraControls.position[1] = orbitPan[1] + pitched[1];
    cameraControls.position[2] = orbitPan[2] + pitched[2];
    cameraControls.fov = orbitFov;
  };

  const panByScreenDelta = (dx: number, dy: number) => {
    const { right, up, distance } = getOrbitBasis();
    const scale = distance * ORBIT_PAN_PER_PX;
    orbitPanTarget = clampPanTarget([
      orbitPanTarget[0] - right[0] * dx * scale + up[0] * dy * scale,
      orbitPanTarget[1] - right[1] * dx * scale + up[1] * dy * scale,
      orbitPanTarget[2] - right[2] * dx * scale + up[2] * dy * scale,
    ]);
  };
  const drawHero = () => {
    if (disposed || !gpu || !canvasSurface || !draws || !coreScene || !assets)
      return;

    const state = setHeroFractalSceneSettings(
      coreScene,
      assets,
      canvasSurface.size,
      {
        camera: HERO_FRACTAL_CAMERA,
        fractalMaterial,
        orbMaterial,
        cubeMaterial,
        glass,
        time: orbTime,
        view: {
          ...cameraControls,
          pointer: [0, 0],
        },
        floorAo,
        floorGrid: debug.floorGrid,
        morphDirection,
        reflectionDebug: debug.view === "reflection",
      }
    );
    const environmentCamera = perspectiveCamera({
      fov: 45,
      aspect: canvasSurface.size[0] / Math.max(canvasSurface.size[1], 1),
      near: 0.05,
      far: 10,
      position: ENVIRONMENT_DEBUG_CAMERA_POSITION,
      target: [0, 0, 0],
    });
    draws.glassWireframe.set({
      params: {
        viewProjection: state.viewProjection,
        model: GLASS_MODEL_MATRIX,
        meshMin: assets.meshMin,
        meshMax: assets.meshMax,
      },
    });
    draws.fractalWireframe.set({
      params: {
        viewProjection: state.viewProjection,
        model: state.fractalModel,
        meshMin: assets.fractalMeshMin,
        meshMax: assets.fractalMeshMax,
        shapeWeights: state.shapeWeights,
        morphDirection,
        time: state.time,
      },
    });
    draws.environmentSphere.set({
      params: {
        viewProjection: environmentCamera.viewProjectionMatrix,
        model: ENVIRONMENT_SPHERE_MODEL,
        cameraPosition: ENVIRONMENT_DEBUG_CAMERA_POSITION,
        environmentRotation: state.environmentRotation,
        environmentExposure: glass.environmentExposure,
      },
      environmentTexture: assets.environmentView,
      environmentSampler: coreScene.environmentSampler,
    });
    const debugAxesParams = {
      viewProjection: state.viewProjection,
      resolution: canvasSurface.size,
      lineWidth: 2.5,
      opacity: 0.94,
    };
    draws.worldAxes.set({
      params: {
        ...debugAxesParams,
        model: WORLD_AXES_MODEL_MATRIX,
      },
    });
    draws.cameraTargetAxes.set({
      params: {
        ...debugAxesParams,
        model: modelMatrix(CAMERA_TARGET_AXES_SCALE, cameraControls.target),
        lineWidth: 3.5,
      },
    });

    const currentGpu = gpu;
    const currentSurface = canvasSurface;
    const currentDraws = draws;
    if (debug.view === "environment") {
      frame(currentGpu, (currentFrame) => {
        currentFrame.pass(
          {
            target: currentSurface,
            clear: [HERO_LIGHT_CLEAR, HERO_LIGHT_CLEAR, HERO_LIGHT_CLEAR, 1],
          },
          (pass) => pass.draw(currentDraws.environmentSphere)
        );
      });
      return;
    }
    const finalDebugDraws: Draw[] = [];
    if (debug.wireframe) {
      finalDebugDraws.push(
        currentDraws.glassWireframe,
        currentDraws.fractalWireframe
      );
    }
    if (debug.coloredAxes) finalDebugDraws.push(currentDraws.worldAxes);
    if (debug.cameraTarget) finalDebugDraws.push(currentDraws.cameraTargetAxes);
    renderHeroFractalScene(
      currentGpu,
      currentSurface,
      coreScene,
      finalDebugDraws
    );
  };

  const renderHero = () => {
    try {
      drawHero();
    } catch (error) {
      fail(error);
    }
  };

  const requestMaterialDraw = () => {
    if (materialFrame) return;
    materialFrame = requestAnimationFrame(() => {
      materialFrame = 0;
      renderHero();
    });
  };

  const clearAutoMorphTimer = () => {
    if (!autoMorphTimer) return;
    window.clearTimeout(autoMorphTimer);
    autoMorphTimer = 0;
  };

  const prefersReducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const notifyShapeChange = (shape: HeroShape) => {
    options.onShapeChange?.(shape);
  };

  const scheduleAutoMorph = () => {
    clearAutoMorphTimer();
    if (!autoMorph || disposed || prefersReducedMotion()) return;
    autoMorphTimer = window.setTimeout(() => {
      autoMorphTimer = 0;
      if (!autoMorph || disposed) return;
      autoMorphIndex = (autoMorphIndex + 1) % SHAPE_ORDER.length;
      setShape(SHAPE_ORDER[autoMorphIndex]!);
    }, AUTO_MORPH_HOLD_MS);
  };

  const stopOrbAnimation = () => {
    if (orbFrame) cancelAnimationFrame(orbFrame);
    orbFrame = 0;
  };

  const animateOrb = (time: number) => {
    orbFrame = 0;
    if (
      disposed ||
      morphFrame ||
      (morphTargetWeights[1] <= 0 && morphTargetWeights[2] <= 0) ||
      !isCanvasVisible ||
      document.hidden
    )
      return;
    orbTime = (time - orbEpoch) * 0.001;
    renderHero();
    orbFrame = requestAnimationFrame(animateOrb);
  };

  const requestOrbAnimation = () => {
    if (
      !orbFrame &&
      !morphFrame &&
      (morphTargetWeights[1] > 0 || morphTargetWeights[2] > 0) &&
      isCanvasVisible &&
      !document.hidden
    ) {
      orbFrame = requestAnimationFrame(animateOrb);
    }
  };

  const finishMorph = () => {
    glass.shapeWeights = copyWeights(morphTargetWeights);
    requestOrbAnimation();
    if (autoMorph) scheduleAutoMorph();
  };

  const animateSphereMorph = (time: number) => {
    morphFrame = 0;
    if (disposed) return;
    const progress = Math.min(
      1,
      Math.max(0, (time - morphStartTime) / SPHERE_MORPH_DURATION_MS)
    );
    const easedProgress = 1 - (1 - progress) ** 4;
    glass.shapeWeights = [
      morphStartWeights[0] +
        (morphTargetWeights[0] - morphStartWeights[0]) * easedProgress,
      morphStartWeights[1] +
        (morphTargetWeights[1] - morphStartWeights[1]) * easedProgress,
      morphStartWeights[2] +
        (morphTargetWeights[2] - morphStartWeights[2]) * easedProgress,
    ];
    if (glass.shapeWeights[1] > 0 || glass.shapeWeights[2] > 0) {
      orbTime = (time - orbEpoch) * 0.001;
    }
    renderHero();
    if (progress < 1) {
      morphFrame = requestAnimationFrame(animateSphereMorph);
    } else {
      finishMorph();
    }
  };

  const setShape = (shape: HeroShape) => {
    const nextWeights = copyWeights(SHAPE_WEIGHTS[shape]);
    autoMorphIndex = Math.max(0, SHAPE_ORDER.indexOf(shape));
    notifyShapeChange(shape);
    clearAutoMorphTimer();
    if (weightsEqual(nextWeights, morphTargetWeights) && !morphFrame) {
      if (autoMorph) scheduleAutoMorph();
      return;
    }
    if (morphFrame) cancelAnimationFrame(morphFrame);
    morphFrame = 0;
    stopOrbAnimation();
    const leavingFractal = nextWeights[0] < glass.shapeWeights[0] - 0.0001;
    morphDirection = leavingFractal ? 1 : -1;
    if (Math.abs(nextWeights[0] - glass.shapeWeights[0]) < 0.0001) {
      morphDirection = 1;
    }
    morphStartWeights = copyWeights(glass.shapeWeights);
    morphTargetWeights = nextWeights;

    if (prefersReducedMotion()) {
      glass.shapeWeights = copyWeights(nextWeights);
      requestMaterialDraw();
      requestOrbAnimation();
      if (autoMorph) scheduleAutoMorph();
      return;
    }

    morphStartTime = performance.now();
    morphFrame = requestAnimationFrame(animateSphereMorph);
  };

  const setAutoMorph = (enabled: boolean) => {
    autoMorph = enabled;
    clearAutoMorphTimer();
    if (!autoMorph || disposed) return;
    if (morphFrame) return;
    scheduleAutoMorph();
  };

  const animateCamera = () => {
    cameraFrame = 0;
    if (disposed) return;
    const now = performance.now();
    const dt = Math.min(48, Math.max(0, now - lastOrbitTick));
    lastOrbitTick = now;
    if (autoRotate) orbitYawTarget += dt * ORBIT_AUTO_YAW_PER_MS;

    const lerp = ORBIT_LERP;
    orbitYaw += (orbitYawTarget - orbitYaw) * lerp;
    orbitPitch += (orbitPitchTarget - orbitPitch) * lerp;
    orbitZoom += (orbitZoomTarget - orbitZoom) * lerp;
    orbitFov += (orbitFovTarget - orbitFov) * lerp;
    orbitPan[0] += (orbitPanTarget[0] - orbitPan[0]) * lerp;
    orbitPan[1] += (orbitPanTarget[1] - orbitPan[1]) * lerp;
    orbitPan[2] += (orbitPanTarget[2] - orbitPan[2]) * lerp;

    if (Math.abs(orbitYawTarget - orbitYaw) < 0.00005) orbitYaw = orbitYawTarget;
    if (Math.abs(orbitPitchTarget - orbitPitch) < 0.00005)
      orbitPitch = orbitPitchTarget;
    if (Math.abs(orbitZoomTarget - orbitZoom) < 0.00005)
      orbitZoom = orbitZoomTarget;
    if (Math.abs(orbitFovTarget - orbitFov) < 0.00005) orbitFov = orbitFovTarget;
    if (Math.abs(orbitPanTarget[0] - orbitPan[0]) < 0.00005)
      orbitPan[0] = orbitPanTarget[0];
    if (Math.abs(orbitPanTarget[1] - orbitPan[1]) < 0.00005)
      orbitPan[1] = orbitPanTarget[1];
    if (Math.abs(orbitPanTarget[2] - orbitPan[2]) < 0.00005)
      orbitPan[2] = orbitPanTarget[2];

    applyOrbitPosition();
    if (!morphFrame && !orbFrame) renderHero();

    const settling =
      Math.abs(orbitYawTarget - orbitYaw) >= 0.00005 ||
      Math.abs(orbitPitchTarget - orbitPitch) >= 0.00005 ||
      Math.abs(orbitZoomTarget - orbitZoom) >= 0.00005 ||
      Math.abs(orbitFovTarget - orbitFov) >= 0.00005 ||
      Math.abs(orbitPanTarget[0] - orbitPan[0]) >= 0.00005 ||
      Math.abs(orbitPanTarget[1] - orbitPan[1]) >= 0.00005 ||
      Math.abs(orbitPanTarget[2] - orbitPan[2]) >= 0.00005;

    if (autoRotate || settling) {
      cameraFrame = requestAnimationFrame(animateCamera);
    }
  };

  const requestCameraDraw = () => {
    lastOrbitTick = performance.now();
    if (!cameraFrame) cameraFrame = requestAnimationFrame(animateCamera);
  };

  const clampOrbitPitch = (value: number) =>
    Math.min(ORBIT_PITCH_LIMIT, Math.max(-ORBIT_PITCH_LIMIT, value));

  const clampOrbitZoom = (value: number) =>
    Math.min(ORBIT_ZOOM_MAX, Math.max(ORBIT_ZOOM_MIN, value));

  const clampOrbitFov = (value: number) =>
    Math.min(ORBIT_FOV_MAX, Math.max(ORBIT_FOV_MIN, value));

  const isPortraitFrame = () => {
    const rect = options.canvas.getBoundingClientRect();
    return rect.height > rect.width * 1.12 || window.innerWidth <= 768;
  };

  const updateFramingHome = () => {
    const portrait = isPortraitFrame();
    framingZoom = portrait ? 1.18 : 1;
    framingFov = portrait ? Math.min(orbitHomeFov + 4, ORBIT_FOV_MAX) : orbitHomeFov;
    framingPan = portrait
      ? [
          orbitHomeTarget[0],
          orbitHomeTarget[1] + 0.04,
          orbitHomeTarget[2],
        ]
      : [...orbitHomeTarget];
  };

  const isAtFramingHome = () =>
    Math.abs(orbitYawTarget) < 0.0001 &&
    Math.abs(orbitPitchTarget) < 0.0001 &&
    Math.abs(orbitZoomTarget - framingZoom) < 0.02 &&
    Math.abs(orbitFovTarget - framingFov) < 0.05 &&
    Math.abs(orbitPanTarget[0] - framingPan[0]) < 0.02 &&
    Math.abs(orbitPanTarget[1] - framingPan[1]) < 0.02 &&
    Math.abs(orbitPanTarget[2] - framingPan[2]) < 0.02;

  const resetView = () => {
    updateFramingHome();
    orbitYawTarget = 0;
    orbitPitchTarget = 0;
    orbitZoomTarget = framingZoom;
    orbitFovTarget = framingFov;
    orbitPanTarget = [...framingPan];
    requestCameraDraw();
  };

  const setAutoRotate = (enabled: boolean) => {
    autoRotate = enabled;
    if (autoRotate) requestCameraDraw();
  };

  const pointerDistance = (
    a: { x: number; y: number },
    b: { x: number; y: number }
  ) => Math.hypot(a.x - b.x, a.y - b.y);

  const pointerMidpoint = (
    a: { x: number; y: number },
    b: { x: number; y: number }
  ) => ({ x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 });

  const syncTwoFingerTransform = () => {
    if (activePointers.size !== 2) return;
    const [first, second] = [...activePointers.values()];
    if (!first || !second) return;
    const distance = pointerDistance(first, second);
    const mid = pointerMidpoint(first, second);
    if (pinchLastDistance > 0 && pinchLastMid) {
      const zoomFactor = distance / pinchLastDistance;
      if (Number.isFinite(zoomFactor) && zoomFactor > 0) {
        orbitZoomTarget = clampOrbitZoom(orbitZoomTarget * zoomFactor);
      }
      panByScreenDelta(mid.x - pinchLastMid.x, mid.y - pinchLastMid.y);
      requestCameraDraw();
    }
    pinchLastDistance = distance;
    pinchLastMid = mid;
  };

  const onPointerDown = (event: PointerEvent) => {
    options.canvas.setPointerCapture(event.pointerId);
    activePointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    dragMoved = false;
    if (activePointers.size === 1) {
      dragPointerId = event.pointerId;
      lastDragX = event.clientX;
      lastDragY = event.clientY;
      dragMode =
        event.shiftKey || event.altKey || event.button === 1 || event.button === 2
          ? "pan"
          : "orbit";
      options.canvas.style.cursor = dragMode === "pan" ? "move" : "grabbing";
      return;
    }
    dragPointerId = null;
    if (activePointers.size === 2) {
      const [first, second] = [...activePointers.values()];
      if (!first || !second) return;
      pinchLastDistance = pointerDistance(first, second);
      pinchLastMid = pointerMidpoint(first, second);
      options.canvas.style.cursor = "move";
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!activePointers.has(event.pointerId)) return;
    activePointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (activePointers.size === 2) {
      syncTwoFingerTransform();
      dragMoved = true;
      return;
    }
    if (dragPointerId !== event.pointerId) return;
    const dx = event.clientX - lastDragX;
    const dy = event.clientY - lastDragY;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) dragMoved = true;
    lastDragX = event.clientX;
    lastDragY = event.clientY;
    const mode =
      event.shiftKey || event.altKey || (event.buttons & 4) !== 0
        ? "pan"
        : dragMode;
    if (mode === "pan") {
      panByScreenDelta(dx, dy);
    } else {
      orbitYawTarget += dx * ORBIT_YAW_PER_PX;
      orbitPitchTarget = clampOrbitPitch(
        orbitPitchTarget + dy * ORBIT_PITCH_PER_PX
      );
    }
    requestCameraDraw();
  };

  const onPointerUp = (event: PointerEvent) => {
    const wasSingle =
      activePointers.size === 1 && activePointers.has(event.pointerId);
    if (activePointers.has(event.pointerId)) {
      activePointers.delete(event.pointerId);
      try {
        options.canvas.releasePointerCapture(event.pointerId);
      } catch {
        // Capture may already be released by the browser.
      }
    }
    if (
      wasSingle &&
      !dragMoved &&
      event.pointerType !== "mouse"
    ) {
      const now = performance.now();
      if (now - lastTapTime < ORBIT_DOUBLE_TAP_MS) {
        resetView();
        lastTapTime = 0;
      } else {
        lastTapTime = now;
      }
    }
    if (activePointers.size === 1) {
      const [remainingId, remaining] = [...activePointers.entries()][0]!;
      dragPointerId = remainingId;
      lastDragX = remaining.x;
      lastDragY = remaining.y;
      dragMode = "orbit";
      pinchLastDistance = 0;
      pinchLastMid = null;
      options.canvas.style.cursor = "grabbing";
      return;
    }
    if (activePointers.size === 0) {
      dragPointerId = null;
      pinchLastDistance = 0;
      pinchLastMid = null;
      options.canvas.style.cursor = "grab";
      return;
    }
    if (activePointers.size === 2) {
      dragPointerId = null;
      const [first, second] = [...activePointers.values()];
      if (!first || !second) return;
      pinchLastDistance = pointerDistance(first, second);
      pinchLastMid = pointerMidpoint(first, second);
    }
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    if (event.altKey) {
      const factor = Math.exp(event.deltaY * ORBIT_WHEEL_FOV);
      orbitFovTarget = clampOrbitFov(orbitFovTarget * factor);
    } else {
      const factor = Math.exp(-event.deltaY * ORBIT_WHEEL_ZOOM);
      orbitZoomTarget = clampOrbitZoom(orbitZoomTarget * factor);
    }
    requestCameraDraw();
  };

  const onDoubleClick = (event: MouseEvent) => {
    event.preventDefault();
    resetView();
  };

  const onContextMenu = (event: Event) => {
    event.preventDefault();
  };

  const onDocumentVisibilityChange = () => {
    if (document.hidden) stopOrbAnimation();
    else requestOrbAnimation();
  };

  const resizeAndDraw = () => {
    resizeFrame = 0;
    if (disposed || !canvasSurface) return;
    try {
      const rect = options.canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      canvasSurface.resize([
        Math.max(1, Math.round(rect.width * dpr)),
        Math.max(1, Math.round(rect.height * dpr)),
      ]);
      if (coreScene) resizeHeroFractalScene(coreScene, canvasSurface.size);
      const wasHome = isAtFramingHome();
      updateFramingHome();
      if (wasHome) {
        orbitZoomTarget = framingZoom;
        orbitZoom = framingZoom;
        orbitFovTarget = framingFov;
        orbitFov = framingFov;
        orbitPanTarget = [...framingPan];
        orbitPan = [...framingPan];
        applyOrbitPosition();
      }
      drawHero();
    } catch (error) {
      fail(error);
    }
  };

  const requestResize = () => {
    if (!resizeFrame) resizeFrame = requestAnimationFrame(resizeAndDraw);
  };

  const onWindowResize = () => {
    if (window.devicePixelRatio === lastDpr) return;
    lastDpr = window.devicePixelRatio;
    requestResize();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    if (materialFrame) cancelAnimationFrame(materialFrame);
    if (cameraFrame) cancelAnimationFrame(cameraFrame);
    if (morphFrame) cancelAnimationFrame(morphFrame);
    if (orbFrame) cancelAnimationFrame(orbFrame);
    clearAutoMorphTimer();
    abort.abort();
    observer?.disconnect();
    visibilityObserver?.disconnect();
    window.removeEventListener("resize", onWindowResize);
    options.canvas.removeEventListener("pointerdown", onPointerDown);
    options.canvas.removeEventListener("pointermove", onPointerMove);
    options.canvas.removeEventListener("pointerup", onPointerUp);
    options.canvas.removeEventListener("pointercancel", onPointerUp);
    options.canvas.removeEventListener("wheel", onWheel);
    options.canvas.removeEventListener("dblclick", onDoubleClick);
    options.canvas.removeEventListener("contextmenu", onContextMenu);
    document.removeEventListener(
      "visibilitychange",
      onDocumentVisibilityChange
    );
    gpu?.dispose();
  };

  const fail = (error: unknown): never => {
    failureStarted = true;
    try {
      dispose();
    } catch {
      // A cleanup failure must not hide the rendering failure.
    }
    throw error;
  };

  const initialize = async () => {
    const { init } = await import("vgpu");
    if (disposed) return;
    const nextGpu = await init();
    if (disposed) {
      nextGpu.dispose();
      return;
    }
    gpu = nextGpu;
    canvasSurface = surface(gpu, options.canvas, { dpr: [1, 2] });
    const loadedAssets = await loadHeroGlassAssets(gpu, abort.signal);
    if (disposed) return;
    assets = loadedAssets;
    const environmentSphereGeometry = geometry(
      gpu,
      sphere({
        radius: 0.82,
        widthSegments: 48,
        heightSegments: 24,
      })
    );
    const debugAxesGeometry = createDebugAxesGeometry(gpu);
    const loadedScene = await createHeroFractalScene(
      gpu,
      canvasSurface,
      assets,
      "homepage-light"
    );
    if (disposed) return;
    coreScene = loadedScene;
    draws = {
      glassWireframe: draw(gpu, {
        shader: heroGlassWireframeWgsl,
        geometry: assets.wireframeGeometry,
        cull: "none",
        depth: false,
        blend: "premultiplied",
        label: "homepage-light-glass-wireframe",
      }),
      fractalWireframe: draw(gpu, {
        shader: heroFractalWireframeWgsl,
        geometry: assets.fractalWireframeGeometry,
        instances: 4,
        cull: "none",
        depth: false,
        blend: "premultiplied",
        label: "homepage-light-fractal-mesh-wireframe",
      }),
      environmentSphere: draw(gpu, {
        shader: heroGlassEnvironmentDebugWgsl,
        geometry: environmentSphereGeometry,
        cull: "back",
        depth: false,
        label: "homepage-light-glass-environment-debug",
      }),
      worldAxes: draw(gpu, {
        shader: heroDebugAxesWgsl,
        geometry: debugAxesGeometry,
        cull: "none",
        depth: false,
        blend: "premultiplied",
        label: "homepage-light-world-axes-debug",
      }),
      cameraTargetAxes: draw(gpu, {
        shader: heroDebugAxesWgsl,
        geometry: debugAxesGeometry,
        cull: "none",
        depth: false,
        blend: "premultiplied",
        label: "homepage-light-camera-target-axes-debug",
      }),
    };
    await Promise.all([
      draws.glassWireframe.compile({ colors: [canvasSurface.format] }),
      draws.fractalWireframe.compile({ colors: [canvasSurface.format] }),
      draws.environmentSphere.compile({ colors: [canvasSurface.format] }),
      draws.worldAxes.compile({ colors: [canvasSurface.format] }),
      draws.cameraTargetAxes.compile({ colors: [canvasSurface.format] }),
    ]);
    if (disposed) return;
    observer = new ResizeObserver(requestResize);
    observer.observe(options.canvas);
    visibilityObserver = new IntersectionObserver(([entry]) => {
      isCanvasVisible = entry?.isIntersecting ?? false;
      if (isCanvasVisible) {
        requestOrbAnimation();
        if (autoMorph && !morphFrame) scheduleAutoMorph();
      } else {
        stopOrbAnimation();
        clearAutoMorphTimer();
      }
    });
    visibilityObserver.observe(options.canvas);
    window.addEventListener("resize", onWindowResize);
    options.canvas.style.cursor = "grab";
    options.canvas.addEventListener("pointerdown", onPointerDown);
    options.canvas.addEventListener("pointermove", onPointerMove);
    options.canvas.addEventListener("pointerup", onPointerUp);
    options.canvas.addEventListener("pointercancel", onPointerUp);
    options.canvas.addEventListener("wheel", onWheel, { passive: false });
    options.canvas.addEventListener("dblclick", onDoubleClick);
    options.canvas.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("visibilitychange", onDocumentVisibilityChange);
    applyOrbitPosition();
    updateFramingHome();
    orbitZoomTarget = framingZoom;
    orbitZoom = framingZoom;
    orbitFovTarget = framingFov;
    orbitFov = framingFov;
    orbitPanTarget = [...framingPan];
    orbitPan = [...framingPan];
    applyOrbitPosition();
    resizeAndDraw();
    requestOrbAnimation();
    if (autoMorph) scheduleAutoMorph();
  };

  const ready = initialize().catch((error: unknown) => {
    if (failureStarted) throw error;
    if (disposed) return;
    fail(error);
  });

  return { ready, setShape, setAutoMorph, resetView, setAutoRotate, dispose };
}

function createDebugAxesGeometry(gpu: Gpu): Geometry {
  const vertices: number[] = [];
  const corners = [
    [0, -1],
    [0, 1],
    [1, 1],
    [0, -1],
    [1, 1],
    [1, -1],
  ] as const;
  const axes = [
    { end: [1, 0, 0], color: [1, 0.08, 0.05] },
    { end: [0, 1, 0], color: [0.1, 0.78, 0.18] },
    { end: [0, 0, 1], color: [0.05, 0.36, 1] },
  ] as const;

  for (const axis of axes) {
    for (const corner of corners) {
      vertices.push(0, 0, 0, ...axis.end, ...axis.color, ...corner);
    }
  }

  return geometry(gpu, {
    label: "homepage-light-debug-axes",
    buffers: [
      {
        data: new Float32Array(vertices),
        stride: 44,
        attributes: {
          line_start: "float32x3",
          line_end: "float32x3",
          axis_color: "float32x3",
          corner: "float32x2",
        },
      },
    ],
  });
}

function crossOrbit(
  a: readonly [number, number, number],
  b: readonly [number, number, number]
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalizeOrbit(
  vector: readonly [number, number, number],
  fallback: readonly [number, number, number]
): [number, number, number] {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  return length < 0.000001
    ? [...fallback]
    : [vector[0] / length, vector[1] / length, vector[2] / length];
}

function rotateAroundAxisOrbit(
  vector: readonly [number, number, number],
  axis: readonly [number, number, number],
  angle: number
): [number, number, number] {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const projection =
    (axis[0] * vector[0] + axis[1] * vector[1] + axis[2] * vector[2]) *
    (1 - cosine);
  const perpendicular = crossOrbit(axis, vector);
  return [
    vector[0] * cosine + perpendicular[0] * sine + axis[0] * projection,
    vector[1] * cosine + perpendicular[1] * sine + axis[1] * projection,
    vector[2] * cosine + perpendicular[2] * sine + axis[2] * projection,
  ];
}
