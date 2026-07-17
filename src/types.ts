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

export type ThoughtSource = "typed" | "speech";

export interface ThoughtDump {
  id: string;
  content: string;
  source: ThoughtSource;
  createdAt: number;
}

export interface PeriodSummary {
  period: GoalPeriod;
  focusSeconds: number;
  plannedMinutes: number;
  completedGoals: number;
  totalGoals: number;
}

export type DailyProgressStatus = "empty" | "missed" | "partial" | "met";

export interface DailyProgress {
  date: string;
  focusSeconds: number;
  plannedMinutes: number;
  progressPercent: number;
  status: DailyProgressStatus;
  isToday: boolean;
}

export interface DashboardStats {
  todayFocusSeconds: number;
  weekFocusSeconds: number;
  monthFocusSeconds: number;
  activeGoals: number;
  completedGoals: number;
  focusStreakDays: number;
  periods: PeriodSummary[];
  dailyProgress: DailyProgress[];
}

export interface Dashboard {
  now: number;
  today: string;
  menuBarTitle: string;
  goals: Goal[];
  activeSession: FocusSession | null;
  recentSessions: FocusSession[];
  reviews: DailyReview[];
  thoughtDumps: ThoughtDump[];
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

export interface ThoughtDumpInput {
  content: string;
  source: ThoughtSource;
}

export type AssistantProvider = "codex" | "claude";

export interface ThoughtComposerState {
  isOpen: boolean;
  draft: string;
  isListening: boolean;
  speechSupported: boolean;
  message: string | null;
}

export interface SystemPreferences {
  launchAtLogin: boolean;
}

export type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "error";

export interface AppUpdateState {
  phase: UpdatePhase;
  version: string | null;
  notes: string | null;
  progress: number | null;
  error: string | null;
}
