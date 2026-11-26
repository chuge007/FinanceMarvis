/**
 * 跨资产数据结构：取数、合成、UI 共用这一份，避免各层各定义一套。
 */
import type { AssetGroupId, AssetRegion, CrossAssetDef, CrossAssetSource } from './crossAssetCatalog';

export interface AssetPoint {
  date: string;
  value: number;
  z: number | null;
  volume?: number;
}

export interface CrossAssetReading {
  id: string;
  label: string;
  short: string;
  group: AssetGroupId;
  source: CrossAssetSource;
  /** 实际取到数据的源：可能因 Yahoo/FRED 不可达而降级为腾讯现货或财政部曲线。 */
  actualSource: CrossAssetSource | 'tencent' | 'treasury';
  region: AssetRegion;
  unit: CrossAssetDef['unit'];
  digits: number;
  polarity: 1 | -1 | 0;
  role: CrossAssetDef['role'];
  latest: number | null;
  /** 绝对变化（利率用 bp、比值用原始差值） */
  change: number | null;
  changePct: number | null;
  z: number | null;
  percentile: number | null;
  riskZ: number | null;
  spark: number[];
  asOf: string | null;
  status: 'riskOn' | 'riskOff' | 'neutral' | 'missing';
  note: string;
  pitfall: string;
  externalUrl?: string;
  norm?: [number, number];
}

export interface CrossAssetSnapshot {
  readings: Record<string, CrossAssetReading>;
  series: Record<string, AssetPoint[]>;
  fetchedAt: string;
  available: number;
  total: number;
  errors: string[];
}
