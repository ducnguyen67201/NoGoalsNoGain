use std::{cmp::Reverse, collections::HashSet};

use chrono::{Datelike, Duration, Local, LocalResult, NaiveDate, TimeZone, Utc};

use crate::models::{
    AppData, DailyReview, Dashboard, DashboardStats, FocusSession, FocusSessionView, Goal,
    GoalInput, GoalPeriod, GoalStatus, GoalView, PeriodSummary, ReviewInput,
};

pub fn now_timestamp() -> i64 {
    Utc::now().timestamp()
}

pub fn create_goal(data: &mut AppData, input: GoalInput, now: i64) -> Result<(), String> {
    let title = clean_required_text(&input.title, 120, "Goal")?;
    validate_target_minutes(input.target_minutes)?;
    let date = local_date(now);
    let (period_start, period_end) = period_bounds(input.period, date);

    if input.is_primary {
        clear_primary_goals(data);
    }

    data.goals.push(Goal {
        id: uuid::Uuid::new_v4().to_string(),
        title,
        period: input.period,
        target_minutes: input.target_minutes,
        period_start,
        period_end,
        created_at: now,
        completed_at: None,
        status: GoalStatus::Active,
        is_primary: input.is_primary,
    });

    Ok(())
}

pub fn update_goal(
    data: &mut AppData,
    goal_id: &str,
    input: GoalInput,
    now: i64,
) -> Result<(), String> {
    let title = clean_required_text(&input.title, 120, "Goal")?;
    validate_target_minutes(input.target_minutes)?;
    let date = local_date(now);
    let (period_start, period_end) = period_bounds(input.period, date);
    let goal_index = data
        .goals
        .iter()
        .position(|goal| goal.id == goal_id)
        .ok_or_else(|| "Goal not found.".to_string())?;

    if input.is_primary {
        clear_primary_goals(data);
    }

    let goal = &mut data.goals[goal_index];
    goal.title = title;
    goal.period = input.period;
    goal.target_minutes = input.target_minutes;
    goal.period_start = period_start;
    goal.period_end = period_end;
    goal.is_primary = input.is_primary;

    Ok(())
}

pub fn set_primary_goal(data: &mut AppData, goal_id: &str, now: i64) -> Result<(), String> {
    let target = data
        .goals
        .iter()
        .find(|goal| goal.id == goal_id)
        .ok_or_else(|| "Goal not found.".to_string())?;

    if target.status != GoalStatus::Active || target.period_end <= now {
        return Err("Only a current, active goal can be your primary focus.".to_string());
    }

    clear_primary_goals(data);
    if let Some(goal) = data.goals.iter_mut().find(|goal| goal.id == goal_id) {
        goal.is_primary = true;
    }

    Ok(())
}

pub fn complete_goal(data: &mut AppData, goal_id: &str, now: i64) -> Result<(), String> {
    let goal_index = data
        .goals
        .iter()
        .position(|goal| goal.id == goal_id)
        .ok_or_else(|| "Goal not found.".to_string())?;

    if active_session(data).is_some_and(|session| session.goal_id == goal_id) {
        stop_active_session(data, now)?;
    }

    let goal = &mut data.goals[goal_index];
    goal.status = GoalStatus::Completed;
    goal.completed_at = Some(now);
    goal.is_primary = false;
    Ok(())
}

pub fn delete_goal(data: &mut AppData, goal_id: &str, now: i64) -> Result<(), String> {
    if !data.goals.iter().any(|goal| goal.id == goal_id) {
        return Err("Goal not found.".to_string());
    }

    if active_session(data).is_some_and(|session| session.goal_id == goal_id) {
        stop_active_session(data, now)?;
    }

    data.goals.retain(|goal| goal.id != goal_id);
    data.sessions.retain(|session| session.goal_id != goal_id);
    Ok(())
}

