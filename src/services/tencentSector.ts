/**
 * 腾讯行业板块榜：东方财富被网络重置时的真实替代源。
 *
 * 口径：
 *  - `zdf / zdf_d5 / zdf_d20 / zdf_d60` 是当日 / 5 / 20 / 60 日涨跌幅（%），
 *    比东财「仅当日快照」多出真实多周期，可直接用于结构层 RS；
 *  - `zljlr` 是主力净流入，单位万元，这里 /10000 转亿元；
 *  - 接口无 CORS，必须经本地 `/tencent-rank` 转发。
 *
 * 失败返回空数组并上报 sourceHealth；不补 0、不随机、不伪装成东财。
 */
import type { SectorFlow } from '../types/fundflow';
import { sectorColor } from '../shared/utils/sectorColor';
import { reportSource } from '../shared/utils/sourceHealth';

const RANK_PATH =
  '/tencent-rank/cgi/cgi-bin/rank/pt/getRank?board_type=hy&sort_type=price&direct=down&offset=0&count=100';
const TTL = 5 * 60_000;

let cache: { ts: number; data: SectorFlow[] } | null = null;
let inflight: Promise<SectorFlow[]> | null = null;

function num(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function readingOf(
  name: string,
  netWan: number | undefined,
  pct: number,
  rs5: number | undefined,
  rs20: number | undefined,
): string {
  const flow =
    netWan === undefined
      ? '主力净流入不可用'
      : `${netWan >= 0 ? '主力净流入' : '主力净流出'} ${Math.abs(netWan / 10000).toFixed(1)} 亿`;
  const trend =
    rs5 !== undefined && rs20 !== undefined
      ? `当日 ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% · 5日 ${rs5 >= 0 ? '+' : ''}${rs5.toFixed(1)}% · 20日 ${rs20 >= 0 ? '+' : ''}${rs20.toFixed(1)}%`
      : `当日 ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
  return `${name}：${trend}；${flow}`;
}

/** 取 31 个行业板块；失败返回空数组。 */
export async function fetchTencentSectorFlows(): Promise<SectorFlow[]> {
  if (cache && Date.now() - cache.ts < TTL) return cache.data;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const resp = await fetch(RANK_PATH, { headers: { accept: 'application/json' } });
      if (!resp.ok) {
        reportSource('tencent', false, `腾讯行业榜 HTTP ${resp.status}`);
        return [];
      }
      const json = await resp.json();
      const list = json?.data?.rank_list;
      if (!Array.isArray(list) || !list.length) {
        reportSource('tencent', false, '腾讯行业榜未返回数据');
        return [];
      }

      const flows: SectorFlow[] = [];
      for (const item of list) {
        const name = String(item?.name ?? item?.code ?? '').trim();
        const pct = num(item?.zdf);
        if (!name || pct === undefined) continue;

        const netWan = num(item?.zljlr);
        const rs5 = num(item?.zdf_d5);
        const rs20 = num(item?.zdf_d20);
        const rs60 = num(item?.zdf_d60);
        const netFlow = netWan === undefined ? 0 : netWan / 10000;

        flows.push({
          id: String(item?.code ?? name),
          name,
          color: sectorColor(name),
          netFlow: +netFlow.toFixed(2),
          pctChg: +pct.toFixed(2),
          mainRatio: 0,
          superLarge: 0,
          large: 0,
          medium: 0,
          small: 0,
          source: 'tencent',
          flowAvailable: netWan !== undefined,
          rs5,
          rs20,
          rs60,
          reading: readingOf(name, netWan, pct, rs5, rs20),
        });
      }

      if (!flows.length) {
        reportSource('tencent', false, '腾讯行业榜解析后无有效板块');
        return [];
      }
      flows.sort((a, b) => b.netFlow - a.netFlow);
      cache = { ts: Date.now(), data: flows };
      reportSource('tencent', true);
      return flows;
    } catch (err) {
      reportSource('tencent', false, err instanceof Error ? err.message : '腾讯行业榜不可达');
      return [];
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
