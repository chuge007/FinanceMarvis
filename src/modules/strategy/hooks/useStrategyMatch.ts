import { useState, useEffect, useCallback } from "react";
import { fetchStrategyDecision } from "../../../services/strategy";
import type { StrategyDecision, Candidate, ExecutionRule } from "../../../types/strategy";
import { useAppStore } from "../../../stores/useAppStore";

export function useStrategyMatch(): { decision: StrategyDecision | null; loading: boolean; refresh: () => void } {
  const { timeframe } = useAppStore();
  const [decision, setDecision] = useState<StrategyDecision | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      setDecision(await fetchStrategyDecision());
    } catch { /* keep stale */ }
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); const id = setInterval(refresh, 30_000); return () => clearInterval(id); }, [refresh, timeframe]);
  return { decision, loading, refresh };
}

export function useCandidates(): { candidates: Candidate[]; loading: boolean } {
  const [candidates] = useState<Candidate[]>([]);
  return { candidates, loading: false };
}

export function useExecutionRules(): { rules: ExecutionRule[]; loading: boolean } {
  const [rules] = useState<ExecutionRule[]>([
    { id: "e1", category: "entry", rules: "信号 >= 60 分可入场，>= 75 分可加仓。入场前确认 VIX < 25、利差未显著走阔。" },
    { id: "e2", category: "risk", rules: "单笔止损 5%、组合最大回撤 15%。信号 < 40 分时将仓位降至 20% 以下。" },
    { id: "e3", category: "position", rules: "初始仓位 50%，信号每提升 10 分加仓 10%，最高 90%。单票上限 15%。" },
    { id: "e4", category: "review", rules: "每日盘后检查信号变化，信号下降 > 10 分触发复盘。每周汇总胜率和盈亏比。" },
  ]);
  return { rules, loading: false };
}