pub fn start_focus(data: &mut AppData, goal_id: &str, now: i64) -> Result<(), String> {
    if active_session(data).is_some() {
        return Err("Stop the current focus session before starting another.".to_string());
    }

    let goal = data
        .goals
        .iter()
        .find(|goal| goal.id == goal_id)
        .ok_or_else(|| "Goal not found.".to_string())?;

    if goal.status != GoalStatus::Active {
        return Err("Completed goals cannot start new focus sessions.".to_string());
    }

    if goal.period_end <= now {
        return Err("This goal belongs to an expired period.".to_string());
    }

    let session = FocusSession {
        id: uuid::Uuid::new_v4().to_string(),
        goal_id: goal_id.to_string(),
        started_at: now,
        ended_at: None,
    };

    data.active_session_id = Some(session.id.clone());
    data.sessions.push(session);
    Ok(())
}

pub fn stop_active_session(data: &mut AppData, now: i64) -> Result<(), String> {
    let active_session_id = data
        .active_session_id
        .as_deref()
        .ok_or_else(|| "No focus session is currently running.".to_string())?;

    let session_index = data
        .sessions
        .iter()
        .position(|session| session.id == active_session_id)
        .ok_or_else(|| "The active focus session could not be found.".to_string())?;

    let session = &mut data.sessions[session_index];
    session.ended_at = Some(now.max(session.started_at));
    data.active_session_id = None;
    Ok(())
}

pub fn save_review(data: &mut AppData, input: ReviewInput, now: i64) -> Result<(), String> {
    let date = local_date(now).format("%Y-%m-%d").to_string();
    let review = DailyReview {
        date: date.clone(),
        shipped: clean_optional_text(&input.shipped, 1_000, "Shipped")?,
        blocker: clean_optional_text(&input.blocker, 1_000, "Blocker")?,
        next_focus: clean_optional_text(&input.next_focus, 1_000, "Next focus")?,
        updated_at: now,
    };

    if let Some(existing) = data.reviews.iter_mut().find(|review| review.date == date) {
        *existing = review;
    } else {
        data.reviews.push(review);
    }

    Ok(())
}

pub fn build_dashboard(data: &AppData, now: i64) -> Dashboard {
    let today_date = local_date(now);
    let today = today_date.format("%Y-%m-%d").to_string();

    let mut goals = data
        .goals
        .iter()
        .cloned()
        .map(|goal| GoalView {
            tracked_seconds: tracked_seconds_for_goal(data, &goal.id, now),
            goal,
        })
        .collect::<Vec<_>>();

    goals.sort_by(|left, right| {
        let left_current = left.goal.period_end > now;
        let right_current = right.goal.period_end > now;

        right_current
            .cmp(&left_current)
            .then_with(|| right.goal.is_primary.cmp(&left.goal.is_primary))
            .then_with(|| {
                goal_status_rank(left.goal.status).cmp(&goal_status_rank(right.goal.status))
            })
            .then_with(|| right.goal.created_at.cmp(&left.goal.created_at))
    });

    let active_session = active_session(data).map(|session| session_view(data, session, now));
    let mut recent_sessions = data.sessions.clone();
    recent_sessions.sort_by_key(|session| Reverse(session.started_at));
    let recent_sessions = recent_sessions
        .into_iter()
        .take(20)
        .map(|session| session_view(data, &session, now))
        .collect();

    let mut reviews = data.reviews.clone();
    reviews.sort_by_key(|review| Reverse(review.updated_at));
    reviews.truncate(14);

    let (today_start, today_end) = period_bounds(GoalPeriod::Daily, today_date);
    let (week_start, week_end) = period_bounds(GoalPeriod::Weekly, today_date);
    let (month_start, month_end) = period_bounds(GoalPeriod::Monthly, today_date);

    let periods = [
        (GoalPeriod::Daily, today_start, today_end),
        (GoalPeriod::Weekly, week_start, week_end),
        (GoalPeriod::Monthly, month_start, month_end),
    ]
    .into_iter()
    .map(|(period, period_start, period_end)| {
        period_summary(data, period, period_start, period_end, now)
    })
    .collect();

    let active_goals = data
        .goals
        .iter()
        .filter(|goal| goal.status == GoalStatus::Active && goal.period_end > now)
        .count();
    let completed_goals = data
        .goals
        .iter()
        .filter(|goal| goal.status == GoalStatus::Completed)
        .count();

    Dashboard {
        now,
        today,
        goals,
        active_session,
        recent_sessions,
        reviews,
        stats: DashboardStats {
            today_focus_seconds: focus_seconds_between(data, today_start, today_end, now),
            week_focus_seconds: focus_seconds_between(data, week_start, week_end, now),
            month_focus_seconds: focus_seconds_between(data, month_start, month_end, now),
            active_goals,
            completed_goals,
            focus_streak_days: focus_streak_days(data, today_date, now),
            periods,
        },
    }
}

