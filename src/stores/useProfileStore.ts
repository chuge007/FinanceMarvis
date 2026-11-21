import { create } from 'zustand';
import { emptyProfile, assessRisk, type Profile, type RiskAnswers } from '../services/investmentPlan';
import { readJSON, writeJSON } from '../shared/utils/localStore';

const KEY = 'marvis.profile.v1';

export const DEFAULT_ANSWERS: RiskAnswers = {
  experience: 1,
  maxLossPct: 20,
  incomeStability: 2,
  reaction: 2,
  goal: 'growth',
};

interface Stored {
  profile: Profile;
  answers: RiskAnswers;
  acknowledged: boolean;
}

function initial(): Stored {
  const base = emptyProfile();
  const risk = assessRisk(DEFAULT_ANSWERS);
  return {
    profile: { ...base, riskScore: risk.score, maxLossPct: DEFAULT_ANSWERS.maxLossPct },
    answers: DEFAULT_ANSWERS,
    acknowledged: false,
  };
}

const saved = readJSON<Stored | null>(KEY, null);
const start: Stored = saved && saved.profile ? { ...initial(), ...saved } : initial();

interface ProfileState extends Stored {
  setProfile: (patch: Partial<Profile>) => void;
  setAnswers: (a: RiskAnswers) => void;
  acknowledge: () => void;
  reset: () => void;
}

function persist(s: Stored) {
  writeJSON<Stored>(KEY, { profile: s.profile, answers: s.answers, acknowledged: s.acknowledged });
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  ...start,
  setProfile: (patch) => {
    const profile = { ...get().profile, ...patch };
    const next = { profile, answers: get().answers, acknowledged: get().acknowledged };
    persist(next);
    set({ profile });
  },
  setAnswers: (answers) => {
    const risk = assessRisk(answers);
    const profile = { ...get().profile, riskScore: risk.score, maxLossPct: answers.maxLossPct, goal: answers.goal };
    const next = { profile, answers, acknowledged: get().acknowledged };
    persist(next);
    set({ answers, profile });
  },
  acknowledge: () => {
    const next = { profile: get().profile, answers: get().answers, acknowledged: true };
    persist(next);
    set({ acknowledged: true });
  },
  reset: () => {
    const fresh = initial();
    persist(fresh);
    set(fresh);
  },
}));
