/**
 * 界面缩放。
 *
 * 现状：整套 UI 的字号写的是固定 px（正文 8.5~11px），在 1920 及以上宽度的屏幕上会明显偏小。
 * 做法：用 CSS `zoom` 按视口宽度整体等比放大——字号、间距、边框、图表一起放大，视觉比例不变，
 *      等同于把「浏览器缩放」内置进应用；用户可在顶栏手动覆盖成固定档位。
 *
 * 为什么不用改字号的方式：字号散落在 ~150 个组件的 Tailwind 任意值里，逐个调大会漏、
 * 且只放大文字不放大容器会导致换行挤压。zoom 是唯一「一处生效、布局不变形」的方案。
 */

export const UI_SCALE_KEY = 'marvis.ui.scale.v1';

/** 'auto' = 跟随窗口宽度；数字 = 固定百分比。 */
export type UiScaleSetting = 'auto' | number;

/** 自动模式下允许的区间：低于 112% 仍然偏小，高于 165% 内容会太稀。 */
export const UI_SCALE_MIN = 112;
export const UI_SCALE_MAX = 165;

/** 设计基准宽度：此宽度下按 100% 显示。 */
const BASE_WIDTH = 1440;

export const UI_SCALE_OPTIONS: { value: UiScaleSetting; label: string }[] = [
  { value: 'auto', label: '自动' },
  { value: 100, label: '100%' },
  { value: 112, label: '112%' },
  { value: 125, label: '125%' },
  { value: 140, label: '140%' },
  { value: 160, label: '160%' },
];

/** 按窗口宽度算自动百分比（已夹在合理区间内）。 */
export function autoScalePercent(width: number): number {
  const raw = Math.round((width / BASE_WIDTH) * 100);
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, raw));
}

export function readScaleSetting(): UiScaleSetting {
  try {
    const raw = window.localStorage.getItem(UI_SCALE_KEY);
    if (!raw || raw === 'auto') return 'auto';
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 80 || value > 200) return 'auto';
    return value;
  } catch {
    return 'auto';
  }
}

export function writeScaleSetting(setting: UiScaleSetting): void {
  try {
    window.localStorage.setItem(UI_SCALE_KEY, String(setting));
  } catch {
    // 隐私模式写入失败：退化为本次会话有效
  }
}

export function resolveScalePercent(setting: UiScaleSetting, width = window.innerWidth): number {
  return setting === 'auto' ? autoScalePercent(width) : setting;
}

/** 是否已经应用过（避免 resize 事件里重复派发导致自激循环）。 */
let lastApplied = 0;

/**
 * 应用到根字号，返回实际生效的百分比。
 *
 * 只改 `document.documentElement.style.fontSize`：整套 UI 的尺寸都写成了 rem，
 * 根字号一变，字号、间距、容器高度等比放大，图表容器随之变宽高并重绘——
 * 位图尺寸跟显示尺寸一致，所以不会像 css zoom 那样把 canvas 拉伸发虚。
 */
export function applyUiScale(percent: number): number {
  const safe = Math.min(200, Math.max(60, Math.round(percent)));
  if (safe === lastApplied) return safe;
  lastApplied = safe;
  document.documentElement.style.fontSize = `${(16 * safe) / 100}px`;
  // 图表库监听 window.resize，容器尺寸变了需要主动通知它按新尺寸重排
  window.dispatchEvent(new Event('resize'));
  return safe;
}
