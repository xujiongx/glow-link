"use client";

import { useEffect, useId, useRef, useState } from "react";

import { navigate, type Route } from "../routing";

const WORKS = [
  {
    route: "glow-ink" as const,
    title: "Glow Ink",
    blurb: "手写发光字 · Radiance Cascades",
  },
] as const;

interface SiteChromeProps {
  readonly route: Route;
}

export function SiteChrome({ route }: SiteChromeProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [route]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root || event.target instanceof Node && root.contains(event.target)) {
        return;
      }
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <header className="site-chrome">
      <button
        type="button"
        className="site-brand"
        onClick={() => navigate("home")}
        aria-label="返回首页"
      >
        <span className="site-brand-mark">HORIZON</span>
        <span className="site-brand-sub">WebGPU 作品集</span>
      </button>

      <div className="site-menu" ref={rootRef}>
        <button
          type="button"
          className="site-menu-trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((value) => !value)}
        >
          作品
          <span className={`site-menu-caret${open ? " is-open" : ""}`} aria-hidden="true" />
        </button>

        <div
          id={menuId}
          className={`site-menu-panel${open ? " is-open" : ""}`}
          role="menu"
          aria-hidden={!open}
        >
          {WORKS.map((work) => (
            <button
              key={work.route}
              type="button"
              role="menuitem"
              className={`site-menu-item${route === work.route ? " is-active" : ""}`}
              onClick={() => {
                setOpen(false);
                navigate(work.route);
              }}
            >
              <span className="site-menu-item-title">{work.title}</span>
              <span className="site-menu-item-blurb">{work.blurb}</span>
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
