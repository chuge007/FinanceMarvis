/**
 * 全球地形合成：把跨资产读数压成「风险偏好 0~100 × 流动性 0~100」的一张罗盘。
 *
 * 规则：
 *  - 只用 role=risk / role=liquidity 且有 Z 的格子，方向由目录里的 polarity 决定；
 *  - 缺失按剩余样本平均，不做插值；覆盖不足时结论自动降级；
 *  - 轨迹逐日重算，日期严格匹配，缺数据的日子跳过，不连线到假点；
 *  - 输出只描述「现在在哪」，不预测下一格往哪走。
 */
import { clamp } from '../../shared/utils/seriesStats';
import {
  CROSS_ASSET_DEFS,
  TERRAIN_GROUPS,
  type AssetGroupId,
} from '../data/crossAssetCatalog';
import type { AssetPoint, CrossAssetReading, CrossAssetSnapshot } from '../data/crossAsset';

export type QuadrantId = 'goldilocks' | 'reflation' | 'riskOff' | 'tightening';

export interface TerrainGroup {
  id: AssetGroupId;
  label: string;
  hint: string;
  coverage: number;
  cells: CrossAssetReading[];
}

export interface TerrainTrailPoint {
  date: string;
  x: number;
  y: number;
}

export interface TerrainModel {
  groups: TerrainGroup[];
  riskScore: number | null;
  liquidityScore: number | null;
  quadrant: QuadrantId | null;
  quadrantLabel: string | null;
  trail: TerrainTrailPoint[];
  coverage: number;
  riskCoverage: number;
  liquidityCoverage: number;
  available: number;
  total: number;
  asOf: string | null;
  narrative: string;
  missing: string[];
}

const QUADRANT_LABEL: Record<QuadrantId, string> = {
  goldilocks: '金发姑娘 · 钱松 + 风险偏好强',
  reflation: '再通胀 · 钱紧 + 风险偏好强',
  riskOff: '避险 · 钱松 + 风险偏好弱',
  tightening: '紧缩 · 钱紧 + 风险偏好弱',
};

const RISK_IDS = CROSS_ASSET_DEFS.filter((d) => d.role === 'risk').map((d) => d.id);
const LIQUIDITY_IDS = CROSS_ASSET_DEFS.filter((d) => d.role === 'liquidity').map((d) => d.id);

const SHORT_OF: Record<string, string> = Object.fromEntries(
  CROSS_ASSET_DEFS.map((d) => [d.id, d.short]),
);

function meanZ(readings: CrossAssetReading[]): number | null {
  const zs = readings.map((r) => r.riskZ).filter((z): z is number => z !== null);
  if (!zs.length) return null;
  return zs.reduce((a, b) => a + b, 0) / zs.length;
}

function toScore(mean: number | null): number | null {
  return mean === null ? null : Math.round(clamp(50 + 10 * mean, 0, 100));
}

function quadrantOf(liquidity: number | null, risk: number | null): QuadrantId | null {
  if (liquidity === null || risk === null) return null;
  const loose = liquidity >= 50;
  const riskOn = risk >= 50;
  if (loose && riskOn) return 'goldilocks';
  if (!loose && riskOn) return 'reflation';
  if (loose && !riskOn) return 'riskOff';
  return 'tightening';
}

function describeContributors(readings: CrossAssetReading[], direction: 'off' | 'on'): string {
  const sorted = readings
    .filter((r) => r.riskZ !== null && (direction === 'off' ? r.riskZ <= -0.5 : r.riskZ >= 0.5))
    .sort((a, b) =>
      direction === 'off'
        ? (a.riskZ as number) - (b.riskZ as number)
        : (b.riskZ as number) - (a.riskZ as number),
    )
    .slice(0, 2);
  if (!sorted.length) return '多数指标还在常态区';
  // 展示原始 Z 的方向（利率/美元上行 = 钱紧），而不是 polarity 处理后的分数，
  // 否则「实际利率 +1.2σ（上行）」会被写成 -1.2σ，读起来正好反了。
  return sorted
    .map((r) => {
      const z = r.z ?? 0;
      return `${SHORT_OF[r.id] ?? r.short} ${z >= 0 ? '+' : ''}${z.toFixed(1)}σ`;
    })
    .join('、');
}

function cellOf(id: string, readings: Record<string, CrossAssetReading>): CrossAssetReading | null {
  return readings[id] ?? null;
}

function buildGroups(readings: Record<string, CrossAssetReading>): TerrainGroup[] {
  return TERRAIN_GROUPS.map((group) => {
    const cells = CROSS_ASSET_DEFS.filter((d) => d.group === group.id)
      .map((d) => readings[d.id])
      .filter((r): r is CrossAssetReading => Boolean(r));
    const available = cells.filter((c) => c.latest !== null).length;
    return {
      id: group.id,
      label: group.label,
      hint: group.hint,
      coverage: cells.length ? available / cells.length : 0,
      cells,
    };
  });
}

