"use client";

import { useEffect, useRef, useState } from "react";

import { createRenderer } from "../black-hole/renderer";

export function BlackHoleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = createRenderer({ canvas });
    void renderer.ready.then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
      renderer.dispose();
    };
  }, []);

  return (
    <div className="black-hole-bg" aria-hidden="true">
      <canvas
        ref={canvasRef}
        className={`black-hole-canvas${ready ? " is-ready" : ""}`}
      />
      <div className="black-hole-veil" />
    </div>
  );
}
