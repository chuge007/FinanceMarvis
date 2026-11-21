import { memo, useEffect, useMemo, useState } from 'react';
import { useProfileStore } from '../../stores/useProfileStore';
import { buildPlan, ASSET_CLASS_FACTS, type RegimeInput } from '../../services/investmentPlan';
import { fetchRhythm } from '../rhythm/services/rhythm';
import { Panel } from '../../shared/components/Panel';
import { SourceBadge } from '../../shared/components/SourceBadge';
import { ProfileForm } from './components/ProfileForm';
import { PlanResult } from './components/PlanResult';
import { MapNav } from './components/MapNav';
import { RiskDisclosure } from './components/RiskDisclosure';

export const InvestmentMapPage = memo(function InvestmentMapPage() {
  const profile = useProfileStore((s) => s.profile);
  const [regime, setRegime] = useState<RegimeInput | null>(null);
  const [regimeState, setRegimeState] = useState<'loading' | 'ok' | 'unavailable'>('loading');

  useEffect(() => {
    let alive = true;
    fetchRhythm()
      .then((s) => {
        if (!alive) return;
        setRegime({ tone: s.regime.tone, confidence: s.regime.confidence, asOf: s.regime.asOf });
        setRegimeState(s.regime.confidence > 0 ? 'ok' : 'unavailable');
      })
      .catch(() => {
        if (alive) setRegimeState('unavailable');
      });
    return () => { alive = false; };
  }, []);

  const plan = useMemo(() => buildPlan(profile, regime), [profile, regime]);

  return (
    <div className="space-y-3 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-bold text-[#d8dce6]">投资地图 · 先安排钱，再谈投资</h2>
          <p className="mt-0.5 max-w-[620px] text-[10px] leading-relaxed text-[#636878]">
            这不是选股工具。它先帮你决定「多少钱可以进股市」，再决定「怎么放、放多少、什么时候调」。
            顺序错了，再好的标的也救不了。
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <SourceBadge kind="rule" text="配置比例：规则推算" />
          <SourceBadge
            kind={regimeState === 'ok' ? 'real' : regimeState === 'loading' ? 'missing' : 'missing'}
            text={
              regimeState === 'ok'
                ? `市场状态：${regime?.tone} · 覆盖 ${regime?.confidence}%`
                : regimeState === 'loading'
                  ? '市场状态：加载中'
                  : '市场状态：不可用（未纳入调整）'
            }
          />
        </div>
      </div>

      <RiskDisclosure />

      <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[340px_1fr]">
        <div id="map-profile" className="scroll-mt-14">
          <Panel title="第 1 步 · 你的情况" hint="只存本机，不上传">
            <ProfileForm />
            <div className="mt-4 border-t border-[#1a1d26] pt-3">
              <button
                onClick={() => useProfileStore.getState().reset()}
                className="text-[10px] text-[#636878] hover:text-[#b0b5c0]"
              >
                重置为默认示例
              </button>
              <span className="ml-2 text-[9.5px] text-[#4d5364]">改动会实时重算，无需保存</span>
            </div>
          </Panel>
        </div>

        <div id="map-plan" className="scroll-mt-14">
          <PlanResult plan={plan} />
        </div>
      </div>

      <MapNav />

      <div className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-4">
        <h3 className="text-[12px] font-bold text-[#d8dce6]">资产大类速查 · 先知道自己在买什么</h3>
        <p className="mt-1 text-[9.5px] leading-relaxed text-[#636878]">
          下表是长期历史统计的粗略量级，不同起点差异极大，不代表未来。它只用来建立"波动有多大"的预期，不是收益预测。
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-[#1a1d26] text-left text-[9.5px] text-[#636878]">
                <th className="py-1.5 pr-3 font-normal">资产类别</th>
                <th className="py-1.5 pr-3 font-normal">作用</th>
                <th className="py-1.5 pr-3 font-normal">建议期限</th>
                <th className="py-1.5 pr-3 font-normal">历史最大回撤量级</th>
                <th className="py-1.5 pr-3 font-normal">流动性</th>
                <th className="py-1.5 font-normal">一句话</th>
              </tr>
            </thead>
            <tbody>
              {ASSET_CLASS_FACTS.map((a) => (
                <tr key={a.name} className="border-b border-[#131620] align-top">
                  <td className="py-1.5 pr-3 text-[10.5px] text-[#d8dce6]">{a.name}</td>
                  <td className="py-1.5 pr-3 text-[10px] text-[#9aa0ae]">{a.role}</td>
                  <td className="py-1.5 pr-3 text-[10px] text-[#9aa0ae]">{a.horizon}</td>
                  <td className="py-1.5 pr-3 text-[10px] text-[#f59e4b]">{a.drawdown}</td>
                  <td className="py-1.5 pr-3 text-[10px] text-[#9aa0ae]">{a.liquidity}</td>
                  <td className="py-1.5 text-[10px] text-[#636878]">{a.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="pb-2 text-center text-[10px] leading-relaxed text-[#636878]">
        Marvis 投资地图 · 配置比例由你填写的画像与公开规则推算，不含任何收益预测 · 不构成投资建议
        <br />
        本工具不具备证券投资咨询资质 · 历史数据不代表未来 · 投资有风险，本金可能亏损
      </p>
    </div>
  );
});