pub fn menu_bar_title(data: &AppData, now: i64) -> String {
    if let Some(session) = active_session(data) {
        let title = goal_title(data, &session.goal_id);
        let elapsed = session_elapsed_seconds(session, now);
        return format!(
            "{} · {}",
            truncate_title(title, 28),
            format_elapsed(elapsed)
        );
    }

    let goal = data
        .goals
        .iter()
        .filter(|goal| goal.status == GoalStatus::Active && goal.period_end > now)
        .min_by_key(|goal| {
            (
                !goal.is_primary,
                period_rank(goal.period),
                Reverse(goal.created_at),
            )
        });

    match goal {
        Some(goal) => {
            let tracked_minutes = tracked_seconds_for_goal(data, &goal.id, now) / 60;
            format!(
                "{} · {tracked_minutes}/{}m",
                truncate_title(&goal.title, 28),
                goal.target_minutes
            )
        }
        None => "Set today’s focus".to_string(),
    }
}

pub fn has_goals(data: &AppData) -> bool {
    !data.goals.is_empty()
}

fn active_session(data: &AppData) -> Option<&FocusSession> {
    let active_session_id = data.active_session_id.as_deref()?;
    data.sessions
        .iter()
        .find(|session| session.id == active_session_id && session.ended_at.is_none())
}

fn clear_primary_goals(data: &mut AppData) {
    for goal in &mut data.goals {
        goal.is_primary = false;
    }
}

fn validate_target_minutes(target_minutes: u32) -> Result<(), String> {
    if !(1..=100_000).contains(&target_minutes) {
        return Err("Target minutes must be between 1 and 100,000.".to_string());
    }
    Ok(())
}

fn clean_required_text(value: &str, max_chars: usize, label: &str) -> Result<String, String> {
    let cleaned = value.trim();
    if cleaned.is_empty() {
        return Err(format!("{label} cannot be empty."));
    }
    clean_optional_text(cleaned, max_chars, label)
}

fn clean_optional_text(value: &str, max_chars: usize, label: &str) -> Result<String, String> {
    let cleaned = value.trim();
    if cleaned.chars().count() > max_chars {
        return Err(format!("{label} must be {max_chars} characters or fewer."));
    }
    Ok(cleaned.to_string())
}

fn period_summary(
    data: &AppData,
    period: GoalPeriod,
    period_start: i64,
    period_end: i64,
    now: i64,
) -> PeriodSummary {
    let goals = data
        .goals
        .iter()
        .filter(|goal| {
            goal.period == period
                && goal.period_start == period_start
                && goal.period_end == period_end
        })
        .collect::<Vec<_>>();

    PeriodSummary {
        period,
        focus_seconds: focus_seconds_between(data, period_start, period_end, now),
        planned_minutes: goals.iter().map(|goal| goal.target_minutes).sum(),
        completed_goals: goals
            .iter()
            .filter(|goal| goal.status == GoalStatus::Completed)
            .count(),
        total_goals: goals.len(),
    }
}

fn session_view(data: &AppData, session: &FocusSession, now: i64) -> FocusSessionView {
    FocusSessionView {
        session: session.clone(),
        goal_title: goal_title(data, &session.goal_id).to_string(),
        elapsed_seconds: session_elapsed_seconds(session, now),
    }
}

fn goal_title<'a>(data: &'a AppData, goal_id: &str) -> &'a str {
    data.goals
        .iter()
        .find(|goal| goal.id == goal_id)
        .map_or("Deleted goal", |goal| goal.title.as_str())
}

fn tracked_seconds_for_goal(data: &AppData, goal_id: &str, now: i64) -> i64 {
    data.sessions
        .iter()
        .filter(|session| session.goal_id == goal_id)
        .map(|session| session_elapsed_seconds(session, now))
        .sum()
}

