// 自动生成，请勿手改。生成命令：node scripts/gen-project-capabilities.mjs
// 生成时间：2026-11-27T07:47:28.912Z
// 数据来源：D:\FinanceMarvis\Github 下 26 个开源项目的公开函数 / 类 / 导出。
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

export const PROJECT_META: ProjectMeta[] = [
  {
    "id": "akshare",
    "label": "AkShare",
    "repo": "akfamily/akshare",
    "dir": "Github/akshare",
    "group": "中国市场",
    "stability": "S4",
    "status": "backup",
    "requires": [
      "python311"
    ],
    "markets": [
      "cn",
      "hk",
      "global"
    ],
    "primaryFor": [
      "cn:lhb",
      "cn:fund-nav"
    ],
    "fallbackFor": [
      "cn:index-kline",
      "cn:margin"
    ],
    "license": "MIT",
    "cloned": true,
    "fileCount": 383,
    "capabilityCount": 1095
  },
  {
    "id": "tushare",
    "label": "Tushare Pro",
    "repo": "waditu/tushare",
    "dir": "Github/tushare",
    "group": "中国市场",
    "stability": "S2",
    "status": "key-required",
    "requires": [
      "key"
    ],
    "markets": [
      "cn"
    ],
    "primaryFor": [
      "cn:fundamentals",
      "cn:margin",
      "cn:lhb"
    ],
    "fallbackFor": [],
    "license": "MIT",
    "cloned": true,
    "fileCount": 53,
    "capabilityCount": 283
  },
  {
    "id": "baostock",
    "label": "baostock",
    "repo": "shimencaiji/baostock",
    "dir": "Github/baostock",
    "group": "中国市场",
    "stability": "S3",
    "status": "python-required",
    "requires": [
      "python311"
    ],
    "markets": [
      "cn"
    ],
    "primaryFor": [],
    "fallbackFor": [
      "cn:index-kline"
    ],
    "license": "Apache-2.0",
    "cloned": true,
    "fileCount": 21,
    "capabilityCount": 50
  },
  {
    "id": "adata",
    "label": "ADATA",
    "repo": "1nchaos/adata",
    "dir": "Github/adata",
    "group": "中国市场",
    "stability": "S4",
    "status": "catalog-only",
    "requires": [
      "python311"
    ],
    "markets": [
      "cn"
    ],
    "primaryFor": [],
    "fallbackFor": [
      "cn:sector-flow"
    ],
    "license": "MIT",
    "cloned": true,
    "fileCount": 98,
    "capabilityCount": 139
  },
  {
    "id": "efinance",
    "label": "efinance",
    "repo": "Micro-sheep/efinance",
    "dir": "Github/efinance",
    "group": "中国市场",
    "stability": "S4",
    "status": "catalog-only",
    "requires": [
      "python311"
    ],
    "markets": [
      "cn"
    ],
    "primaryFor": [],
    "fallbackFor": [
      "cn:fund-nav"
    ],
    "license": "MIT",
    "cloned": true,
    "fileCount": 24,
    "capabilityCount": 61
  },
  {
    "id": "pytdx",
    "label": "pytdx",
    "repo": "rainx/pytdx",
    "dir": "Github/pytdx",
    "group": "中国市场",
    "stability": "S3",
    "status": "external-only",
    "requires": [
      "local-server"
    ],
    "markets": [
      "cn"
    ],
    "primaryFor": [],
    "fallbackFor": [
      "cn:index-kline"
    ],
    "license": "MIT",
    "cloned": true,
    "fileCount": 69,
    "capabilityCount": 166
  },
  {
    "id": "mootdx",
    "label": "mootdx",
    "repo": "mootdx/mootdx",
    "dir": "Github/mootdx",
    "group": "中国市场",
    "stability": "S3",
    "status": "external-only",
    "requires": [
      "local-server"
    ],
    "markets": [
      "cn"
    ],
    "primaryFor": [],
    "fallbackFor": [
      "cn:index-kline"
    ],
    "license": "MIT",
    "cloned": true,
    "fileCount": 46,
    "capabilityCount": 361
  },
  {
    "id": "yfinance",
    "label": "yfinance",
    "repo": "ranaroussi/yfinance",
    "dir": "Github/yfinance",
    "group": "全球市场",
    "stability": "S4",
    "status": "live",
    "requires": [],
    "markets": [
      "us",
      "global"
    ],
    "primaryFor": [
      "us:etf",
      "global:index"
    ],
    "fallbackFor": [
      "us:eod"
    ],
    "license": "Apache-2.0",
    "cloned": true,
    "fileCount": 34,
    "capabilityCount": 322
  },
  {
    "id": "openbb",
    "label": "OpenBB",
    "repo": "OpenBB-finance/OpenBB",
    "dir": "Github/OpenBB",
    "group": "全球市场",
    "stability": "S5",
    "status": "catalog-only",
    "requires": [],
    "markets": [
      "us",
      "global"
    ],
    "primaryFor": [],
    "fallbackFor": [],
    "license": "AGPL-3.0",
    "cloned": true,
    "fileCount": 2055,
    "capabilityCount": 7934
  },
  {
    "id": "pandas-datareader",
    "label": "pandas-datareader",
    "repo": "pydata/pandas-datareader",
    "dir": "Github/pandas-datareader",
    "group": "全球市场",
    "stability": "S5",
    "status": "live",
    "requires": [],
    "markets": [
      "global"
    ],
    "primaryFor": [],
    "fallbackFor": [
      "us:inflation"
    ],
    "license": "BSD-3-Clause",
    "cloned": true,
    "fileCount": 27,
    "capabilityCount": 63
  },
  {
    "id": "yahooquery",
    "label": "yahooquery",
    "repo": "dpguthrie/yahooquery",
    "dir": "Github/yahooquery",
    "group": "全球市场",
    "stability": "S4",
    "status": "catalog-only",
    "requires": [],
    "markets": [
      "us"
    ],
    "primaryFor": [],
    "fallbackFor": [
      "us:fundamentals"
    ],
    "license": "MIT",
    "cloned": true,
    "fileCount": 10,
    "capabilityCount": 92
  },
  {
    "id": "sec-edgar-downloader",
    "label": "sec-edgar-downloader",
    "repo": "jadchaar/sec-edgar-downloader",
    "dir": "Github/sec-edgar-downloader",
    "group": "全球市场",
    "stability": "S1",
    "status": "live",
    "requires": [
      "python311"
    ],
    "markets": [
      "us"
    ],
    "primaryFor": [
      "us:filings"
    ],
    "fallbackFor": [],
    "license": "MIT",
    "cloned": true,
    "fileCount": 8,
    "capabilityCount": 17
  },
  {
    "id": "edgartools",
    "label": "edgartools",
    "repo": "dgunning/edgartools",
    "dir": "Github/edgartools",
    "group": "全球市场",
    "stability": "S1",
    "status": "live",
    "requires": [
      "python311"
    ],
    "markets": [
      "us"
    ],
    "primaryFor": [
      "us:filings"
    ],
    "fallbackFor": [],
    "license": "MIT",
    "cloned": true,
    "fileCount": 394,
    "capabilityCount": 3329
  },
  {
    "id": "alpha-vantage",
    "label": "Alpha Vantage",
    "repo": "RomelTorres/alpha_vantage",
    "dir": "Github/alpha_vantage",
    "group": "全球市场",
    "stability": "S2",
    "status": "key-required",
    "requires": [
      "key"
    ],
    "markets": [
      "us",
      "global"
    ],
    "primaryFor": [],
    "fallbackFor": [
      "us:eod"
    ],
    "license": "MIT",
    "cloned": true,
    "fileCount": 26,
    "capabilityCount": 159
  },
  {
    "id": "twelvedata",
    "label": "Twelve Data",
    "repo": "twelvedata/twelvedata-python",
    "dir": "Github/twelvedata-python",
    "group": "全球市场",
    "stability": "S2",
    "status": "key-required",
    "requires": [
      "key"
    ],
    "markets": [
      "us",
      "global"
    ],
    "primaryFor": [],
    "fallbackFor": [
      "us:eod"
    ],
    "license": "MIT",
    "cloned": true,
    "fileCount": 12,
    "capabilityCount": 461
  },
  {
    "id": "fmp",
    "label": "FMP SDK",
    "repo": "daxm/fmpsdk",
    "dir": "Github/fmpsdk",
    "group": "全球市场",
    "stability": "S2",
    "status": "key-required",
    "requires": [
      "key"
    ],
    "markets": [
      "us"
    ],
    "primaryFor": [
      "us:eod"
    ],
    "fallbackFor": [
      "us:fundamentals"
    ],
    "license": "BSD-3-Clause",
    "cloned": true,
    "fileCount": 71,
    "capabilityCount": 509
  },
  {
    "id": "ccxt",
    "label": "ccxt",
    "repo": "ccxt/ccxt",
    "dir": "Github/ccxt",
    "group": "加密货币",
    "stability": "S3",
    "status": "live",
    "requires": [
      "python311"
    ],
    "markets": [
      "crypto"
    ],
    "primaryFor": [
      "crypto:quote",
      "crypto:ohlcv"
    ],
    "fallbackFor": [],
    "license": "MIT",
    "cloned": true,
    "fileCount": 1646,
    "capabilityCount": 2871
  },
  {
    "id": "freqtrade",
    "label": "freqtrade",
    "repo": "freqtrade/freqtrade",
    "dir": "Github/freqtrade",
    "group": "加密货币",
    "stability": "TOOL",
    "status": "catalog-only",
    "requires": [
      "python311"
    ],
    "markets": [
      "crypto"
    ],
    "primaryFor": [],
    "fallbackFor": [],
    "license": "GPL-3.0",
    "cloned": true,
    "fileCount": 345,
    "capabilityCount": 1638
  },
  {
    "id": "fredapi",
    "label": "fredapi",
    "repo": "mortada/fredapi",
    "dir": "Github/fredapi",
    "group": "宏观/另类",
    "stability": "S1",
    "status": "live",
    "requires": [],
    "markets": [
      "us"
    ],
    "primaryFor": [
      "us:inflation",
      "us:rates"
    ],
    "fallbackFor": [],
    "license": "BSD-3-Clause",
    "cloned": true,
    "fileCount": 4,
    "capabilityCount": 11
  },
  {
    "id": "nasdaq-data-link",
    "label": "Nasdaq Data Link",
    "repo": "nasdaq/data-link-python",
    "dir": "Github/data-link-python",
    "group": "宏观/另类",
    "stability": "S2",
    "status": "key-required",
    "requires": [
      "key"
    ],
    "markets": [
      "global"
    ],
    "primaryFor": [],
    "fallbackFor": [],
    "license": "Apache-2.0",
    "cloned": true,
    "fileCount": 35,
    "capabilityCount": 97
  },
  {
    "id": "backtrader",
    "label": "Backtrader",
    "repo": "mementum/backtrader",
    "dir": "Github/backtrader",
    "group": "工具框架",
    "stability": "TOOL",
    "status": "python-required",
    "requires": [
      "python311"
    ],
    "markets": [
      "global"
    ],
    "primaryFor": [],
    "fallbackFor": [],
    "license": "GPL-3.0",
    "cloned": true,
    "fileCount": 262,
    "capabilityCount": 910
  },
  {
    "id": "vectorbt",
    "label": "vectorbt",
    "repo": "polakowo/vectorbt",
    "dir": "Github/vectorbt",
    "group": "工具框架",
    "stability": "TOOL",
    "status": "python-required",
    "requires": [
      "python311"
    ],
    "markets": [
      "global"
    ],
    "primaryFor": [],
    "fallbackFor": [],
    "license": "Apache-2.0",
    "cloned": true,
    "fileCount": 100,
    "capabilityCount": 1522
  },
  {
    "id": "rqalpha",
    "label": "RQAlpha",
    "repo": "ricequant/rqalpha",
    "dir": "Github/rqalpha",
    "group": "工具框架",
    "stability": "TOOL",
    "status": "python-required",
    "requires": [
      "python311"
    ],
    "markets": [
      "cn"
    ],
    "primaryFor": [],
    "fallbackFor": [],
    "license": "Apache-2.0",
    "cloned": true,
    "fileCount": 139,
    "capabilityCount": 927
  },
  {
    "id": "vnpy",
    "label": "vn.py",
    "repo": "vnpy/vnpy",
    "dir": "Github/vnpy",
    "group": "工具框架",
    "stability": "TOOL",
    "status": "external-only",
    "requires": [
      "python311"
    ],
    "markets": [
      "cn"
    ],
    "primaryFor": [],
    "fallbackFor": [],
    "license": "MIT",
    "cloned": true,
    "fileCount": 61,
    "capabilityCount": 491
  },
  {
    "id": "pyfolio",
    "label": "pyfolio",
    "repo": "quantopian/pyfolio",
    "dir": "Github/pyfolio",
    "group": "工具框架",
    "stability": "TOOL",
    "status": "catalog-only",
    "requires": [],
    "markets": [
      "us"
    ],
    "primaryFor": [],
    "fallbackFor": [],
    "license": "Apache-2.0",
    "cloned": true,
    "fileCount": 17,
    "capabilityCount": 176
  },
  {
    "id": "empyrical",
    "label": "empyrical",
    "repo": "quantopian/empyrical",
    "dir": "Github/empyrical",
    "group": "工具框架",
    "stability": "TOOL",
    "status": "catalog-only",
    "requires": [],
    "markets": [
      "us"
    ],
    "primaryFor": [],
    "fallbackFor": [],
    "license": "Apache-2.0",
    "cloned": true,
    "fileCount": 10,
    "capabilityCount": 111
  }
];

export const CAPABILITIES_TOTAL = 23795;
export const CAPABILITIES_GENERATED_AT = '2026-11-27T07:47:28.913Z';
export const CAPABILITIES_URL = '/data/project-capabilities.json';
