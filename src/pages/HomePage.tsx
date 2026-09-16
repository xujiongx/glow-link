"use client";

import { ArrowRight } from "lucide-react";

import { iconProps } from "../icons";
import { navigate } from "../routing";

export function HomePage() {
  return (
    <main className="home">
      <div className="home-copy">
        <p className="home-kicker">Interactive graphics</p>
        <h1 className="home-title">HORIZON</h1>
        <p className="home-lede">
          用 WebGPU 做会发光、会弯曲光线的小世界。每一件作品都是一次实时渲染实验。
        </p>
        <div className="home-cta">
          <button
            type="button"
            className="home-button"
            onClick={() => navigate("works")}
          >
            浏览作品
            <ArrowRight {...iconProps} className="ui-icon" />
          </button>
        </div>
      </div>
    </main>
  );
}
