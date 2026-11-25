/**
 * 本地序列仓库：把“只有当日快照、没有历史”的指标逐日累积成时间序列。
 *
 * 解决的问题：
 *  - A 股宽度、板块资金流、组合权益比例等只有当下快照；
 *  - 没有历史就无法做滚动相关、Beta、体制分位。
 *
 * 原则：
 *  - 不做虚假回填：没有就是没有，从第一次打开开始攒；
 *  - 只存本机 IndexedDB，不上传；
 *  - 数据量极小（每天几十条），可长期保留。
 */
import type { StructureSnapshot } from './structure';
import type { PortfolioSummary } from '../../stores/usePortfolioStore';

const DB_NAME = 'MarvisVaultDB';
const DB_VERSION = 1;
const STORE = 'series_daily';

interface VaultRow {
  key: string;
  seriesId: string;
  date: string;
  value: number;
  source: string;
  savedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' });
        store.createIndex('seriesId', 'seriesId', { unique: false });
        store.createIndex('date', 'date', { unique: false });
      }
    };
  });
  return dbPromise;
}

function keyOf(seriesId: string, date: string): string {
  return `${seriesId}|${date}`;
}

async function putRows(rows: VaultRow[]): Promise<void> {
  if (!rows.length) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      rows.forEach((r) => store.put(r));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // 隐私模式 / 配额满：静默降级，不影响主流程
  }
}

export async function recordPoint(
  seriesId: string,
  date: string,
  value: number,
  source = 'local',
): Promise<void> {
  if (!Number.isFinite(value) || !date) return;
  await putRows([{
    key: keyOf(seriesId, date),
    seriesId,
    date,
    value,
    source,
    savedAt: Date.now(),
  }]);
}

/** 记录板块宽度、相对强弱、资金流；同一天重复打开会覆盖，不会重复计数。 */
export async function recordStructure(structure: StructureSnapshot | null): Promise<void> {
  if (!structure || structure.source !== 'real') return;
  const date = structure.asOf ?? new Date().toISOString().slice(0, 10);
  const rows: VaultRow[] = [];

  if (structure.breadth !== null) {
    rows.push({
      key: keyOf('structure.breadth', date),
      seriesId: 'structure.breadth',
      date,
      value: structure.breadth,
      source: structure.market,
      savedAt: Date.now(),
    });
  }

  structure.items.forEach((item) => {
    if (item.rs20 !== null) {
      rows.push({
        key: keyOf(`sector.rs20.${item.id}`, date),
        seriesId: `sector.rs20.${item.id}`,
        date,
        value: item.rs20,
        source: structure.market,
        savedAt: Date.now(),
      });
    }
    if (item.flow !== null) {
      rows.push({
        key: keyOf(`sector.flow.${item.id}`, date),
        seriesId: `sector.flow.${item.id}`,
        date,
        value: item.flow,
        source: structure.market,
        savedAt: Date.now(),
      });
    }
  });

  await putRows(rows);
}

/** 记录组合权益比例；用于以后计算组合与基准的相关性、回撤与 Beta。 */
export async function recordPortfolio(date: string, summary: PortfolioSummary): Promise<void> {
  if (!summary.totalAssets || summary.totalAssets <= 0) return;
  const equityPct = (summary.totalValue / summary.totalAssets) * 100;
  await recordPoint('portfolio.equity_pct', date, equityPct, 'local');
}

export interface VaultStats {
  seriesId: string;
  count: number;
  first: string | null;
  last: string | null;
}

export async function vaultStats(seriesId: string): Promise<VaultStats> {
  try {
    const db = await openDB();
    return await new Promise<VaultStats>((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const index = tx.objectStore(STORE).index('seriesId');
      let count = 0;
      let first: string | null = null;
      let last: string | null = null;

      const req = index.openCursor(IDBKeyRange.only(seriesId));
      req.onerror = () => resolve({ seriesId, count: 0, first: null, last: null });
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve({ seriesId, count, first, last });
          return;
        }
        const row = cursor.value as VaultRow;
        count++;
        if (!first || row.date < first) first = row.date;
        if (!last || row.date > last) last = row.date;
        cursor.continue();
      };
    });
  } catch {
    return { seriesId, count: 0, first: null, last: null };
  }
}

export async function vaultSeries(seriesId: string, limit = 500): Promise<{ date: string; value: number }[]> {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const index = tx.objectStore(STORE).index('seriesId');
      const out: { date: string; value: number }[] = [];
      const req = index.openCursor(IDBKeyRange.only(seriesId));
      req.onerror = () => resolve([]);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve(out.sort((a, b) => a.date.localeCompare(b.date)).slice(-limit));
          return;
        }
        const row = cursor.value as VaultRow;
        out.push({ date: row.date, value: row.value });
        cursor.continue();
      };
    });
  } catch {
    return [];
  }
}
