import { memo, useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import { sankey as d3Sankey, sankeyLinkHorizontal } from 'd3-sankey';
import { Panel } from '../../../shared/components/Panel';
import { useSectorFlow } from '../hooks/useSectorFlow';
import { useFundFlowOverview } from '../hooks/useSectorFlow';
import { useMoneyFlow } from '../hooks/useSectorFlow';
import { getMarketState } from '../../../shared/utils/marketHours';
import { useAppStore } from '../../../stores/useAppStore';

interface SankeyNode { name: string; category: string }
interface SankeyLink { source: number; target: number; value: number }

export const SankeyFlowChart = memo(function SankeyFlowChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const market = useAppStore((s) => s.market);
  const isCN = market === 'CN';
  const { data: sectors } = useSectorFlow();
  const { data: overview } = useFundFlowOverview();
  const { data: moneyFlow } = useMoneyFlow();
  const [hoveredReason, setHoveredReason] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || sectors.length === 0) return;

    const width = container.clientWidth || 700;
    const height = 380;
    container.innerHTML = '';

    const marketState = getMarketState();
    // ─── 扇区抽稀：东财源最多拉 100 个板块，全量入图会让中间标签堆成「文字墙」。
    //      只保留净流入 Top8 + 净流出 Top6 的重点板块，兼顾信息量与可读性。 ───
    const sortedSectors = [...sectors].sort((a, b) => Math.abs(b.netFlow) - Math.abs(a.netFlow));
    const inflowSectors = sortedSectors.filter(s => s.netFlow > 1).slice(0, 8);
    const outflowSectors = sortedSectors.filter(s => s.netFlow <= 1).slice(0, 6);
    const shownCount = inflowSectors.length + outflowSectors.length;

    // ─── 按市场区分资金来源 ───
    const sourceNames = isCN
      ? ['主力资金', '散户资金']
      : ['对冲基金', '机构资金', '散户资金'];

    const nodes: SankeyNode[] = [
      ...sourceNames.map(name => ({ name, category: 'source' })),
      ...inflowSectors.map(s => ({ name: s.name, category: 'sector' })),
      ...outflowSectors.map(s => ({ name: s.name, category: 'sector' })),
      { name: '净流入', category: 'outcome' },
      { name: '净流出', category: 'outcome' },
    ];

    const nodeIndex: Record<string, number> = {};
    nodes.forEach((n, i) => { nodeIndex[n.name] = i; });

    const links: SankeyLink[] = [];
    const inflowIdx = nodeIndex['净流入'];
    const outflowIdx = nodeIndex['净流出'];

    if (isCN) {
      // CN 真实数据：主力资金 + 散户资金 → 板块 → 流入/流出
      const mainIdx = nodeIndex['主力资金'];
      const retailIdx = nodeIndex['散户资金'];
      const totalIn = inflowSectors.reduce((a, b) => a + Math.max(b.netFlow, 0), 0);
      const totalOut = outflowSectors.reduce((a, b) => a + Math.max(-b.netFlow, 0), 0);
      const mainAmt = Math.abs(overview?.institutionalFlow ?? 500);
      const retailAmt = Math.abs(overview?.retailFlow ?? 150);
      inflowSectors.forEach(s => {
        const share = totalIn > 0 ? Math.max(s.netFlow, 0) / totalIn : 1 / inflowSectors.length;
        links.push({ source: mainIdx, target: nodeIndex[s.name], value: Math.max(1, Math.round(mainAmt * share * 0.6)) });
        links.push({ source: retailIdx, target: nodeIndex[s.name], value: Math.max(1, Math.round(retailAmt * share * 0.9)) });
      });
      outflowSectors.forEach(s => {
        const share = totalOut > 0 ? Math.max(-s.netFlow, 0) / totalOut : 1 / outflowSectors.length;
        links.push({ source: mainIdx, target: nodeIndex[s.name], value: Math.max(1, Math.round(mainAmt * share * 0.4)) });
      });
      inflowSectors.forEach(s => links.push({ source: nodeIndex[s.name], target: inflowIdx, value: Math.max(1, Math.round(Math.abs(s.netFlow))) }));
      outflowSectors.forEach(s => links.push({ source: nodeIndex[s.name], target: outflowIdx, value: Math.max(1, Math.round(Math.abs(s.netFlow))) }));
    } else {
      // US 模型：对冲基金 + 机构 + 散户 → 板块 → 流入/流出
      const src0Idx = nodeIndex[sourceNames[0]];
      const instIdx = nodeIndex[sourceNames[1]];
      const retailIdx = nodeIndex[sourceNames[2]];
      const src0Total = Math.abs(overview?.institutionalFlow ?? 500) * 0.4;
      inflowSectors.forEach(s => {
        const share = s.netFlow / inflowSectors.reduce((a, b) => a + Math.max(b.netFlow, 1), 0.01);
        links.push({ source: src0Idx, target: nodeIndex[s.name], value: Math.round(Math.max(1, src0Total * share * 0.6)) });
      });
      outflowSectors.forEach(s => {
        const share = Math.abs(s.netFlow) / outflowSectors.reduce((a, b) => a + Math.max(Math.abs(b.netFlow), 1), 0.01);
        links.push({ source: src0Idx, target: nodeIndex[s.name], value: Math.round(Math.max(1, Math.abs(src0Total) * 0.4 * share)) });
      });
      const instTotal = Math.abs(overview?.institutionalFlow ?? 500) * 0.6;
      inflowSectors.forEach(s => {
        const share = s.netFlow / inflowSectors.reduce((a, b) => a + Math.max(b.netFlow, 1), 0.01);
        links.push({ source: instIdx, target: nodeIndex[s.name], value: Math.round(Math.max(1, instTotal * 0.5 * share)) });
      });
      outflowSectors.forEach(s => {
        const share = Math.abs(s.netFlow) / outflowSectors.reduce((a, b) => a + Math.max(Math.abs(b.netFlow), 1), 0.01);
        links.push({ source: instIdx, target: nodeIndex[s.name], value: Math.round(Math.max(1, instTotal * 0.5 * share)) });
      });
      const retailTotal = Math.abs(overview?.retailFlow ?? 200);
      inflowSectors.forEach(s => {
        const share = s.netFlow / inflowSectors.reduce((a, b) => a + Math.max(b.netFlow, 1), 0.01);
        links.push({ source: retailIdx, target: nodeIndex[s.name], value: Math.round(Math.max(1, retailTotal * 0.5 * share)) });
      });
      outflowSectors.forEach(s => {
        const share = Math.abs(s.netFlow) / outflowSectors.reduce((a, b) => a + Math.max(Math.abs(b.netFlow), 1), 0.01);
        links.push({ source: retailIdx, target: nodeIndex[s.name], value: Math.round(Math.max(1, retailTotal * 0.5 * share)) });
      });
      inflowSectors.forEach(s => links.push({ source: nodeIndex[s.name], target: inflowIdx, value: Math.round(Math.abs(s.netFlow)) }));
      outflowSectors.forEach(s => links.push({ source: nodeIndex[s.name], target: outflowIdx, value: Math.round(Math.abs(s.netFlow)) }));
    }

    const validLinks = links.filter(l => l.value > 0);

    // ─── 颜色映射 ───
    const sourceColors: Record<string, string> = {
      '主力资金': '#4078ff',
      '对冲基金': '#f04452',
      '机构资金': '#4078ff',
      '散户资金': '#f59e4b',
      '净流入': '#f04452',
      '净流出': '#0ca678',
    };

    // ─── 绘制 Sankey ───
    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`);

    const sankeyGenerator = d3Sankey()
      .nodeWidth(18)
      .nodePadding(8)
      .extent([[1, 28], [width - 1, height - 28]])
      .iterations(64);

    const { nodes: sankeyNodes, links: sankeyLinks } = sankeyGenerator({
      nodes: nodes.map(d => ({ ...d })) as any,
      links: validLinks.map(d => ({ ...d })) as any,
    });

    // 绘制连线
    const linkG = svg.append('g')
      .attr('fill', 'none')
      .attr('stroke-opacity', 0.35);

    linkG.selectAll('path')
      .data(sankeyLinks)
      .join('path')
      .attr('d', sankeyLinkHorizontal())
      .attr('stroke', (d: any) => {
        const srcNode: any = d.source;
        const tgtNode: any = d.target;
        if (sourceColors[srcNode.name]) return sourceColors[srcNode.name];
        if (sourceColors[tgtNode.name]) return sourceColors[tgtNode.name];
        return '#636878';
      })
      .attr('stroke-width', (d: any) => Math.max(1, d.width))
      .on('mouseover', function (_, d: any) {
        d3.select(this).attr('stroke-opacity', 0.7);
        const src: any = d.source;
        const tgt: any = d.target;
        const flowDir = tgt.name === '净流入' ? '→流入' : tgt.name === '净流出' ? '→流出' : '';
        const fromLabel = sourceNames.includes(src.name) ? src.name : '';
        const unit = isCN ? '亿' : 'M';
        setHoveredReason(fromLabel
          ? `${fromLabel} ${flowDir ? flowDir : ''} ${tgt.name}: ${d.value}${unit}`
          : `${src.name} → ${tgt.name}: ${d.value}${unit}`);
      })
      .on('mouseout', function () {
        d3.select(this).attr('stroke-opacity', 0.35);
        setHoveredReason(null);
      });

    // 绘制节点
    const nodeG = svg.append('g');

    nodeG.selectAll('rect')
      .data(sankeyNodes)
      .join('rect')
      .attr('x', (d: any) => d.x0)
      .attr('y', (d: any) => d.y0)
      .attr('width', (d: any) => d.x1 - d.x0)
      .attr('height', (d: any) => Math.max(1, d.y1 - d.y0))
      .attr('fill', (d: any) => {
        if (sourceColors[d.name]) return sourceColors[d.name];
        const sec = sectors.find(s => s.name === d.name);
        return sec?.color ?? '#636878';
      })
      .attr('stroke', '#0f1118')
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.92);

    // 节点标签：加大字号 + 深色描边（保证文字压在连线上仍可读）
    nodeG.selectAll('text')
      .data(sankeyNodes)
      .join('text')
      .attr('x', (d: any) => d.x0 < width / 2 ? d.x1 + 7 : d.x0 - 7)
      .attr('y', (d: any) => (d.y0 + d.y1) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', (d: any) => d.x0 < width / 2 ? 'start' : 'end')
      .attr('fill', '#e6e9f2')
      .style('font-size', '10.5px')
      .style('font-weight', '600')
      .style('paint-order', 'stroke')
      .style('stroke', '#0f1118')
      .style('stroke-width', '3px')
      .style('stroke-linejoin', 'round')
      .text((d: any) => d.name);

    // ─── 归因分析区（总额/TOP 用全量板块口径，不因图上抽稀而失真） ───
    const totalInflow = sectors.filter(s => s.netFlow > 0).reduce((s, sec) => s + sec.netFlow, 0);
    const totalOutflow = Math.abs(sectors.filter(s => s.netFlow <= 0).reduce((s, sec) => s + sec.netFlow, 0));
    const netFlow = totalInflow - totalOutflow;
    const topInflow = [...sectors].filter(s => s.netFlow > 0).sort((a, b) => b.netFlow - a.netFlow).slice(0, 3);
    const topOutflow = [...sectors].filter(s => s.netFlow <= 0).sort((a, b) => a.netFlow - b.netFlow).slice(0, 3);

    const trendReading = moneyFlow?.reading ?? overview?.reading ?? '数据加载中';
    const unitLabel = isCN ? '亿' : 'M';

    const attributionDiv = document.createElement('div');
    attributionDiv.className = 'mt-3 space-y-1.5 text-[11px]';
    attributionDiv.innerHTML = `
      <div class="flex items-center gap-2 flex-wrap">
        <span class="font-medium ${netFlow > 0 ? 'text-[#f04452]' : 'text-[#0ca678]'}">
          ${netFlow > 0 ? '净流入' : '净流出'} ${Math.abs(Math.round(netFlow))}${unitLabel}
        </span>
        ${!marketState.isOpen ? '<span class="bg-[#636878] text-[#0f1118] px-1 rounded text-[10.5px]">闭市</span>' : ''}
        <span class="text-[#636878] text-[10.5px]">图上展示重点板块 ${shownCount}/${sectors.length}</span>
      </div>
      <div class="text-[#636878] leading-relaxed">${trendReading}</div>
      ${topInflow.length > 0 ? `<div class="text-[#f04452]">流入 Top: ${topInflow.map(s => s.name + '(+' + s.pctChg.toFixed(2) + '%)').join(' | ')}</div>` : ''}
      ${topOutflow.length > 0 ? `<div class="text-[#0ca678]">流出 Top: ${topOutflow.map(s => s.name + '(' + s.pctChg.toFixed(2) + '%)').join(' | ')}</div>` : ''}
      <div class="flex items-center gap-3 text-[10px] text-[#636878] flex-wrap">
        <span>图例：</span>
        ${sourceNames.map(n => `<span class="flex items-center gap-1"><span class="w-2.5 h-2.5 inline-block rounded-sm" style="background:${sourceColors[n]}"></span>${n}</span>`).join('')}
        <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 inline-block rounded-sm" style="background:#f04452"></span>净流入</span>
        <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 inline-block rounded-sm" style="background:#0ca678"></span>净流出</span>
        <span>| 连线越粗=资金额越大 · 悬停连线查看明细</span>
      </div>
      <div class="text-[#636878] text-[10.5px]">数据源: ${isCN ? '东方财富 板块资金流(真实) · 主力/散户口径' : 'CONVEX CRAI 推导 · 确定性资金分配模型'}</div>
    `;
    container.appendChild(attributionDiv);

  }, [sectors, overview, moneyFlow]);

  return (
    <Panel title="资金流向动态图" badge="桑基图" hint="只展示净流入 Top8 / 净流出 Top6 重点板块，总额与 Top 列表为全市场口径">
      <div ref={containerRef} className="w-full" style={{ minHeight: 420 }}>
        {sectors.length === 0 && (
          <div className="h-80 flex items-center justify-center text-[#636878] text-[12px]">加载资金流数据...</div>
        )}
      </div>
      {hoveredReason && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[#1a1d26] border border-[#2a2d3a] rounded px-3 py-1.5 text-[11px] text-[#d8dce6] z-50 shadow-lg pointer-events-none">
          {hoveredReason}
        </div>
      )}
    </Panel>
  );
});
