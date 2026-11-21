import { memo, useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import { fetchConvexLatest } from '../../services/api';

interface LinkageNode {
  id: string;
  label: string;
  group: 'macro' | 'sentiment' | 'fundflow' | 'strategy';
  value: number;
  description: string;
}

interface LinkageEdge {
  source: string;
  target: string;
  label: string;
  strength: number;
}

interface LinkageData {
  nodes: LinkageNode[];
  edges: LinkageEdge[];
}

// ─── 联动关系定义 ───
const LINKAGES: Record<string, LinkageData> = {
  macro: {
    nodes: [
      { id: 'cpi', label: 'CPI', group: 'macro', value: 60, description: '通胀数据超预期 → 加息预期升温' },
      { id: 'fomc', label: 'FOMC', group: 'macro', value: 75, description: '美联储政策声明偏鹰 → 风险资产承压' },
      { id: 'vix', label: 'VIX', group: 'macro', value: 50, description: '波动率跳升至 20+ → 市场恐慌情绪蔓延' },
      { id: 'dxy', label: '美元指数', group: 'macro', value: 55, description: '美元走强 → 新兴市场资金外流' },
      { id: 'bond', label: '国债利差', group: 'macro', value: 45, description: '2s10s 倒挂收窄 → 衰退担忧减弱' },
      { id: 'sentiment', label: '市场情绪', group: 'sentiment', value: 65, description: '情绪从 Greed 转向 Fear' },
      { id: 'sector', label: '板块轮动', group: 'fundflow', value: 70, description: '科技资金流出 → 防御板块流入' },
      { id: 'signal', label: '策略信号', group: 'strategy', value: 55, description: '综合信号降至 40 分以下 → 触发减仓' },
    ],
    edges: [
      { source: 'cpi', target: 'fomc', label: '数据驱动政策', strength: 0.9 },
      { source: 'fomc', target: 'bond', label: '利率预期重塑', strength: 0.85 },
      { source: 'fomc', target: 'vix', label: '不确定性传导', strength: 0.7 },
      { source: 'bond', target: 'dxy', label: '利差吸引资金', strength: 0.65 },
      { source: 'dxy', target: 'sentiment', label: '汇率影响风险偏好', strength: 0.55 },
      { source: 'vix', target: 'sentiment', label: '恐慌情绪传导', strength: 0.8 },
      { source: 'sentiment', target: 'sector', label: '风险偏好驱动轮动', strength: 0.75 },
      { source: 'sector', target: 'signal', label: '资金流向决定策略', strength: 0.85 },
    ],
  },
  sentiment: {
    nodes: [
      { id: 'fg', label: 'F&G 指数', group: 'sentiment', value: 65, description: '恐慌贪婪指数从 65→35' },
      { id: 'putcall', label: 'Put/Call', group: 'sentiment', value: 55, description: 'Put/Call 比率急升至 1.2' },
      { id: 'naaim', label: 'NAAIM', group: 'sentiment', value: 50, description: '主动经理人暴露降至 60%' },
      { id: 'darkpool', label: '暗池', group: 'sentiment', value: 45, description: '暗池大宗卖单激增' },
      { id: 'gex', label: 'Gamma 暴露', group: 'sentiment', value: 40, description: '负 Gamma 主导 → 加剧下跌' },
      { id: 'vix', label: 'VIX', group: 'macro', value: 55, description: '波动率飙升 → 期权定价重估' },
      { id: 'sector', label: '板块资金', group: 'fundflow', value: 60, description: '情绪恶化 → 资金撤离周期股' },
      { id: 'signal', label: '做T信号', group: 'strategy', value: 50, description: '情绪崩溃触发策略预警' },
    ],
    edges: [
      { source: 'fg', target: 'putcall', label: '情绪→对冲需求', strength: 0.8 },
      { source: 'putcall', target: 'gex', label: '期权分布影响Gamma', strength: 0.75 },
      { source: 'fg', target: 'naaim', label: '情绪驱动仓位', strength: 0.7 },
      { source: 'darkpool', target: 'vix', label: '大单预警波动', strength: 0.65 },
      { source: 'gex', target: 'vix', label: 'Gamma挤压', strength: 0.85 },
      { source: 'vix', target: 'sector', label: '恐慌→防御轮动', strength: 0.7 },
      { source: 'putcall', target: 'signal', label: '避险信号', strength: 0.6 },
      { source: 'sector', target: 'signal', label: '资金确认', strength: 0.75 },
    ],
  },
  fundflow: {
    nodes: [
      { id: 'north', label: '北向资金', group: 'fundflow', value: 60, description: '北向单日净流出 ¥8.5B' },
      { id: 'institution', label: '机构', group: 'fundflow', value: 55, description: '机构净卖出 ¥3.2B' },
      { id: 'retail', label: '散户', group: 'fundflow', value: 45, description: '散户恐慌性抛售 ¥1.5B' },
      { id: 'tech', label: '科技板块', group: 'fundflow', value: 70, description: '科技流出 ¥6.8B → 获利了结' },
      { id: 'finance', label: '金融板块', group: 'fundflow', value: 50, description: '银行流入 ¥2.1B → 利率上行受益' },
      { id: 'defense', label: '防御板块', group: 'fundflow', value: 55, description: '公用事业流入 ¥1.8B' },
      { id: 'sentiment', label: '市场情绪', group: 'sentiment', value: 60, description: '资金流出印证 F&G 下滑' },
      { id: 'signal', label: '策略信号', group: 'strategy', value: 50, description: '资金面偏空 → 策略降仓' },
    ],
    edges: [
      { source: 'north', target: 'tech', label: '外资减仓科技', strength: 0.9 },
      { source: 'institution', target: 'tech', label: '机构同步减持', strength: 0.8 },
      { source: 'retail', target: 'tech', label: '散户跟风卖出', strength: 0.5 },
      { source: 'north', target: 'finance', label: '北向加仓银行', strength: 0.6 },
      { source: 'institution', target: 'defense', label: '机构调仓防御', strength: 0.65 },
      { source: 'retail', target: 'defense', label: '散户避险', strength: 0.4 },
      { source: 'tech', target: 'sentiment', label: '龙头股领跌', strength: 0.75 },
      { source: 'sentiment', target: 'signal', label: '情绪恶化→减仓', strength: 0.8 },
    ],
  },
  strategy: {
    nodes: [
      { id: 'score', label: '综合得分', group: 'strategy', value: 50, description: '得分从 68→42，跌破 45 分阈值' },
      { id: 'sentiment_dim', label: '情绪维度', group: 'sentiment', value: 60, description: '情绪评分 35 → 急剧恶化' },
      { id: 'vol_dim', label: '波动维度', group: 'strategy', value: 55, description: 'VIX 升至 22 → 波动评分 40' },
      { id: 'rate_dim', label: '利率维度', group: 'strategy', value: 50, description: '10Y 升至 4.5% → 利率评分 45' },
      { id: 'credit_dim', label: '信用维度', group: 'strategy', value: 55, description: 'HY 利差走阔 → 信用评分 42' },
      { id: 'macro_dim', label: '宏观维度', group: 'strategy', value: 45, description: 'PMI 不及预期 → 宏观评分 48' },
      { id: 'action', label: '操作决策', group: 'strategy', value: 60, description: '降仓至 20% → 减仓信号已触发' },
      { id: 'exec', label: '风险执行', group: 'strategy', value: 50, description: '单日最大亏损达 5% → 风控红线' },
    ],
    edges: [
      { source: 'sentiment_dim', target: 'score', label: '权重 0.25', strength: 0.7 },
      { source: 'vol_dim', target: 'score', label: '权重 0.20', strength: 0.65 },
      { source: 'rate_dim', target: 'score', label: '权重 0.15', strength: 0.6 },
      { source: 'credit_dim', target: 'score', label: '权重 0.20', strength: 0.65 },
      { source: 'macro_dim', target: 'score', label: '权重 0.20', strength: 0.6 },
      { source: 'score', target: 'action', label: '低分触发减仓', strength: 0.9 },
      { source: 'action', target: 'exec', label: '指令→执行', strength: 0.85 },
    ],
  },
};

const GROUP_COLORS: Record<string, string> = {
  macro: '#4078ff',
  sentiment: '#f59e4b',
  fundflow: '#0ca678',
  strategy: '#f04452',
};

interface EventLinkageFlowProps {
  module: 'macro' | 'sentiment' | 'fundflow' | 'strategy';
}

export const EventLinkageFlow = memo(function EventLinkageFlow({ module }: EventLinkageFlowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [crai, setCrai] = useState<number | null>(null);
  const [vix, setVix] = useState<number | null>(null);

  useEffect(() => {
    fetchConvexLatest('CONVEX_CRAI').then(setCrai);
    fetchConvexLatest('VIXCLS').then(setVix);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 700;
    const height = 320;
    container.innerHTML = '';

    const linkage = LINKAGES[module];
    if (!linkage) return;

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`);

    // 定义 marker 箭头
    svg.append('defs').selectAll('marker')
      .data(linkage.edges)
      .join('marker')
      .attr('id', (_, i) => `arrow-${i}`)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 18)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#636878');

    // Force simulation
    const simulation = d3.forceSimulation(linkage.nodes as any)
      .force('link', d3.forceLink(linkage.edges).id((d: any) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('y', d3.forceY((d: any) => {
        const groups = ['macro', 'sentiment', 'fundflow', 'strategy'];
        return 50 + groups.indexOf(d.group) * 70;
      }).strength(0.3));

    // 连线
    const link = svg.append('g')
      .selectAll('line')
      .data(linkage.edges)
      .join('line')
      .attr('stroke', '#2a2d3a')
      .attr('stroke-width', (d) => Math.max(1, d.strength * 3))
      .attr('stroke-dasharray', (d) => d.strength < 0.6 ? '4,2' : 'none')
      .attr('marker-end', (_, i) => `url(#arrow-${i})`);

    // 连线标签
    const linkLabel = svg.append('g')
      .selectAll('text')
      .data(linkage.edges)
      .join('text')
      .attr('text-anchor', 'middle')
      .attr('dy', -5)
      .attr('fill', '#636878')
      .style('font-size', '9.5px');

    // 节点
    const node = svg.append('g')
      .selectAll('g')
      .data(linkage.nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .on('click', (_, d) => setActiveNode(activeNode === d.id ? null : d.id))
      .call(d3.drag<SVGGElement, any>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        }) as any);

    // 节点圆
    node.append('circle')
      .attr('r', (d) => 8 + d.value * 0.1)
      .attr('fill', (d) => GROUP_COLORS[d.group])
      .attr('stroke', '#0f1118')
      .attr('stroke-width', 2)
      .attr('opacity', 0.85);

    // 节点标签
    node.append('text')
      .attr('dy', 22)
      .attr('text-anchor', 'middle')
      .attr('fill', '#d8dce6')
      .style('font-size', '9px')
      .style('font-weight', '500')
      .text((d) => d.label);

    // Tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      linkLabel
        .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
        .attr('y', (d: any) => (d.source.y + d.target.y) / 2)
        .text((d) => d.label);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    simulation.alpha(1).restart();

    return () => { simulation.stop(); };
  }, [module, activeNode]);

  const descriptions = LINKAGES[module]?.nodes.reduce((acc, n) => {
    acc[n.id] = n.description;
    return acc;
  }, {} as Record<string, string>) ?? {};

  const realDataNote = crai !== null && vix !== null
    ? `当前 CRAI=${crai.toFixed(2)} | VIX=${vix.toFixed(1)}`
    : '数据加载中...';

  return (
    <div className="bg-[#0f1118] border border-[#1a1d26] rounded-[5px] p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-bold text-[#d8dce6]">指标事件联动关系图</div>
        <div className="text-[9.5px] text-[#636878] font-mono">{realDataNote}</div>
      </div>
      <div ref={containerRef} className="w-full" style={{ minHeight: 320 }} />
      {activeNode && descriptions[activeNode] && (
        <div className="mt-2 p-2 bg-[rgba(64,120,255,0.08)] border border-[rgba(64,120,255,0.2)] rounded text-[10px] text-[#b0b5c0]">
          <span className="text-[#4078ff] font-medium">{LINKAGES[module].nodes.find(n => n.id === activeNode)?.label}: </span>
          {descriptions[activeNode]}
        </div>
      )}
      <div className="mt-2 flex gap-3 text-[10px] text-[#636878]">
        <span><span className="inline-block w-2 h-2 rounded-full bg-[#4078ff] mr-1"></span>宏观</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-[#f59e4b] mr-1"></span>情绪</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-[#0ca678] mr-1"></span>资金</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-[#f04452] mr-1"></span>策略</span>
        <span>| 点击节点查看详情 | 可拖拽</span>
      </div>
    </div>
  );
});
