import React, { useEffect, useState } from 'react';
import { useAlertStore, requestNotificationPermission } from '../../stores/useAlertStore';
import type { AlertCondition } from '../../stores/useAlertStore';

const ALERT_CONDITIONS = [
  { value: 'price_above', label: '价格突破', unit: '¥' },
  { value: 'price_below', label: '价格跌破', unit: '¥' },
  { value: 'change_above', label: '涨幅超过', unit: '%' },
  { value: 'change_below', label: '跌幅超过', unit: '%' },
  { value: 'volume_spike', label: '成交量突破', unit: '万' },
  { value: 'rsi_overbought', label: 'RSI超买', unit: '' },
  { value: 'rsi_oversold', label: 'RSI超卖', unit: '' },
] as const;

const AddAlertDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [symbol, setSymbol] = useState('');
  const [condition, setCondition] = useState<AlertCondition>('price_above');
  const [targetValue, setTargetValue] = useState('');
  const addAlert = useAlertStore(state => state.addAlert);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!symbol || !targetValue) {
      alert('请填写完整信息');
      return;
    }

    await addAlert({
      symbol: symbol.trim(),
      name: symbol.trim(),
      condition,
      targetValue: parseFloat(targetValue),
      message: '',
      enabled: true,
      notifySound: true,
      notifyDesktop: true,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">添加告警</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">股票代码</label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="例如: 600519"
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">告警条件</label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as AlertCondition)}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
            >
              {ALERT_CONDITIONS.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              目标值 {ALERT_CONDITIONS.find(c => c.value === condition)?.unit}
            </label>
            <input
              type="number"
              step="0.01"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder="输入数值"
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
            />
          </div>

          <div className="flex gap-2 pt-4">
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              添加
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AlertList: React.FC = () => {
  const alerts = useAlertStore(state => state.alerts);
  const removeAlert = useAlertStore(state => state.removeAlert);
  const toggleAlert = useAlertStore(state => state.toggleAlert);

  const activeAlerts = alerts.filter(a => !a.triggered && a.enabled);
  const triggeredAlerts = alerts.filter(a => a.triggered);
  const disabledAlerts = alerts.filter(a => !a.triggered && !a.enabled);

  const renderAlertRow = (alert: any) => (
    <tr key={alert.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
      <td className="px-4 py-3">
        <div className="font-medium">{alert.symbol}</div>
        <div className="text-xs text-gray-500">{alert.name}</div>
      </td>
      <td className="px-4 py-3 text-sm">{alert.message}</td>
      <td className="px-4 py-3 text-sm">
        {alert.currentValue !== undefined && (
          <span className="text-blue-600 font-medium">{alert.currentValue.toFixed(2)}</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className={`px-2 py-1 text-xs rounded-full ${
          alert.triggered 
            ? 'bg-green-100 text-green-800' 
            : alert.enabled 
            ? 'bg-blue-100 text-blue-800' 
            : 'bg-gray-100 text-gray-800'
        }`}>
          {alert.triggered ? '已触发' : alert.enabled ? '监控中' : '已暂停'}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {new Date(alert.createdAt).toLocaleString('zh-CN')}
      </td>
      <td className="px-4 py-3 text-center space-x-2">
        {!alert.triggered && (
          <button
            onClick={() => toggleAlert(alert.id)}
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            {alert.enabled ? '暂停' : '启用'}
          </button>
        )}
        <button
          onClick={() => removeAlert(alert.id)}
          className="text-red-600 hover:text-red-800 text-sm"
        >
          删除
        </button>
      </td>
    </tr>
  );

  return (
    <div className="space-y-6">
      {activeAlerts.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900 border-b">
            <h3 className="font-semibold">监控中 ({activeAlerts.length})</h3>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">代码</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">条件</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">当前值</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">创建时间</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {activeAlerts.map(renderAlertRow)}
            </tbody>
          </table>
        </div>
      )}

      {triggeredAlerts.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 bg-green-50 dark:bg-green-900 border-b">
            <h3 className="font-semibold">已触发 ({triggeredAlerts.length})</h3>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">代码</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">条件</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">触发值</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">触发时间</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {triggeredAlerts.map(alert => (
                <tr key={alert.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3">
                    <div className="font-medium">{alert.symbol}</div>
                  </td>
                  <td className="px-4 py-3 text-sm">{alert.message}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className="text-green-600 font-medium">{alert.currentValue?.toFixed(2)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                      已触发
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {alert.triggeredAt && new Date(alert.triggeredAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => removeAlert(alert.id)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeAlerts.length === 0 && triggeredAlerts.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-center">
          <div className="text-gray-400 text-lg">暂无告警</div>
          <div className="text-sm text-gray-500 mt-2">点击右上角"添加告警"开始监控</div>
        </div>
      )}
    </div>
  );
};

export const AlertPage: React.FC = () => {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const loadAlerts = useAlertStore(state => state.loadAlerts);
  const loading = useAlertStore(state => state.loading);

  useEffect(() => {
    loadAlerts();
    requestNotificationPermission();
  }, [loadAlerts]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">告警规则</h1>
          <p className="text-sm text-gray-500 mt-1">保存你的价格与指标阈值，作为检查清单使用</p>
        </div>
        <button
          onClick={() => setShowAddDialog(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          + 添加告警
        </button>
      </div>

      <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-200">
        当前版本<strong>不会自动轮询触发</strong>告警：规则会保存在本机，但不会在价格触及时弹通知。
        请把它当作「事先写好的检查清单」，在打开软件时人工核对。后续版本接入行情轮询后才会自动提醒。
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <div className="mt-2 text-gray-600">加载中...</div>
        </div>
      ) : (
        <AlertList />
      )}

      {showAddDialog && <AddAlertDialog onClose={() => setShowAddDialog(false)} />}
    </div>
  );
};
