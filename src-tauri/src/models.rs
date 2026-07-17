use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GoalPeriod {
    Daily,
    Weekly,
    Monthly,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GoalStatus {
    Active,
    Completed,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Goal {
    pub id: String,
    pub title: String,
    pub period: GoalPeriod,
    pub target_minutes: u32,
    pub period_start: i64,
    pub period_end: i64,
    pub created_at: i64,
    pub completed_at: Option<i64>,
    pub status: GoalStatus,
    pub is_primary: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusSession {
    pub id: String,
    pub goal_id: String,
    pub started_at: i64,
    pub ended_at: Option<i64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyReview {
    pub date: String,
    pub shipped: String,
    pub blocker: String,
    pub next_focus: String,
    pub updated_at: i64,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ThoughtSource {
    Typed,
    Speech,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThoughtDump {
    pub id: String,
    pub content: String,
    pub source: ThoughtSource,
    pub created_at: i64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppData {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub goals: Vec<Goal>,
    #[serde(default)]
    pub sessions: Vec<FocusSession>,
    #[serde(default)]
    pub reviews: Vec<DailyReview>,
    #[serde(default)]
    pub thought_dumps: Vec<ThoughtDump>,
    #[serde(default)]
    pub active_session_id: Option<String>,
}

impl Default for AppData {
    fn default() -> Self {
        Self {
            schema_version: default_schema_version(),
            goals: Vec::new(),
            sessions: Vec::new(),
            reviews: Vec::new(),
            thought_dumps: Vec::new(),
            active_session_id: None,
        }
    }
}

const fn default_schema_version() -> u32 {
    1
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalInput {
    pub title: String,
    pub period: GoalPeriod,
    pub target_minutes: u32,
    #[serde(default)]
    pub is_primary: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewInput {
    pub shipped: String,
    pub blocker: String,
    pub next_focus: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThoughtDumpInput {
    pub content: String,
    pub source: ThoughtSource,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AssistantProvider {
    Codex,
    Claude,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalView {
    #[serde(flatten)]
    pub goal: Goal,
    pub tracked_seconds: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusSessionView {
    #[serde(flatten)]
    pub session: FocusSession,
    pub goal_title: String,
    pub elapsed_seconds: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeriodSummary {
    pub period: GoalPeriod,
    pub focus_seconds: i64,
    pub planned_minutes: u32,
    pub completed_goals: usize,
    pub total_goals: usize,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DailyProgressStatus {
    Empty,
    Missed,
    Partial,
    Met,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyProgress {
    pub date: String,
    pub focus_seconds: i64,
    pub planned_minutes: u32,
    pub progress_percent: u32,
    pub status: DailyProgressStatus,
    pub is_today: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardStats {
    pub today_focus_seconds: i64,
    pub week_focus_seconds: i64,
    pub month_focus_seconds: i64,
    pub active_goals: usize,
    pub completed_goals: usize,
    pub focus_streak_days: usize,
    pub periods: Vec<PeriodSummary>,
    pub daily_progress: Vec<DailyProgress>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Dashboard {
    pub now: i64,
    pub today: String,
    pub menu_bar_title: String,
    pub goals: Vec<GoalView>,
    pub active_session: Option<FocusSessionView>,
    pub recent_sessions: Vec<FocusSessionView>,
    pub reviews: Vec<DailyReview>,
    pub thought_dumps: Vec<ThoughtDump>,
    pub stats: DashboardStats,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn state_from_before_thought_dumps_still_loads() {
        let data: AppData = serde_json::from_str(
            r#"{
                "schemaVersion": 1,
                "goals": [],
                "sessions": [],
                "reviews": [],
                "activeSessionId": null
            }"#,
        )
        .unwrap();

        assert!(data.thought_dumps.is_empty());
    }
}
