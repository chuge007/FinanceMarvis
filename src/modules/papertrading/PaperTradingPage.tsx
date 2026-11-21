import React, { useEffect, useState } from 'react';
import { usePaperTradingStore } from '../../stores/usePaperTradingStore';

const AccountSelector: React.FC = () => {
  const accounts = usePaperTradingStore(state => state.accounts);
  const currentAccount = usePaperTradingStore(state => state.currentAccount);
  const selectAccount = usePaperTradingStore(state => state.selectAccount);
  const createAccount = usePaperTradingStore(state => state.createAccount);
  const [showCreate, setShowCreate] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [initialCapital, setInitialCapital] = useState('100000');

  const handleCreate = () => {
    if (!newAccountName.trim()) {
      alert('请输入账户名称');
      return;
    }
    createAccount(newAccountName, parseFloat(initialCapital));
    setShowCreate(false);
    setNewAccountName('');
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">模拟账户</h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          + 新建账户
        </button>
      </div>

      {showCreate && (
        <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-700 rounded">
          <input
            type="text"
            value={newAccountName}
            onChange={(e) => setNewAccountName(e.target.value)}
            placeholder="账户名称"
            className="w-full px-3 py-2 mb-2 border rounded dark:bg-gray-600 dark:border-gray-500"
          />
          <input
            type="number"
            value={initialCapital}
            onChange={(e) => setInitialCapital(e.target.value)}
            placeholder="初始资金"
            className="w-full px-3 py-2 mb-2 border rounded dark:bg-gray-600 dark:border-gray-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              className="flex-1 px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
            >
              创建
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="flex-1 px-3 py-1 text-sm bg-gray-300 dark:bg-gray-600 rounded hover:bg-gray-400"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <select
        value={currentAccount?.id || ''}
        onChange={(e) => selectAccount(e.target.value)}
        className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
      >
        <option value="">选择账户</option>
        {accounts.map(acc => (
          <option key={acc.id} value={acc.id}>
            {acc.name} - ¥{acc.totalAssets.toLocaleString()}
          </option>
        ))}
      </select>
    </div>
  );
};

const TradingPanel: React.FC = () => {
  const [symbol, setSymbol] = useState('');
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState('100');
  const [price, setPrice] = useState('');
  const placeOrder = usePaperTradingStore(state => state.placeOrder);
  const currentAccount = usePaperTradingStore(state => state.currentAccount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentAccount) {
      alert('请先选择账户');
      return;
    }

    if (!symbol || !quantity || !price) {
      alert('请填写完整信息');
      return;
    }

    const qty = parseInt(quantity);
    const prc = parseFloat(price);
    const amount = qty * prc;
    const fee = amount * 0.0003; // 0.03% 手续费

    await placeOrder({
      accountId: currentAccount.id,
      symbol: symbol.trim(),
      type: orderType,
      quantity: qty,
      price: prc,
      amount,
      fee,
    });

    // 清空表单
    setSymbol('');
    setQuantity('100');
    setPrice('');
    alert(`${orderType === 'buy' ? '买入' : '卖出'}订单已提交`);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <h3 className="font-semibold mb-4">下单交易</h3>
      
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setOrderType('buy')}
            className={`flex-1 py-2 rounded ${
              orderType === 'buy'
                ? 'bg-red-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700'
            }`}
          >
            买入
          </button>
          <button
            type="button"
            onClick={() => setOrderType('sell')}
            className={`flex-1 py-2 rounded ${
              orderType === 'sell'
                ? 'bg-green-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700'
            }`}
          >
            卖出
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">股票代码</label>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="例如: 600519"
            className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">数量（股）</label>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="100"
            step="100"
            className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">价格（¥）</label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            step="0.01"
            className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
            required
          />
        </div>

        <div className="text-xs text-gray-500 space-y-1">
          <div>成交金额: ¥{(parseFloat(quantity || '0') * parseFloat(price || '0')).toLocaleString()}</div>
          <div>手续费: ¥{(parseFloat(quantity || '0') * parseFloat(price || '0') * 0.0003).toFixed(2)}</div>
        </div>

        <button
          type="submit"
          className={`w-full py-2 rounded text-white ${
            orderType === 'buy'
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {orderType === 'buy' ? '买入' : '卖出'}
        </button>
      </form>
    </div>
  );
};

const PositionList: React.FC = () => {
  const positions = usePaperTradingStore(state => state.positions);
  const currentAccount = usePaperTradingStore(state => state.currentAccount);

  const accountPositions = positions.filter(p => p.accountId === currentAccount?.id);

  if (accountPositions.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
        <div className="text-gray-400">暂无持仓</div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div className="p-4 border-b dark:border-gray-700">
        <h3 className="font-semibold">当前持仓</h3>
      </div>
      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-gray-700">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">代码</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">持仓</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">成本</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">现价</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">市值</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">盈亏</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {accountPositions.map(pos => (
            <tr key={pos.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
              <td className="px-4 py-3 font-medium">{pos.symbol}</td>
              <td className="px-4 py-3 text-right">{pos.quantity}</td>
              <td className="px-4 py-3 text-right">¥{pos.avgCost.toFixed(2)}</td>
              <td className="px-4 py-3 text-right">¥{pos.currentPrice.toFixed(2)}</td>
              <td className="px-4 py-3 text-right">¥{pos.marketValue.toLocaleString()}</td>
              <td className={`px-4 py-3 text-right font-medium ${
                pos.pnl >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {pos.pnl >= 0 ? '+' : ''}{pos.pnl.toFixed(2)}
                <div className="text-xs">({pos.pnlPercent >= 0 ? '+' : ''}{pos.pnlPercent.toFixed(2)}%)</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const PerformancePanel: React.FC = () => {
  const currentAccount = usePaperTradingStore(state => state.currentAccount);
  const performance = usePaperTradingStore(state => state.performance);

  if (!currentAccount) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
        <div className="text-sm text-gray-500">总资产</div>
        <div className="text-2xl font-bold mt-1">
          ¥{currentAccount.totalAssets.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
        </div>
        <div className={`text-sm mt-1 ${currentAccount.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {currentAccount.totalPnL >= 0 ? '+' : ''}{currentAccount.totalPnL.toFixed(2)} 
          ({currentAccount.totalPnLPercent >= 0 ? '+' : ''}{currentAccount.totalPnLPercent.toFixed(2)}%)
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
        <div className="text-sm text-gray-500">可用资金</div>
        <div className="text-2xl font-bold mt-1">
          ¥{currentAccount.cash.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
        </div>
        <div className="text-sm text-gray-500 mt-1">
          占比 {((currentAccount.cash / currentAccount.totalAssets) * 100).toFixed(1)}%
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
        <div className="text-sm text-gray-500">持仓市值</div>
        <div className="text-2xl font-bold mt-1">
          ¥{currentAccount.marketValue.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
        </div>
        <div className="text-sm text-gray-500 mt-1">
          占比 {((currentAccount.marketValue / currentAccount.totalAssets) * 100).toFixed(1)}%
        </div>
      </div>

      {performance && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
          <div className="text-sm text-gray-500">胜率</div>
          <div className="text-2xl font-bold mt-1">
            {performance.winRate.toFixed(1)}%
          </div>
          <div className="text-sm text-gray-500 mt-1">
            {performance.winningTrades}胜 / {performance.totalTrades}笔
          </div>
        </div>
      )}
    </div>
  );
};

export const PaperTradingPage: React.FC = () => {
  const currentAccount = usePaperTradingStore(state => state.currentAccount);
  const calculatePerformance = usePaperTradingStore(state => state.calculatePerformance);

  useEffect(() => {
    if (currentAccount) {
      calculatePerformance();
    }
  }, [currentAccount, calculatePerformance]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">模拟交易</h1>
        <p className="text-sm text-gray-500 mt-1">零风险练习交易策略，积累实战经验</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          <AccountSelector />
          <TradingPanel />
        </div>

        <div className="lg:col-span-2 space-y-6">
          {currentAccount ? (
            <>
              <PerformancePanel />
              <PositionList />
            </>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-center">
              <div className="text-gray-400 text-lg">请先创建或选择一个模拟账户</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
