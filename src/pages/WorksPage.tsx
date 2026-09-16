"use client";

import { ArrowUpRight } from "lucide-react";

import { iconProps } from "../icons";
import { navigate } from "../routing";
import { WORKS } from "../works";

export function WorksPage() {
  return (
    <main className="works-page">
      <div className="works-page-inner">
        <header className="works-header">
          <p className="works-kicker">Selected works</p>
          <h1 className="works-title">作品</h1>
          <p className="works-lede">
            实时渲染实验合集。点开任意作品，直接进入可交互的 WebGPU 现场。
          </p>
        </header>

        <ul className="works-list">
          {WORKS.map((work) => (
            <li key={work.route}>
              <button
                type="button"
                className="works-card"
                onClick={() => navigate(work.route)}
              >
                <div className="works-card-copy">
                  <p className="works-card-tag">{work.tag}</p>
                  <h2 className="works-card-title">{work.title}</h2>
                  <p className="works-card-blurb">{work.blurb}</p>
                </div>
                <span className="works-card-action">
                  进入
                  <ArrowUpRight {...iconProps} className="ui-icon" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
