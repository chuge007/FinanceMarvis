/**
 * 新浪板块：腾讯行业榜失败后的第二兜底。
 *
 * 页面是 GBK 编码的 JS 变量：
 *   var S_Finance_bankuai_class = {"gn_hwqc":"code,name,count,avgPrice,changeAmt,changePct,volume,amount,leadCode,..."}
 * 只有当日涨跌与成交额，没有主力净流入；映射时 flowAvailable=false，不把 0 当成真实流入。
 */
import type { SectorFlow } from '../types/fundflow';
import { sectorColor } from '../shared/utils/sectorColor';
import { reportSource } from '../shared/utils/sourceHealth';

const SINA_PATH = '/sina-sector/q/view/newFLJK.php?param=class';
const TTL = 5 * 60_000;

let cache: { ts: number; data: SectorFlow[] } | null = null;
let inflight: Promise<SectorFlow[]> | null = null;

function parsePayload(text: string): Record<string, string> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : null;
  } catch {
    return null;
  }
}

/** 取板块当日涨跌；失败返回空数组。 */
export async function fetchSinaSectorFlows(): Promise<SectorFlow[]> {
  if (cache && Date.now() - cache.ts < TTL) return cache.data;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const resp = await fetch(SINA_PATH);
      if (!resp.ok) {
        reportSource('sina', false, `新浪板块 HTTP ${resp.status}`);
        return [];
      }
      // 新浪返回 GBK，必须按字节解码；直接 resp.text() 会得到乱码。
      const buf = await resp.arrayBuffer();
      const text = new TextDecoder('gbk').decode(buf);
      const payload = parsePayload(text);
      if (!payload) {
        reportSource('sina', false, '新浪板块解析失败');
        return [];
      }

      const flows: SectorFlow[] = [];
      for (const raw of Object.values(payload)) {
        if (typeof raw !== 'string') continue;
        const parts = raw.split(',');
        if (parts.length < 8) continue;
        const name = parts[1]?.trim();
        const pct = Number(parts[5]);
        if (!name || !Number.isFinite(pct)) continue;

        flows.push({
          id: parts[0] || name,
          name,
          color: sectorColor(name),
          netFlow: 0,
          pctChg: +pct.toFixed(2),
          source: 'sina',
          flowAvailable: false,
          reading: `${name}：当日 ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%；新浪只有价格口径，无主力净流入`,
        });
      }

      if (!flows.length) {
        reportSource('sina', false, '新浪板块解析后无有效板块');
        return [];
      }
      flows.sort((a, b) => b.pctChg - a.pctChg);
      cache = { ts: Date.now(), data: flows };
      reportSource('sina', true);
      return flows;
    } catch (err) {
      reportSource('sina', false, err instanceof Error ? err.message : '新浪板块不可达');
      return [];
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
