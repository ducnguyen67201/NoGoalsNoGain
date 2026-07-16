import type { Dashboard, Goal, GoalPeriod } from "./types";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDuration(totalSeconds: number, includeSeconds = false): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (includeSeconds) {
    return hours > 0
      ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
          .toString()
          .padStart(2, "0")}`
      : `${minutes.toString().padStart(2, "0")}:${seconds
          .toString()
          .padStart(2, "0")}`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp * 1000));
}

function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function formatToday(): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

function periodLabel(period: GoalPeriod): string {
  switch (period) {
    case "daily":
      return "Today";
    case "weekly":
      return "This week";
    case "monthly":
      return "This month";
  }
}

function periodNoun(period: GoalPeriod): string {
  switch (period) {
    case "daily":
      return "daily";
    case "weekly":
      return "weekly";
    case "monthly":
      return "monthly";
  }
}

function goalProgress(goal: Goal): number {
  return Math.min(
    100,
    Math.round((goal.trackedSeconds / (goal.targetMinutes * 60)) * 100),
  );
}

function currentGoals(data: Dashboard, period?: GoalPeriod): Goal[] {
  return data.goals.filter(
    (goal) =>
      goal.periodEnd > data.now && (period === undefined || goal.period === period),
  );
}

function suggestedGoal(data: Dashboard): Goal | null {
  return (
    currentGoals(data)
      .filter((goal) => goal.status === "active")
      .sort((left, right) => {
        if (left.isPrimary !== right.isPrimary) {
          return left.isPrimary ? -1 : 1;
        }
        const periodOrder: Record<GoalPeriod, number> = {
          daily: 0,
          weekly: 1,
          monthly: 2,
        };
        return periodOrder[left.period] - periodOrder[right.period];
      })[0] ?? null
  );
}

function renderSidebar(): string {
  return `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">NG</div>
        <div>
          <strong>No Goals</strong>
          <span>No Gain</span>
        </div>
      </div>

      <nav class="nav-list" aria-label="Dashboard sections">
        <button class="nav-item is-active" data-action="scroll" data-target="today">
          <span aria-hidden="true">⌁</span> Today
        </button>
        <button class="nav-item" data-action="scroll" data-target="goals">
          <span aria-hidden="true">◎</span> Goals
        </button>
        <button class="nav-item" data-action="scroll" data-target="insights">
          <span aria-hidden="true">↗</span> Insights
        </button>
        <button class="nav-item" data-action="scroll" data-target="history">
          <span aria-hidden="true">◷</span> History
        </button>
      </nav>

      <div class="sidebar-footer">
        <div class="privacy-dot"></div>
        <div>
          <strong>Local-first</strong>
          <span>Your focus data stays on this Mac.</span>
        </div>
      </div>
    </aside>
  `;
}

function renderFocusCard(data: Dashboard): string {
  if (data.activeSession) {
    const activeGoal = data.goals.find(
      (goal) => goal.id === data.activeSession?.goalId,
    );
    const progress = activeGoal ? goalProgress(activeGoal) : 0;

    return `
      <section class="focus-card is-running" aria-label="Current focus session">
        <div class="focus-card-top">
          <span class="eyebrow"><span class="pulse-dot"></span> Focus in progress</span>
          <span class="period-chip">${activeGoal ? periodLabel(activeGoal.period) : "Active"}</span>
        </div>
        <div class="focus-card-body">
          <div class="focus-copy">
            <h2>${escapeHtml(data.activeSession.goalTitle)}</h2>
            <p>Stay with the outcome. The clock keeps running when this window is hidden.</p>
          </div>
          <div class="timer-wrap">
            <strong class="focus-timer" data-timer-start="${data.activeSession.startedAt}">
              ${formatDuration(data.activeSession.elapsedSeconds, true)}
            </strong>
            <span>${progress}% of target</span>
          </div>
        </div>
        <div class="focus-progress" aria-label="${progress}% of target complete">
          <span style="width: ${progress}%"></span>
        </div>
        <div class="focus-actions">
          <button class="button button-danger" data-action="stop-focus">Stop focus</button>
          <span>Closing the window will not stop this session.</span>
        </div>
      </section>
    `;
  }

  const goal = suggestedGoal(data);
  if (!goal) {
    return `
      <section class="focus-card empty-focus">
        <div>
          <span class="eyebrow">Your next outcome</span>
          <h2>Decide what deserves today.</h2>
          <p>Create one concrete goal, make it primary, and let the menu bar keep it visible.</p>
        </div>
        <button class="button button-primary" data-action="new-goal">Set your first goal</button>
      </section>
    `;
  }

  const progress = goalProgress(goal);
  return `
    <section class="focus-card" aria-label="Suggested focus">
      <div class="focus-card-top">
        <span class="eyebrow">${goal.isPrimary ? "Primary outcome" : "Suggested outcome"}</span>
        <span class="period-chip">${periodLabel(goal.period)}</span>
      </div>
      <div class="focus-card-body">
        <div class="focus-copy">
          <h2>${escapeHtml(goal.title)}</h2>
          <p>${formatDuration(goal.trackedSeconds)} focused of ${goal.targetMinutes}m planned.</p>
        </div>
        <div class="focus-score">
          <strong>${progress}%</strong>
          <span>target</span>
        </div>
      </div>
      <div class="focus-progress" aria-label="${progress}% of target complete">
        <span style="width: ${progress}%"></span>
      </div>
      <div class="focus-actions">
        <button class="button button-primary" data-action="start-focus" data-goal-id="${goal.id}">
          Start focus
        </button>
        <button class="button button-ghost" data-action="complete-goal" data-goal-id="${goal.id}">
          Mark shipped
        </button>
      </div>
    </section>
  `;
}

function renderStatCards(data: Dashboard): string {
  return `
    <section class="stat-grid" aria-label="Focus summary">
      <article class="stat-card">
        <span>Focused today</span>
        <strong>${formatDuration(data.stats.todayFocusSeconds)}</strong>
        <small>${formatDuration(data.stats.weekFocusSeconds)} this week</small>
      </article>
      <article class="stat-card">
        <span>Current goals</span>
        <strong>${data.stats.activeGoals}</strong>
        <small>${data.stats.completedGoals} shipped all time</small>
      </article>
      <article class="stat-card">
        <span>Focus streak</span>
        <strong>${data.stats.focusStreakDays}<em> days</em></strong>
        <small>Sessions on consecutive days</small>
      </article>
    </section>
  `;
}

function renderGoalCard(goal: Goal, data: Dashboard): string {
  const progress = goalProgress(goal);
  const isFocusing = data.activeSession?.goalId === goal.id;
  const isExpired = goal.periodEnd <= data.now;
  const isCompleted = goal.status === "completed";

  return `
    <article class="goal-card ${isCompleted ? "is-complete" : ""}">
      <div class="goal-card-heading">
        <div>
          <div class="goal-badges">
            ${goal.isPrimary ? '<span class="badge badge-primary">Primary</span>' : ""}
            ${isCompleted ? '<span class="badge badge-complete">Shipped</span>' : ""}
            ${isExpired && !isCompleted ? '<span class="badge">Expired</span>' : ""}
          </div>
          <h3>${escapeHtml(goal.title)}</h3>
        </div>
        <button
          class="icon-button"
          data-action="delete-goal"
          data-goal-id="${goal.id}"
          aria-label="Delete ${escapeHtml(goal.title)}"
          title="Delete goal"
        >×</button>
      </div>
      <div class="goal-meta">
        <span>${formatDuration(goal.trackedSeconds)} / ${goal.targetMinutes}m</span>
        <span>${progress}%</span>
      </div>
      <div class="goal-progress"><span style="width: ${progress}%"></span></div>
      <div class="goal-footer">
        <span>${formatDate(goal.periodStart)} – ${formatDate(goal.periodEnd - 1)}</span>
        ${
          isCompleted || isExpired
            ? ""
            : `
              <div class="goal-actions">
                ${
                  goal.isPrimary
                    ? ""
                    : `<button class="text-button" data-action="primary-goal" data-goal-id="${goal.id}">Make primary</button>`
                }
                <button
                  class="text-button text-button-strong"
                  data-action="${isFocusing ? "stop-focus" : "start-focus"}"
                  data-goal-id="${goal.id}"
                >${isFocusing ? "Stop" : "Focus"}</button>
                <button class="text-button" data-action="complete-goal" data-goal-id="${goal.id}">Ship</button>
              </div>
            `
        }
      </div>
    </article>
  `;
}

function renderGoalColumn(period: GoalPeriod, data: Dashboard): string {
  const goals = currentGoals(data, period);

  return `
    <section class="goal-column">
      <div class="section-heading compact">
        <div>
          <span class="eyebrow">${periodNoun(period)} direction</span>
          <h3>${periodLabel(period)}</h3>
        </div>
        <span class="count-pill">${goals.length}</span>
      </div>
      <div class="goal-stack">
        ${
          goals.length > 0
            ? goals.map((goal) => renderGoalCard(goal, data)).join("")
            : `
              <button class="empty-goal" data-action="new-goal" data-period="${period}">
                <span>+</span>
                Add a ${periodNoun(period)} goal
              </button>
            `
        }
      </div>
    </section>
  `;
}

function renderGoals(data: Dashboard): string {
  return `
    <section id="goals" class="page-section">
      <div class="section-heading">
        <div>
          <span class="eyebrow">Direction across horizons</span>
          <h2>Goals</h2>
        </div>
        <button class="button button-secondary" data-action="new-goal">+ New goal</button>
      </div>
      <div class="goal-columns">
        ${renderGoalColumn("daily", data)}
        ${renderGoalColumn("weekly", data)}
        ${renderGoalColumn("monthly", data)}
      </div>
    </section>
  `;
}

function renderInsights(data: Dashboard): string {
  return `
    <section id="insights" class="page-section">
      <div class="section-heading">
        <div>
          <span class="eyebrow">Plan versus attention</span>
          <h2>Where your time went</h2>
        </div>
        <span class="muted">${formatDuration(data.stats.monthFocusSeconds)} focused this month</span>
      </div>
      <div class="insight-grid">
        ${data.stats.periods
          .map((summary) => {
            const focusMinutes = Math.round(summary.focusSeconds / 60);
            const planProgress =
              summary.plannedMinutes > 0
                ? Math.min(100, Math.round((focusMinutes / summary.plannedMinutes) * 100))
                : 0;
            const completion =
              summary.totalGoals > 0
                ? Math.round((summary.completedGoals / summary.totalGoals) * 100)
                : 0;

            return `
              <article class="insight-card">
                <div class="insight-heading">
                  <span>${periodLabel(summary.period)}</span>
                  <strong>${focusMinutes}m</strong>
                </div>
                <div class="insight-row">
                  <span>Focus vs plan</span>
                  <span>${summary.plannedMinutes > 0 ? `${planProgress}%` : "No target"}</span>
                </div>
                <div class="insight-bar"><span style="width: ${planProgress}%"></span></div>
                <div class="insight-footer">
                  <span>${summary.plannedMinutes}m planned</span>
                  <span>${completion}% shipped</span>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderReview(data: Dashboard): string {
  const todayReview = data.reviews.find((review) => review.date === data.today);

  return `
    <section class="review-card">
      <div class="section-heading compact">
        <div>
          <span class="eyebrow">Founder closeout</span>
          <h2>End the day with context</h2>
        </div>
        <span class="muted">${todayReview ? "Saved today" : "2 minute review"}</span>
      </div>
      <form id="review-form" class="review-form">
        <label>
          <span>What shipped?</span>
          <textarea name="shipped" rows="2" placeholder="The concrete outcome you moved forward…">${escapeHtml(todayReview?.shipped ?? "")}</textarea>
        </label>
        <label>
          <span>What blocked you?</span>
          <textarea name="blocker" rows="2" placeholder="Decision, dependency, energy, unclear scope…">${escapeHtml(todayReview?.blocker ?? "")}</textarea>
        </label>
        <label>
          <span>What deserves focus next?</span>
          <textarea name="nextFocus" rows="2" placeholder="The next outcome, not a list of chores…">${escapeHtml(todayReview?.nextFocus ?? "")}</textarea>
        </label>
        <button class="button button-secondary" type="submit">Save daily review</button>
      </form>
    </section>
  `;
}

function renderHistory(data: Dashboard): string {
  const completedSessions = data.recentSessions.filter(
    (session) => session.endedAt !== null,
  );
  const previousReviews = data.reviews.filter((review) => review.date !== data.today);

  return `
    <section id="history" class="page-section history-grid">
      <div>
        <div class="section-heading">
          <div>
            <span class="eyebrow">Evidence of work</span>
            <h2>Recent focus</h2>
          </div>
        </div>
        <div class="history-list">
          ${
            completedSessions.length > 0
              ? completedSessions
                  .slice(0, 10)
                  .map(
                    (session) => `
                      <article class="history-item">
                        <div class="history-icon">↗</div>
                        <div>
                          <strong>${escapeHtml(session.goalTitle)}</strong>
                          <span>${formatDateTime(session.startedAt)}</span>
                        </div>
                        <time>${formatDuration(session.elapsedSeconds)}</time>
                      </article>
                    `,
                  )
                  .join("")
              : '<div class="empty-state">Completed focus sessions will appear here.</div>'
          }
        </div>
      </div>
      <div>
        <div class="section-heading">
          <div>
            <span class="eyebrow">Decision log</span>
            <h2>Previous reviews</h2>
          </div>
        </div>
        <div class="review-history">
          ${
            previousReviews.length > 0
              ? previousReviews
                  .slice(0, 6)
                  .map(
                    (review) => `
                      <article>
                        <time>${escapeHtml(review.date)}</time>
                        <strong>${escapeHtml(review.shipped || "No shipped outcome recorded")}</strong>
                        ${
                          review.nextFocus
                            ? `<span>Next: ${escapeHtml(review.nextFocus)}</span>`
                            : ""
                        }
                      </article>
                    `,
                  )
                  .join("")
              : '<div class="empty-state">Your daily decisions will build up here.</div>'
          }
        </div>
      </div>
    </section>
  `;
}

export function renderDashboard(data: Dashboard): string {
  return `
    <div class="app-shell">
      ${renderSidebar()}
      <main class="main-content">
        <section id="today" class="top-section">
          <header class="page-header">
            <div>
              <span class="eyebrow">${formatToday()}</span>
              <h1>Own the outcome.</h1>
              <p>Choose deliberately, focus visibly, review honestly.</p>
            </div>
            <button class="button button-secondary" data-action="new-goal">+ New goal</button>
          </header>
          ${renderFocusCard(data)}
          ${renderStatCards(data)}
        </section>
        ${renderGoals(data)}
        ${renderInsights(data)}
        ${renderReview(data)}
        ${renderHistory(data)}
      </main>
    </div>
  `;
}

export function loadingMarkup(): string {
  return `
    <div class="loading-screen">
      <div class="brand-mark">NG</div>
      <span>Loading your direction…</span>
    </div>
  `;
}

export function updateLiveTimers(): void {
  const now = Math.floor(Date.now() / 1000);
  document.querySelectorAll<HTMLElement>("[data-timer-start]").forEach((element) => {
    const startedAt = Number(element.dataset.timerStart ?? now);
    element.textContent = formatDuration(now - startedAt, true);
  });
}