function buildTrail(series: Record<string, AssetPoint[]>): TerrainTrailPoint[] {
  const riskIds = RISK_IDS.filter((id) => series[id]?.length);
  const liquidityIds = LIQUIDITY_IDS.filter((id) => series[id]?.length);
  if (!riskIds.length || !liquidityIds.length) return [];

  const dateSet = new Set<string>();
  [...riskIds, ...liquidityIds].forEach((id) => {
    series[id].forEach((p) => {
      if (p.z !== null) dateSet.add(p.date);
    });
  });
  const dates = [...dateSet].sort().slice(-60);

  const zMaps = new Map<string, Map<string, number>>();
  [...riskIds, ...liquidityIds].forEach((id) => {
    const map = new Map<string, number>();
    series[id].forEach((p) => {
      if (p.z !== null) map.set(p.date, p.z);
    });
    zMaps.set(id, map);
  });

  const minRisk = Math.max(3, Math.ceil(riskIds.length * 0.4));
  const minLiquidity = Math.max(2, Math.ceil(liquidityIds.length * 0.4));

  const trail: TerrainTrailPoint[] = [];
  dates.forEach((date) => {
    const riskVals = riskIds
      .map((id) => {
        const z = zMaps.get(id)?.get(date);
        const def = CROSS_ASSET_DEFS.find((d) => d.id === id);
        return z !== undefined && def && def.polarity !== 0 ? def.polarity * z : null;
      })
      .filter((v): v is number => v !== null);
    const liquidityVals = liquidityIds
      .map((id) => {
        const z = zMaps.get(id)?.get(date);
        const def = CROSS_ASSET_DEFS.find((d) => d.id === id);
        return z !== undefined && def && def.polarity !== 0 ? def.polarity * z : null;
      })
      .filter((v): v is number => v !== null);

    if (riskVals.length < minRisk || liquidityVals.length < minLiquidity) return;
    const risk = 50 + 10 * (riskVals.reduce((a, b) => a + b, 0) / riskVals.length);
    const liquidity = 50 + 10 * (liquidityVals.reduce((a, b) => a + b, 0) / liquidityVals.length);
    trail.push({
      date,
      x: Math.round(clamp(liquidity, 0, 100) * 10) / 10,
      y: Math.round(clamp(risk, 0, 100) * 10) / 10,
    });
  });

  return trail;
}

export function buildTerrain(cross: CrossAssetSnapshot | null): TerrainModel {
  const readings = cross?.readings ?? {};
  const groups = buildGroups(readings);

  const riskCells = RISK_IDS.map((id) => cellOf(id, readings)).filter(
    (r): r is CrossAssetReading => Boolean(r),
  );
  const liquidityCells = LIQUIDITY_IDS.map((id) => cellOf(id, readings)).filter(
    (r): r is CrossAssetReading => Boolean(r),
  );

  const total = CROSS_ASSET_DEFS.length;
  const available = Object.values(readings).filter((r) => r.latest !== null).length;
  const coverage = total ? available / total : 0;
  const riskCoverage = RISK_IDS.length
    ? riskCells.filter((r) => r.riskZ !== null).length / RISK_IDS.length
    : 0;
  const liquidityCoverage = LIQUIDITY_IDS.length
    ? liquidityCells.filter((r) => r.riskZ !== null).length / LIQUIDITY_IDS.length
    : 0;

  // 样本不足一半时不给分数：单个格子也能算出数字，但那不是「市场的风险偏好」。
  const riskScore = riskCoverage >= 0.5 ? toScore(meanZ(riskCells)) : null;
  const liquidityScore = liquidityCoverage >= 0.5 ? toScore(meanZ(liquidityCells)) : null;
  const quadrant = quadrantOf(liquidityScore, riskScore);

  const missing = CROSS_ASSET_DEFS.filter((d) => (readings[d.id]?.latest ?? null) === null).map(
    (d) => d.short,
  );

  const asOf =
    Object.values(readings)
      .map((r) => r.asOf)
      .filter((d): d is string => Boolean(d))
      .sort()
      .pop() ?? null;

  const pc = cellOf('PC_TOTAL', readings);
  const fg = cellOf('FG', readings);

  const parts: string[] = [];
  if (liquidityScore === null) {
    parts.push('流动性数据不足');
  } else {
    const tight = liquidityScore < 50;
    parts.push(`${tight ? '钱在变紧' : '钱偏宽松'}（${tight ? describeContributors(liquidityCells, 'off') : describeContributors(liquidityCells, 'on')}）`);
  }
  if (riskScore === null) {
    parts.push('风险偏好数据不足');
  } else {
    const strong = riskScore >= 50;
    parts.push(`${strong ? '风险偏好偏强' : '风险偏好偏弱'}（${strong ? describeContributors(riskCells, 'on') : describeContributors(riskCells, 'off')}）`);
  }
  if (pc?.latest !== null && pc?.latest !== undefined) {
    const zone = pc.norm && pc.latest > pc.norm[1] ? '偏高·避险拥挤' : pc.norm && pc.latest < pc.norm[0] ? '偏低·自满' : '常态';
    parts.push(`总 Put/Call ${pc.latest.toFixed(3)}（${zone}）`);
  } else if (fg?.latest !== null && fg?.latest !== undefined) {
    parts.push(`情绪 ${Math.round(fg.latest)}`);
  }
  if (cross && available === 0) parts.push('上游全部不可用，不给判断');

  return {
    groups,
    riskScore,
    liquidityScore,
    quadrant,
    quadrantLabel: quadrant ? QUADRANT_LABEL[quadrant] : null,
    trail: cross ? buildTrail(cross.series) : [],
    coverage,
    riskCoverage,
    liquidityCoverage,
    available,
    total,
    asOf,
    narrative: parts.join(' → '),
    missing,
  };
}
