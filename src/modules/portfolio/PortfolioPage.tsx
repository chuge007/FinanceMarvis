import React, { useEffect, useState } from 'react';
import { usePortfolioStore } from '../../stores/usePortfolioStore';
import { useAppStore } from '../../stores/useAppStore';

const PortfolioSummaryCards: React.FC = () => {
  const summary = usePortfolioStore(state => state.summary);

  const cards = [
    {
      label: '总资产',
      value: `¥${summary.totalAssets.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      trend: summary.totalPnL >= 0 ? '+' : '',
      trendValue: `${summary.totalPnL.toFixed(2)} (${summary.totalPnLPercent.toFixed(2)}%)`,
      color: summary.totalPnL >= 0 ? 'text-green-500' : 'text-red-500',
    },
    {
      label: '持仓市值',
      value: `¥${summary.totalValue.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`,
      subValue: `成本 ¥${summary.totalCost.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`,
      color: 'text-blue-500',
    },
    {
      label: '可用现金',
      value: `¥${summary.cash.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`,
      subValue: `占比 ${((summary.cash / summary.totalAssets) * 100).toFixed(1)}%`,
      color: 'text-gray-600',
    },
    {
      label: '持仓数量',
      value: summary.positionCount.toString(),
      subValue: `胜率 ${summary.winRate.toFixed(1)}%`,
      color: 'text-purple-500',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card, idx) => (
        <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">{card.label}</div>
          <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
          {card.trend && (
            <div className={`text-sm mt-1 ${card.color}`}>
              {card.trend}{card.trendValue}
            </div>
          )}
          {card.subValue && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{card.subValue}</div>
          )}
        </div>
      ))}
    </div>
  );
};

const PositionTable: React.FC = () => {
  const positions = usePortfolioStore(state => state.positions);
  const removePosition = usePortfolioStore(state => state.removePosition);

  if (positions.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-center">
        <div className="text-gray-400 text-lg">暂无持仓</div>
        <div className="text-sm text-gray-500 mt-2">点击右上角"添加持仓"开始记录</div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">代码/名称</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">持仓</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">成本价</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">现价</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">市值</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">盈亏</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">权重</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {positions.map(pos => (
              <tr key={pos.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900 dark:text-white">{pos.symbol}</div>
                  <div className="text-xs text-gray-500">{pos.name}</div>
                </td>
                <td className="px-4 py-3 text-right text-sm">{pos.quantity.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-sm">¥{pos.avgCost.toFixed(2)}</td>
                <td className="px-4 py-3 text-right text-sm font-medium">¥{pos.currentPrice.toFixed(2)}</td>
                <td className="px-4 py-3 text-right text-sm">¥{pos.marketValue.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</td>
                <td className={`px-4 py-3 text-right text-sm font-medium ${pos.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {pos.pnl >= 0 ? '+' : ''}{pos.pnl.toFixed(2)}
                  <div className="text-xs">({pos.pnlPercent >= 0 ? '+' : ''}{pos.pnlPercent.toFixed(2)}%)</div>
                </td>
                <td className="px-4 py-3 text-right text-sm">{pos.weight.toFixed(1)}%</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => removePosition(pos.id)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const PortfolioPage: React.FC = () => {
  const loadPositions = usePortfolioStore(state => state.loadPositions);
  const loadTrades = usePortfolioStore(state => state.loadTrades);
  const addPosition = usePortfolioStore(state => state.addPosition);
  const loading = usePortfolioStore(state => state.loading);
  const market = useAppStore(state => state.market);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ symbol: '', name: '', quantity: '', avgCost: '', currentPrice: '' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPositions();
    loadTrades();
  }, [loadPositions, loadTrades]);

  const field = (key: keyof typeof form, label: string, placeholder: string) => (
    <label className="block">
      <span className="text-xs text-gray-500">{label}</span>
      <input
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="mt-1 w-full px-2 py-1.5 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
      />
    </label>
  );

  const submit = async () => {
    const qty = Number(form.quantity);
    const cost = Number(form.avgCost);
    const rawPrice = form.currentPrice.trim() === '' ? cost : Number(form.currentPrice);
    if (!form.symbol.trim() || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(cost) || cost <= 0) {
      setError('请填写有效的代码、数量与成本价（数量与价格需大于 0）。');
      return;
    }
    await addPosition({
      symbol: form.symbol.trim().toUpperCase(),
      name: form.name.trim() || form.symbol.trim().toUpperCase(),
      quantity: qty,
      avgCost: cost,
      currentPrice: Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : cost,
      market,
    });
    setForm({ symbol: '', name: '', quantity: '', avgCost: '', currentPrice: '' });
    setError(null);
    setShowAdd(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">持仓跟踪</h1>
          <p className="text-sm text-gray-500 mt-1">手动记账，数据只存本机浏览器；不会自动同步券商</p>
        </div>
        <button
          onClick={() => { setShowAdd((v) => !v); setError(null); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {showAdd ? '收起' : '+ 添加持仓'}
        </button>
      </div>

      {showAdd && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {field('symbol', '代码', '600519')}
            {field('name', '名称（可选）', '贵州茅台')}
            {field('quantity', '数量', '100')}
            {field('avgCost', '成本价', '1800')}
            {field('currentPrice', '现价（可留空）', '')}
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="flex items-center gap-2">
            <button onClick={() => void submit()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              保存持仓
            </button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 border rounded-lg dark:border-gray-600">
              取消
            </button>
            <span className="text-xs text-gray-500">
              现价留空则按成本价计；当前市价对应「{market === 'US' ? '美股' : 'A股'}」。
            </span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <div className="mt-2 text-gray-600">加载中...</div>
        </div>
      ) : (
        <>
          <PortfolioSummaryCards />
          <PositionTable />
        </>
      )}
    </div>
  );
};
