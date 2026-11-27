# -*- coding: utf-8 -*-
"""Marvis 数据侧车：独立 HTTP 回环服务，承载 AkShare / SEC EDGAR / ccxt / baostock。

与富途侧车（stdio JSON-RPC）隔离：
  - 富途依赖 futu-api，本侧车依赖 akshare / edgartools / ccxt / baostock；一份 requirements 失败不连坐另一份。
  - 只监听 127.0.0.1，端口由 --port 传入，默认 8765。
  - 缺库时对应能力标 unavailable，绝不返回模拟值；调用方按「缺」渲染。
  - edgartools 的安装包提供的是 `edgar` 模块，不能用 `edgartools` 作为 import 名。
"""
import argparse
import importlib
import importlib.util
import json
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LIB_NAMES = ('akshare', 'edgar', 'ccxt', 'baostock', 'efinance', 'yahooquery', 'adata')

# 通用调用的严格白名单：只允许已装库的数据模块；禁止内建/系统/子进程/文件类模块。
ALLOWED_LIBS = {
    'akshare': 'akshare',
    'efinance': 'efinance',
    'yahooquery': 'yahooquery',
    'adata': 'adata',
}
# 函数名允许点号分隔的公开子模块路径（如 stock.get_quote_history），每段都不得以下划线开头。
SAFE_SYMBOL = __import__('re').compile(r'^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*$')
# 不在启动阶段 import：akshare 首次导入可达数秒，会让 health 探测 6s 超时。
# health 用 find_spec 快速判定是否安装，真正 import 在调用方法时懒加载。
LIB_CACHE = {}

INSTALL_HINT = 'py -3.11 -m pip install -r sidecar/requirements-data.txt'


def load_lib(name):
    if name in LIB_CACHE:
        return LIB_CACHE[name]
    try:
        LIB_CACHE[name] = importlib.import_module(name)
    except Exception as exc:  # noqa: BLE001 - 缺库是常态，显式上报
        LIB_CACHE[name] = None
        return None
    return LIB_CACHE[name]


def ok(data, method=''):
    return {'ok': True, 'data': data, 'method': method}


def fail(code, message):
    return {'ok': False, 'error': {'code': code, 'message': message}}


def missing_lib(name):
    return fail('LIB_UNAVAILABLE', '{0} 未安装，请运行 {1}'.format(name, INSTALL_HINT)), 200


def rows_of(df):
    return json.loads(df.to_json(orient='records', force_ascii=False, date_format='iso'))


def edgar_filings(params, forms):
    edgar = load_lib('edgar')
    if edgar is None:
        return missing_lib('edgartools')
    try:
        ticker = params.get('ticker', '')
        company = edgar.Company(ticker)
        filings = company.get_filings(form=forms)
        rows = [{
            'form': getattr(f, 'form', None),
            'filingDate': str(getattr(f, 'filing_date', '')),
            'reportDate': str(getattr(f, 'report_date', '')),
            'accession': getattr(f, 'accession_number', None),
        } for f in list(filings)[: int(params.get('limit', 20))]]
        return ok({'rows': rows, 'ticker': ticker, 'forms': forms}, 'edgar.filings'), 200
    except Exception as exc:  # noqa: BLE001
        return fail('UPSTREAM_ERROR', '{0}: {1}'.format(type(exc).__name__, exc)), 200


