import type { Route } from "./routing";

export interface WorkItem {
  readonly route: Extract<Route, "glow-ink">;
  readonly title: string;
  readonly blurb: string;
  readonly tag: string;
}

export const WORKS: readonly WorkItem[] = [
  {
    route: "glow-ink",
    title: "Glow Ink",
    blurb: "用手写笔画绘制发光文字，光线在画布上真实弹射。",
    tag: "Radiance Cascades",
  },
];
