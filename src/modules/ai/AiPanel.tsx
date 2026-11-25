import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useSnapshotStore } from '../../core/data/snapshot';
import { buildResonance } from '../../core/analysis/resonance';
import { usePositioningStore } from '../../stores/usePositioningStore';
import { useStructureStore } from '../../stores/useStructureStore';
import { fetchNewsFeed } from '../../services/macro';
import { useAppStore } from '../../stores/useAppStore';
import type { NewsItem } from '../../types/macro';
import {
  AI_PRESETS,
  clearAiConfig,
  fetchAiModels,
  fetchAiStatus,
  loadAiConfig,
  maskKey,
  normalizeBaseUrl,
  saveAiConfig,
  streamChat,
  type AiConfig,
  type AiProviderId,
  type AiServerStatus,
  type ChatMessage,
} from '../../services/ai';
import { AI_FIRST_TASK, AI_SYSTEM_PROMPT, buildDataBrief } from './context';

interface AiPanelProps {
  open: boolean;
  onClose: () => void;
}

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

const MARKET_LABEL = { US: '美股', CN: 'A股' } as const;

const EMPTY_DRAFT: AiConfig = {
  provider: 'custom',
  baseUrl: '',
  apiKey: '',
  model: '',
  temperature: 0.3,
};

/** 极简 Markdown 渲染：只认标题 / 列表 / 段落，全部走文本节点，不注入 HTML。 */
function MarkdownLite({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split('\n');
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push(
        <h4 key={key++} className="mt-3 mb-1 text-[0.7188rem] font-semibold text-[#d8dce6]">
          {line.slice(3)}
        </h4>,
      );
      i += 1;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={key++} className="my-1 list-disc space-y-0.5 pl-4">
          {items.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>,
      );
      continue;
    }
    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith('#') &&
      !/^\s*[-*]\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={key++} className="my-1 leading-relaxed">
        {para.join(' ')}
      </p>,
    );
  }

  return <div className="text-[0.7188rem] text-[#b0b5c0]">{blocks}</div>;
}

