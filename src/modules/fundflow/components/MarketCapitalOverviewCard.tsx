import { memo } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { useMarketCapitalOverview } from '../hooks/useSectorFlow';
import { useAppStore } from '../../../stores/useAppStore';

function fmt(v: number | undefined, digits = 0): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '--';
  return v.toFixed(digits);
}

function FlowKpi({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <div className="rounded-md bg-[#14161d] px-2 py-1.5">
      <div className="text-[0.625rem] text-[#636878]">{label}</div>
      <div className="text-[0.8125rem] font-bold font-mono leading-tight" style={{ color }}>{value}<span className="text-[0.625rem] font-normal text-[#636878] ml-0.5">{unit}</span></div>
    </div>
  );
}

function strengthInfo(totalMain: number, mainRatio: number): { label: string; color: string; pct: number } {
  // 力度：综合主力净额与净占比
  const ratio = Math.min(1, Math.abs(totalMain) / 1500) * 0.6 + Math.min(1, Math.abs(mainRatio) / 50) * 0.4;
  const strength = ratio * 100;
  if (totalMain > 500) return { label: '强流入', color: '#f04452', pct: strength };
  if (totalMain > 80) return { label: '流入', color: '#ff9f9f', pct: strength };
  if (totalMain > -80) return { label: '平衡', color: '#9aa0ad', pct: strength };
  if (totalMain > -500) return { label: '流出', color: '#7cc9a8', pct: strength };
  return { label: '强流出', color: '#0ca678', pct: strength };
}

function badgeOf(source: string): string {
  if (source === 'eastmoney') return '东财 · 真实数据';
  if (source === 'tencent') return '腾讯 · 真实数据';
  if (source === 'sina') return '新浪 · 真实数据';
  return '美股 · 模型估算';
}

function sourceNoteOf(source: string): string {
  if (source === 'eastmoney') return '数据源: 东方财富 板块资金流（主力/超大/大/中/小单）+ 涨跌家数';
  if (source === 'tencent') return '数据源: 腾讯行业榜（主力净流入 + 5/20/60 日涨跌）；东财不可达时启用';
  if (source === 'sina') return '数据源: 新浪板块（仅当日涨跌）；东财/腾讯不可达时启用';
  return '数据源: 模型估算（美股无北向资金披露）';
}

