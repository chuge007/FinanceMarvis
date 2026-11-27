/**
 * 数据契约：服务端 /api/v1 与前端之间的唯一约定。
 *
 * 三条硬约束（来自取数纪律）：
 *  1. 任何数字都必须能追到来源与数据日期 —— 所以响应统一带 meta。
 *  2. 取不到就写「不可得」，不用 0 或空白顶替 —— 所以 meta.missing 是必填语义。
 *  3. 同一屏内同一指标只有一个来源 —— 所以 meta.source 是单值而非数组。
 */

export type DataPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type DataAuth = 'none' | 'key' | 'client';
export type MarketTag = 'cn' | 'hk' | 'us' | 'global' | 'tw' | 'jp';

/** 数据资产主维度（主维度唯一，交叉标签见 sourceCatalog）。 */
export type DataDomain = 'market' | 'fundamental' | 'macro' | 'flow' | 'sentiment' | 'sector' | 'event' | 'alternative' | 'tool';
/** 该源在同一数据项里的角色。 */
export type SourceRole = 'primary' | 'backup' | 'fallback' | 'external-only' | 'deprecated';
/** 可信度分级：官方一手 / 聚合 / 抓取 / 派生。 */
export type SourceQuality = 'official' | 'aggregator' | 'scraper' | 'derived';
/** 稳定性分级：官方一手 > Key API > 免密稳定 > 爬虫 > 聚合 > 失效。 */
export type StabilityGrade = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';
/** 侧车方法级质量，按 `edgar.*` / `ccxt.*` 等方法前缀覆盖源级标签。 */
export interface MethodQuality {
  quality: SourceQuality;
  stability: StabilityGrade;
}

/** 由 registry 生成的源引用。 */
export interface SourceRef {
  id: string;
  prefix: string;
  label: string;
  datasets: string[];
  auth: DataAuth;
  priority: DataPriority;
  markets: string[];
  ttl: number;
  viaProxy: boolean;
  domain: DataDomain;
  role: SourceRole;
  quality: SourceQuality;
  stability?: StabilityGrade;
  methodQuality?: Record<string, MethodQuality>;
}

/** 数据新鲜度，用于前端徽标与「是否可信」判断。 */
export type Freshness = 'live' | 'intraday' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'stale';

/** 每个响应的元信息。缺一项都不算完整交付。 */
export interface SourceMeta {
  /** 实际使用的源 id（主源降级后要换成备源 id，不能仍写主源）。 */
  source: string;
  /** 数据自身的日期 / 时间戳（ISO），不是响应时间。 */
  asOf: string | null;
  /** 口径：qfq/hfq/bfq、现货/期货、持仓/成交额、报告期等。 */
  caliber?: string;
  /** 是否超过该频率的合理新鲜度。 */
  stale?: boolean;
  /** 是否发生了降级（主源不可用，用了备源）。 */
  degraded?: boolean;
  /** 本次未取到的数据域，前端必须显式渲染「不可得」。 */
  missing?: string[];
  /** 附加说明，例如「经代理」「来自本地历史库」。 */
  note?: string;
}

export interface Envelope<T> {
  data: T;
  meta: SourceMeta;
}

/** 序列点：OHLC 等附加字段放 extra，避免每加一类数据就改表。 */
export interface SeriesPoint {
  date: string;
  value: number;
  extra?: Record<string, number | string | null>;
}

export interface SeriesBundle {
  id: string;
  label: string;
  unit?: string;
  points: SeriesPoint[];
  meta: SourceMeta;
}

export interface SeriesResponse {
  series: SeriesBundle[];
  meta: SourceMeta;
}

/** 派生指标：分位、Z、变化。 */
export interface FactorValue {
  id: string;
  label: string;
  value: number | null;
  unit?: string;
  percentile?: number | null;
  z?: number | null;
  change?: number | null;
  changeWindow?: string;
  asOf: string | null;
  source: string;
}

export interface FactorResponse {
  factors: FactorValue[];
  meta: SourceMeta;
}

/** 环境分数与四档信号（借鉴 airoom 的「环境分数 + 核心因子」）。 */
export type RegimeBand = 'excellent' | 'good' | 'poor' | 'severe';

export interface RegimeDriver {
  id: string;
  label: string;
  contribution: number;
  value: number | null;
  /** 0-100 的健康度，前端画条形用；样本不足时为 undefined。 */
  health?: number;
  note?: string;
}

export interface RegimeBlock {
  market: string;
  score: number | null;
  band: RegimeBand | null;
  /** 构成分数的核心因子，按贡献绝对值排序。 */
  drivers: RegimeDriver[];
  breadth?: { up: number; down: number; limitUp?: number; limitDown?: number } | null;
  asOf: string | null;
  source: string;
  coverage?: string;
}

/** /api/v1/regime 的 data 就是单个 block（不包数组，避免前端再取 [0]）。 */
export type RegimeResponse = RegimeBlock;

/** 源健康度。 */
export interface SourceHealth {
  id: string;
  ok: boolean;
  latencyMs: number | null;
  error: string | null;
  checkedAt: string | null;
  cooldownUntil: string | null;
  /** 历史覆盖区间，便于判断能否算分位。 */
  coverage?: { first: string | null; last: string | null; points: number } | null;
  /** 连续失败轮数：>=2 时前端要给出告警，而不是只把数字藏起来。 */
  consecutiveFailures?: number;
  /** 该源下挂的序列条数。 */
  seriesCount?: number;
}

export interface HealthResponse {
  sources: SourceHealth[];
  db: { driver: string; seriesCount: number; pointCount: number; path: string };
  /** 可按需开启的能力（Key / 客户端）。 */
  capabilities: Array<{ id: string; label: string; available: boolean; hint: string }>;
  scheduler?: { running: boolean; total: number; lastRuns: Array<{ id: string; lastRun: string; failures: number }> };
  uptimeSec?: number;
  meta: SourceMeta;
}

/** 统一错误码，前端按码做差异化文案。 */
export type ApiErrorCode = 'NO_DATA' | 'DEGRADED' | 'RATE_LIMITED' | 'UPSTREAM_ERROR' | 'BAD_REQUEST' | 'INTERNAL';
