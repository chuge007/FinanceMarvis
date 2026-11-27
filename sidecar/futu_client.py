# -*- coding: utf-8 -*-
"""富途 OpenAPI 封装：供 stdio JSON-RPC 调用。

所有方法返回 JSON 可序列化结构，不返回 pandas 对象。
权限与额度异常原样上抛，由 main.py 转成结构化错误码。
"""
import os
import math

HOST = os.environ.get('FUTU_OPEND_HOST', '127.0.0.1')
PORT = int(os.environ.get('FUTU_OPEND_PORT', '11111'))
TRD_ENV_DEFAULT = os.environ.get('FUTU_TRD_ENV', 'SIMULATE')

try:
    from futu import (
        OpenQuoteContext, OpenSecTradeContext, SubType, KLType, AuType,
        TrdEnv, TrdMarket, SecurityFirm, RET_OK,
    )
    FUTU_AVAILABLE = True
    IMPORT_ERROR = ''
except Exception as exc:  # pragma: no cover - 取决于用户环境
    FUTU_AVAILABLE = False
    IMPORT_ERROR = str(exc)


def clean(value):
    """把 NaN / numpy 类型转成 JSON 安全值。"""
    if value is None:
        return None
    if isinstance(value, float):
        return None if math.isnan(value) or math.isinf(value) else value
    if hasattr(value, 'item'):
        try:
            return clean(value.item())
        except Exception:
            pass
    if isinstance(value, (str, int, bool)):
        return value
    return str(value)


def rows(data):
    if data is None:
        return []
    if hasattr(data, 'to_dict'):
        return [{k: clean(v) for k, v in r.items()} for r in data.to_dict('records')]
    if isinstance(data, list):
        return [{k: clean(v) for k, v in r.items()} for r in data if isinstance(r, dict)]
    return []


