import { memo, useEffect, useState } from 'react';
import { useAlertStore, type AlertCondition } from '../../../stores/useAlertStore';

const CONDITIONS: { value: AlertCondition; label: string; unit: string }[] = [
  { value: 'price_above', label: '价格突破', unit: '元' },
  { value: 'price_below', label: '价格跌破', unit: '元' },
  { value: 'change_above', label: '涨幅超过', unit: '%' },
  { value: 'change_below', label: '跌幅超过', unit: '%' },
  { value: 'rsi_overbought', label: 'RSI 超买', unit: '' },
  { value: 'rsi_oversold', label: 'RSI 超卖', unit: '' },
];

const fieldCls =
  'w-full rounded border border-[#1a1d26] bg-[#090b0f] px-2 py-1.5 text-[0.6875rem] text-[#d8dce6] outline-none focus:border-[#4078ff]';

export const ObservationList = memo(function ObservationList() {
  const { alerts, loading, loadAlerts, addAlert, removeAlert, toggleAlert } = useAlertStore();
  const [symbol, setSymbol] = useState('');
  const [condition, setCondition] = useState<AlertCondition>('price_above');
  const [target, setTarget] = useState('');

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  const unit = CONDITIONS.find((c) => c.value === condition)?.unit ?? '';

  const submit = async () => {
    const value = Number(target);
    if (!symbol.trim() || !Number.isFinite(value)) return;
    await addAlert({
      symbol: symbol.trim().toUpperCase(),
      name: symbol.trim().toUpperCase(),
      condition,
      targetValue: value,
      message: '',
      enabled: true,
      notifySound: true,
      notifyDesktop: true,
    });
    setSymbol('');
    setTarget('');
  };

  return (
    <div className="space-y-3">
      <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[0.75rem] font-bold text-[#d8dce6]">观察清单</h3>
          <span className="text-[0.5625rem] text-[#4d5364]">
            目前支持价格/涨跌幅/RSI；信用-波动背离等条件式提醒下一步接入
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <label className="block">
            <span className="mb-1 block text-[0.5625rem] text-[#636878]">代码 / 名称</span>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="例如 AAPL / 600519" className={fieldCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.5625rem] text-[#636878]">条件</span>
            <select value={condition} onChange={(e) => setCondition(e.target.value as AlertCondition)} className={fieldCls}>
              {CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.5625rem] text-[#636878]">阈值 {unit && `(${unit})`}</span>
            <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="数值" className={fieldCls} />
          </label>
          <div className="flex items-end">
            <button onClick={() => void submit()} className="rounded bg-[#4078ff] px-3 py-1.5 text-[0.6563rem] text-white hover:brightness-110">
              加入观察
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[0.75rem] font-bold text-[#d8dce6]">当前清单</h3>
          <span className="text-[0.5625rem] text-[#4d5364]">{alerts.length} 条 · 只存本机</span>
        </div>

        {alerts.length === 0 ? (
          <div className="flex h-24 flex-col items-center justify-center gap-1 text-center">
            <div className="text-[0.6875rem] text-[#b0b5c0]">{loading ? '正在读取…' : '还没有观察项'}</div>
            <div className="text-[0.5938rem] text-[#636878]">把“想盯但不想买”的标的放进来，触发时再看，不在盘中临时起意。</div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {alerts.map((a) => {
              const meta = CONDITIONS.find((c) => c.value === a.condition);
              return (
                <div key={a.id} className="flex flex-wrap items-center gap-2 rounded border border-[#1a1d26] bg-[rgba(255,255,255,0.015)] px-2.5 py-2">
                  <span className="w-[5.25rem] shrink-0 text-[0.6875rem] text-[#d8dce6]">{a.symbol}</span>
                  <span className="text-[0.5938rem] text-[#8a8f9d]">{meta?.label ?? a.condition}</span>
                  <span className="font-mono text-[0.625rem] text-[#f59e4b] tabular-nums">
                    {a.targetValue}{meta?.unit}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[0.5313rem] ${a.enabled ? 'bg-[rgba(12,166,120,0.12)] text-[#0ca678]' : 'bg-[rgba(255,255,255,0.04)] text-[#636878]'}`}>
                    {a.enabled ? '启用' : '停用'}
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    <button onClick={() => void toggleAlert(a.id)} className="rounded border border-[#1a1d26] px-2 py-0.5 text-[0.5625rem] text-[#8a8f9d] hover:text-[#d8dce6]">
                      {a.enabled ? '停用' : '启用'}
                    </button>
                    <button onClick={() => void removeAlert(a.id)} className="rounded border border-[#1a1d26] px-2 py-0.5 text-[0.5625rem] text-[#f04452] hover:bg-[rgba(240,68,82,0.06)]">
                      删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});
