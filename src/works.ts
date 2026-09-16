import type { Route } from "./routing";

export type WorkItem =
  | {
      readonly id: string;
      readonly title: string;
      readonly blurb: string;
      readonly tag: string;
      readonly kind: "internal";
      readonly route: Extract<Route, "glow-ink">;
    }
  | {
      readonly id: string;
      readonly title: string;
      readonly blurb: string;
      readonly tag: string;
      readonly kind: "external";
      readonly href: string;
    };

export const WORKS: readonly WorkItem[] = [
  {
    id: "glow-ink",
    kind: "internal",
    route: "glow-ink",
    title: "Glow Ink",
    blurb: "用手写笔画绘制发光文字，光线在画布上真实弹射。",
    tag: "WebGPU · Radiance Cascades",
  },
  {
    id: "money",
    kind: "external",
    href: "https://money.xujiong.cloud/",
    title: "家庭记账",
    blurb: "用家庭编码进入账本，记录和管理日常收支。",
    tag: "记账 · 家庭协作",
  },
  {
    id: "bun",
    kind: "external",
    href: "https://bun.xujiong.cloud/",
    title: "多人临时聊天室",
    blurb: "多房间实时聊天，开房即用，适合临时沟通。",
    tag: "实时通信",
  },
  {
    id: "menu",
    kind: "external",
    href: "https://menu.xujiong.cloud/",
    title: "点菜网站",
    blurb: "浏览菜品并完成点餐，适合聚餐与家常点菜场景。",
    tag: "点餐",
  },
  {
    id: "run",
    kind: "external",
    href: "https://run.xujiong.cloud/",
    title: "拾趣跑",
    blurb: "经典草原跑酷小游戏：采花躲怪，多种模式挑战。",
    tag: "小游戏 · Zdog",
  },
  {
    id: "search",
    kind: "external",
    href: "https://search.xujiong.cloud/",
    title: "Shelf 文档检索",
    blurb: "本地文档语义检索，上传资料后用对话快速找答案。",
    tag: "语义检索",
  },
  {
    id: "day",
    kind: "external",
    href: "https://day.xujiong.cloud/",
    title: "朝暮记",
    blurb: "每日待办、笔记与发现，用邮箱无密码登录同步数据。",
    tag: "每日记事",
  },
  {
    id: "avatar",
    kind: "external",
    href: "https://www.xujiong.cloud/",
    title: "AI 分身",
    blurb: "打造属于自己的 AI 分身应用。",
    tag: "AI",
  },
];

export function openWork(work: WorkItem): void {
  if (work.kind === "external") {
    window.open(work.href, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.hash = `#/${work.route}`;
}
