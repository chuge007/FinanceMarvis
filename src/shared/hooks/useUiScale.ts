import { useCallback, useEffect, useState } from 'react';
import {
  applyUiScale,
  readScaleSetting,
  resolveScalePercent,
  writeScaleSetting,
  type UiScaleSetting,
} from '../utils/uiScale';

/**
 * 界面缩放状态：挂载时应用一次，窗口变化时（仅自动模式）重新计算，切换档位时立即生效。
 * 首屏的缩放由 index.html 里的内联脚本先行设置，避免闪一下缩小版。
 */
export function useUiScale() {
  const [setting, setSetting] = useState<UiScaleSetting>(() => readScaleSetting());
  const [percent, setPercent] = useState<number>(() => resolveScalePercent(readScaleSetting()));

  useEffect(() => {
    const next = applyUiScale(resolveScalePercent(setting));
    setPercent(next);

    if (setting !== 'auto') return;
    const onResize = () => {
      setPercent(applyUiScale(resolveScalePercent('auto')));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [setting]);

  const change = useCallback((next: UiScaleSetting) => {
    writeScaleSetting(next);
    setSetting(next);
  }, []);

  return { setting, percent, change };
}
