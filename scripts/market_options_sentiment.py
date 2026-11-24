#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""美股大盘期权情绪报告（独立 CLI，标准库即可运行）。

与前端 `src/services/optionsSentiment.ts` 同源同口径：
1. CBOE 官网内嵌 JSON：官方全市场 Put/Call Ratio + 成交量/未平仓；
2. Yahoo Finance chart API：VIX/VVIX/SKEW 与 VIX 期限结构；
3. 一句话判读：PCR 分位 + VIX 水平 + 期限结构 + SKEW。

相比初版：默认校验证书、支持代理与重试、解析容错更强、上游失败不伪造数据。

用法：
  python scripts/market_options_sentiment.py
  python scripts/market_options_sentiment.py --json
  python scripts/market_options_sentiment.py --proxy http://127.0.0.1:7897
"""

import argparse
import json
import re
import ssl
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
CBOE_URL = "https://www.cboe.com/us/options/market_statistics/daily/"
YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart"

PCR_NORM = {
    "TOTAL PUT/CALL RATIO": (0.70, 1.10),
    "INDEX PUT/CALL RATIO": (0.90, 1.40),
    "EQUITY PUT/CALL RATIO": (0.45, 0.75),
    "EXCHANGE TRADED PRODUCTS PUT/CALL RATIO": (0.90, 1.30),
    "CBOE VOLATILITY INDEX (VIX) PUT/CALL RATIO": (0.60, 1.00),
    "SPX + SPXW + SPXO PUT/CALL RATIO": (1.00, 1.60),
}

RATIO_LABELS = {
    "TOTAL PUT/CALL RATIO": "Total P/C",
    "INDEX PUT/CALL RATIO": "Index P/C",
    "EQUITY PUT/CALL RATIO": "Equity P/C",
    "EXCHANGE TRADED PRODUCTS PUT/CALL RATIO": "ETP P/C",
    "CBOE VOLATILITY INDEX (VIX) PUT/CALL RATIO": "VIX P/C",
    "SPX + SPXW + SPXO PUT/CALL RATIO": "SPX P/C",
}

VOL_LABELS = {
    "^VIX9D": "VIX 9天", "^VIX": "VIX 30天", "^VIX3M": "VIX 3个月",
    "^VIX6M": "VIX 6个月", "^VIX1Y": "VIX 1年",
}
OTHER_LABELS = {"^SKEW": "SKEW", "^VVIX": "VVIX", "^GSPC": "标普500", "^NDX": "纳指100"}
SUMMARY_BLOCKS = [
    "SUM OF ALL PRODUCTS", "INDEX OPTIONS", "EXCHANGE TRADED PRODUCTS",
    "EQUITY OPTIONS", "CBOE VOLATILITY INDEX (VIX)",
]


def build_opener(proxy=None, insecure=False):
    handlers = []
    if proxy:
        handlers.append(urllib.request.ProxyHandler({"http": proxy, "https": proxy}))
    ctx = ssl.create_default_context()
    if insecure:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    handlers.append(urllib.request.HTTPSHandler(context=ctx))
    return urllib.request.build_opener(*handlers)


def get(opener, url, timeout=20, retries=2):
    last = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
            with opener.open(req, timeout=timeout) as resp:
                return resp.read().decode("utf-8", "replace")
        except Exception as exc:  # noqa: BLE001 - 网络错误统一重试
            last = exc
            if attempt < retries:
                time.sleep(0.6 * (attempt + 1))
    raise last


def number(raw):
    if raw is None or raw == "":
        return None
    try:
        return float(str(raw).replace(",", "").strip())
    except ValueError:
        return None


def ratio(put, call):
    return round(put / call, 3) if call else None


def parse_triplet(chunk, name):
    start = chunk.find('"%s"' % name)
    if start < 0:
        return None
    match = re.search(
        r'"call"\s*:\s*"?([0-9][0-9,\.]*)"?\s*,\s*'
        r'"put"\s*:\s*"?([0-9][0-9,\.]*)"?\s*,\s*'
        r'"total"\s*:\s*"?([0-9][0-9,\.]*)"?',
        chunk[start:],
    )
    if not match:
        return None
    call, put, total = (number(match.group(i)) or 0 for i in (1, 2, 3))
    return {"call": call, "put": put, "total": total, "put_call_ratio": ratio(put, call)}


def parse_cboe(html):
    flat = html.replace('\\"', '"').replace("\\/", "/").replace("&quot;", '"')
    ratios = {}
    pattern = re.compile(r'\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"value"\s*:\s*"([^"]*)"\s*\}')
    for match in pattern.finditer(flat):
        name, raw = match.group(1), match.group(2)
        if "PUT/CALL RATIO" not in name.upper():
            continue
        value = number(raw)
        if value is not None:
            ratios[name] = value

    summary = {}
    for block in SUMMARY_BLOCKS:
        idx = flat.find('"%s":[' % block)
        if idx < 0:
            continue
        chunk = flat[idx:idx + 1200]
        volume = parse_triplet(chunk, "VOLUME")
        open_interest = parse_triplet(chunk, "OPEN INTEREST")
        if volume and open_interest:
            summary[block] = {"volume": volume, "open_interest": open_interest}
    return ratios, summary


def fetch_cboe(opener):
    ratios, summary = parse_cboe(get(opener, CBOE_URL, timeout=25))
    return ratios, summary


def fetch_yahoo_quote(opener, symbol):
    url = "%s/%s?range=5d&interval=1d" % (YAHOO_CHART, urllib.parse.quote(symbol, safe=""))
    data = json.loads(get(opener, url, timeout=15))
    meta = (data.get("chart") or {}).get("result") or [{}]
    meta = meta[0].get("meta") or {}
    price = number(meta.get("regularMarketPrice"))
    if price is None:
        return None
    prev = number(meta.get("chartPreviousClose"))
    return {
        "symbol": symbol,
        "name": VOL_LABELS.get(symbol) or OTHER_LABELS.get(symbol) or symbol,
        "price": round(price, 2),
        "change_pct": round((price / prev - 1) * 100, 2) if prev else None,
    }


def interpret(total, equity, vix, skew, vix3m):
    parts = []
    if total is not None:
        lo, hi = PCR_NORM["TOTAL PUT/CALL RATIO"]
        if total > hi + 0.15:
            parts.append("全市场 Put/Call 显著偏高，避险/对冲需求升温（偏空）")
        elif total < lo - 0.15:
            parts.append("全市场 Put/Call 偏低，看涨情绪浓厚（偏多/需警惕过热）")
        else:
            parts.append("全市场 Put/Call 处于常态区间")
    if equity is not None and equity > PCR_NORM["EQUITY PUT/CALL RATIO"][1] + 0.1:
        parts.append("个股 Put/Call 偏高，个股层面避险情绪明显")
    if vix is not None:
        if vix > 30:
            parts.append("VIX %s 处于高波动区间（恐慌）" % vix)
        elif vix > 20:
            parts.append("VIX %s 偏高（谨慎）" % vix)
        elif vix > 14:
            parts.append("VIX %s 温和" % vix)
        else:
            parts.append("VIX %s 低位（自满）" % vix)
    if vix and vix3m and vix3m > 0:
        if vix / vix3m < 0.92:
            parts.append("VIX 期限结构呈 Contango（近月低于远月，情绪平稳）")
        elif vix / vix3m > 1.05:
            parts.append("VIX 期限结构倒挂（近月高于远月，短期压力上升）")
    if skew is not None:
        if skew > 140:
            parts.append("SKEW %s 偏高，尾部看跌保护需求强" % skew)
        elif skew < 120:
            parts.append("SKEW %s 偏低，尾部对冲需求清淡" % skew)
    return "；".join(parts) + "。" if parts else "期权数据源暂不可用，暂无判读。"


def build_report(opener):
    errors = []
    try:
        ratios, summary = fetch_cboe(opener)
        if not ratios:
            errors.append("CBOE 未返回 Put/Call 统计")
    except Exception as exc:  # noqa: BLE001
        ratios, summary = {}, {}
        errors.append("CBOE 数据源不可用: %s" % exc)

    quotes = {}
    for symbol in list(VOL_LABELS) + list(OTHER_LABELS):
        try:
            quote = fetch_yahoo_quote(opener, symbol)
            if quote:
                quotes[symbol] = quote
        except Exception:  # noqa: BLE001 - 单指数失败不影响其余
            pass
    if not quotes:
        errors.append("Yahoo 波动率指数不可用")

    vix = (quotes.get("^VIX") or {}).get("price")
    vix3m = (quotes.get("^VIX3M") or {}).get("price")
    verdict = interpret(
        ratios.get("TOTAL PUT/CALL RATIO"),
        ratios.get("EQUITY PUT/CALL RATIO"),
        vix,
        (quotes.get("^SKEW") or {}).get("price"),
        vix3m,
    )
    return {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "available": bool(ratios or quotes),
        "cboe_put_call_ratios": ratios,
        "cboe_volume_open_interest": summary,
        "volatility_indices": quotes,
        "sentiment_verdict": verdict,
        "sources": [CBOE_URL, "Yahoo Finance chart API"],
        "errors": errors,
    }


def print_text(report):
    print("=" * 70)
    print("美股大盘期权情绪报告  |  " + report["generated_at"])
    print("=" * 70)
    print("\n【CBOE 全市场 Put/Call Ratio】（>1 看跌占优，<1 看涨占优）")
    for name, label in RATIO_LABELS.items():
        value = report["cboe_put_call_ratios"].get(name)
        if value is None:
            print("  %-50s —" % label)
            continue
        lo, hi = PCR_NORM[name]
        tag = "  ← 偏高(避险)" if value > hi else ("  ← 偏低(乐观)" if value < lo else "  ← 常态")
        print("  %-50s %6.2f%s" % (label, value, tag))

    total = report["cboe_volume_open_interest"].get("SUM OF ALL PRODUCTS")
    if total:
        vol, oi = total["volume"], total["open_interest"]
        print("\n【全市场量能】成交量 %s 张 (C %s / P %s)" % (
            format(vol["total"], ",.0f"), format(vol["call"], ",.0f"), format(vol["put"], ",.0f")))
        print("               未平仓 %s 张 (C %s / P %s，P/C %s)" % (
            format(oi["total"], ",.0f"), format(oi["call"], ",.0f"),
            format(oi["put"], ",.0f"), oi["put_call_ratio"]))

    print("\n【波动率指数】")
    print("  " + "  |  ".join(
        "%s %s" % (q["name"], q["price"]) for q in report["volatility_indices"].values()))

    print("\n【一句话判读】")
    print("  " + report["sentiment_verdict"])
    if report["errors"]:
        print("\n【数据源异常】" + "；".join(report["errors"]))
    print("=" * 70)


def main():
    parser = argparse.ArgumentParser(description="美股大盘期权情绪报告")
    parser.add_argument("--json", action="store_true", help="输出 JSON")
    parser.add_argument("--proxy", help="HTTP/HTTPS 代理，如 http://127.0.0.1:7897")
    parser.add_argument("--insecure", action="store_true", help="跳过 TLS 校验（不推荐）")
    args = parser.parse_args()

    report = build_report(build_opener(args.proxy, args.insecure))
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print_text(report)


if __name__ == "__main__":
    main()