export const MarketCapitalOverviewCard = memo(function MarketCapitalOverviewCard() {
  const { data, loading } = useMarketCapitalOverview();
  const market = useAppStore((s) => s.market);
  const isCN = market === 'CN';

  if (!data) {
    return <Panel title="全市场资金全景" badge={isCN ? '真实板块 · 等待数据' : '美股模型'}>
      <div className="py-6 text-center text-[0.625rem] text-[#636878]">{loading ? '加载中...' : '暂无数据'}</div>
    </Panel>;
  }

  const mainColor = data.totalMain >= 0 ? '#f04452' : '#0ca678';
  const st = strengthInfo(data.totalMain, data.mainRatio);
  const sectorUp = data.sectorUp ?? 0;
  const sectorDown = data.sectorDown ?? 0;
  const sectorCount = sectorUp + sectorDown + (data.breadthBasis === 'sector' ? data.flatCount : 0);

  const kpis: Array<[string, string, string, string]> = isCN
    ? data.source === 'eastmoney'
      ? [
          ['主力净流入', fmt(data.totalMain), '亿', mainColor],
          ['超大单', data.superLarge >= 0 ? '+' + fmt(data.superLarge) : fmt(data.superLarge), '亿', data.superLarge >= 0 ? '#f04452' : '#0ca678'],
          ['大单', data.large >= 0 ? '+' + fmt(data.large) : fmt(data.large), '亿', data.large >= 0 ? '#f04452' : '#0ca678'],
          ['中单', data.medium >= 0 ? '+' + fmt(data.medium) : fmt(data.medium), '亿', data.medium >= 0 ? '#f59e4b' : '#0ca678'],
          ['小单', data.small >= 0 ? '+' + fmt(data.small) : fmt(data.small), '亿', data.small >= 0 ? '#f59e4b' : '#0ca678'],
          ['成交额', fmt(data.totalAmount), '亿', '#4078ff'],
          ['主力净占比', fmt(data.mainRatio, 2), '%', '#4078ff'],
        ]
      : data.source === 'tencent'
        ? [
            ['主力净流入', fmt(data.totalMain), '亿', mainColor],
            ['板块上涨', String(sectorUp), '个', '#f04452'],
            ['板块下跌', String(sectorDown), '个', '#0ca678'],
            ['覆盖行业', String(sectorCount || sectorUp + sectorDown), '个', '#4078ff'],
          ]
        : [
            ['板块上涨', String(sectorUp), '个', '#f04452'],
            ['板块下跌', String(sectorDown), '个', '#0ca678'],
            ['覆盖板块', String(sectorUp + sectorDown), '个', '#4078ff'],
          ]
    : [
        ['资金净流向', fmt(data.totalMain), 'M', mainColor],
        ['机构净流', data.large >= 0 ? '+' + fmt(data.large) : fmt(data.large), 'M', data.large >= 0 ? '#f04452' : '#0ca678'],
        ['散户净流', data.small >= 0 ? '+' + fmt(data.small) : fmt(data.small), 'M', data.small >= 0 ? '#f59e4b' : '#0ca678'],
      ];

  return (
    <Panel title="全市场资金全景" badge={badgeOf(data.source)}>
      <div className="grid grid-cols-4 gap-1.5">
        {kpis.map(([label, value, unit, color]) => (
          <FlowKpi key={label} label={label} value={value} unit={unit} color={color} />
        ))}
      </div>

      {/* 趋势与力度：腾讯有主力净额；新浪只有价格口径，不显示假的资金力度 */}
      {data.source !== 'sina' && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[0.625rem] text-[#636878] shrink-0">资金力度</span>
          <div className="flex-1 h-[0.5rem] bg-[#1a1d26] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(4, st.pct))}%`, backgroundColor: st.color }}
            />
          </div>
          <span className="text-[0.6563rem] font-medium shrink-0" style={{ color: st.color }}>{st.label}</span>
          {data.source === 'eastmoney' && (
            <span className="text-[0.625rem] text-[#636878] shrink-0">主力占比 {fmt(data.mainRatio, 2)}%</span>
          )}
        </div>
      )}

      {/* 股票家数（东财）与板块宽度（腾讯/新浪）分开标注，避免把板块数当股票家数 */}
      {isCN && data.breadthBasis !== 'sector' && data.upCount + data.downCount > 0 && (
        <div className="mt-2 flex items-center gap-2 text-[0.6563rem]">
          <span className="text-[#636878]">市场宽度</span>
          <span className="text-[#f04452]">上涨 {data.upCount}</span>
          <span className="text-[#0ca678]">下跌 {data.downCount}</span>
          <span className="text-[#9aa0ad]">平盘 {data.flatCount}</span>
          <div className="flex-1 flex h-[0.375rem] rounded-full overflow-hidden bg-[#14161d]">
            <div className="bg-[#f04452]" style={{ width: `${data.upCount + data.downCount > 0 ? (data.upCount / (data.upCount + data.downCount)) * 100 : 0}%` }} />
            <div className="bg-[#0ca678]" style={{ flex: 1 }} />
          </div>
        </div>
      )}

      {isCN && data.breadthBasis === 'sector' && sectorUp + sectorDown > 0 && (
        <div className="mt-2 flex items-center gap-2 text-[0.6563rem]">
          <span className="text-[#636878]">板块宽度</span>
          <span className="text-[#f04452]">上涨 {sectorUp}</span>
          <span className="text-[#0ca678]">下跌 {sectorDown}</span>
          <div className="flex-1 flex h-[0.375rem] rounded-full overflow-hidden bg-[#14161d]">
            <div className="bg-[#f04452]" style={{ width: `${(sectorUp / (sectorUp + sectorDown)) * 100}%` }} />
            <div className="bg-[#0ca678]" style={{ flex: 1 }} />
          </div>
          <span className="text-[#4d5364] shrink-0">板块口径，不是股票家数</span>
        </div>
      )}

      <p className="mt-2 text-[0.6875rem] leading-relaxed text-[#b0b5c0]">{data.reading}</p>
      <div className="text-[0.625rem] text-[#636878] mt-1">{sourceNoteOf(data.source)}</div>
    </Panel>
  );
});
