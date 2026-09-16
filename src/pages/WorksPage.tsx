"use client";

import { ArrowUpRight, ExternalLink } from "lucide-react";

import { iconProps } from "../icons";
import { WORKS, openWork } from "../works";

export function WorksPage() {
  return (
    <main className="works-page">
      <div className="works-page-inner">
        <header className="works-header">
          <p className="works-kicker">Selected works</p>
          <h1 className="works-title">作品</h1>
          <p className="works-lede">
            WebGPU 实验与日常产品合集。站内作品直接进入，外链作品会在新标签页打开。
          </p>
        </header>

        <ul className="works-list">
          {WORKS.map((work) => (
            <li key={work.id}>
              <button
                type="button"
                className="works-card"
                onClick={() => openWork(work)}
              >
                <div className="works-card-copy">
                  <p className="works-card-tag">{work.tag}</p>
                  <h2 className="works-card-title">{work.title}</h2>
                  <p className="works-card-blurb">{work.blurb}</p>
                </div>
                <span className="works-card-action">
                  {work.kind === "external" ? "打开" : "进入"}
                  {work.kind === "external" ? (
                    <ExternalLink {...iconProps} className="ui-icon" />
                  ) : (
                    <ArrowUpRight {...iconProps} className="ui-icon" />
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
