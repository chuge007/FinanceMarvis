import { memo, useEffect, useState, useSyncExternalStore } from 'react';
import { sourceHealthSnapshot, subscribeSourceHealth } from '../utils/sourceHealth';

interface ProxyStatus {
  proxy: string | null;
  source: 'env' | 'detected' | 'none';
}

/**
 * 上游健康条：只在「有源失败」时出现，一行说清楚哪几个不可用，展开看原因。
 * 目的是把原来散落在控制台的几十条报错收敛成一句人话，并给出下一步动作。
 */
export const DataHealthBar = memo(function DataHealthBar() {
  const sources = useSyncExternalStore(subscribeSourceHealth, sourceHealthSnapshot, sourceHealthSnapshot);
  const [open, setOpen] = useState(false);
  const [proxy, setProxy] = useState<ProxyStatus | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/proxy-status')
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data: ProxyStatus | null) => {
        if (alive && data) setProxy(data);
      })
      .catch(() => {
        /* 静态部署没有这个端点，静默忽略 */
      });
    return () => {
      alive = false;
    };
  }, []);

  const failed = sources.filter((s) => s.ok === false);
  if (!failed.length) return null;

  const okCount = sources.filter((s) => s.ok === true).length;
  const names = failed.map((s) => s.label).join('、');

  return (
    <div className="border-b border-[rgba(245,158,75,0.25)] bg-[rgba(245,158,75,0.07)] px-3 py-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#f59e4b]" />
        <span className="text-[0.8125rem] text-[#f59e4b]">
          {failed.length} 个上游不可用：{names}
        </span>
        <span className="text-[0.75rem] text-[#8a8f9d]">
          {okCount > 0 ? `其余 ${okCount} 个正常 · ` : ''}
          相关读数显示「缺」，不会用演示值替代
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto shrink-0 rounded border border-[rgba(245,158,75,0.35)] px-1.5 py-0.5 text-[0.75rem] text-[#f59e4b] hover:bg-[rgba(245,158,75,0.12)]"
        >
          {open ? '收起原因' : '查看原因'}
        </button>
      </div>
      {open && (
        <div className="mt-1 space-y-0.5 pb-0.5">
          {proxy && (
            <div className="text-[0.75rem] leading-relaxed text-[#8a8f9d]">
              <span className="text-[#b0b5c0]">出海通道</span>
              <span className="mx-1 text-[#4d5364]">·</span>
              {proxy.proxy
                ? `${proxy.proxy}（${proxy.source === 'env' ? '环境变量' : '自动探测'}；Yahoo / CBOE / Convex 经此转发）`
                : '未检测到本机代理：Yahoo / CBOE / Convex 直连，中国大陆通常会 403'}
            </div>
          )}
          {failed.map((s) => (
            <div key={s.id} className="text-[0.75rem] leading-relaxed text-[#8a8f9d]">
              <span className="text-[#b0b5c0]">{s.label}</span>
              <span className="mx-1 text-[#4d5364]">·</span>
              {s.message || '上游不可达'}
              {s.id === 'convex' || s.id === 'yahoo' ? (
                <span className="ml-1 text-[#4d5364]">（中国大陆通常需要本机出海代理；可在项目根目录运行 npm run probe 诊断）</span>
              ) : null}
              {s.id === 'eastmoney' ? (
                <span className="ml-1 text-[#4d5364]">（不可达时 A 股板块自动切换腾讯行业榜 / 新浪板块）</span>
              ) : null}
              {s.id === 'data-sidecar' ? (
                <span className="ml-1 text-[#4d5364]">
                  （龙虎榜 / SEC 财报 / 加密行情显示「缺」，不会用演示值替代；装库命令：py -3.11 -m pip install -r sidecar/requirements-data.txt）
                </span>
              ) : null}
              {s.id === 'python-runtime' ? (
                <span className="ml-1 text-[#4d5364]">（需 Python 3.11+；本机 3.8 不满足 AkShare / edgartools / ccxt 要求）</span>
              ) : null}
              {s.id === 'tushare' ? (
                <span className="ml-1 text-[#4d5364]">（A 股财务、两融、龙虎榜显示「缺」；在设置中填入 Tushare Token 后启用）</span>
              ) : null}
              {s.id === 'fmp' ? (
                <span className="ml-1 text-[#4d5364]">（高价值美股标的自动回落 Yahoo；402/429 不重试）</span>
              ) : null}
              {s.id === 'edgar' || s.id === 'ccxt' || s.id === 'akshare' || s.id === 'baostock' ? (
                <span className="ml-1 text-[#4d5364]">（对应侧车方法按库显示「缺」，可在「全景 → 缺口看板」查看影响面）</span>
              ) : null}
              {s.id === 'strategy-runner' ? (
                <span className="ml-1 text-[#4d5364]">（本地回测未就绪；绩效公式区仍可查看口径）</span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
