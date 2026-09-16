"use client";

import { useEffect, useRef, useState } from "react";

import { createRenderer } from "./renderer";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actionsRef = useRef<{
    clearCanvas: () => void;
    exportPng: () => Promise<void>;
  } | null>(null);
  const hideChromeTimer = useRef<number>(0);
  const [exporting, setExporting] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = createRenderer({ canvas });
    actionsRef.current = {
      clearCanvas: renderer.clearCanvas,
      exportPng: renderer.exportPng,
    };
    void renderer.ready;
    return () => {
      actionsRef.current = null;
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const clearHideTimer = () => {
      if (hideChromeTimer.current) {
        window.clearTimeout(hideChromeTimer.current);
        hideChromeTimer.current = 0;
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!event.isPrimary) return;
      clearHideTimer();
      setDrawing(true);
      setChromeHidden(true);
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (!event.isPrimary) return;
      setDrawing(false);
      clearHideTimer();
      hideChromeTimer.current = window.setTimeout(() => {
        setChromeHidden(false);
        hideChromeTimer.current = 0;
      }, 700);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerEnd);
    canvas.addEventListener("pointercancel", onPointerEnd);

    return () => {
      clearHideTimer();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerEnd);
      canvas.removeEventListener("pointercancel", onPointerEnd);
    };
  }, []);

  const onClear = () => {
    actionsRef.current?.clearCanvas();
  };

  const onExport = () => {
    const actions = actionsRef.current;
    if (!actions || exporting) return;
    setExporting(true);
    void actions
      .exportPng()
      .catch((error: unknown) => {
        console.error(error);
        window.alert(error instanceof Error ? error.message : "导出图片失败");
      })
      .finally(() => setExporting(false));
  };

  return (
    <div
      className={[
        "app",
        drawing ? "is-drawing" : "",
        chromeHidden ? "chrome-hidden" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <main className="stage">
        <canvas ref={canvasRef} className="stage-canvas" />
        <p className="hint">按住拖动画笔 · 笔画即光源</p>
      </main>

      <div className="chrome">
        <div className="chrome-brand">
          <p className="brand-name">Glow Ink</p>
          <p className="brand-tag">手写发光字 · Radiance Cascades</p>
        </div>
        <div className="chrome-actions">
          <button
            type="button"
            className="action-button ghost"
            onClick={onClear}
            tabIndex={chromeHidden ? -1 : 0}
          >
            清空
          </button>
          <button
            type="button"
            className="action-button"
            onClick={onExport}
            disabled={exporting}
            tabIndex={chromeHidden ? -1 : 0}
          >
            {exporting ? "导出中" : "导出"}
          </button>
        </div>
      </div>
    </div>
  );
}
