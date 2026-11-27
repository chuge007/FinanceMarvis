/**
 * 盘口终端：回答「这只票现在谁在买、买得多急、人群押注在哪边」。
 *
 * 数据全部来自富途侧车；侧车不可用时明确显示「不可得」与安装方式，
 * 不退化成延迟快照冒充实时盘口。
 */
import { memo, useState } from 'react';
import { futuCall, useFutuStatus } from '../../core/data/hooks';
import { SidecarFeed } from '../../shared/components/SidecarFeed';

type Row = Record<string, any>;

const TABS = [
  { id: 'snapshot', label: '实时快照' },
  { id: 'ticker', label: '逐笔' },
  { id: 'orderbook', label: '买卖盘' },
  { id: 'capitalFlow', label: '资金流' },
  { id: 'optionChain', label: '期权链' },
  { id: 'portfolio', label: '持仓' },
] as const;

function fmt(v: any, digits = 2): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

function DataTable({ rows, columns }: { rows: Row[]; columns: Array<{ key: string; label: string; digits?: number }> }) {
  if (!rows.length) return <div className="py-6 text-center text-[0.8125rem] text-[#4d5364]">该维度暂无数据</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-[0.8125rem]">
        <thead>
          <tr className="border-b border-[#1a1d26] text-left text-[0.75rem] text-[#4d5364]">
            {columns.map((c) => <th key={c.key} className="py-1.5 pr-3 font-normal">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 60).map((r, i) => (
            <tr key={i} className="border-b border-[#151823] last:border-0">
              {columns.map((c) => {
                const raw = r[c.key];
                const num = Number(raw);
                const color = typeof raw === 'string' && (raw.includes('买') || raw.includes('涨'))
                  ? 'text-[#e5484d]'
                  : typeof raw === 'string' && (raw.includes('卖') || raw.includes('跌'))
                    ? 'text-[#30a46c]'
                    : 'text-[#b0b5c0]';
                return (
                  <td key={c.key} className={`py-1 pr-3 font-mono ${color}`}>
                    {raw == null ? '—' : typeof raw === 'number' || (num !== 0 && Number.isFinite(num)) ? fmt(raw, c.digits ?? 2) : String(raw)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const COLUMNS: Record<string, Array<{ key: string; label: string; digits?: number }>> = {
  snapshot: [
    { key: 'code', label: '代码' }, { key: 'name', label: '名称' }, { key: 'last_price', label: '最新' },
    { key: 'prev_close_price', label: '昨收' }, { key: 'change_rate', label: '涨跌%' },
    { key: 'volume', label: '成交量', digits: 0 }, { key: 'turnover', label: '成交额', digits: 0 },
    { key: 'price_spread', label: '价差' },
  ],
  ticker: [
    { key: 'ticker_time', label: '时间' }, { key: 'price', label: '成交价' },
    { key: 'volume', label: '量', digits: 0 }, { key: 'turnover', label: '额', digits: 0 },
    { key: 'ticker_direction', label: '方向' },
  ],
  orderbook: [
    { key: 'Bid', label: '买盘' }, { key: 'Ask', label: '卖盘' },
  ],
  capitalFlow: [
    { key: 'capital_flow_item_time', label: '时间' }, { key: 'in_flow', label: '流入' },
    { key: 'super_in_flow', label: '超大单' }, { key: 'big_in_flow', label: '大单' },
    { key: 'mid_in_flow', label: '中单' }, { key: 'sml_in_flow', label: '小单' },
    { key: 'main_in_flow', label: '主力' },
  ],
  optionChain: [
    { key: 'code', label: '合约' }, { key: 'name', label: '名称' },
    { key: 'strike_price', label: '行权价' }, { key: 'last_price', label: '最新' },
    { key: 'volume', label: '量', digits: 0 }, { key: 'open_interest', label: '持仓', digits: 0 },
  ],
  portfolio: [
    { key: 'code', label: '代码' }, { key: 'qty', label: '数量', digits: 0 },
    { key: 'average_cost', label: '成本' }, { key: 'nominal_price', label: '现价' },
    { key: 'market_val', label: '市值' }, { key: 'pl_ratio_avg_cost', label: '盈亏比%' },
    { key: 'today_pl_val', label: '今日盈亏' },
  ],
};

export const TerminalPage = memo(function TerminalPage() {
  const status = useFutuStatus();
  const [symbol, setSymbol] = useState('HK.00700');
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('snapshot');
  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    setNote('');
    const method = tab === 'portfolio' ? 'portfolio' : tab;
    const params = tab === 'portfolio' ? { market: 'HK' } : tab === 'snapshot' ? { codes: symbol } : { code: symbol };
    try {
      const env = await futuCall<{ rows?: Row[] }>(method, params);
      setRows(env.data?.rows ?? []);
      setNote(env.meta.missing?.join('；') ?? '');
    } catch (err) {
      setRows([]);
      setNote(err instanceof Error ? err.message : '请求失败');
    } finally {
      setBusy(false);
    }
  }

  const available = status.data?.available === true;

  return (
    <div className="space-y-3 p-3">
      <div>
        <h2 className="text-[1.0625rem] font-bold text-[#d8dce6]">盘口终端 · 现在谁在买、买得多急</h2>
        <p className="mt-1 text-[0.8125rem] text-[#636878]">
          逐笔、买卖盘、四级资金流与期权链来自本机富途 OpenD；未连接时不会用延迟行情冒充实时。
        </p>
      </div>

      {!available && (
        <div className="rounded border-l-2 border-[#f5a524] bg-[#f5a524]/5 px-3 py-2">
          <p className="text-[0.8125rem] text-[#f5a524]">不可得 · 富途侧车未就绪</p>
          <p className="mt-1 text-[0.75rem] leading-relaxed text-[#636878]">
            {status.data?.importError ? `Python: ${status.data.importError}；` : ''}
            {status.data?.hint ?? '安装 futu-api>=10.4.6408、运行 OpenD 并登录后自动启用。'}
          </p>
        </div>
      )}

      <section className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="futu-symbol" className="text-[0.8125rem] text-[#636878]">标的</label>
          <input
            id="futu-symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="HK.00700 / US.AAPL / SH.600519"
            className="min-w-[16rem] flex-1 rounded border border-[#1a1d26] bg-[#0b0d13] px-2.5 py-1.5 font-mono text-[0.8125rem] text-[#d8dce6] outline-none focus:border-[#4078ff]"
          />
          <button
            onClick={load}
            disabled={busy || !available}
            className={`rounded px-3 py-1.5 text-[0.8125rem] transition-colors ${
              busy || !available
                ? 'cursor-not-allowed bg-[#151823] text-[#4d5364]'
                : 'bg-[rgba(64,120,255,0.16)] text-[#cfd6e4] hover:bg-[rgba(64,120,255,0.28)]'
            }`}
          >
            {busy ? '读取中…' : '读取'}
          </button>
          <span className="text-[0.75rem] text-[#4d5364]">
            {status.data?.realTradingEnabled ? '真实交易已开启（需二次确认）' : '默认模拟盘'}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setRows([]); setNote(''); }}
              className={`rounded px-2.5 py-1 text-[0.8125rem] transition-colors ${
                tab === t.id
                  ? 'bg-[rgba(64,120,255,0.16)] text-[#d8dce6]'
                  : 'text-[#787e8e] hover:bg-[rgba(255,255,255,0.03)] hover:text-[#d8dce6]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {note && <p className="mt-2 text-[0.8125rem] text-[#f5a524]">{note}</p>}
        <div className="mt-2"><DataTable rows={rows} columns={COLUMNS[tab] ?? []} /></div>
      </section>

      <section className="space-y-3 border-t border-[#1a1d26] pt-3">
        <div>
          <h3 className="text-[0.9375rem] font-semibold text-[#d8dce6]">开源项目行情 · 备源 / 特色品类</h3>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-[#636878]">
            A 股 K 线主源仍是腾讯；baostock 为备源，需逐日偏差 ≤0.1% 才允许换主。加密现货走 ccxt 单一交易所，USDT 不等同 USD。
            缺库或交易所不可达时显示「缺」，不用模拟行情顶替。
          </p>
        </div>
        <SidecarFeed
          project="baostock" stability="S3" title="沪深300 前复权日线（K 线备源）"
          caliber="baostock sh.000001；指数无复权语义时返回 adjustflag=3；与腾讯主源分列"
          method="baostock.kline"
          params={{ code: 'sh.000001', start: new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10), end: new Date().toISOString().slice(0, 10), frequency: 'd', adjustflag: '2' }}
          maxRows={20}
        />
        <SidecarFeed
          project="ccxt" stability="S3" title="BTC/USDT 现价（Binance）"
          caliber="ccxt fetch_ticker，单一交易所 Binance；仅当日快照，不参与跨日分位"
          method="ccxt.ticker" params={{ exchange: 'binance', symbol: 'BTC/USDT' }} maxRows={5}
        />
        <SidecarFeed
          project="ccxt" stability="S3" title="BTC/USDT 日线 OHLCV（Binance）"
          caliber="ccxt fetch_ohlcv，1d；USDT 计价不等同 USD，换所不平均"
          method="ccxt.ohlcv" params={{ exchange: 'binance', symbol: 'BTC/USDT', timeframe: '1d', limit: 60 }} maxRows={20}
        />
      </section>
    </div>
  );
});