class FutuClient:
    def __init__(self):
        self.quote_ctx = None
        self.trade_ctx = None

    def ensure(self):
        if not FUTU_AVAILABLE:
            raise RuntimeError('futu-api 未安装：pip install "futu-api>=10.4.6408"')

    def quote(self):
        self.ensure()
        if self.quote_ctx is None:
            self.quote_ctx = OpenQuoteContext(host=HOST, port=PORT)
        return self.quote_ctx

    def trade(self, market='HK'):
        self.ensure()
        if self.trade_ctx is None:
            trd_market = {
                'HK': TrdMarket.HK, 'US': TrdMarket.US, 'CN': TrdMarket.CN,
                'SG': TrdMarket.SG, 'HKCC': TrdMarket.HKCC,
            }.get(str(market).upper(), TrdMarket.HK)
            self.trade_ctx = OpenSecTradeContext(
                filter_trdmarket=trd_market,
                host=HOST, port=PORT,
                security_firm=SecurityFirm.FUTUSECURITIES,
            )
        return self.trade_ctx

    @staticmethod
    def check(ret, data, label):
        if ret != RET_OK:
            raise RuntimeError('{} 失败: {}'.format(label, data))
        return data

    # ── 行情 ────────────────────────────────────────────────
    def snapshot(self, codes):
        data = self.check(*self.quote().get_market_snapshot(codes), 'get_market_snapshot')
        return rows(data)

    def kline(self, code, ktype='K_DAY', count=320, fq='QFQ'):
        kt = getattr(KLType, ktype, KLType.K_DAY)
        au = {'QFQ': AuType.QFQ, 'HFQ': AuType.HFQ, 'NONE': AuType.NONE}.get(str(fq).upper(), AuType.QFQ)
        ret, data, _ = self.quote().request_history_kline(
            code, ktype=kt, autype=au, max_count=min(int(count), 1000))
        return rows(self.check(ret, data, 'request_history_kline'))

    def cur_kline(self, code, ktype='K_1M', count=1000):
        kt = getattr(KLType, ktype, KLType.K_1M)
        ret, data, _ = self.quote().get_cur_kline(code, min(int(count), 1000), kt, AuType.QFQ)
        return rows(self.check(ret, data, 'get_cur_kline'))

    def rt_data(self, code):
        ret, data, _ = self.quote().get_rt_data(code)
        return rows(self.check(ret, data, 'get_rt_data'))

    def ticker(self, code, num=200):
        ret, data, _ = self.quote().get_rt_ticker(code, min(int(num), 1000))
        return rows(self.check(ret, data, 'get_rt_ticker'))

    def orderbook(self, code, num=10):
        ret, data, _ = self.quote().get_order_book(code, min(int(num), 10))
        return rows(self.check(ret, data, 'get_order_book'))

    def broker_queue(self, code):
        ret, data, _ = self.quote().get_broker_queue(code)
        return rows(self.check(ret, data, 'get_broker_queue'))

    def capital_flow(self, code):
        ret, data, _ = self.quote().get_capital_flow(code)
        return rows(self.check(ret, data, 'get_capital_flow'))

    def capital_distribution(self, code):
        ret, data, _ = self.quote().get_capital_distribution(code)
        return rows(self.check(ret, data, 'get_capital_distribution'))

    def option_chain(self, code, expiry):
        ret, data, _ = self.quote().get_option_chain(code=code, expiry_date=expiry)
        return rows(self.check(ret, data, 'get_option_chain'))

    def option_expiry(self, code):
        ret, data, _ = self.quote().get_option_expiration_date(code=code)
        return rows(self.check(ret, data, 'get_option_expiration_date'))

    def stock_filter(self, market, filters, sort_field, ascending=False, limit=200):
        ret, data, _ = self.quote().get_stock_filter(
            market, filters, sort_field=sort_field, ascending=ascending, limit=min(int(limit), 200))
        return rows(self.check(ret, data, 'get_stock_filter'))

    def subscribe(self, codes, subtypes):
        subs = [getattr(SubType, s, SubType.QUOTE) for s in subtypes]
        ret, data, _ = self.quote().subscribe(codes, subs)
        return {'result': rows(self.check(ret, data, 'subscribe')), 'subtypes': subtypes}

    def unsubscribe(self, codes, subtypes):
        subs = [getattr(SubType, s, SubType.QUOTE) for s in subtypes]
        ret, data, _ = self.quote().unsubscribe(codes, subs)
        return rows(self.check(ret, data, 'unsubscribe'))

    # ── 交易（默认模拟盘）──────────────────────────────────
    def accounts(self, market='HK'):
        env = getattr(TrdEnv, TRD_ENV_DEFAULT, TrdEnv.SIMULATE)
        ret, data = self.trade(market).accinfo_query(trd_env=env)
        return rows(self.check(ret, data, 'accinfo_query'))

    def portfolio(self, market='HK'):
        env = getattr(TrdEnv, TRD_ENV_DEFAULT, TrdEnv.SIMULATE)
        ret, data = self.trade(market).position_list_query(trd_env=env)
        return rows(self.check(ret, data, 'position_list_query'))

    def orders(self, market='HK'):
        env = getattr(TrdEnv, TRD_ENV_DEFAULT, TrdEnv.SIMULATE)
        ret, data = self.trade(market).order_list_query(trd_env=env)
        return rows(self.check(ret, data, 'order_list_query'))

    def place_order(self, market, code, side, qty, price, env='SIMULATE', price_type='NORMAL'):
        """真实下单必须显式 env=REAL，且由上层做二次确认与审计。"""
        trd_env = getattr(TrdEnv, str(env).upper(), TrdEnv.SIMULATE)
        order_type = getattr(__import__('futu').TrdSide, side, None) if FUTU_AVAILABLE else None
        if order_type is None:
            raise RuntimeError('未知交易方向: {}'.format(side))
        ret, data = self.trade(market).place_order(
            price=float(price), qty=int(qty), code=code, trd_type=getattr(__import__('futu').TrdType, price_type, 0),
            trd_side=order_type, trd_env=trd_env, acc_id=0)
        return rows(self.check(ret, data, 'place_order'))

    def cancel_order(self, market, order_id, env='SIMULATE'):
        trd_env = getattr(TrdEnv, str(env).upper(), TrdEnv.SIMULATE)
        ret, data = self.trade(market).cancel_order(order_id=order_id, trd_env=trd_env, acc_id=0)
        return rows(self.check(ret, data, 'cancel_order'))

    def close(self):
        for ctx in (self.quote_ctx, self.trade_ctx):
            if ctx is not None:
                try:
                    ctx.close()
                except Exception:
                    pass
