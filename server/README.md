---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: f5b61678fbb5dd530278fd04cb182c1a_529baaceab9d11f18039525400461939
    ReservedCode1: nU0Yq+pnALMnjUpxIrywuyeeUpMuwseqCjfnuynAGbvfnP45gYeQpXi366uekeAk3wqW6zayPmNAyJ2PZn/l1yqslWgezpJ3XFV09NOsq4UoGOOl2YC8WCSO6NRsCS6/9E+gxLo+b3WrVWCMvnIdzvqw1sCP+vIJdlCiTQsYXxsm5SvsGL8qo24Wjbo=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: f5b61678fbb5dd530278fd04cb182c1a_529baaceab9d11f18039525400461939
    ReservedCode2: nU0Yq+pnALMnjUpxIrywuyeeUpMuwseqCjfnuynAGbvfnP45gYeQpXi366uekeAk3wqW6zayPmNAyJ2PZn/l1yqslWgezpJ3XFV09NOsq4UoGOOl2YC8WCSO6NRsCS6/9E+gxLo+b3WrVWCMvnIdzvqw1sCP+vIJdlCiTQsYXxsm5SvsGL8qo24Wjbo=
---

# StrategyLab 生产部署说明

## 一键启动（本机生产模式）

```powershell
cd D:\dev\CompleteInvestmentInformationMarvis
npm run build        # 首次或代码变更后构建 dist
$env:HTTPS_PROXY='http://127.0.0.1:7897'   # 本机经 Clash 出海代理（ConvexTrade 地区封锁必需）
npm run serve        # 启动生产服务，默认 http://localhost:8080
```

- ConvexTrade 对中国大陆按地区封锁：必须设置出海代理，否则 /convex 返回 403。
- 海外服务器部署时无需 HTTPS_PROXY（直连即可）。
- 关闭：Ctrl+C 或在任务管理器结束 node 进程。

## 服务职责（server/proxy.mjs）

单端口同时承担两部分：

1. **静态托管** `dist/` 构建产物（SPA，非静态路径自动回源 index.html）；
2. **同域转发** 六个数据源，规避 CORS / 反爬 / 地区封锁：

| 前端路径 | 上游 | 说明 |
|---|---|---|
| /convex | convextrade.com/api/public | 宏观序列；经 HTTPS_PROXY 出海 |
| /eastmoney-news | np-listapi.eastmoney.com | 快讯；注入 eastmoney Referer 过 WAF |
| /yahoo | query1.finance.yahoo.com | 美股行情/K线、VIX/VVIX/SKEW；注入浏览器 UA/Referer |
| /cboe | www.cboe.com | CBOE 官方日度 Put/Call 与成交量/持仓；注入浏览器 UA/Referer |
| /eastmoney-kline | push2his.eastmoney.com | 东财 K线兜底 |
| /eastmoney-quote | push2.eastmoney.com | 东财实时报价 |

## 内置 AI 网关（/ai）

页面右上角「AI 分析」把当前已抓到的风险体制、环境指标、结构与网页快讯交给模型做总结。
浏览器不直连上游模型，统一走同域接口，由本服务转发（`server/ai-gateway.mjs`）：

| 前端路径 | 方法 | 作用 |
|---|---|---|
| /ai/config | GET | 返回服务端是否已统一配置模型（不回显 Key） |
| /ai/models | GET | 代拉上游 `/models`，供设置面板选模型 |
| /ai/chat | POST | 转发到上游 `/chat/completions`，SSE 原样回传 |

凭证两种来源，优先级从高到低：

1. **服务端环境变量**（部署方统一提供，使用者打开即用，本地无需配置）：

```powershell
$env:AI_BASE_URL='https://tokenhub.tencentmaas.com/plan/v3'
$env:AI_API_KEY='sk-tp-xxx'
$env:AI_MODEL='你的模型名'
npm run serve
```

2. **使用者在界面里自填**：存本机 localStorage，随请求头 `x-ai-base / x-ai-key / x-ai-model` 带过来，服务端不落盘。
   设置 `AI_BASE_URL` 后请求头会被忽略，避免公网部署时被改成任意内网地址。

若本机跑着 codebuddy2api，Base URL 填 `http://127.0.0.1:8001/v1` 即可直接用 CodeBuddy 账号里的模型
（模型名以 `/ai/models` 返回为准）。`npm run dev` 下同样的路由由 `vite.config.ts` 的插件接管，无需另起后端。

## 前端代理模式开关（src/services/api.ts / macro.ts）

- 默认（推荐）：构建与运行时都走同域相对路径 `/{x}`，由本服务转发。
- 海外直连部署：构建时加环境变量 `VITE_UPSTREAM=direct`，前端改为直连上游绝对地址，无需本服务。

## 端口

默认 8080，可用 `PORT=9000 npm run serve` 覆盖。

## 常见排查

- /convex 403 → 未设 HTTPS_PROXY 或代理节点不可用；
- 页面白屏 → dist 未构建，先 `npm run build`；
- 上游偶发 502/断连（如东财 A 股 K 线） → 属上游临时故障，前端已有腾讯源兜底，稍后重试即可。
*（内容由AI生成，仅供参考）*
