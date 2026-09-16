// Browser lifecycle for the baked black-hole pipeline. VGPU stays dynamically imported.

import type { Frame, Gpu, Surface } from "vgpu";

type VgpuApi = typeof import("vgpu");

import {
  createEffects,
  createTargets,
  destroyTargets,
  prewarm,
  renderChain,
  setBakeUniforms,
  setBindings,
  setPostUniforms,
  setShadeUniforms,
  type Effects,
  type Targets,
} from "./pipeline";
import {
  defaultHeroSettings,
  mobileHeroOverrides,
  type HeroSettings,
} from "./settings";

const SCENE_YAW_TAU_S = 0.325;
const MAX_FRAME_DT_S = 0.1;
const FRAME_PACING_EPSILON_MS = 2;
const DESKTOP_TARGET_FPS = 60;
const MOBILE_TARGET_FPS = 30;
const MOBILE_RENDER_SCALE = 0.72;
const MOBILE_QUERY = "(max-width: 767px)";

interface RendererOptions {
  canvas: HTMLCanvasElement;
}

type RenderSize = { width: number; height: number };

function cloneSettings(source: HeroSettings): HeroSettings {
  return {
    ...source,
    bloom: { ...source.bloom },
    disk: { ...source.disk },
    stars: { ...source.stars },
  };
}

function applyHeroPatch(
  target: HeroSettings,
  patch: Partial<HeroSettings>
): void {
  const { bloom, disk, stars, ...rest } = patch;
  Object.assign(target, rest);
  if (bloom) Object.assign(target.bloom, bloom);
  if (disk) Object.assign(target.disk, disk);
  if (stars) Object.assign(target.stars, stars);
}

function scaleBloomForDevice(settings: HeroSettings, mobile: boolean): void {
  const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
  const scale = mobile ? Math.min(dpr, 1.5) / 2.2 : dpr / 2;
  settings.bloom.radius *= scale;
  settings.bloom.strength *= scale;
}