fn session_elapsed_seconds(session: &FocusSession, now: i64) -> i64 {
    session
        .ended_at
        .unwrap_or(now)
        .saturating_sub(session.started_at)
}

fn focus_seconds_between(data: &AppData, start: i64, end: i64, now: i64) -> i64 {
    data.sessions
        .iter()
        .map(|session| {
            overlap_seconds(
                session.started_at,
                session.ended_at.unwrap_or(now),
                start,
                end,
            )
        })
        .sum()
}

fn overlap_seconds(first_start: i64, first_end: i64, second_start: i64, second_end: i64) -> i64 {
    first_end
        .min(second_end)
        .saturating_sub(first_start.max(second_start))
}

fn focus_streak_days(data: &AppData, today: NaiveDate, now: i64) -> usize {
    let focused_dates = data
        .sessions
        .iter()
        .filter(|session| session_elapsed_seconds(session, now) > 0)
        .map(|session| local_date(session.started_at))
        .collect::<HashSet<_>>();

    let mut cursor = if focused_dates.contains(&today) {
        today
    } else {
        today - Duration::days(1)
    };
    let mut streak = 0;

    while focused_dates.contains(&cursor) {
        streak += 1;
        cursor -= Duration::days(1);
    }

    streak
}

fn goal_status_rank(status: GoalStatus) -> u8 {
    match status {
        GoalStatus::Active => 0,
        GoalStatus::Completed => 1,
    }
}

fn period_rank(period: GoalPeriod) -> u8 {
    match period {
        GoalPeriod::Daily => 0,
        GoalPeriod::Weekly => 1,
        GoalPeriod::Monthly => 2,
    }
}

fn format_elapsed(seconds: i64) -> String {
    let seconds = seconds.max(0);
    let hours = seconds / 3_600;
    let minutes = (seconds % 3_600) / 60;
    let seconds = seconds % 60;

    if hours > 0 {
        format!("{hours}:{minutes:02}:{seconds:02}")
    } else {
        format!("{minutes:02}:{seconds:02}")
    }
}

fn truncate_title(title: &str, max_chars: usize) -> String {
    if title.chars().count() <= max_chars {
        return title.to_string();
    }

    let mut truncated = title
        .chars()
        .take(max_chars.saturating_sub(1))
        .collect::<String>();
    truncated.push('…');
    truncated
}

fn local_date(timestamp: i64) -> NaiveDate {
    Local
        .timestamp_opt(timestamp, 0)
        .single()
        .unwrap_or_else(Local::now)
        .date_naive()
}

fn period_bounds(period: GoalPeriod, date: NaiveDate) -> (i64, i64) {
    let (start_date, end_date) = period_dates(period, date);
    (
        local_midnight_timestamp(start_date),
        local_midnight_timestamp(end_date),
    )
}

fn period_dates(period: GoalPeriod, date: NaiveDate) -> (NaiveDate, NaiveDate) {
    match period {
        GoalPeriod::Daily => (date, date + Duration::days(1)),
        GoalPeriod::Weekly => {
            let start = date - Duration::days(i64::from(date.weekday().num_days_from_monday()));
            (start, start + Duration::days(7))
        }
        GoalPeriod::Monthly => {
            let start = NaiveDate::from_ymd_opt(date.year(), date.month(), 1)
                .expect("the first day of a valid month exists");
            let end = if date.month() == 12 {
                NaiveDate::from_ymd_opt(date.year() + 1, 1, 1)
            } else {
                NaiveDate::from_ymd_opt(date.year(), date.month() + 1, 1)
            }
            .expect("the first day of the next month exists");
            (start, end)
        }
    }
}

