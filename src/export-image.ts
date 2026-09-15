function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function glowInkFilename(date = new Date()): string {
  return [
    "glow-ink",
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    ".png",
  ].join("");
}

export async function canvasToPngBlob(
  canvas: HTMLCanvasElement
): Promise<Blob> {
  if (typeof canvas.toBlob !== "function") {
    throw new Error("当前浏览器不支持导出画布为图片");
  }
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
  if (!blob) {
    throw new Error("导出失败：无法读取画布像素");
  }
  return blob;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
