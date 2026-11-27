/**
 * 异步研究工作台：把 Wind Alice 的自然语言结论收敛成结构化 Finding。
 *
 * 没有 Key 时仍可用「本地解析测试」验证 json 块 → 表格 → unstructured 三层链路；
 * 有 JWT 时可提交云端异步任务（2-15 分钟），任务状态在队列里可查。
 */
import { memo, useState } from 'react';
import { listFindings, submitResearch, useWindStatus, windResolve } from '../../core/data/hooks';
import type { ResearchFinding } from '../../core/domain';

const TOKEN_KEY = 'marvis.cloud.token';

export const ResearchPage = memo(function ResearchPage() {
  const wind = useWindStatus();
  const [prompt, setPrompt] = useState('分析当前高收益债利差与波动率环境，列出三个可验证的风险因子');
  const [markdown, setMarkdown] = useState('');
  const [finding, setFinding] = useState<ResearchFinding | null>(null);
  const [findings, setFindings] = useState<ResearchFinding[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) ?? '' : '';

  async function onResolve() {
    setBusy(true);
    setNote('');
    try {
      const env = await windResolve(markdown);
      setFinding(env.data.finding);
      setNote(env.meta.note ?? `置信度 ${env.data.finding.confidence}`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : '解析失败');
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit() {
    if (!token) {
      setNote('需要先在云端登录并把 JWT 存到 localStorage.marvis.cloud.token');
      return;
    }
    setBusy(true);
    setNote('');
    try {
      const task = await submitResearch(prompt, token);
      setNote(`任务已提交 ${task.id}，预计 2-15 分钟`);
      const list = await listFindings(token);
      setFindings(list);
    } catch (err) {
      setNote(err instanceof Error ? err.message : '提交失败');
    } finally {
      setBusy(false);
    }
  }

  async function onLoadFindings() {
    if (!token) {
      setNote('需要云端 JWT');
      return;
    }
    try {
      setFindings(await listFindings(token));
    } catch (err) {
      setNote(err instanceof Error ? err.message : '读取失败');
    }
  }

  return (
    <div className="space-y-3 p-3">
      <div>
        <h2 className="text-[1.0625rem] font-bold text-[#d8dce6]">研究工作台 · 结论要能进因子体系</h2>
        <p className="mt-1 text-[0.8125rem] text-[#636878]">
          Wind Alice 返回 Markdown 与附件，这里按 json 块 → 表格 → 不可结构 三层收敛，并标注置信度。
        </p>
      </div>

      <section className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${wind.data?.available ? 'bg-[#30a46c]' : 'bg-[#4d5364]'}`} />
          <span className="text-[0.8125rem] text-[#b0b5c0]">
            Wind {wind.data?.available ? '凭据就绪' : '不可得'}
          </span>
          {!wind.data?.available && (
            <span className="text-[0.75rem] text-[#636878]">{wind.data?.reason ?? '配置 WIND_API_KEY 后启用'}</span>
          )}
        </div>

        <label htmlFor="research-prompt" className="mt-3 block text-[0.8125rem] text-[#636878]">研究任务</label>
        <textarea
          id="research-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded border border-[#1a1d26] bg-[#0b0d13] px-2.5 py-2 text-[0.8125rem] text-[#d8dce6] outline-none focus:border-[#4078ff]"
        />
        <div className="mt-2 flex gap-2">
          <button
            onClick={onSubmit}
            disabled={busy || !wind.data?.available}
            className={`rounded px-3 py-1.5 text-[0.8125rem] transition-colors ${
              busy || !wind.data?.available
                ? 'cursor-not-allowed bg-[#151823] text-[#4d5364]'
                : 'bg-[rgba(64,120,255,0.16)] text-[#cfd6e4] hover:bg-[rgba(64,120,255,0.28)]'
            }`}
          >
            提交异步任务
          </button>
          <button
            onClick={onLoadFindings}
            className="rounded bg-[rgba(255,255,255,0.05)] px-3 py-1.5 text-[0.8125rem] text-[#b0b5c0] hover:bg-[rgba(255,255,255,0.08)]"
          >
            读取结论
          </button>
        </div>
      </section>

      <section className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-4">
        <h3 className="text-[0.875rem] font-semibold text-[#d8dce6]">本地解析测试（无需 Key）</h3>
        <label htmlFor="research-md" className="mt-2 block text-[0.8125rem] text-[#636878]">
          粘贴 Alice 返回的 Markdown（含 ```json 代码块或表格）
        </label>
        <textarea
          id="research-md"
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          rows={5}
          placeholder={'结论：信用利差处于历史高位。\n```json\n{"framework":"信用环境","conclusion":"利差偏高","factors":[{"name":"HY OAS","value":3.72,"direction":"negative"}],"score":25,"asOf":"2026-11-26"}\n```'}
          className="mt-1 w-full rounded border border-[#1a1d26] bg-[#0b0d13] px-2.5 py-2 font-mono text-[0.8125rem] text-[#d8dce6] outline-none focus:border-[#4078ff]"
        />
        <button
          onClick={onResolve}
          disabled={busy}
          className="mt-2 rounded bg-[rgba(64,120,255,0.16)] px-3 py-1.5 text-[0.8125rem] text-[#cfd6e4] hover:bg-[rgba(64,120,255,0.28)] disabled:cursor-not-allowed"
        >
          解析为 Finding
        </button>
        {note && <p className="mt-2 text-[0.8125rem] text-[#f5a524]">{note}</p>}
      </section>

      {(finding || findings.length > 0) && (
        <section className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-4">
          <h3 className="mb-2 text-[0.875rem] font-semibold text-[#d8dce6]">结构化结论</h3>
          {[finding, ...findings].filter(Boolean).map((f, i) => (
            <div key={f!.id + i} className="mb-2 border-b border-[#151823] pb-2 last:border-0">
              <div className="flex flex-wrap gap-2 text-[0.8125rem]">
                <span className="text-[#d8dce6]">{f!.framework}</span>
                <span className="rounded bg-[#151823] px-1.5 text-[#636878]">{f!.confidence}</span>
                <span className="text-[#4d5364]">{f!.asOf} · {f!.source}</span>
              </div>
              <p className="mt-1 text-[0.8125rem] text-[#b0b5c0]">{f!.conclusion}</p>
              {f!.factors.map((factor) => (
                <span key={factor.name} className="mr-2 text-[0.75rem] text-[#636878]">
                  {factor.name}={String(factor.value)}
                </span>
              ))}
            </div>
          ))}
        </section>
      )}
    </div>
  );
});
