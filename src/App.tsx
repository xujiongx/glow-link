"use client";

import { useEffect, useRef, useState } from "react";

import { createRenderer } from "./renderer";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actionsRef = useRef<{
    clearCanvas: () => void;
    exportPng: () => Promise<void>;
  } | null>(null);
  const [exporting, setExporting] = useState(false);

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
    <div className="app">
      <header className="brand">
        <div className="brand-copy">
          <p className="brand-name">Glow Ink</p>
          <p className="brand-tag">手写发光字 · Radiance Cascades</p>
        </div>
        <div className="brand-actions">
          <button type="button" className="action-button ghost" onClick={onClear}>
            清空画布
          </button>
          <button
            type="button"
            className="action-button"
            onClick={onExport}
            disabled={exporting}
          >
            {exporting ? "导出中…" : "导出图片"}
          </button>
        </div>
      </header>

      <main className="stage">
        <canvas ref={canvasRef} className="stage-canvas" />
        <p className="hint">按住拖动画笔 · 笔画即光源</p>
      </main>
    </div>
  );
}
