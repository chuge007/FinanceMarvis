/**
 * 设置页：这一版只做「看得见的状态」，不做无法生效的假开关。
 *
 * 原则：能力没接上就显示「如何启用」，而不是放一个点了没反应的输入框。
 * Key 与客户端凭据统一由服务端环境变量提供（MARVIS_PROFILE / TUSHARE_TOKEN / DATABULL_API_KEY），
 * 避免把密钥写进浏览器 localStorage 再随请求头外发。
 */
import { memo, useEffect, useState } from 'react';
import { useCatalog, useHealth, useRefresh } from '../../core/data/hooks';
import { apiGet, apiPost } from '../../core/data/client';

type KeyChannel = {
  id: string; label: string; scope: string; env: string;
  configured: boolean; source: string; masked: string; editable: boolean; status: string;
};

export const SettingsPage = memo(function SettingsPage() {
  const catalog = useCatalog();
  const health = useHealth();
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [channels, setChannels] = useState<KeyChannel[]>([]);
  const [keyDraft, setKeyDraft] = useState<Record<string, string>>({});
  const [keyMessage, setKeyMessage] = useState('');

  useEffect(() => {
    let alive = true;
    apiGet<{ channels: KeyChannel[] }>('/key-channels')
      .then((r) => { if (alive) setChannels(r.data.channels ?? []); })
      .catch(() => { /* 状态不可得时保持空 */ });
    return () => { alive = false; };
  }, []);

  async function saveKeys() {
    setKeyMessage('保存中…');
    try {
      await apiPost('/key-channels', keyDraft);
      const r = await apiGet<{ channels: KeyChannel[] }>('/key-channels');
      setChannels(r.data.channels ?? []);
      setKeyDraft({});
      setKeyMessage('已保存到本机数据目录，重启应用后生效');
    } catch (err) {
      setKeyMessage(err instanceof Error ? err.message : '保存失败');
    }
  }

  async function onRefresh() {
    setBusy(true);
    setMessage('');
    try {
      const env = await refresh();
      setMessage(`已抓取 ${env.data.total} 条，成功 ${env.data.ok} 条`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '刷新失败');
    } finally {
      setBusy(false);
    }
  }

  const capabilities = catalog.data?.capabilities ?? health.data?.capabilities ?? [];
  const sources = catalog.data?.sources ?? [];
  const bySource = new Map<string, typeof sources>();
  for (const s of sources) {
    const list = bySource.get(s.source) ?? [];
    list.push(s);
    bySource.set(s.source, list);
  }

  return (
    <div className="space-y-3 p-3">
      <div>
        <h2 className="text-[1.0625rem] font-bold text-[#d8dce6]">设置 · 数据从哪来、哪些能力可用</h2>
        <p className="mt-1 text-[0.8125rem] text-[#636878]">
          免 key 源默认开启；需要 Key 或本地客户端的通道，探测到才启用，未启用时界面明确标注不可得。
        </p>
      </div>

      <section className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[0.875rem] font-semibold text-[#d8dce6]">本地数据服务</h3>
          <button
            onClick={onRefresh}
            disabled={busy}
            className={`rounded px-3 py-1.5 text-[0.8125rem] transition-colors ${
              busy
                ? 'cursor-not-allowed bg-[#151823] text-[#4d5364]'
                : 'bg-[rgba(64,120,255,0.16)] text-[#cfd6e4] hover:bg-[rgba(64,120,255,0.28)]'
            }`}
          >
            {busy ? '抓取中…' : '立即刷新'}
          </button>
        </div>
        <div className="grid gap-2 text-[0.8125rem] text-[#b0b5c0] sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded border border-[#151823] bg-[#0b0d13] p-2">
            <div className="text-[0.75rem] text-[#4d5364]">形态</div>
            <div className="mt-0.5">{catalog.data?.profile ?? '—'}</div>
          </div>
          <div className="rounded border border-[#151823] bg-[#0b0d13] p-2">
            <div className="text-[0.75rem] text-[#4d5364]">存储驱动</div>
            <div className="mt-0.5">{health.data?.db.driver ?? '—'}</div>
          </div>
          <div className="rounded border border-[#151823] bg-[#0b0d13] p-2">
            <div className="text-[0.75rem] text-[#4d5364]">序列 / 数据点</div>
            <div className="mt-0.5 font-mono">
              {health.data?.db.seriesCount ?? 0} / {health.data?.db.pointCount ?? 0}
            </div>
          </div>
          <div className="rounded border border-[#151823] bg-[#0b0d13] p-2">
            <div className="text-[0.75rem] text-[#4d5364]">运行时长</div>
            <div className="mt-0.5 font-mono">{health.data?.uptimeSec ?? 0}s</div>
          </div>
        </div>
        {message && <p className="mt-2 text-[0.8125rem] text-[#4078ff]">{message}</p>}
        {health.data?.db.path && (
          <p className="mt-2 break-all text-[0.75rem] text-[#4d5364]">库文件：{health.data.db.path}</p>
        )}
      </section>

      <section className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[0.875rem] font-semibold text-[#d8dce6]">API Key 配置（本机保存）</h3>
          <button onClick={saveKeys} disabled={Object.keys(keyDraft).length === 0}
            className="rounded bg-[#4080ff] px-3 py-1.5 text-[0.8125rem] text-white disabled:opacity-40">
            保存 Key
          </button>
        </div>
        <p className="mb-3 text-[0.75rem] leading-relaxed text-[#636878]">
          Key 只写入本机数据目录，不进 localStorage、不进 exe。留空表示删除该项；环境变量设置的 Key 不可在界面覆盖。保存后重启应用生效。
        </p>
        <div className="grid gap-2 md:grid-cols-2">
          {channels.map((c) => (
            <label key={c.id} className="block rounded border border-[#151823] bg-[#0b0d13] p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.8125rem] text-[#d8dce6]">{c.label}</span>
                <span className={`rounded px-1.5 py-0.5 text-[0.75rem] ${c.configured ? 'bg-[#30a46c]/15 text-[#30a46c]' : 'bg-[#151823] text-[#636878]'}`}>
                  {c.status}{c.masked ? ` ${c.masked}` : ''}
                </span>
              </div>
              <p className="mt-1 text-[0.75rem] text-[#636878]">{c.scope}</p>
              {c.editable ? (
                <input type="password" autoComplete="off" value={keyDraft[c.env] ?? ''}
                  onChange={(e) => setKeyDraft((d) => ({ ...d, [c.env]: e.target.value }))}
                  placeholder={`填入 ${c.env}`}
                  className="mt-1.5 w-full rounded border border-[#232734] bg-[#0a0c11] px-2 py-1.5 font-mono text-[0.8125rem] text-[#d8dce6] outline-none placeholder:text-[#4d5364]" />
              ) : (
                <p className="mt-1 text-[0.75rem] text-[#8fb0ff]">来源：{c.source}（环境变量优先）</p>
              )}
            </label>
          ))}
        </div>
        {channels.length === 0 && <p className="text-[0.8125rem] text-[#4d5364]">数据服务未连接，Key 状态不可得。</p>}
        {keyMessage && <p className="mt-2 text-[0.8125rem] text-[#4078ff]">{keyMessage}</p>}
      </section>

      <section className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-4">
        <h3 className="mb-3 text-[0.875rem] font-semibold text-[#d8dce6]">可选通道</h3>
        <div className="space-y-2">
          {capabilities.map((c) => (
            <div key={c.id} className="flex items-start gap-3 rounded border border-[#151823] bg-[#0b0d13] p-2">
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${c.available ? 'bg-[#30a46c]' : 'bg-[#4d5364]'}`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[0.8125rem] text-[#d8dce6]">{c.label}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[0.75rem] ${
                      c.available ? 'bg-[#30a46c]/15 text-[#30a46c]' : 'bg-[#151823] text-[#636878]'
                    }`}
                  >
                    {c.available ? '已启用' : '未启用'}
                  </span>
                </div>
                <p className="mt-0.5 text-[0.75rem] leading-relaxed text-[#636878]">{c.hint}</p>
              </div>
            </div>
          ))}
          {capabilities.length === 0 && (
            <p className="text-[0.8125rem] text-[#4d5364]">数据服务未连接，能力状态不可得。</p>
          )}
        </div>
      </section>

      <section className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[0.875rem] font-semibold text-[#d8dce6]">已接入序列</h3>
          <span className="text-[0.75rem] text-[#4d5364]">共 {sources.length} 条</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-[0.8125rem]">
            <thead>
              <tr className="border-b border-[#1a1d26] text-left text-[0.75rem] text-[#4d5364]">
                <th className="py-1.5 pr-2 font-normal">序列</th>
                <th className="py-1.5 pr-2 font-normal">来源</th>
                <th className="py-1.5 pr-2 font-normal">频率</th>
                <th className="py-1.5 pr-2 font-normal">口径</th>
              </tr>
            </thead>
            <tbody>
              {sources.slice(0, 120).map((s) => (
                <tr key={s.id} className="border-b border-[#151823] last:border-0">
                  <td className="py-1.5 pr-2 text-[#b0b5c0]">{s.label}</td>
                  <td className="py-1.5 pr-2 font-mono text-[0.75rem] text-[#636878]">{s.source}</td>
                  <td className="py-1.5 pr-2 text-[#636878]">{s.freq}</td>
                  <td className="py-1.5 pr-2 text-[0.75rem] text-[#4d5364]">{s.caliber || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sources.length === 0 && (
          <p className="py-4 text-center text-[0.8125rem] text-[#4d5364]">目录不可得（数据服务未启动）</p>
        )}
      </section>
    </div>
  );
});
