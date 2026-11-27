/**
 * 从 D:\FinanceMarvis\Github 下已下载的开源项目源码中抽取公开能力，
 * 生成 src/core/data/projectCapabilities.generated.ts。
 *
 * 用法：node scripts/gen-project-capabilities.mjs
 * 规则：只读源码，不复制实现；能力清单是「功能地图」，不是数据链。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const GITHUB_DIR = path.join(ROOT, 'Github');
const OUT = path.join(ROOT, 'src', 'core', 'data', 'projectCapabilities.generated.ts');
const JSON_OUT = path.join(ROOT, 'public', 'data', 'project-capabilities.json');

const PROJECTS = [
  { id: 'akshare', label: 'AkShare', dir: 'akshare', repo: 'akfamily/akshare', group: '中国市场', stability: 'S4', status: 'backup', requires: ['python311'], markets: ['cn', 'hk', 'global'], primaryFor: ['cn:lhb', 'cn:fund-nav'], fallbackFor: ['cn:index-kline', 'cn:margin'], license: 'MIT' },
  { id: 'tushare', label: 'Tushare Pro', dir: 'tushare', repo: 'waditu/tushare', group: '中国市场', stability: 'S2', status: 'key-required', requires: ['key'], markets: ['cn'], primaryFor: ['cn:fundamentals', 'cn:margin', 'cn:lhb'], fallbackFor: [], license: 'MIT' },
  { id: 'baostock', label: 'baostock', dir: 'baostock', repo: 'shimencaiji/baostock', group: '中国市场', stability: 'S3', status: 'python-required', requires: ['python311'], markets: ['cn'], primaryFor: [], fallbackFor: ['cn:index-kline'], license: 'Apache-2.0' },
  { id: 'adata', label: 'ADATA', dir: 'adata', repo: '1nchaos/adata', group: '中国市场', stability: 'S4', status: 'catalog-only', requires: ['python311'], markets: ['cn'], primaryFor: [], fallbackFor: ['cn:sector-flow'], license: 'MIT' },
  { id: 'efinance', label: 'efinance', dir: 'efinance', repo: 'Micro-sheep/efinance', group: '中国市场', stability: 'S4', status: 'catalog-only', requires: ['python311'], markets: ['cn'], primaryFor: [], fallbackFor: ['cn:fund-nav'], license: 'MIT' },
  { id: 'pytdx', label: 'pytdx', dir: 'pytdx', repo: 'rainx/pytdx', group: '中国市场', stability: 'S3', status: 'external-only', requires: ['local-server'], markets: ['cn'], primaryFor: [], fallbackFor: ['cn:index-kline'], license: 'MIT' },
  { id: 'mootdx', label: 'mootdx', dir: 'mootdx', repo: 'mootdx/mootdx', group: '中国市场', stability: 'S3', status: 'external-only', requires: ['local-server'], markets: ['cn'], primaryFor: [], fallbackFor: ['cn:index-kline'], license: 'MIT' },
  { id: 'yfinance', label: 'yfinance', dir: 'yfinance', repo: 'ranaroussi/yfinance', group: '全球市场', stability: 'S4', status: 'live', requires: [], markets: ['us', 'global'], primaryFor: ['us:etf', 'global:index'], fallbackFor: ['us:eod'], license: 'Apache-2.0' },
  { id: 'openbb', label: 'OpenBB', dir: 'OpenBB', repo: 'OpenBB-finance/OpenBB', group: '全球市场', stability: 'S5', status: 'catalog-only', requires: [], markets: ['us', 'global'], primaryFor: [], fallbackFor: [], license: 'AGPL-3.0' },
  { id: 'pandas-datareader', label: 'pandas-datareader', dir: 'pandas-datareader', repo: 'pydata/pandas-datareader', group: '全球市场', stability: 'S5', status: 'live', requires: [], markets: ['global'], primaryFor: [], fallbackFor: ['us:inflation'], license: 'BSD-3-Clause' },
  { id: 'yahooquery', label: 'yahooquery', dir: 'yahooquery', repo: 'dpguthrie/yahooquery', group: '全球市场', stability: 'S4', status: 'catalog-only', requires: [], markets: ['us'], primaryFor: [], fallbackFor: ['us:fundamentals'], license: 'MIT' },
  { id: 'sec-edgar-downloader', label: 'sec-edgar-downloader', dir: 'sec-edgar-downloader', repo: 'jadchaar/sec-edgar-downloader', group: '全球市场', stability: 'S1', status: 'live', requires: ['python311'], markets: ['us'], primaryFor: ['us:filings'], fallbackFor: [], license: 'MIT' },
  { id: 'edgartools', label: 'edgartools', dir: 'edgartools', repo: 'dgunning/edgartools', group: '全球市场', stability: 'S1', status: 'live', requires: ['python311'], markets: ['us'], primaryFor: ['us:filings'], fallbackFor: [], license: 'MIT' },
  { id: 'alpha-vantage', label: 'Alpha Vantage', dir: 'alpha_vantage', repo: 'RomelTorres/alpha_vantage', group: '全球市场', stability: 'S2', status: 'key-required', requires: ['key'], markets: ['us', 'global'], primaryFor: [], fallbackFor: ['us:eod'], license: 'MIT' },
  { id: 'twelvedata', label: 'Twelve Data', dir: 'twelvedata-python', repo: 'twelvedata/twelvedata-python', group: '全球市场', stability: 'S2', status: 'key-required', requires: ['key'], markets: ['us', 'global'], primaryFor: [], fallbackFor: ['us:eod'], license: 'MIT' },
  { id: 'fmp', label: 'FMP SDK', dir: 'fmpsdk', repo: 'daxm/fmpsdk', group: '全球市场', stability: 'S2', status: 'key-required', requires: ['key'], markets: ['us'], primaryFor: ['us:eod'], fallbackFor: ['us:fundamentals'], license: 'BSD-3-Clause' },
  { id: 'ccxt', label: 'ccxt', dir: 'ccxt', repo: 'ccxt/ccxt', group: '加密货币', stability: 'S3', status: 'live', requires: ['python311'], markets: ['crypto'], primaryFor: ['crypto:quote', 'crypto:ohlcv'], fallbackFor: [], license: 'MIT' },
  { id: 'freqtrade', label: 'freqtrade', dir: 'freqtrade', repo: 'freqtrade/freqtrade', group: '加密货币', stability: 'TOOL', status: 'catalog-only', requires: ['python311'], markets: ['crypto'], primaryFor: [], fallbackFor: [], license: 'GPL-3.0' },
  { id: 'fredapi', label: 'fredapi', dir: 'fredapi', repo: 'mortada/fredapi', group: '宏观/另类', stability: 'S1', status: 'live', requires: [], markets: ['us'], primaryFor: ['us:inflation', 'us:rates'], fallbackFor: [], license: 'BSD-3-Clause' },
  { id: 'nasdaq-data-link', label: 'Nasdaq Data Link', dir: 'data-link-python', repo: 'nasdaq/data-link-python', group: '宏观/另类', stability: 'S2', status: 'key-required', requires: ['key'], markets: ['global'], primaryFor: [], fallbackFor: [], license: 'Apache-2.0' },
  { id: 'backtrader', label: 'Backtrader', dir: 'backtrader', repo: 'mementum/backtrader', group: '工具框架', stability: 'TOOL', status: 'python-required', requires: ['python311'], markets: ['global'], primaryFor: [], fallbackFor: [], license: 'GPL-3.0' },
  { id: 'vectorbt', label: 'vectorbt', dir: 'vectorbt', repo: 'polakowo/vectorbt', group: '工具框架', stability: 'TOOL', status: 'python-required', requires: ['python311'], markets: ['global'], primaryFor: [], fallbackFor: [], license: 'Apache-2.0' },
  { id: 'rqalpha', label: 'RQAlpha', dir: 'rqalpha', repo: 'ricequant/rqalpha', group: '工具框架', stability: 'TOOL', status: 'python-required', requires: ['python311'], markets: ['cn'], primaryFor: [], fallbackFor: [], license: 'Apache-2.0' },
  { id: 'vnpy', label: 'vn.py', dir: 'vnpy', repo: 'vnpy/vnpy', group: '工具框架', stability: 'TOOL', status: 'external-only', requires: ['python311'], markets: ['cn'], primaryFor: [], fallbackFor: [], license: 'MIT' },
  { id: 'pyfolio', label: 'pyfolio', dir: 'pyfolio', repo: 'quantopian/pyfolio', group: '工具框架', stability: 'TOOL', status: 'catalog-only', requires: [], markets: ['us'], primaryFor: [], fallbackFor: [], license: 'Apache-2.0' },
  { id: 'empyrical', label: 'empyrical', dir: 'empyrical', repo: 'quantopian/empyrical', group: '工具框架', stability: 'TOOL', status: 'catalog-only', requires: [], markets: ['us'], primaryFor: [], fallbackFor: [], license: 'Apache-2.0' },
];

const SKIP_DIRS = new Set(['.git', '__pycache__', 'node_modules', '.venv', 'venv', 'build', 'dist', 'docs', 'doc', 'tests', 'test', 'examples', 'example', '.github', 'site-packages', 'coverage']);
const CATEGORY_RULES = [
  ['财务', /financ|income|balance|cashflow|statement|fundamental|report|filings?|10k|10q|8k/i],
  ['回测', /backtest|strategy|strategies|optimize|simulat|runner/i],
  ['绩效', /sharpe|sortino|calmar|drawdown|performance|empyrical|pyfolio/i],
  ['基金', /fund|nav|etf/i],
  ['期货', /future|futures|commodity/i],
  ['外汇', /forex|fx|currency/i],
  ['期权', /option|optionchain|greek/i],
  ['加密', /crypto|coin|ticker|ohlcv|exchange/i],
  ['宏观', /macro|fred|inflation|cpi|gdp|rates?|economic/i],
  ['资金流', /flow|capital|margin|position|holding/i],
  ['板块', /sector|industry|board|rank/i],
  ['情绪', /sentiment|fear|greed|emotion/i],
  ['K线', /kline|ohlc|hist|history|candle|bars/i],
  ['行情', /quote|spot|realtime|price|ticker|market/i],
  ['新闻', /news|headline|press/i],
  ['事件', /calendar|event|date/i],
  ['工具', /util|helper|convert|format|parse|cache|config/i],
];

function categoryOf(name) {
  for (const [label, re] of CATEGORY_RULES) if (re.test(name)) return label;
  return '其他';
}

function collectFiles(dir, exts, out = [], depth = 0) {
  if (depth > 6 || out.length > 6000) return out;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) collectFiles(full, exts, out, depth + 1);
    else if (exts.includes(path.extname(e.name))) out.push(full);
  }
  return out;
}

function humanize(name) {
  return name.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
}

function extractCapabilities(project) {
  const dir = path.join(GITHUB_DIR, project.dir);
  if (!fs.existsSync(path.join(dir, '.git'))) return { cloned: false, capabilities: [], fileCount: 0 };
  const files = collectFiles(dir, project.id === 'ccxt' ? ['.py', '.js', '.ts'] : ['.py']);
  const names = new Map();
  const pyDef = /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/gm;
  const pyClass = /^\s*class\s+([A-Za-z_]\w*)/gm;
  const jsDef = /export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/g;
  for (const file of files) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    if (text.length > 900_000) continue;
    const patterns = file.endsWith('.py') ? [pyDef, pyClass] : [jsDef];
    for (const re of patterns) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        const name = m[1];
        if (!name || name.startsWith('_') || /^(test|main|setup|teardown)$/i.test(name)) continue;
        if (!names.has(name)) {
          names.set(name, {
            id: `${project.id}:${name}`,
            project: project.id,
            projectLabel: project.label,
            group: project.group,
            name: humanize(name),
            symbol: name,
            category: categoryOf(name),
            markets: project.markets,
            stability: project.stability,
            status: project.status,
            requires: project.requires,
            primaryFor: project.primaryFor,
            fallbackFor: project.fallbackFor,
            ui: project.status === 'catalog-only' || project.group === '工具框架' ? '全景 / 能力目录' : '全景 / 能力目录 · 业务页',
            sourcePath: `Github/${project.dir}/${path.relative(dir, file).replace(/\\/g, '/')}`,
          });
        }
      }
    }
  }
  return { cloned: true, capabilities: [...names.values()].sort((a, b) => a.symbol.localeCompare(b.symbol)), fileCount: files.length };
}

const capabilities = [];
const projects = [];
for (const project of PROJECTS) {
  const { cloned, capabilities: caps, fileCount } = extractCapabilities(project);
  projects.push({
    id: project.id,
    label: project.label,
    repo: project.repo,
    dir: `Github/${project.dir}`,
    group: project.group,
    stability: project.stability,
    status: cloned ? project.status : 'catalog-only',
    requires: project.requires,
    markets: project.markets,
    primaryFor: project.primaryFor,
    fallbackFor: project.fallbackFor,
    license: project.license,
    cloned,
    fileCount,
    capabilityCount: caps.length,
  });
  capabilities.push(...caps);
}

const ts = `// 自动生成，请勿手改。生成命令：node scripts/gen-project-capabilities.mjs
// 生成时间：${new Date().toISOString()}
// 数据来源：D:\\FinanceMarvis\\Github 下 26 个开源项目的公开函数 / 类 / 导出。
// 全量能力清单在 public/data/project-capabilities.json，运行时按需加载，不进 JS bundle。

export type CapabilityStatus = 'live' | 'backup' | 'key-required' | 'python-required' | 'catalog-only' | 'external-only';
export type Stability = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'TOOL';

export interface Capability {
  id: string;
  project: string;
  projectLabel: string;
  group: string;
  name: string;
  symbol: string;
  category: string;
  markets: string[];
  stability: Stability;
  status: CapabilityStatus;
  requires: string[];
  primaryFor: string[];
  fallbackFor: string[];
  ui: string;
  sourcePath: string;
}

export interface ProjectMeta {
  id: string;
  label: string;
  repo: string;
  dir: string;
  group: string;
  stability: Stability;
  status: CapabilityStatus;
  requires: string[];
  markets: string[];
  primaryFor: string[];
  fallbackFor: string[];
  license: string;
  cloned: boolean;
  fileCount: number;
  capabilityCount: number;
}

export const PROJECT_META: ProjectMeta[] = ${JSON.stringify(projects, null, 2)};

export const CAPABILITIES_TOTAL = ${capabilities.length};
export const CAPABILITIES_GENERATED_AT = '${new Date().toISOString()}';
export const CAPABILITIES_URL = '/data/project-capabilities.json';
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, ts, 'utf8');
fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
fs.writeFileSync(JSON_OUT, JSON.stringify({ generatedAt: new Date().toISOString(), capabilities }), 'utf8');
console.log(`projects=${projects.length} capabilities=${capabilities.length}`);
console.log(`  meta=${path.relative(ROOT, OUT)}`);
console.log(`  data=${path.relative(ROOT, JSON_OUT)} (${(fs.statSync(JSON_OUT).size / 1024 / 1024).toFixed(2)} MB)`);
for (const p of projects) console.log(`  ${p.cloned ? 'OK  ' : 'MISS'} ${p.label.padEnd(22)} caps=${String(p.capabilityCount).padStart(4)} files=${p.fileCount}`);
