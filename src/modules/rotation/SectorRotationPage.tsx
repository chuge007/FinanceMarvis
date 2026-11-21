import React, { useEffect } from 'react';
import { useSectorRotationStore } from '../../stores/useSectorRotationStore';
import { DemoBanner } from '../../shared/components/DemoBanner';

const SectorHeatmap: React.FC = () => {
  const currentRotation = useSectorRotationStore(state => state.currentRotation);
  
  if (!currentRotation) return null;

  const getHeatColor = (change: number) => {
    if (change > 3) return 'bg-red-600';
    if (change > 1) return 'bg-red-400';
    if (change > 0) return 'bg-red-200';
    if (change > -1) return 'bg-green-200';
    if (change > -3) return 'bg-green-400';
    return 'bg-green-600';
  };

  const sortedSectors = [...currentRotation.sectors].sort((a, b) => b.change - a.change);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">板块涨跌幅热力图</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {sortedSectors.map(sector => (
          <div
            key={sector.code}
            className={`${getHeatColor(sector.change)} p-4 rounded-lg text-white transition-all hover:scale-105 cursor-pointer`}
          >
            <div className="font-medium text-sm">{sector.name}</div>
            <div className="text-2xl font-bold mt-1">
              {sector.change >= 0 ? '+' : ''}{sector.change.toFixed(2)}%
            </div>
            <div className="text-xs mt-1 opacity-80">
              成交量 {sector.volumeChange >= 0 ? '+' : ''}{sector.volumeChange.toFixed(1)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const SectorRotationClock: React.FC = () => {
  const currentRotation = useSectorRotationStore(state => state.currentRotation);
  
  if (!currentRotation) return null;

  const getQuadrantPosition = (sector: any) => {
    // X轴：相对强度（涨跌幅）
    // Y轴：动量（成交量变化）
    const x = sector.change * 10; // 缩放到合适范围
    const y = sector.volumeChange / 2;
    
    return { x, y };
  };

  const getPhaseLabel = (phase: string) => {
    const labels = {
      leading: '领先',
      strengthening: '走强',
      weakening: '走弱',
      lagging: '落后',
    };
    return labels[phase as keyof typeof labels] || phase;
  };

  const getPhaseColor = (phase: string) => {
    const colors = {
      leading: 'text-green-600',
      strengthening: 'text-blue-600',
      weakening: 'text-orange-600',
      lagging: 'text-red-600',
    };
    return colors[phase as keyof typeof colors] || 'text-gray-600';
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">板块轮动时钟</h3>
      
      {/* 四象限说明 */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-green-50 dark:bg-green-900 p-3 rounded-lg">
          <div className="font-medium text-green-700 dark:text-green-300">领先（Leading）</div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            高涨幅 + 高成交量<br/>
            ▶ 建议：持有或加仓
          </div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900 p-3 rounded-lg">
          <div className="font-medium text-blue-700 dark:text-blue-300">走强（Strengthening）</div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            高涨幅 + 低成交量<br/>
            ▶ 建议：关注买入机会
          </div>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900 p-3 rounded-lg">
          <div className="font-medium text-orange-700 dark:text-orange-300">走弱（Weakening）</div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            低涨幅 + 高成交量<br/>
            ▶ 建议：减仓或观望
          </div>
        </div>
        <div className="bg-red-50 dark:bg-red-900 p-3 rounded-lg">
          <div className="font-medium text-red-700 dark:text-red-300">落后（Lagging）</div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            低涨幅 + 低成交量<br/>
            ▶ 建议：规避或轻仓
          </div>
        </div>
      </div>

      {/* 板块列表 */}
      <div className="space-y-2">
        {currentRotation.sectors.map(sector => (
          <div key={sector.code} className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded">
            <div className="flex items-center gap-3">
              <div className={`px-2 py-1 text-xs rounded ${getPhaseColor(sector.phase)} bg-gray-100 dark:bg-gray-700`}>
                {getPhaseLabel(sector.phase)}
              </div>
              <span className="font-medium">{sector.name}</span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className={sector.change >= 0 ? 'text-green-600' : 'text-red-600'}>
                {sector.change >= 0 ? '+' : ''}{sector.change.toFixed(2)}%
              </span>
              <span className="text-gray-500">
                量 {sector.volumeChange >= 0 ? '+' : ''}{sector.volumeChange.toFixed(1)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const MoneyFlowTable: React.FC = () => {
  const currentRotation = useSectorRotationStore(state => state.currentRotation);
  
  if (!currentRotation) return null;

  const sortedByFlow = [...currentRotation.sectors].sort((a, b) => b.mainInflow - a.mainInflow);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div className="p-4 border-b dark:border-gray-700">
        <h3 className="text-lg font-semibold">主力资金流向</h3>
      </div>
      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-gray-700">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">板块</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">涨跌幅</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">换手率</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">主力净流入</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">龙头股</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {sortedByFlow.map(sector => (
            <tr key={sector.code} className="hover:bg-gray-50 dark:hover:bg-gray-700">
              <td className="px-4 py-3">
                <div className="font-medium">{sector.name}</div>
                <div className="text-xs text-gray-500">热度: {sector.hotness}</div>
              </td>
              <td className={`px-4 py-3 text-right font-medium ${
                sector.change >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {sector.change >= 0 ? '+' : ''}{sector.change.toFixed(2)}%
              </td>
              <td className="px-4 py-3 text-right text-sm">{sector.turnover.toFixed(2)}%</td>
              <td className={`px-4 py-3 text-right font-medium ${
                sector.mainInflow >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {sector.mainInflow >= 0 ? '+' : ''}{sector.mainInflow.toFixed(2)}亿
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {sector.leadingStocks.slice(0, 3).map((stock, idx) => (
                    <span key={idx} className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                      {stock}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const SectorRotationPage: React.FC = () => {
  const fetchRotationData = useSectorRotationStore(state => state.fetchRotationData);
  const loading = useSectorRotationStore(state => state.loading);
  const currentRotation = useSectorRotationStore(state => state.currentRotation);

  useEffect(() => {
    fetchRotationData();
    // 每5分钟刷新一次
    const interval = setInterval(fetchRotationData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchRotationData]);

  return (
    <div className="p-6 space-y-6">
      <DemoBanner title="本页全部为写死的演示数据，不是实时资金流">
        「实时追踪资金流向」的表述已删除。板块涨跌、主力净流入、热度评分、轮动阶段均为界面示例，
        不可用于判断行业强弱。真实板块资金流请看「资金流」页（A 股部分来自东方财富接口）。
      </DemoBanner>

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">板块轮动分析</h1>
          <p className="text-sm text-gray-500 mt-1">演示数据 · 仅用于展示分析框架，不构成行业判断</p>
        </div>
        <button
          onClick={fetchRotationData}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? '刷新中...' : '刷新数据'}
        </button>
      </div>

      {loading && !currentRotation ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <div className="mt-2 text-gray-600">加载中...</div>
        </div>
      ) : currentRotation ? (
        <>
          <SectorHeatmap />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectorRotationClock />
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">轮动信号</h3>
              {currentRotation.rotationSignals.length > 0 ? (
                <div className="space-y-3">
                  {currentRotation.rotationSignals.map((signal, idx) => (
                    <div key={idx} className="p-3 bg-blue-50 dark:bg-blue-900 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="text-red-600 font-medium">{signal.from}</span>
                        <span className="text-gray-500">→</span>
                        <span className="text-green-600 font-medium">{signal.to}</span>
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        信号强度: {(signal.strength * 100).toFixed(0)}%
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500 text-sm">暂无明显轮动信号</div>
              )}

              <div className="mt-6">
                <h4 className="font-medium mb-2">当前热门板块</h4>
                <div className="flex flex-wrap gap-2">
                  {currentRotation.hotSectors.map((sector, idx) => (
                    <span key={idx} className="px-3 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full text-sm">
                      🔥 {sector}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <h4 className="font-medium mb-2">冷门板块</h4>
                <div className="flex flex-wrap gap-2">
                  {currentRotation.coldSectors.map((sector, idx) => (
                    <span key={idx} className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full text-sm">
                      ❄️ {sector}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <MoneyFlowTable />
        </>
      ) : null}
    </div>
  );
};
