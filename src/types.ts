export type GoalPeriod = "daily" | "weekly" | "monthly";
export type GoalStatus = "active" | "completed";

export interface Goal {
  id: string;
  title: string;
  period: GoalPeriod;
  targetMinutes: number;
  periodStart: number;
  periodEnd: number;
  createdAt: number;
  completedAt: number | null;
  status: GoalStatus;
  isPrimary: boolean;
  trackedSeconds: number;
}

export interface FocusSession {
  id: string;
  goalId: string;
  goalTitle: string;
  startedAt: number;
  endedAt: number | null;
  elapsedSeconds: number;
}

export interface DailyReview {
  date: string;
  shipped: string;
  blocker: string;
  nextFocus: string;
  updatedAt: number;
}

export interface PeriodSummary {
  period: GoalPeriod;
  focusSeconds: number;
  plannedMinutes: number;
  completedGoals: number;
  totalGoals: number;
}

export interface DashboardStats {
  todayFocusSeconds: number;
  weekFocusSeconds: number;
  monthFocusSeconds: number;
  activeGoals: number;
  completedGoals: number;
  focusStreakDays: number;
  periods: PeriodSummary[];
}

export interface Dashboard {
  now: number;
  today: string;
  goals: Goal[];
  activeSession: FocusSession | null;
  recentSessions: FocusSession[];
  reviews: DailyReview[];
  stats: DashboardStats;
}

export interface GoalInput {
  title: string;
  period: GoalPeriod;
  targetMinutes: number;
  isPrimary: boolean;
}

export interface ReviewInput {
  shipped: string;
  blocker: string;
  nextFocus: string;
}