fn local_midnight_timestamp(date: NaiveDate) -> i64 {
    let midnight = date
        .and_hms_opt(0, 0, 0)
        .expect("midnight is always a valid time");

    match Local.from_local_datetime(&midnight) {
        LocalResult::Single(value) => value.timestamp(),
        LocalResult::Ambiguous(earlier, _) => earlier.timestamp(),
        LocalResult::None => Local
            .from_local_datetime(&(midnight + Duration::hours(1)))
            .earliest()
            .expect("a local time shortly after midnight must exist")
            .timestamp(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn period_dates_cover_day_week_and_month() {
        let date = NaiveDate::from_ymd_opt(2026, 7, 16).unwrap();

        assert_eq!(
            period_dates(GoalPeriod::Daily, date),
            (
                NaiveDate::from_ymd_opt(2026, 7, 16).unwrap(),
                NaiveDate::from_ymd_opt(2026, 7, 17).unwrap()
            )
        );
        assert_eq!(
            period_dates(GoalPeriod::Weekly, date),
            (
                NaiveDate::from_ymd_opt(2026, 7, 13).unwrap(),
                NaiveDate::from_ymd_opt(2026, 7, 20).unwrap()
            )
        );
        assert_eq!(
            period_dates(GoalPeriod::Monthly, date),
            (
                NaiveDate::from_ymd_opt(2026, 7, 1).unwrap(),
                NaiveDate::from_ymd_opt(2026, 8, 1).unwrap()
            )
        );
    }

    #[test]
    fn overlap_only_counts_time_inside_the_window() {
        assert_eq!(overlap_seconds(100, 200, 150, 300), 50);
        assert_eq!(overlap_seconds(100, 200, 200, 300), 0);
        assert_eq!(overlap_seconds(120, 180, 100, 300), 60);
    }

    #[test]
    fn active_focus_appears_in_the_menu_bar_title() {
        let mut data = AppData::default();
        data.goals.push(Goal {
            id: "goal".to_string(),
            title: "Ship the founder onboarding".to_string(),
            period: GoalPeriod::Daily,
            target_minutes: 90,
            period_start: 0,
            period_end: 10_000,
            created_at: 0,
            completed_at: None,
            status: GoalStatus::Active,
            is_primary: true,
        });
        data.sessions.push(FocusSession {
            id: "session".to_string(),
            goal_id: "goal".to_string(),
            started_at: 1_000,
            ended_at: None,
        });
        data.active_session_id = Some("session".to_string());

        assert_eq!(
            menu_bar_title(&data, 4_661),
            "Ship the founder onboarding · 1:01:01"
        );
    }

    #[test]
    fn completing_an_active_goal_stops_its_timer() {
        let mut data = AppData::default();
        data.goals.push(Goal {
            id: "goal".to_string(),
            title: "Ship".to_string(),
            period: GoalPeriod::Daily,
            target_minutes: 30,
            period_start: 0,
            period_end: 10_000,
            created_at: 0,
            completed_at: None,
            status: GoalStatus::Active,
            is_primary: true,
        });
        data.sessions.push(FocusSession {
            id: "session".to_string(),
            goal_id: "goal".to_string(),
            started_at: 100,
            ended_at: None,
        });
        data.active_session_id = Some("session".to_string());

        complete_goal(&mut data, "goal", 500).unwrap();

        assert_eq!(data.active_session_id, None);
        assert_eq!(data.sessions[0].ended_at, Some(500));
        assert_eq!(data.goals[0].status, GoalStatus::Completed);
    }

    #[test]
    fn invalid_updates_do_not_clear_the_primary_goal() {
        let mut data = AppData::default();
        data.goals.push(Goal {
            id: "goal".to_string(),
            title: "Ship".to_string(),
            period: GoalPeriod::Daily,
            target_minutes: 30,
            period_start: 0,
            period_end: 10_000,
            created_at: 0,
            completed_at: None,
            status: GoalStatus::Active,
            is_primary: true,
        });

        let result = update_goal(
            &mut data,
            "missing",
            GoalInput {
                title: "Another goal".to_string(),
                period: GoalPeriod::Weekly,
                target_minutes: 60,
                is_primary: true,
            },
            500,
        );

        assert!(result.is_err());
        assert!(data.goals[0].is_primary);
        assert_eq!(data.goals[0].title, "Ship");
    }

    #[test]
    fn missing_active_session_does_not_destroy_its_reference() {
        let mut data = AppData {
            active_session_id: Some("missing".to_string()),
            ..AppData::default()
        };

        let result = stop_active_session(&mut data, 500);

        assert!(result.is_err());
        assert_eq!(data.active_session_id.as_deref(), Some("missing"));
    }
}