def call(method, params):
    """白名单方法，返回 (payload, http_status)。"""
    if method == 'health':
        libs = {k: importlib.util.find_spec(k) is not None for k in LIB_NAMES}
        return ok({
            'available': all(libs.values()),
            'python': sys.version.split()[0],
            'libs': libs,
            'importErrors': {},
            'libVersion': 'find_spec（未实际导入）',
        }, method), 200

    if method == 'akshare.stock_lhb':
        akshare = load_lib('akshare')
        if akshare is None:
            return missing_lib('akshare')
        try:
            date = params.get('date', '')
            compact = date.replace('-', '') if date else ''
            # 东财 detail_em 源站改版常返回 None；先走新浪日榜（实测可用），失败再回东财。
            try:
                df = akshare.stock_lhb_detail_daily_sina(date=compact) if compact else None
                source = 'sina'
            except Exception:  # noqa: BLE001
                df = None
                source = 'eastmoney'
            if df is None or getattr(df, 'empty', True):
                df = akshare.stock_lhb_detail_em(start_date=date, end_date=date)
                source = 'eastmoney'
            return ok({
                'rows': rows_of(df),
                'date': date,
                'source': source,
                'caliber': '新浪龙虎榜日榜（备用源）；席位口径不与 Tushare 主源合并',
            }, method), 200
        except Exception as exc:  # noqa: BLE001
            return fail('UPSTREAM_ERROR', '{0}: {1}'.format(type(exc).__name__, exc)), 200

    if method == 'akshare.fund_nav':
        akshare = load_lib('akshare')
        if akshare is None:
            return missing_lib('akshare')
        try:
            code = params.get('code', '')
            df = akshare.fund_open_fund_info_em(symbol=code, indicator='单位净值走势')
            return ok({'rows': rows_of(df), 'code': code}, method), 200
        except Exception as exc:  # noqa: BLE001
            return fail('UPSTREAM_ERROR', '{0}: {1}'.format(type(exc).__name__, exc)), 200

    if method == 'akshare.margin':
        akshare = load_lib('akshare')
        if akshare is None:
            return missing_lib('akshare')
        try:
            date = params.get('date', '')
            df = akshare.stock_margin_sse(date=date) if date else akshare.stock_margin_account_info()
            return ok({'rows': rows_of(df), 'date': date, 'caliber': 'T-1 18:00 后完整'}, method), 200
        except Exception as exc:  # noqa: BLE001
            return fail('UPSTREAM_ERROR', '{0}: {1}'.format(type(exc).__name__, exc)), 200

    if method == 'akshare.sector_flow':
        akshare = load_lib('akshare')
        if akshare is None:
            return missing_lib('akshare')
        try:
            # 东财 push2 常被限流；先试同花顺行业资金流（实测可用），失败再回东财。
            try:
                df = akshare.stock_fund_flow_industry_ths(symbol='即时')
                source = 'ths'
            except Exception:  # noqa: BLE001
                df = None
                source = 'eastmoney'
            if df is None or getattr(df, 'empty', True):
                df = akshare.stock_fund_flow_sector_rank_em(
                    indicator=params.get('indicator', '今日'),
                    sector_type=params.get('sectorType', '行业资金流'),
                )
                source = 'eastmoney'
            return ok({
                'rows': rows_of(df),
                'source': source,
                'caliber': '同花顺行业资金流（备用源）；净额单位见列名，不与腾讯行业榜主源混算',
            }, method), 200
        except Exception as exc:  # noqa: BLE001
            return fail('UPSTREAM_ERROR', '{0}: {1}'.format(type(exc).__name__, exc)), 200

    if method == 'akshare.futures':
        akshare = load_lib('akshare')
        if akshare is None:
            return missing_lib('akshare')
        try:
            symbol = params.get('symbol', 'RB0')
            df = akshare.futures_zh_daily_sina(symbol=symbol)
            return ok({'rows': rows_of(df), 'symbol': symbol, 'caliber': '连续合约，换月口径需标注'}, method), 200
        except Exception as exc:  # noqa: BLE001
            return fail('UPSTREAM_ERROR', '{0}: {1}'.format(type(exc).__name__, exc)), 200

    if method == 'akshare.forex':
        akshare = load_lib('akshare')
        if akshare is None:
            return missing_lib('akshare')
        try:
            symbol = params.get('symbol', 'USDCNH')
            df = akshare.fx_hist_em(symbol=symbol)
            return ok({'rows': rows_of(df), 'symbol': symbol}, method), 200
        except Exception as exc:  # noqa: BLE001
            return fail('UPSTREAM_ERROR', '{0}: {1}'.format(type(exc).__name__, exc)), 200

    if method == 'baostock.kline':
        baostock = load_lib('baostock')
        if baostock is None:
            return missing_lib('baostock')
        try:
            code = params.get('code', 'sh.000001')
            start = params.get('start', '')
            end = params.get('end', '')
            frequency = params.get('frequency', 'd')
            adjustflag = str(params.get('adjustflag', '2'))  # 2 = 前复权
            login = baostock.login()
            if getattr(login, 'error_code', '0') != '0':
                return fail('UPSTREAM_ERROR', 'baostock 登录失败: {0}'.format(getattr(login, 'error_msg', ''))), 200
            try:
                fields = 'date,code,open,high,low,close,volume,amount,adjustflag'
                rs = baostock.query_history_k_data_plus(
                    code, fields, start_date=start, end_date=end,
                    frequency=frequency, adjustflag=adjustflag,
                )
                rows = []
                while rs.next():
                    rows.append(dict(zip(rs.fields, rs.get_row_data())))
            finally:
                baostock.logout()
            actual_flag = rows[0].get('adjustflag', adjustflag) if rows else adjustflag
            return ok({
                'rows': rows, 'code': code, 'frequency': frequency,
                'caliber': '请求 adjustflag={0}，实际返回 adjustflag={1}（指数无复权语义时返回 3）'.format(adjustflag, actual_flag),
            }, method), 200
        except Exception as exc:  # noqa: BLE001
            return fail('UPSTREAM_ERROR', '{0}: {1}'.format(type(exc).__name__, exc)), 200

    if method == 'edgar.filings':
        forms = params.get('forms') or ['10-K', '10-Q', '8-K']
        return edgar_filings(params, forms)

    if method == 'edgar.13f':
        return edgar_filings(params, ['13F-HR'])

    if method == 'ccxt.ticker':
        ccxt = load_lib('ccxt')
        if ccxt is None:
            return missing_lib('ccxt')
        try:
            exchange_id = params.get('exchange', 'binance')
            symbol = params.get('symbol', 'BTC/USDT')
            if exchange_id not in ccxt.exchanges:
                return fail('BAD_REQUEST', '不支持的交易所 {0}'.format(exchange_id)), 200
            exchange = getattr(ccxt, exchange_id)({'enableRateLimit': True})
            ticker = exchange.fetch_ticker(symbol)
            return ok({
                'symbol': symbol,
                'exchange': exchange_id,
                'last': ticker.get('last'),
                'quoteVolume': ticker.get('quoteVolume'),
                'timestamp': ticker.get('timestamp'),
            }, method), 200
        except Exception as exc:  # noqa: BLE001
            return fail('UPSTREAM_ERROR', '{0}: {1}'.format(type(exc).__name__, exc)), 200

    if method == 'ccxt.ohlcv':
        ccxt = load_lib('ccxt')
        if ccxt is None:
            return missing_lib('ccxt')
        try:
            exchange_id = params.get('exchange', 'binance')
            symbol = params.get('symbol', 'BTC/USDT')
            timeframe = params.get('timeframe', '1d')
            limit = int(params.get('limit', 500))
            if exchange_id not in ccxt.exchanges:
                return fail('BAD_REQUEST', '不支持的交易所 {0}'.format(exchange_id)), 200
            exchange = getattr(ccxt, exchange_id)({'enableRateLimit': True})
            candles = exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)
            rows = [{
                'date': datetime.fromtimestamp(c[0] / 1000, tz=timezone.utc).strftime('%Y-%m-%d'),
                'open': c[1], 'high': c[2], 'low': c[3], 'close': c[4], 'volume': c[5],
            } for c in candles]
            return ok({
                'rows': rows, 'symbol': symbol, 'exchange': exchange_id, 'timeframe': timeframe,
                'caliber': '单一交易所 {0}；USDT 计价不等同 USD'.format(exchange_id),
            }, method), 200
        except Exception as exc:  # noqa: BLE001
            return fail('UPSTREAM_ERROR', '{0}: {1}'.format(type(exc).__name__, exc)), 200

    if method == 'python.call':
        """通用白名单调用：只能调用已装数据库的公开函数，参数来自前端白名单能力。

        安全边界：
          - lib 必须在 ALLOWED_LIBS；symbol 必须匹配 SAFE_SYMBOL（公开 API、无点号、无下划线开头）；
          - 不允许传入任意 callable 或模块对象，args/kwargs 只接受 JSON 标量/列表/字典；
          - 返回 DataFrame -> rows；dict/list -> rows/value；其他标量 -> value。
        这样「仅目录」里有实际数据接口的公开函数可被真正取数，内部工具函数仍不暴露。
        """
        lib_key = params.get('lib', '')
        symbol = params.get('symbol', '')
        if lib_key not in ALLOWED_LIBS or not SAFE_SYMBOL.match(symbol):
            return fail('BAD_REQUEST', '不允许的库或符号 {0}.{1}'.format(lib_key, symbol)), 200
        module = load_lib(ALLOWED_LIBS[lib_key])
        if module is None:
            return missing_lib(ALLOWED_LIBS[lib_key])
        def resolve(obj, path):
            for part in path.split('.'):
                obj = getattr(obj, part, None)
                if obj is None:
                    return None
            return obj

        fn = resolve(module, symbol)
        if fn is None:
            # 能力清单里的 symbol 是扁平名（get_quote_history），库里常在子模块（stock / fund）下。
            for sub in ('stock', 'fund', 'bond', 'futures', 'forex', 'macro', 'news'):
                candidate = getattr(module, sub, None)
                if candidate is not None:
                    fn = resolve(candidate, symbol)
                    if fn is not None:
                        break
        if fn is None:
            return fail('BAD_REQUEST', '{0} 没有公开函数 {1}'.format(lib_key, symbol)), 200
        if not callable(fn):
            return fail('BAD_REQUEST', '{0}.{1} 不是可调用函数'.format(lib_key, symbol)), 200
        # 类（如 yahooquery.Ticker）需先实例化；构造参数从 args/kwargs 传入。
        if isinstance(fn, type):
            try:
                fn = fn(*(params.get('args') or []), **(params.get('kwargs') or {}))
            except Exception as exc:  # noqa: BLE001
                return fail('UPSTREAM_ERROR', '实例化 {0} 失败: {1}'.format(symbol, type(exc).__name__)), 200
            if not callable(fn):
                payload = {'value': fn, 'lib': lib_key, 'symbol': symbol, 'caliber': '通用白名单调用（对象属性）'}
                return ok(payload, method), 200
            args, kwargs = [], {}
        try:
            args = params.get('args') or []
            kwargs = params.get('kwargs') or {}
            if not isinstance(args, list) or not isinstance(kwargs, dict):
                return fail('BAD_REQUEST', 'args 必须是数组、kwargs 必须是对象'), 200
            result = fn(*args, **kwargs)
            if hasattr(result, 'to_json'):
                payload = {'rows': rows_of(result)}
            elif isinstance(result, (list, tuple)):
                payload = {'rows': result}
            elif isinstance(result, dict):
                payload = {'value': result, 'rows': result.get('data') or result.get('rows') or []}
            else:
                payload = {'value': result}
            payload.update({'lib': lib_key, 'symbol': symbol, 'caliber': '通用白名单调用；参数来自能力清单，不做模拟值'})
            return ok(payload, method), 200
        except Exception as exc:  # noqa: BLE001
            # 通用能力调用的参数/上游错误是用户侧单次失败，不进全局冷却。
            return fail('CAPABILITY_ERROR', '{0}: {1}'.format(type(exc).__name__, exc)), 200

    return fail('BAD_REQUEST', '不允许的方法 {0}'.format(method)), 400


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # 日志走 stderr，不污染协议
        sys.stderr.write('[data-sidecar] ' + (fmt % args) + '\n')

    def _send(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split('?')[0] in ('/health', '/'):
            self._send(call('health', {})[0], 200)
            return
        self._send(fail('NOT_FOUND', self.path), 404)

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length)
            body = json.loads(raw.decode('utf-8'))
        except Exception:  # noqa: BLE001
            self._send(fail('BAD_REQUEST', '请求体不是合法 JSON'), 400)
            return
        method = body.get('method', '')
        params = body.get('params') or {}
        payload, status = call(method, params)
        self._send(payload, status)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--host', default='127.0.0.1')
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    sys.stderr.write('[data-sidecar] ready on http://{0}:{1}\n'.format(args.host, args.port))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
