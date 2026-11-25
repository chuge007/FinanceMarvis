/**
 * 内置 AI 助手（前端侧）。
 *
 * 三条硬约束：
 *  1. 浏览器不直连上游模型——Key 会暴露在前端，且上游普遍不发 CORS 头。
 *     统一 POST 同域 `/ai/chat`，由 server/proxy.mjs 或 desktop/launcher.cjs 转发。
 *  2. 使用者自带的 Key 只存在本机 localStorage，随请求头一次性带给本地服务端，
 *     不落盘到服务端、不上传任何第三方。
 *  3. 部署方若在服务端设置了 AI_BASE_URL / AI_API_KEY / AI_MODEL，前端无需任何配置
 *     即可使用（`/ai/config` 返回 configured=true），本地填的配置不会覆盖它。
 */
import { readJSON, removeKey, writeJSON } from '../shared/utils/localStore';

export type AiProviderId = 'codebuddy' | 'tokenplan' | 'deepseek' | 'custom';

export interface AiPreset {
  id: AiProviderId;
  label: string;
  baseUrl: string;
  model: string;
  hint: string;
}

/** 预设只填「常见可用值」，模型名以 /v1/models 或服务商控制台为准。 */
export const AI_PRESETS: AiPreset[] = [
  {
    id: 'codebuddy',
    label: 'CodeBuddy 本地网关',
    baseUrl: 'http://127.0.0.1:8001/v1',
    model: '',
    hint: '需先在本机运行 codebuddy2api，模型名用 GET /v1/models 返回的真实值（如 DeepSeek V4）',
  },
  {
    id: 'tokenplan',
    label: '腾讯云 Token Plan',
    baseUrl: 'https://tokenhub.tencentmaas.com/plan/v3',
    model: '',
    hint: 'Key 形如 sk-tp-xxx，模型名需在你订阅的套餐范围内',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek 官方',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    hint: '官方 OpenAI 兼容接口，Key 形如 sk-xxx',
  },
  {
    id: 'custom',
    label: '自定义（OpenAI 兼容）',
    baseUrl: '',
    model: '',
    hint: '任何兼容 /chat/completions 的服务：OpenRouter、硅基流动、本地 Ollama 等',
  },
];

export interface AiConfig {
  provider: AiProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiServerStatus {
  /** 服务端是否已统一配置模型接口（部署方提供 Key 时为 true）。 */
  configured: boolean;
  model: string;
  baseUrl: string;
}

const CONFIG_KEY = 'marvis.ai.config.v1';

export function loadAiConfig(): AiConfig | null {
  const raw = readJSON<AiConfig | null>(CONFIG_KEY, null);
  if (!raw || !raw.baseUrl || !raw.model) return null;
  return {
    provider: raw.provider ?? 'custom',
    baseUrl: raw.baseUrl,
    apiKey: raw.apiKey ?? '',
    model: raw.model,
    temperature: typeof raw.temperature === 'number' ? raw.temperature : 0.3,
  };
}

export function saveAiConfig(config: AiConfig): void {
  writeJSON(CONFIG_KEY, config);
}

export function clearAiConfig(): void {
  removeKey(CONFIG_KEY);
}

/** 与服务端 normalizeBase 保持一致，避免两处规则漂移导致 404。 */
export function normalizeBaseUrl(raw: string): string {
  let base = String(raw ?? '').trim().replace(/\/+$/, '');
  if (!base) return '';
  base = base.replace(/\/chat\/completions$/, '');
  if (!/\/v\d+[a-z]*$/i.test(base)) base += '/v1';
  return base;
}

/** 只回显 Key 的首尾，避免设置面板把完整密钥留在屏幕上。 */
export function maskKey(key: string): string {
  const k = String(key ?? '');
  if (!k) return '';
  if (k.length <= 8) return '****';
  return `${k.slice(0, 4)}****${k.slice(-4)}`;
}

export async function fetchAiStatus(): Promise<AiServerStatus> {
  try {
    const resp = await fetch('/ai/config', { headers: { accept: 'application/json' } });
    if (!resp.ok) throw new Error(String(resp.status));
    const data = await resp.json();
    return {
      configured: Boolean(data?.configured),
      model: String(data?.model ?? ''),
      baseUrl: String(data?.baseUrl ?? ''),
    };
  } catch {
    return { configured: false, model: '', baseUrl: '' };
  }
}

/** 经本地服务端拉取上游模型列表（浏览器直连会被 CORS 拦住）。 */
export async function fetchAiModels(config: AiConfig | null): Promise<string[]> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (config) {
    headers['x-ai-base'] = normalizeBaseUrl(config.baseUrl);
    headers['x-ai-key'] = config.apiKey;
  }
  const resp = await fetch('/ai/models', { headers });
  const raw = await resp.text().catch(() => '');
  if (!resp.ok) {
    let message = `拉取模型列表失败（HTTP ${resp.status}）`;
    try {
      const json = JSON.parse(raw);
      if (json?.error?.message) message = String(json.error.message);
    } catch {
      /* 上游返回非 JSON，保留默认提示 */
    }
    throw new Error(message);
  }
  let json: any = null;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('上游返回的不是 JSON，可能不是 OpenAI 兼容接口');
  }
  const list = json?.data ?? json?.models ?? [];
  if (!Array.isArray(list)) return [];
  return list
    .map((item: any) => (typeof item === 'string' ? item : String(item?.id ?? item?.name ?? '')))
    .filter((id: string) => Boolean(id));
}

