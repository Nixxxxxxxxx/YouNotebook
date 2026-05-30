export type PlannerTaskSource = "web" | "telegram";

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