export const AiPanel = memo(function AiPanel({ open, onClose }: AiPanelProps) {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const market = useAppStore((s) => s.market);

  const [status, setStatus] = useState<AiServerStatus>({ configured: false, model: '', baseUrl: '' });
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AiConfig>(EMPTY_DRAFT);
  const [formError, setFormError] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [probing, setProbing] = useState(false);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [streamText, setStreamText] = useState('');
  const [phase, setPhase] = useState<'idle' | 'collecting' | 'generating'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState('');

  const apiMessages = useRef<ChatMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const ready = status.configured || Boolean(config);
  const busy = phase !== 'idle';

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void fetchAiStatus().then((next) => {
      if (!alive) return;
      setStatus(next);
      const stored = loadAiConfig();
      setConfig(stored);
      if (!stored && !next.configured) {
        setDraft(EMPTY_DRAFT);
        setEditing(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, streamText, error, phase]);

  const statusChip = useMemo(() => {
    if (status.configured) return { text: `服务端统一配置${status.model ? ` · ${status.model}` : ''}`, color: '#0ca678' };
    if (config) return { text: `本地配置 · ${config.model}`, color: '#4078ff' };
    return { text: '未配置模型接口', color: '#f59e4b' };
  }, [status, config]);

  const runStream = useCallback(
    async (activeConfig: AiConfig | null) => {
      const controller = new AbortController();
      abortRef.current = controller;
      let acc = '';
      setStreamText('');
      setPhase('generating');
      try {
        await streamChat({
          messages: apiMessages.current,
          config: activeConfig,
          signal: controller.signal,
          onDelta: (delta) => {
            acc += delta;
            setStreamText(acc);
          },
        });
        apiMessages.current = [...apiMessages.current, { role: 'assistant', content: acc }];
        setTurns((prev) => [...prev, { role: 'assistant', content: acc }]);
        setStreamText('');
      } catch (err) {
        if (controller.signal.aborted) {
          if (acc.trim()) {
            apiMessages.current = [...apiMessages.current, { role: 'assistant', content: acc }];
            setTurns((prev) => [...prev, { role: 'assistant', content: acc }]);
          }
          setStreamText('');
        } else {
          setError(err instanceof Error ? err.message : '调用失败');
          setStreamText('');
        }
      } finally {
        abortRef.current = null;
        setPhase('idle');
      }
    },
    [],
  );

  const summarize = useCallback(async () => {
    if (busy || !ready) return;
    setError(null);
    setTurns([]);
    setStreamText('');
    apiMessages.current = [];
    setPhase('collecting');

    try {
      const structureStore = useStructureStore.getState();
      const positioning = usePositioningStore.getState();
      const [, , news] = await Promise.all([
        structureStore.load(market),
        positioning.load(),
        fetchNewsFeed(market).catch(() => [] as NewsItem[]),
      ]);
      const structure = useStructureStore.getState().byMarket[market] ?? null;
      const term = usePositioningStore.getState().term;
      const options = usePositioningStore.getState().options;
      const resonance = buildResonance({ snapshot, term, options, structure });
      const brief = buildDataBrief({ market, snapshot, structure, news, resonance, term });
      apiMessages.current = [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        { role: 'user', content: `${AI_FIRST_TASK}\n${brief}\n----- 数据结束 -----` },
      ];
      setTurns([{ role: 'user', content: `总结当前${MARKET_LABEL[market]}数据` }]);
      await runStream(status.configured ? null : config);
    } catch (err) {
      setError(err instanceof Error ? err.message : '数据收集失败');
      setPhase('idle');
    }
  }, [busy, ready, market, snapshot, status.configured, config, runStream]);

  const sendFollowUp = useCallback(() => {
    const question = followUp.trim();
    if (!question || busy || !apiMessages.current.length) return;
    setFollowUp('');
    setError(null);
    apiMessages.current = [...apiMessages.current, { role: 'user', content: question }];
    setTurns((prev) => [...prev, { role: 'user', content: question }]);
    void runStream(status.configured ? null : config);
  }, [followUp, busy, runStream, status.configured, config]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const openSettings = useCallback(() => {
    setDraft(
      config ?? {
        ...EMPTY_DRAFT,
        baseUrl: AI_PRESETS[0].baseUrl,
        model: AI_PRESETS[0].model,
        provider: AI_PRESETS[0].id,
      },
    );
    setModels([]);
    setFormError(null);
    setEditing(true);
  }, [config]);

  const applyPreset = useCallback((id: AiProviderId) => {
    const preset = AI_PRESETS.find((p) => p.id === id);
    setDraft((prev) => ({
      ...prev,
      provider: id,
      baseUrl: preset ? preset.baseUrl : prev.baseUrl,
      model: preset ? preset.model || prev.model : prev.model,
    }));
    setModels([]);
  }, []);

  const probeModels = useCallback(async () => {
    setProbing(true);
    setFormError(null);
    try {
      const list = await fetchAiModels({
        ...draft,
        baseUrl: normalizeBaseUrl(draft.baseUrl),
      });
      setModels(list);
      if (!list.length) setFormError('上游没有返回模型列表，请手动填写模型名');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '拉取模型列表失败');
    } finally {
      setProbing(false);
    }
  }, [draft]);

  const saveDraft = useCallback(() => {
    const baseUrl = normalizeBaseUrl(draft.baseUrl);
    if (!/^https?:\/\//i.test(baseUrl)) {
      setFormError('Base URL 需要以 http:// 或 https:// 开头');
      return;
    }
    if (!draft.model.trim()) {
      setFormError('请填写模型名');
      return;
    }
    const next: AiConfig = {
      ...draft,
      baseUrl,
      model: draft.model.trim(),
      apiKey: draft.apiKey.trim(),
      temperature: typeof draft.temperature === 'number' ? draft.temperature : 0.3,
    };
    saveAiConfig(next);
    setConfig(next);
    setEditing(false);
    setFormError(null);
  }, [draft]);

  if (!open) return null;

  const presetHint = AI_PRESETS.find((p) => p.id === draft.provider)?.hint ?? '';

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <button
        type="button"
        aria-label="关闭 AI 面板"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/55"
      />
      <aside className="relative flex h-full w-full max-w-[33.75rem] flex-col border-l border-[#1a1d26] bg-[#0b0d13] shadow-2xl">
        <header className="flex items-center justify-between gap-2 border-b border-[#1a1d26] px-3 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[0.8125rem] font-semibold text-[#d8dce6]">AI 分析</span>
              <span
                className="truncate rounded px-1.5 py-0.5 text-[0.5938rem]"
                style={{ color: statusChip.color, background: `${statusChip.color}18` }}
                title={statusChip.text}
              >
                {statusChip.text}
              </span>
            </div>
            <div className="mt-0.5 text-[0.5625rem] text-[#4d5364]">
              只总结本机已抓到的真实数据 · 不给买卖建议 · 模型输出可能有误，请自行核对
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={openSettings}
              className="rounded border border-[#1a1d26] px-2 py-1 text-[0.5938rem] text-[#8a8f9d] hover:border-[#2a3040] hover:text-[#d8dce6]"
            >
              设置
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-[#1a1d26] px-2 py-1 text-[0.5938rem] text-[#8a8f9d] hover:border-[#2a3040] hover:text-[#d8dce6]"
            >
              关闭
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
          {editing ? (
            <div className="space-y-2.5">
              <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-3">
                <div className="mb-2 text-[0.6563rem] text-[#8a8f9d]">
                  填写一次，保存在本机浏览器，不上传。若部署方已在服务端配置模型，这里可以不填。
                </div>

                <label className="mb-1 block text-[0.5938rem] text-[#636878]">接口类型</label>
                <select
                  value={draft.provider}
                  onChange={(e) => applyPreset(e.target.value as AiProviderId)}
                  className="mb-2 w-full rounded border border-[#1a1d26] bg-[#090b0f] px-2 py-1.5 text-[0.6875rem] text-[#d8dce6] outline-none focus:border-[#4078ff]"
                >
                  {AI_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                {presetHint && <div className="mb-2 text-[0.5625rem] leading-relaxed text-[#4d5364]">{presetHint}</div>}

                <label className="mb-1 block text-[0.5938rem] text-[#636878]">Base URL</label>
                <input
                  value={draft.baseUrl}
                  onChange={(e) => setDraft((p) => ({ ...p, baseUrl: e.target.value }))}
                  placeholder="https://api.deepseek.com/v1"
                  spellCheck={false}
                  className="mb-2 w-full rounded border border-[#1a1d26] bg-[#090b0f] px-2 py-1.5 font-mono text-[0.6563rem] text-[#d8dce6] outline-none focus:border-[#4078ff]"
                />

                <label className="mb-1 block text-[0.5938rem] text-[#636878]">API Key</label>
                <input
                  value={draft.apiKey}
                  onChange={(e) => setDraft((p) => ({ ...p, apiKey: e.target.value }))}
                  placeholder="sk-..."
                  type="password"
                  spellCheck={false}
                  autoComplete="off"
                  className="mb-2 w-full rounded border border-[#1a1d26] bg-[#090b0f] px-2 py-1.5 font-mono text-[0.6563rem] text-[#d8dce6] outline-none focus:border-[#4078ff]"
                />
                {draft.apiKey && (
                  <div className="mb-2 text-[0.5625rem] text-[#4d5364]">当前：{maskKey(draft.apiKey)}</div>
                )}

                <label className="mb-1 block text-[0.5938rem] text-[#636878]">模型名</label>
                <div className="mb-1 flex gap-1.5">
                  <input
                    value={draft.model}
                    onChange={(e) => setDraft((p) => ({ ...p, model: e.target.value }))}
                    placeholder="deepseek-chat"
                    spellCheck={false}
                    list="marvis-ai-models"
                    className="min-w-0 flex-1 rounded border border-[#1a1d26] bg-[#090b0f] px-2 py-1.5 font-mono text-[0.6563rem] text-[#d8dce6] outline-none focus:border-[#4078ff]"
                  />
                  <datalist id="marvis-ai-models">
                    {models.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                  <button
                    type="button"
                    onClick={() => void probeModels()}
                    disabled={probing || !draft.baseUrl}
                    className="shrink-0 rounded border border-[#1a1d26] px-2 py-1 text-[0.5938rem] text-[#8a8f9d] hover:border-[#2a3040] hover:text-[#d8dce6] disabled:opacity-40"
                  >
                    {probing ? '拉取中…' : '拉取模型'}
                  </button>
                </div>
                {models.length > 0 && (
                  <div className="mb-1 max-h-24 overflow-y-auto rounded border border-[#1a1d26] bg-[#090b0f] p-1">
                    {models.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setDraft((p) => ({ ...p, model: m }))}
                        className={`block w-full truncate rounded px-1.5 py-0.5 text-left font-mono text-[0.5938rem] hover:bg-[rgba(64,120,255,0.14)] ${
                          draft.model === m ? 'text-[#4078ff]' : 'text-[#8a8f9d]'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}

                {formError && <div className="mt-2 text-[0.5938rem] text-[#f04452]">{formError}</div>}

                <div className="mt-3 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={saveDraft}
                    className="rounded bg-[#4078ff] px-3 py-1.5 text-[0.625rem] font-medium text-white hover:bg-[#3570f0]"
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setFormError(null);
                    }}
                    className="rounded border border-[#1a1d26] px-3 py-1.5 text-[0.625rem] text-[#8a8f9d] hover:text-[#d8dce6]"
                  >
                    取消
                  </button>
                  {config && (
                    <button
                      type="button"
                      onClick={() => {
                        clearAiConfig();
                        setConfig(null);
                        setDraft(EMPTY_DRAFT);
                        setEditing(false);
                        setFormError(null);
                      }}
                      className="ml-auto rounded border border-[#1a1d26] px-2 py-1.5 text-[0.5938rem] text-[#636878] hover:text-[#f04452]"
                    >
                      清空本地配置
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {!ready && (
                <div className="rounded-[0.3125rem] border border-[#f59e4b] bg-[rgba(245,158,75,0.07)] px-3 py-2 text-[0.6563rem] leading-relaxed text-[#f59e4b]">
                  还没有可用的模型接口。点右上角「设置」填一次 Base URL、API Key 和模型名即可，配置只保存在本机。
                </div>
              )}

              {!turns.length && !streamText && !busy && ready && (
                <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] px-3 py-2.5 text-[0.6563rem] leading-relaxed text-[#8a8f9d]">
                  点下方「总结当前数据」，会把本页已抓到的风险体制、环境指标、
                  {MARKET_LABEL[market]}结构与网页快讯一起交给模型，输出结论、变化、风险、数据缺口和跟踪点。
                </div>
              )}

              {turns.map((turn, idx) =>
                turn.role === 'user' ? (
                  <div key={idx} className="flex justify-end">
                    <div className="max-w-[86%] rounded-[0.3125rem] bg-[rgba(64,120,255,0.16)] px-2.5 py-1.5 text-[0.6563rem] text-[#cfd6e4]">
                      {turn.content}
                    </div>
                  </div>
                ) : (
                  <div key={idx} className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] px-3 py-2">
                    <MarkdownLite text={turn.content} />
                  </div>
                ),
              )}

              {streamText && (
                <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] px-3 py-2">
                  <MarkdownLite text={streamText} />
                  <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-[#4078ff]" />
                </div>
              )}

              {phase === 'collecting' && (
                <div className="text-[0.625rem] text-[#4078ff]">正在收集本页数据（结构、快讯可能较慢）…</div>
              )}
              {phase === 'generating' && !streamText && (
                <div className="text-[0.625rem] text-[#4078ff]">模型思考中…</div>
              )}

              {error && (
                <div className="rounded-[0.3125rem] border border-[#f04452] bg-[rgba(240,68,82,0.06)] px-2.5 py-2 text-[0.625rem] leading-relaxed text-[#f04452]">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="border-t border-[#1a1d26] px-3 py-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void summarize()}
              disabled={busy || !ready}
              className="shrink-0 rounded bg-[#4078ff] px-3 py-1.5 text-[0.625rem] font-medium text-white hover:bg-[#3570f0] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? '处理中…' : turns.length ? '重新总结' : '总结当前数据'}
            </button>
            {busy && (
              <button
                type="button"
                onClick={stop}
                className="shrink-0 rounded border border-[#1a1d26] px-2.5 py-1.5 text-[0.625rem] text-[#f59e4b] hover:border-[#2a3040]"
              >
                停止
              </button>
            )}
            {!busy && turns.some((t) => t.role === 'assistant') && (
              <button
                type="button"
                onClick={() => {
                  setTurns([]);
                  setStreamText('');
                  apiMessages.current = [];
                  setError(null);
                }}
                className="shrink-0 rounded border border-[#1a1d26] px-2.5 py-1.5 text-[0.625rem] text-[#8a8f9d] hover:text-[#d8dce6]"
              >
                清空
              </button>
            )}
            <input
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendFollowUp();
                }
              }}
              disabled={!apiMessages.current.length || busy}
              placeholder={apiMessages.current.length ? '继续追问，例如：哪些指标是滞后的？' : '先总结一次再追问'}
              className="min-w-0 flex-1 rounded border border-[#1a1d26] bg-[#090b0f] px-2 py-1.5 text-[0.6563rem] text-[#d8dce6] outline-none placeholder:text-[#3f4453] focus:border-[#4078ff] disabled:opacity-50"
            />
            <button
              type="button"
              onClick={sendFollowUp}
              disabled={!followUp.trim() || busy || !apiMessages.current.length}
              className="shrink-0 rounded border border-[#1a1d26] px-2.5 py-1.5 text-[0.625rem] text-[#8a8f9d] hover:border-[#2a3040] hover:text-[#d8dce6] disabled:opacity-40"
            >
              发送
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
});
