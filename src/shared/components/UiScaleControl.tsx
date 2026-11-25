import { memo } from 'react';
import { useUiScale } from '../hooks/useUiScale';
import { UI_SCALE_OPTIONS } from '../utils/uiScale';

/** 顶栏字号缩放开关：自动跟随窗口宽度，也可手动锁定档位，设置存本机。 */
export const UiScaleControl = memo(function UiScaleControl() {
  const { setting, percent, change } = useUiScale();

  return (
    <label
      className="flex items-center gap-1 rounded bg-[rgba(255,255,255,0.05)] px-2 py-1.5 text-[0.6875rem] text-[#b0b5c0]"
      title="界面字号缩放（自动跟随窗口宽度，可手动锁定）"
    >
      <span className="text-[0.5625rem] text-[#636878]">字号</span>
      <select
        value={String(setting)}
        onChange={(e) => {
          const value = e.target.value;
          change(value === 'auto' ? 'auto' : Number(value));
        }}
        className="cursor-pointer bg-transparent text-[0.6875rem] text-[#b0b5c0] outline-none"
      >
        {UI_SCALE_OPTIONS.map((option) => (
          <option
            key={String(option.value)}
            value={String(option.value)}
            className="bg-[#0f1118] text-[#b0b5c0]"
          >
            {option.value === 'auto' ? `${option.label} ${percent}%` : option.label}
          </option>
        ))}
      </select>
    </label>
  );
});
