"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, Eraser, LoaderCircle } from "lucide-react";

import { createRenderer } from "../glow-ink/renderer";
import { iconProps } from "../icons";
import { navigate } from "../routing";

export function GlowInkPage() {
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
        "glow-app",
        drawing ? "is-drawing" : "",
        chromeHidden ? "chrome-hidden" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="glow-bar">
        <div className="glow-bar-left">
          <button
            type="button"
            className="glow-back"
            onClick={() => navigate("home")}
            tabIndex={chromeHidden ? -1 : 0}
          >
            <ArrowLeft {...iconProps} className="ui-icon" />
            首页
          </button>
          <div className="glow-bar-copy">
            <p className="glow-brand-name">Glow Ink</p>
            <p className="glow-brand-tag">手写发光字</p>
          </div>
        </div>
        <div className="glow-bar-actions">
          <button
            type="button"
            className="action-button ghost"
            onClick={onClear}
            tabIndex={chromeHidden ? -1 : 0}
          >
            <Eraser {...iconProps} className="ui-icon" />
            清空
          </button>
          <button
            type="button"
            className="action-button"
            onClick={onExport}
            disabled={exporting}
            tabIndex={chromeHidden ? -1 : 0}
          >
            {exporting ? (
              <LoaderCircle {...iconProps} className="ui-icon is-spinning" />
            ) : (
              <Download {...iconProps} className="ui-icon" />
            )}
            {exporting ? "导出中" : "导出"}
          </button>
        </div>
      </header>

      <main className="glow-stage">
        <canvas ref={canvasRef} className="glow-stage-canvas" />
        <p className="glow-hint">按住拖动画笔 · 笔画即光源</p>
      </main>
    </div>
  );
}
