import { memo } from 'react';
import { useProfileStore } from '../../../stores/useProfileStore';
import { assessRisk, scoreToLevel } from '../../../services/investmentPlan';

const LEVEL_LABEL = { conservative: '保守型', balanced: '稳健型', growth: '成长型', aggressive: '进取型' } as const;

function Field(props: {
  label: string;
  hint?: string;
  value: number;
  unit: string;
  step?: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  const { label, hint, value, unit, step = 1, min = 0, max, onChange } = props;
  return (
    <label className="block">
      <span className="text-[10px] text-[#636878]">{label}</span>
      <div className="mt-1 flex items-center gap-1.5">
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full rounded-[4px] border border-[#1a1d26] bg-[#0b0e14] px-2 py-1.5 text-[12px] tabular-nums text-[#d8dce6] outline-none focus:border-[#4078ff]"
        />
        <span className="shrink-0 text-[10px] text-[#636878]">{unit}</span>
      </div>
      {hint && <span className="mt-0.5 block text-[9.5px] leading-snug text-[#4d5364]">{hint}</span>}
    </label>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-[12px] font-bold text-[#d8dce6]">{title}</h3>
        {hint && <span className="text-[9.5px] text-[#636878]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Choice(props: {
  label: string;
  value: number | string;
  options: Array<{ v: number | string; t: string }>;
  onChange: (v: number | string) => void;
}) {
  return (
    <div>
      <span className="text-[10px] text-[#636878]">{props.label}</span>
      <div className="mt-1 flex flex-wrap gap-1">
        {props.options.map((o) => {
          const active = o.v === props.value;
          return (
            <button
              key={String(o.v)}
              type="button"
              onClick={() => props.onChange(o.v)}
              className={`rounded-[4px] border px-2 py-1 text-[10.5px] transition-colors ${
                active
                  ? 'border-[#4078ff] bg-[rgba(64,120,255,0.14)] text-[#d8dce6]'
                  : 'border-[#1a1d26] bg-[#0b0e14] text-[#9aa0ae] hover:border-[#2a3040]'
              }`}
            >
              {o.t}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const ProfileForm = memo(function ProfileForm() {
  const profile = useProfileStore((s) => s.profile);
  const answers = useProfileStore((s) => s.answers);
  const setProfile = useProfileStore((s) => s.setProfile);
  const setAnswers = useProfileStore((s) => s.setAnswers);

  const risk = assessRisk(answers);
  const level = scoreToLevel(risk.score);

  return (
    <div className="space-y-4">
      <Section title="你的钱" hint="只填金融资产，不含自住房">
        <div className="grid grid-cols-2 gap-2.5">
          <Field
            label="可投资金融资产"
            unit="万元"
            value={Math.round(profile.investableAssets / 10000)}
            hint="含现金、存款、基金、股票"
            onChange={(v) => setProfile({ investableAssets: Math.max(0, v) * 10000 })}
          />
          <Field
            label="高息负债余额"
            unit="万元"
            value={Math.round(profile.highInterestDebt / 10000)}
            hint="信用卡 / 消费贷；房贷不算"
            onChange={(v) => setProfile({ highInterestDebt: Math.max(0, v) * 10000 })}
          />
          <Field
            label="月收入（税后）"
            unit="元"
            step={500}
            value={profile.monthlyIncome}
            onChange={(v) => setProfile({ monthlyIncome: Math.max(0, v) })}
          />
          <Field
            label="月支出"
            unit="元"
            step={500}
            value={profile.monthlyExpense}
            onChange={(v) => setProfile({ monthlyExpense: Math.max(0, v) })}
          />
          <Field
            label="现有应急金"
            unit="个月支出"
            min={0}
            max={24}
            value={profile.emergencyMonths}
            hint="能覆盖几个月开销"
            onChange={(v) => setProfile({ emergencyMonths: Math.min(24, Math.max(0, v)) })}
          />
          <Field
            label="年龄"
            unit="岁"
            min={18}
            max={90}
            value={profile.age}
            onChange={(v) => setProfile({ age: Math.min(90, Math.max(18, v)) })}
          />
          <Field
            label="这笔钱多久不用"
            unit="年"
            min={0}
            max={40}
            value={profile.horizonYears}
            hint="低于 3 年不配权益"
            onChange={(v) => setProfile({ horizonYears: Math.min(40, Math.max(0, v)) })}
          />
          <label className="mt-5 flex items-center gap-2 text-[11px] text-[#b0b5c0]">
            <input
              type="checkbox"
              checked={profile.hasInsurance}
              onChange={(e) => setProfile({ hasInsurance: e.target.checked })}
              className="accent-[#0ca678]"
            />
            已有医疗 / 重疾 / 意外保障
          </label>
        </div>
      </Section>

      <Section title="风险测评" hint="5 题 · 结果只影响比例，不影响是否该投资">
        <div className="space-y-2.5">
          <Choice
            label="1. 你的投资经验"
            value={answers.experience}
            options={[
              { v: 0, t: '没买过' },
              { v: 1, t: '只买过货基/债基' },
              { v: 2, t: '买过股票或股票基金' },
              { v: 3, t: '做过期货/期权等杠杆' },
            ]}
            onChange={(v) => setAnswers({ ...answers, experience: v as 0 | 1 | 2 | 3 })}
          />
          <Choice
            label="2. 能接受的最大浮亏"
            value={answers.maxLossPct}
            options={[
              { v: 5, t: '5% 以内' },
              { v: 10, t: '10%' },
              { v: 20, t: '20%' },
              { v: 30, t: '30% 以上' },
            ]}
            onChange={(v) => setAnswers({ ...answers, maxLossPct: v as 5 | 10 | 20 | 30 })}
          />
          <Choice
            label="3. 收入稳定性"
            value={answers.incomeStability}
            options={[
              { v: 0, t: '不稳定' },
              { v: 1, t: '一般' },
              { v: 2, t: '很稳定' },
            ]}
            onChange={(v) => setAnswers({ ...answers, incomeStability: v as 0 | 1 | 2 })}
          />
          <Choice
            label="4. 持仓跌 20% 时你会"
            value={answers.reaction}
            options={[
              { v: 0, t: '全部卖出' },
              { v: 1, t: '卖一部分' },
              { v: 2, t: '继续持有' },
              { v: 3, t: '加仓' },
            ]}
            onChange={(v) => setAnswers({ ...answers, reaction: v as 0 | 1 | 2 | 3 })}
          />
          <Choice
            label="5. 你的目标"
            value={answers.goal}
            options={[
              { v: 'preserve', t: '保值' },
              { v: 'income', t: '稳健增值' },
              { v: 'growth', t: '长期成长' },
              { v: 'aggressive', t: '积极进取' },
            ]}
            onChange={(v) => setAnswers({ ...answers, goal: v as typeof answers.goal })}
          />
        </div>
        <div className="mt-2 rounded-[4px] bg-[rgba(255,255,255,0.025)] px-2.5 py-2 text-[10px] text-[#9aa0ae]">
          得分 {risk.score}/100 · 意愿等级「{LEVEL_LABEL[level]}」
          <span className="text-[#636878]">　最终等级还会被「能接受的最大浮亏」与投资期限压制。</span>
        </div>
      </Section>
    </div>
  );
});