function extractContent(raw: string): string {
  try {
    const json = JSON.parse(raw);
    const msg = json?.choices?.[0]?.message?.content;
    if (typeof msg === 'string') return msg;
    const text = json?.choices?.[0]?.text;
    if (typeof text === 'string') return text;
    const err = json?.error?.message ?? json?.message;
    if (typeof err === 'string') throw new Error(err);
    return '';
  } catch (err) {
    if (err instanceof Error && err.message && !err.message.startsWith('Unexpected')) throw err;
    return raw;
  }
}

export interface StreamChatOptions {
  messages: ChatMessage[];
  /** null 表示使用服务端统一配置的接口。 */
  config: AiConfig | null;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
}

/**
 * 流式对话：逐段回调增量文本，返回完整回答。
 * 上游不支持 SSE（返回一次性 JSON）时自动降级为整段回调。
 */
export async function streamChat({ messages, config, signal, onDelta }: StreamChatOptions): Promise<string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'text/event-stream',
  };
  const body: Record<string, unknown> = {
    messages,
    stream: true,
    temperature: config?.temperature ?? 0.3,
  };
  if (config) {
    headers['x-ai-base'] = normalizeBaseUrl(config.baseUrl);
    headers['x-ai-key'] = config.apiKey;
    headers['x-ai-model'] = config.model;
    body.model = config.model;
  }

  const resp = await fetch('/ai/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    let message = `请求失败（HTTP ${resp.status}）`;
    try {
      const json = JSON.parse(text);
      if (json?.error?.message) message = String(json.error.message);
    } catch {
      if (text.trim()) message = text.trim().slice(0, 300);
    }
    throw new Error(message);
  }

  const contentType = resp.headers.get('content-type') ?? '';

  if (!contentType.includes('event-stream')) {
    const raw = await resp.text();
    const content = extractContent(raw);
    if (content) onDelta(content);
    return content;
  }

  const reader = resp.body?.getReader();
  if (!reader) throw new Error('当前环境不支持流式读取');

  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

    let sep = buffer.indexOf('\n\n');
    while (sep >= 0) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      sep = buffer.indexOf('\n\n');

      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          if (json?.error?.message) throw new Error(String(json.error.message));
          const delta = json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.message?.content ?? '';
          if (delta) {
            answer += delta;
            onDelta(delta);
          }
        } catch (err) {
          if (err instanceof Error && err.message && !err.message.startsWith('Unexpected')) throw err;
        }
      }
    }
  }

  if (!answer.trim()) throw new Error('上游返回了空内容，请检查模型名是否正确');
  return answer;
}