export function createRenderer({ canvas }: RendererOptions) {
  const desktopSettings = cloneSettings(defaultHeroSettings());
  const settings = cloneSettings(desktopSettings);
  const mobileQuery = window.matchMedia(MOBILE_QUERY);
  let isMobile = mobileQuery.matches;
  let minFrameIntervalMs =
    1000 / (isMobile ? MOBILE_TARGET_FPS : DESKTOP_TARGET_FPS) -
    FRAME_PACING_EPSILON_MS;

  const applyResponsiveLayout = () => {
    isMobile = mobileQuery.matches;
    minFrameIntervalMs =
      1000 / (isMobile ? MOBILE_TARGET_FPS : DESKTOP_TARGET_FPS) -
      FRAME_PACING_EPSILON_MS;
    applyHeroPatch(settings, desktopSettings);
    if (isMobile) applyHeroPatch(settings, mobileHeroOverrides());
    scaleBloomForDevice(settings, isMobile);
  };
  applyResponsiveLayout();

  let disposed = false;

  let api: VgpuApi | undefined;
  let gpu: Gpu | undefined;
  let surface: Surface | undefined;
  let effects: Effects | undefined;
  let targets: Targets | undefined;
  let loop: { stop(): void } | undefined;
  let observer: ResizeObserver | undefined;
  let intersection: IntersectionObserver | undefined;
  let documentVisible =
    typeof document === "undefined" ? true : !document.hidden;
  let canvasIntersecting = true;

  let started = false;
  let animationTime = 0;
  let lastFrameAt: number | undefined;
  let resizeFrame = 0;
  let pendingSize: RenderSize | undefined;
  let forceBake = true;
  let pointerXNormalized = 0;
  let currentSceneYaw = 0;
  let lastYawAt: number | undefined;

  const syncPostUniforms = () => {
    if (!effects || !targets) return;
    setPostUniforms(effects, targets, settings);
  };

  const onLayoutChange = () => {
    applyResponsiveLayout();
    forceBake = true;
    syncPostUniforms();
    measure();
    if (loop) {
      loop.stop();
      loop = undefined;
      reconcileLoop();
    }
  };
  mobileQuery.addEventListener("change", onLayoutChange);

  const onPointerMove = (event: PointerEvent) => {
    // Allow touch parallax on mobile; keep motion subtle via mouseYaw.
    if (event.pointerType === "mouse" || isMobile) {
      const width = Math.max(window.innerWidth, 1);
      pointerXNormalized = Math.min(
        1,
        Math.max(-1, (event.clientX / width) * 2 - 1)
      );
    }
  };

  const recenterPointer = () => {
    pointerXNormalized = 0;
  };
  const onPointerOut = (event: PointerEvent) => {
    if (event.relatedTarget === null) recenterPointer();
  };
  const onVisibilityChange = () => {
    if (document.hidden) recenterPointer();
    documentVisible = !document.hidden;
    reconcileLoop();
  };

  function reconcileLoop(): void {
    if (!started || !gpu || !api) return;
    const shouldRun = !disposed && documentVisible && canvasIntersecting;
    if (shouldRun === Boolean(loop)) return;
    if (shouldRun) {
      lastFrameAt = undefined;
      lastYawAt = undefined;
      loop = startPacedLoop(api, gpu);
    } else {
      loop?.stop();
      loop = undefined;
    }
  }

  function startPacedLoop(vgpu: VgpuApi, activeGpu: Gpu): { stop(): void } {
    let stopped = false;

    let lastPresentedAt: number | undefined;
    const tick = (timestamp: number): void => {
      if (stopped) return;
      if (
        lastPresentedAt === undefined ||
        timestamp - lastPresentedAt >= minFrameIntervalMs
      ) {
        lastPresentedAt = timestamp;
        try {
          vgpu.frame(activeGpu, renderFrame);
        } catch (error) {
          handleFailure(error);
        }
      }
      if (!stopped) frameHandle = requestAnimationFrame(tick);
    };
    let frameHandle = requestAnimationFrame(tick);
    return {
      stop(): void {
        stopped = true;
        cancelAnimationFrame(frameHandle);
      },
    };
  }

  const advanceAnimationTime = (now: number): number => {
    animationTime +=
      lastFrameAt === undefined ? 0 : Math.max(0, (now - lastFrameAt) / 1000);
    lastFrameAt = now;
    return animationTime;
  };

  const renderFrame = (frame: Frame): void => {
    if (disposed || !effects || !targets || !surface) return;
    const now = clockMs();
    const runBake = forceBake;
    forceBake = false;
    if (runBake) setBakeUniforms(effects, targets, settings);
    setShadeUniforms(
      effects,
      targets,
      settings,
      advanceAnimationTime(now),
      advanceSceneYaw(now)
    );
    renderChain(frame, effects, targets, surface, runBake);
  };

  const advanceSceneYaw = (now: number): number => {
    if (settings.mouseYaw <= 0) {
      currentSceneYaw = 0;
      lastYawAt = now;
      return 0;
    }
    const dt =
      lastYawAt === undefined
        ? 0
        : Math.min(Math.max((now - lastYawAt) / 1000, 0), MAX_FRAME_DT_S);
    lastYawAt = now;
    const target = pointerXNormalized * Math.max(0, settings.mouseYaw);
    currentSceneYaw +=
      (target - currentSceneYaw) * (1 - Math.exp(-dt / SCENE_YAW_TAU_S));
    return currentSceneYaw;
  };

  const applyResize = () => {
    resizeFrame = 0;
    const size = pendingSize;
    pendingSize = undefined;
    if (disposed || !size || !gpu || !api || !effects || !targets || !surface)
      return;
    try {
      const width = Math.max(1, Math.round(size.width));
      const height = Math.max(1, Math.round(size.height));
      surface.resize([width, height]);
      const previousTargets = targets;
      const nextTargets = createTargets(api, gpu, [width, height]);
      try {
        setBindings(effects, nextTargets);
        setPostUniforms(effects, nextTargets, settings);
      } catch (error) {
        destroyTargets(nextTargets);
        throw error;
      }
      targets = nextTargets;
      destroyTargets(previousTargets);
      forceBake = true;
    } catch (error) {
      handleFailure(error);
    }
  };
  const resize = (size: RenderSize) => {
    if (disposed || size.width <= 0 || size.height <= 0) return;
    pendingSize = size;
    if (!resizeFrame) resizeFrame = requestAnimationFrame(applyResize);
  };

  const measure = () => {
    const scale = isMobile ? MOBILE_RENDER_SCALE : 1;
    resize({
      width: canvas.clientWidth * scale,
      height: canvas.clientHeight * scale,
    });
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    loop?.stop();
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    observer?.disconnect();
    intersection?.disconnect();
    if (typeof window !== "undefined") {
      mobileQuery.removeEventListener("change", onLayoutChange);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerout", onPointerOut);
      window.removeEventListener("blur", recenterPointer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
    gpu?.dispose();
  };

  const initialize = async () => {
    const vgpu = await import("vgpu");
    const { init } = vgpu;
    if (disposed) return;
    const nextGpu = await init();
    if (disposed) {
      nextGpu.dispose();
      return;
    }
    gpu = nextGpu;
    api = vgpu;
    // Keep CSS size full-bleed; mobile draws at a lower buffer scale via measure().
    surface = vgpu.surface(gpu, canvas, { autoResize: false, dpr: 1 });
    effects = createEffects(vgpu, gpu);
    const scale = isMobile ? MOBILE_RENDER_SCALE : 1;
    const initialSize: [number, number] = [
      Math.max(1, Math.round(canvas.clientWidth * scale) || surface.size[0]),
      Math.max(1, Math.round(canvas.clientHeight * scale) || surface.size[1]),
    ];
    surface.resize(initialSize);
    targets = createTargets(vgpu, gpu, initialSize);
    setBakeUniforms(effects, targets, settings);
    setShadeUniforms(effects, targets, settings, animationTime, currentSceneYaw);
    setBindings(effects, targets);
    setPostUniforms(effects, targets, settings);
    await prewarm(effects, targets, surface);
    if (disposed) return;
    observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(measure);
    observer?.observe(canvas);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerout", onPointerOut, { passive: true });
    window.addEventListener("blur", recenterPointer);
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (typeof IntersectionObserver !== "undefined") {
      intersection = new IntersectionObserver(
        (entries) => {
          canvasIntersecting =
            entries[entries.length - 1]?.isIntersecting ?? canvasIntersecting;
          reconcileLoop();
        },
        { threshold: 0 }
      );
      intersection.observe(canvas);
    }
    measure();
    started = true;
    documentVisible = !document.hidden;
    reconcileLoop();
  };

  function handleFailure(error: unknown): never {
    dispose();
    throw error;
  }

  const ready = initialize().catch((error: unknown) => {
    if (disposed) return;
    handleFailure(error);
  });

  return { ready, dispose };
}

function clockMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}
