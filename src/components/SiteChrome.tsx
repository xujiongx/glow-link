"use client";

import { ArrowRight } from "lucide-react";

import { iconProps } from "../icons";
import { navigate, type Route } from "../routing";

interface SiteChromeProps {
  readonly route: Route;
}

export function SiteChrome({ route }: SiteChromeProps) {
  return (
    <header className="site-chrome">
      <button
        type="button"
        className="site-brand"
        onClick={() => navigate("home")}
        aria-label="返回首页"
      >
        <span className="site-brand-mark">HORIZON</span>
      </button>

      <button
        type="button"
        className={`site-works-link${route === "works" ? " is-active" : ""}`}
        onClick={() => navigate("works")}
        aria-current={route === "works" ? "page" : undefined}
      >
        <span className="site-works-link-label">作品</span>
        <span className="site-works-link-arrow">
          <ArrowRight {...iconProps} />
        </span>
      </button>
    </header>
  );
}
