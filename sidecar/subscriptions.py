# -*- coding: utf-8 -*-
"""订阅额度状态机。

富途实测限制：
- 每个标的 × 每个 SubType 计 1 个订阅额度；
- 订阅后至少 1 分钟才能反订阅；
- 多连接必须全部反订阅才释放额度。
因此这里只在本进程内维护池，不假装能跨进程统计。
"""
import time


class SubscriptionPool:
    def __init__(self):
        self.items = {}

    def key(self, code, subtype):
        return '{}|{}'.format(code, subtype)

    def add(self, codes, subtypes):
        now = time.time()
        for code in codes:
            for sub in subtypes:
                k = self.key(code, sub)
                if k not in self.items:
                    self.items[k] = {'since': now, 'last_used': now}
                else:
                    self.items[k]['last_used'] = now
        return len(self.items)

    def remove(self, codes, subtypes):
        now = time.time()
        blocked = []
        removed = 0
        for code in codes:
            for sub in subtypes:
                k = self.key(code, sub)
                entry = self.items.get(k)
                if not entry:
                    continue
                if now - entry['since'] < 60:
                    blocked.append(k)
                    continue
                del self.items[k]
                removed += 1
        return {'removed': removed, 'blocked': blocked, 'remaining': len(self.items)}

    def touch(self, code, subtype):
        entry = self.items.get(self.key(code, subtype))
        if entry:
            entry['last_used'] = time.time()

    def status(self):
        return {
            'count': len(self.items),
            'items': [
                {'code': k.split('|')[0], 'subtype': k.split('|')[1], 'ageSec': int(time.time() - v['since'])}
                for k, v in self.items.items()
            ],
        }
