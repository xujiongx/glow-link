# Glow Ink · 手写发光字

基于 [vgpu Radiance Cascades](https://vgpu.sh/examples/radiance-cascades) 的交互示例：用指针书写，笔画本身作为 HDR 光源，经 Jump Flood 距离场与六级 radiance cascades 合成二维全局光照。

## 开发

需要支持 **WebGPU** 的浏览器（Chrome / Edge / Safari Technology Preview 等）。

```bash
npm install
npm run dev
```

## 操作

- 在画布上按住拖动书写
- 每一笔使用不同色相的发光颜色
- 「清空」「导出」可擦除笔画或下载 PNG；移动端书写时控件会自动让出画布

## 技术栈

- React + Vite
- [vgpu](https://vgpu.sh) WebGPU 渲染
- `@vgpu/wgsl` 加载 `.wgsl` 模块
