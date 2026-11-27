# -*- coding: utf-8 -*-
"""Marvis 富途侧车：stdio JSON-RPC。

协议：stdin 每行一个命令 JSON，stdout 每行一个结果 JSON。
stdout 绝不输出日志（会污染协议）；诊断信息走 stderr。
"""
import json
import sys
import time
import traceback

from futu_client import FutuClient, FUTU_AVAILABLE, IMPORT_ERROR
from subscriptions import SubscriptionPool

client = FutuClient()
pool = SubscriptionPool()


def split_codes(value):
    if isinstance(value, list):
        return value
    return [c.strip() for c in str(value or '').split(',') if c.strip()]


def split_subs(value):
    if isinstance(value, list):
        return value
    return [s.strip() for s in str(value or 'QUOTE').split(',') if s.strip()]


def dispatch(cmd):
    method = cmd.get('method')
    p = cmd.get('params') or {}
    codes = split_codes(p.get('codes') or p.get('code'))
    env = cmd.get('env') or 'SIMULATE'

    if method == 'ping':
        return {'available': FUTU_AVAILABLE, 'importError': IMPORT_ERROR, 'subscriptions': pool.status()}
    if method == 'snapshot':
        return {'rows': client.snapshot(codes)}
    if method == 'kline':
        return {'rows': client.kline(p['code'], p.get('ktype', 'K_DAY'), p.get('count', 320), p.get('fq', 'QFQ'))}
    if method == 'curKline':
        return {'rows': client.cur_kline(p['code'], p.get('ktype', 'K_1M'), p.get('count', 1000))}
    if method == 'rtData':
        return {'rows': client.rt_data(p['code'])}
    if method == 'ticker':
        return {'rows': client.ticker(p['code'], p.get('num', 200))}
    if method == 'orderbook':
        return {'rows': client.orderbook(p['code'], p.get('num', 10))}
    if method == 'brokerQueue':
        return {'rows': client.broker_queue(p['code'])}
    if method == 'capitalFlow':
        return {'rows': client.capital_flow(p['code'])}
    if method == 'capitalDistribution':
        return {'rows': client.capital_distribution(p['code'])}
    if method == 'optionChain':
        return {'rows': client.option_chain(p['code'], p['expiry'])}
    if method == 'optionExpiry':
        return {'rows': client.option_expiry(p['code'])}
    if method == 'stockFilter':
        return {'rows': client.stock_filter(
            p.get('market', 'HK'), p.get('filters', []), p.get('sortField', 'CHANGE_RATE'),
            bool(p.get('ascending', False)), p.get('limit', 200))}
    if method == 'subscribe':
        subs = split_subs(p.get('subtypes'))
        count = pool.add(codes, subs)
        result = client.subscribe(codes, subs)
        result['poolSize'] = count
        return result
    if method == 'unsubscribe':
        return pool.remove(codes, split_subs(p.get('subtypes')))
    if method == 'subscriptionStatus':
        return pool.status()
    if method == 'accounts':
        return {'rows': client.accounts(p.get('market', 'HK'))}
    if method == 'portfolio':
        return {'rows': client.portfolio(p.get('market', 'HK'))}
    if method == 'orders':
        return {'rows': client.orders(p.get('market', 'HK'))}
    if method == 'placeOrder':
        if env == 'REAL':
            raise RuntimeError('真实下单需由上层二次确认并设置 MARVIS_ALLOW_REAL_TRADING')
        return {'rows': client.place_order(
            p.get('market', 'HK'), p['code'], p['side'], p['qty'], p.get('price', 0), env)}
    if method == 'cancelOrder':
        return {'rows': client.cancel_order(p.get('market', 'HK'), p['orderId'], env)}
    raise RuntimeError('未知方法: {}'.format(method))


def emit(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n')
    sys.stdout.flush()


for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    started = time.time()
    try:
        cmd = json.loads(line)
    except Exception as exc:
        emit({'ok': False, 'id': '', 'error': {'code': 'BAD_COMMAND', 'message': str(exc)}, 'ms': 0})
        continue

    cid = cmd.get('id', '')
    try:
        result = dispatch(cmd)
        emit({'ok': True, 'id': cid, 'result': result, 'ms': int((time.time() - started) * 1000)})
    except KeyError as exc:
        emit({'ok': False, 'id': cid, 'error': {'code': 'MISSING_PARAM', 'message': '缺少参数 {}'.format(exc)}, 'ms': int((time.time() - started) * 1000)})
    except Exception as exc:
        sys.stderr.write(traceback.format_exc() + '\n')
        emit({'ok': False, 'id': cid, 'error': {'code': 'SIDECAR_ERROR', 'message': str(exc)}, 'ms': int((time.time() - started) * 1000)})
