"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, RotateCcw, RefreshCw, Shuffle } from "lucide-react";

import { createRenderer } from "../glass-fractal/renderer";
import { iconProps } from "../icons";
import { navigate } from "../routing";

type Shape = "fractal" | "orb" | "cube";

const SHAPES = [
  { id: "fractal", label: "Fractal" },
  { id: "orb", label: "Orb" },
  { id: "cube", label: "Cube" },
] as const satisfies readonly {
  id: Shape;
  label: string;
}[];

export function GlassFractalPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ReturnType<typeof createRenderer> | null>(null);
  const [shape, setShape] = useState<Shape>("fractal");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoMorph, setAutoMorph] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = createRenderer({
      canvas,
      onShapeChange: (nextShape) => {
        if (!cancelled) setShape(nextShape);
      },
    });
    rendererRef.current = renderer;
    void renderer.ready
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "加载失败");
      });
    return () => {
      cancelled = true;
      if (rendererRef.current === renderer) rendererRef.current = null;
      renderer.dispose();
    };
  }, []);

  const selectShape = (nextShape: Shape) => {
    setShape(nextShape);
    rendererRef.current?.setShape(nextShape);
  };

  const toggleAutoMorph = () => {
    const next = !autoMorph;
    setAutoMorph(next);
    rendererRef.current?.setAutoMorph(next);
  };

  const toggleAutoRotate = () => {
    const next = !autoRotate;
    setAutoRotate(next);
    rendererRef.current?.setAutoRotate(next);
  };

  const resetView = () => {
    rendererRef.current?.resetView();
  };

  return (
    <div className="glass-app">
      <header className="glass-bar">
        <button
          type="button"
          className="glass-back"
          onClick={() => navigate("home")}
        >
          <ArrowLeft {...iconProps} className="ui-icon" />
          <span className="glass-back-label">首页</span>
        </button>
        <div className="glass-bar-copy">
          <p className="glass-brand-name">Glass Fractal</p>
          <p className="glass-brand-tag">玻璃四面体 · 分形网格</p>
        </div>
      </header>

      <main className="glass-stage">
        <canvas
          ref={canvasRef}
          className={`glass-stage-canvas${ready ? " is-ready" : ""}`}
        />
        {error ? <p className="glass-error">{error}</p> : null}
        {!ready && !error ? <p className="glass-loading">加载中…</p> : null}

        {ready && !error ? (
          <p className="glass-hint glass-hint-desktop">
            拖动旋转 · Shift 平移 · 滚轮缩放 · Alt+滚轮视场 · 双击重置
          </p>
        ) : null}
      </main>

      <div className="glass-dock">
        <div className="glass-shapes" role="group" aria-label="形状">
          {SHAPES.map((option) => {
            const selected = shape === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                className={`glass-shape-button${selected ? " is-selected" : ""}`}
                onClick={() => selectShape(option.id)}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="glass-tools" role="group" aria-label="视角">
          <button
            type="button"
            aria-pressed={autoMorph}
            aria-label="自动变形"
            className={`glass-tool-button${autoMorph ? " is-selected" : ""}`}
            onClick={toggleAutoMorph}
          >
            <Shuffle {...iconProps} className="ui-icon" />
            <span className="glass-tool-label">变形</span>
          </button>
          <button
            type="button"
            aria-pressed={autoRotate}
            aria-label="自动旋转"
            className={`glass-tool-button${autoRotate ? " is-selected" : ""}`}
            onClick={toggleAutoRotate}
          >
            <RefreshCw {...iconProps} className="ui-icon" />
            <span className="glass-tool-label">自转</span>
          </button>
          <button
            type="button"
            aria-label="重置视角"
            className="glass-tool-button"
            onClick={resetView}
          >
            <RotateCcw {...iconProps} className="ui-icon" />
            <span className="glass-tool-label">重置</span>
          </button>
        </div>
      </div>
    </div>
  );
}
