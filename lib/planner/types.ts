export type PlannerTaskSource = "web" | "telegram";
export type PlannerVoiceSource = "web" | "telegram";
export type PlannerVoiceProvider = "cloudflare" | "openai";

export type PlannerTask = {
  id: string;
  title: string;
  date: string;
  completed: boolean;
  sortOrder: number;
  source: PlannerTaskSource;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type PlannerTaskInput = {
  title: string;
  date: string;
  completed?: boolean;
  sortOrder?: number;
  source?: PlannerTaskSource;
};

export type PlannerVoiceUsageSummary = {
  dailyLimitSeconds: number;
  model: string;
  nextResetAt: string;
  progress: number;
  provider: PlannerVoiceProvider;
  providerLabel: string;
  requestsToday: number;
  totalSecondsToday: number;
  userSecondsToday: number;
};
