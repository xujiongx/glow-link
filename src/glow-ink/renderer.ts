import { surface, type Gpu, type Surface } from "vgpu";

import {
  canvasToPngBlob,
  downloadBlob,
  glowInkFilename,
} from "./export-image";
import { installLightPaintInput } from "./pointer-input";
import {
  createScene,
  destroyScene,
  prepareScene,
  presentScene,
  runChain,
  type RadianceScene,
} from "./simulation";

interface RendererOptions {
  readonly canvas: HTMLCanvasElement;
}

export function createRenderer({ canvas }: RendererOptions) {
  let disposed = false;
  let gpu: Gpu | undefined;
  let canvasSurface: Surface | undefined;
  let scene: RadianceScene | undefined;
  let input: ReturnType<typeof installLightPaintInput> | undefined;
  let observer: ResizeObserver | undefined;
  let unsubscribeResize: (() => void) | undefined;
  let animationFrame = 0;
  let resizeFrame = 0;
  let pendingSize:
    | { readonly width: number; readonly height: number; readonly dpr: number }
    | undefined;
  let lastDpr = typeof window === "undefined" ? 1 : window.devicePixelRatio;
  let sawInitialResize = false;
  let rebuilding = false;
  let dirty = true;
  let clearRequested = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (animationFrame) cancelAnimationFrame(animationFrame);
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    observer?.disconnect();
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", onWindowResize);
    }
    let firstError: unknown;
    for (const cleanup of [
      unsubscribeResize,
      () => input?.dispose(),
      () => gpu?.dispose(),
    ]) {
      try {
        cleanup?.();
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError) throw firstError;
  };

  const fail = (error: unknown): never => {
    try {
      dispose();
    } catch {
      // Keep the operation failure primary after best-effort teardown.
    }
    throw error;
  };

  const rebuildScene = () => {
    if (disposed || !gpu || !canvasSurface) return;
    rebuilding = true;
    try {
      const next = createScene(gpu, canvasSurface.size);
      const previous = scene;
      scene = next;
      if (previous) destroyScene(previous);
      clearRequested = true;
      dirty = true;
      void prepareScene(next, canvasSurface.format).catch((error: unknown) => {
        if (!disposed && scene === next) fail(error);
      });
    } catch (error) {
      fail(error);
    } finally {
      rebuilding = false;
    }
  };

  const onSurfaceResize = () => {
    if (!sawInitialResize) {
      sawInitialResize = true;
      return;
    }
    if (!rebuilding) rebuildScene();
  };

  const applyResize = () => {
    resizeFrame = 0;
    const size = pendingSize;
    pendingSize = undefined;
    if (disposed || !size || !canvasSurface) return;
    try {
      canvasSurface.resize([
        Math.max(1, Math.round(size.width * size.dpr)),
        Math.max(1, Math.round(size.height * size.dpr)),
      ]);
    } catch (error) {
      fail(error);
    }
  };

  const measure = () => {
    const { width, height } = canvas.getBoundingClientRect();
    if (disposed || width <= 0 || height <= 0) return;
    pendingSize = {
      width,
      height,
      dpr: Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
    };
    if (!resizeFrame) resizeFrame = requestAnimationFrame(applyResize);
  };

  function onWindowResize() {
    if (window.devicePixelRatio === lastDpr) return;
    lastDpr = window.devicePixelRatio;
    measure();
  }

  const tick = () => {
    animationFrame = 0;
    if (disposed) return;
    if (!document.hidden && gpu && canvasSurface && scene && input) {
      try {
        const segment = input.take();
        if (segment) dirty = true;
        if (dirty) {
          runChain(scene, {
            segment,
            keepPrevious: !clearRequested,
            view: "final",
          });
          clearRequested = false;
          dirty = false;
        }
        presentScene(scene, canvasSurface, "final");
      } catch (error) {
        fail(error);
      }
    }
    animationFrame = requestAnimationFrame(tick);
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
    canvasSurface = surface(gpu, canvas, { autoResize: false, dpr: [1, 2] });
    scene = createScene(gpu, canvasSurface.size);
    await prepareScene(scene, canvasSurface.format);
    if (disposed) return;

    input = installLightPaintInput(canvas);

    unsubscribeResize = canvasSurface.onResize(onSurfaceResize);
    observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(measure);
    observer?.observe(canvas);
    window.addEventListener("resize", onWindowResize);
    measure();
    animationFrame = requestAnimationFrame(tick);
  };

  const ready = initialize().catch((error: unknown) => {
    if (!disposed) fail(error);
  });

  const clearCanvas = () => {
    if (disposed) return;
    clearRequested = true;
    dirty = true;
  };

  const exportPng = async () => {
    await ready;
    if (disposed || !gpu || !canvasSurface || !scene) {
      throw new Error("渲染器尚未就绪，请稍后再导出");
    }

    runChain(scene, {
      keepPrevious: true,
      view: "final",
    });
    presentScene(scene, canvasSurface, "final");
    await gpu.settled();
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const blob = await canvasToPngBlob(canvas);
    downloadBlob(blob, glowInkFilename());
  };

  return { ready, dispose, clearCanvas, exportPng };
}
