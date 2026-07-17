import type {
  AppUpdateState,
  DailyProgress,
  Dashboard,
  Goal,
  GoalPeriod,
  SystemPreferences,
  ThoughtComposerState,
} from "./types";

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

function formatMomentumDuration(totalSeconds: number): string {
  if (totalSeconds > 0 && totalSeconds < 60) {
    return "<1m";
  }
  return formatDuration(totalSeconds);
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

function stairLogo(): string {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 20v-5h5v-5h5V5h6" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
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
        <button class="nav-item" data-action="scroll" data-target="settings">
          <span aria-hidden="true">⌘</span> Menu bar
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

function renderMenuBarPanel(
  data: Dashboard,
  preferences: SystemPreferences,
): string {
  return `
    <section id="settings" class="menu-bar-panel glass-panel" aria-label="Menu bar settings">
      <div class="menu-bar-copy">
        <span class="eyebrow">Always in sight</span>
        <h2>Your focus lives in the Mac menu bar.</h2>
        <p>The label updates automatically when you choose a primary goal or start a timer.</p>
      </div>

      <div class="menu-bar-preview-wrap">
        <span class="preview-label">Live preview</span>
        <div class="menu-bar-preview" aria-label="Menu bar preview: ${escapeHtml(data.menuBarTitle)}">
          <strong>${escapeHtml(data.menuBarTitle)}</strong>
        </div>
      </div>

      <div class="startup-setting">
        <div>
          <strong>Launch at login</strong>
          <span>Keep the goal visible after restarting your Mac.</span>
        </div>
        <button
          class="switch ${preferences.launchAtLogin ? "is-on" : ""}"
          type="button"
          role="switch"
          aria-checked="${preferences.launchAtLogin}"
          data-action="toggle-autostart"
          aria-label="Launch No Goals No Gain at login"
        >
          <span></span>
        </button>
      </div>
    </section>
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

function dailyProgressDate(date: string): Date {
  return new Date(`${date}T12:00:00`);
}

function dailyProgressLabel(day: DailyProgress): string {
  const date = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(dailyProgressDate(day.date));
  const focused = formatDuration(day.focusSeconds);

  if (day.plannedMinutes === 0) {
    return `${date}: ${focused} focused, no daily target`;
  }

  return `${date}: ${focused} of ${day.plannedMinutes}m, ${day.progressPercent}%`;
}

function velocitySummary(days: DailyProgress[]): {
  label: string;
  tone: "up" | "down" | "steady";
} {
  const total = (items: DailyProgress[]): number =>
    items.reduce((sum, day) => sum + day.focusSeconds, 0);
  const meaningfulFocusSeconds = 5 * 60;
  const previousTotal = total(days.slice(0, 3));
  const recentTotal = total(days.slice(-3));

  if (previousTotal < meaningfulFocusSeconds) {
    return recentTotal >= meaningfulFocusSeconds
      ? { label: "Building momentum", tone: "up" }
      : { label: "No signal yet", tone: "steady" };
  }

  const change = Math.round(
    ((recentTotal - previousTotal) / previousTotal) * 100,
  );
  if (Math.abs(change) < 5) {
    return { label: "Steady velocity", tone: "steady" };
  }

  return {
    label: `${change > 0 ? "+" : ""}${change}% velocity`,
    tone: change > 0 ? "up" : "down",
  };
}

function renderVelocityChart(
  days: DailyProgress[],
  gradientId: string,
): string {
  const width = 280;
  const height = 68;
  const horizontalPadding = width / 14;
  const top = 7;
  const baseline = 59;
  const maxSeconds = Math.max(
    30 * 60,
    ...days.map((day) => day.focusSeconds),
  );
  const step =
    days.length > 1
      ? (width - horizontalPadding * 2) / (days.length - 1)
      : 0;
  const points = days.map((day, index) => {
    const x = horizontalPadding + step * index;
    const y =
      baseline -
      (Math.max(0, day.focusSeconds) / maxSeconds) * (baseline - top);
    return { x, y };
  });
  const pointList = points
    .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");
  const areaPath =
    points.length > 0
      ? `M ${points[0].x.toFixed(1)} ${baseline} L ${pointList
          .split(",")
          .join(" ")} L ${points[points.length - 1].x.toFixed(1)} ${baseline} Z`
      : "";
  const accessibleSummary = days
    .map((day) => dailyProgressLabel(day))
    .join("; ");

  return `
    <svg class="velocity-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Seven-day focus velocity">
      <title>${escapeHtml(accessibleSummary)}</title>
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#48b991" stop-opacity="0.24" />
          <stop offset="100%" stop-color="#48b991" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path class="velocity-grid" d="M 8 ${baseline} H 272" />
      ${areaPath ? `<path class="velocity-area" d="${areaPath}" fill="url(#${gradientId})" />` : ""}
      ${points.length > 0 ? `<polyline class="velocity-line" points="${pointList}" />` : ""}
      ${points
        .map(
          (point, index) => `
            <circle
              class="velocity-point status-${days[index].status}"
              cx="${point.x.toFixed(1)}"
              cy="${point.y.toFixed(1)}"
              r="${days[index].isToday ? 3.4 : 2.5}"
            />`,
        )
        .join("")}
    </svg>
  `;
}

function renderDaySignals(days: DailyProgress[]): string {
  return `
    <div class="day-signals" aria-label="Daily target progress">
      ${days
        .map((day) => {
          const dayName = new Intl.DateTimeFormat(undefined, {
            weekday: "narrow",
          }).format(dailyProgressDate(day.date));
          const strength = (0.12 + day.progressPercent * 0.0032).toFixed(2);
          const label = dailyProgressLabel(day);
          return `
            <span
              class="day-signal status-${day.status} ${day.isToday ? "is-today" : ""}"
              style="--signal-strength: ${strength}"
              title="${escapeHtml(label)}"
              role="img"
              aria-label="${escapeHtml(label)}"
            >
              <i aria-hidden="true"><b></b></i>
              <small>${escapeHtml(dayName)}</small>
            </span>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderDashboardMomentum(data: Dashboard): string {
  const days = data.stats.dailyProgress;
  const velocity = velocitySummary(days);
  const today = days.find((day) => day.isToday) ?? days[days.length - 1];

  return `
    <article class="momentum-card glass-panel is-${velocity.tone}" aria-labelledby="momentum-title">
      <div class="momentum-heading">
        <div>
          <span class="eyebrow">Seven-day signal</span>
          <h3 id="momentum-title">Focus velocity</h3>
        </div>
        <div class="momentum-heading-actions">
          <span class="momentum-today">
            <strong>${today ? formatMomentumDuration(today.focusSeconds) : "0m"}</strong>
            <small>focused today</small>
          </span>
          <span class="velocity-badge is-${velocity.tone}">${escapeHtml(velocity.label)}</span>
        </div>
      </div>
      <div class="momentum-chart-wrap">
        ${renderVelocityChart(days, "dashboard-velocity-fill")}
      </div>
      ${renderDaySignals(days)}
    </article>
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
      ${renderDashboardMomentum(data)}
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

function updateStatusCopy(update: AppUpdateState): {
  eyebrow: string;
  title: string;
  detail: string;
} {
  const version = update.version ? ` ${update.version}` : "";

  switch (update.phase) {
    case "available":
      return {
        eyebrow: "Update ready",
        title: `No Goals No Gain${version}`,
        detail:
          update.notes?.trim() ||
          "A new version is ready to install. Your local goals and focus history stay in place.",
      };
    case "downloading":
      return {
        eyebrow: "Downloading update",
        title:
          update.progress === null
            ? "Preparing the download…"
            : `${update.progress}% downloaded`,
        detail: "You can keep using the app while the update downloads.",
      };
    case "installing":
      return {
        eyebrow: "Installing update",
        title: "Almost there…",
        detail: "No Goals No Gain will relaunch automatically when it is ready.",
      };
    case "error":
      return {
        eyebrow: "Update paused",
        title: "The update could not be installed.",
        detail: "Check your connection and try the installation again.",
      };
    case "idle":
    case "checking":
      return { eyebrow: "", title: "", detail: "" };
  }
}

function renderUpdateProgress(update: AppUpdateState, className: string): string {
  if (update.phase !== "downloading" && update.phase !== "installing") {
    return "";
  }

  const progress = update.phase === "installing" ? 100 : update.progress;
  return `
    <span class="${className} ${progress === null ? "is-indeterminate" : ""}" aria-hidden="true">
      <i style="${progress === null ? "" : `width: ${progress}%`}"></i>
    </span>
  `;
}

function renderDashboardUpdate(update: AppUpdateState): string {
  if (update.phase === "idle" || update.phase === "checking") {
    return "";
  }

  const copy = updateStatusCopy(update);
  const canInstall = update.phase === "available" || update.phase === "error";
  const actionLabel = update.phase === "error" ? "Try again" : "Install update now";

  return `
    <section class="update-prompt glass-panel is-${update.phase}" role="status" aria-live="polite">
      <span class="update-prompt-icon" aria-hidden="true">↻</span>
      <div class="update-prompt-copy">
        <span class="eyebrow">${escapeHtml(copy.eyebrow)}</span>
        <strong>${escapeHtml(copy.title)}</strong>
        <p>${escapeHtml(copy.detail)}</p>
        ${renderUpdateProgress(update, "update-progress")}
      </div>
      <button
        class="button button-primary update-prompt-action"
        type="button"
        data-action="install-update"
        ${canInstall ? "" : "disabled"}
      >${canInstall ? actionLabel : update.phase === "installing" ? "Installing…" : "Downloading…"}</button>
    </section>
  `;
}

export function renderDashboard(
  data: Dashboard,
  preferences: SystemPreferences,
  update: AppUpdateState,
): string {
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
          ${renderDashboardUpdate(update)}
          ${renderMenuBarPanel(data, preferences)}
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

function renderQuickUpdate(update: AppUpdateState): string {
  if (update.phase === "idle" || update.phase === "checking") {
    return "";
  }

  const copy = updateStatusCopy(update);
  const canInstall = update.phase === "available" || update.phase === "error";
  const actionLabel = update.phase === "error" ? "Try again" : "Install update now";

  return `
    <section class="quick-update is-${update.phase}" role="status" aria-live="polite">
      <span class="quick-update-icon" aria-hidden="true">↻</span>
      <span class="quick-update-copy">
        <strong>${escapeHtml(copy.title)}</strong>
        <small>${escapeHtml(copy.eyebrow)}</small>
      </span>
      <button type="button" data-action="install-update" ${canInstall ? "" : "disabled"}>
        ${canInstall ? actionLabel : update.phase === "installing" ? "Installing…" : update.progress === null ? "Downloading…" : `${update.progress}%`}
      </button>
      ${renderUpdateProgress(update, "quick-update-progress")}
    </section>
  `;
}

function renderQuickMomentum(data: Dashboard): string {
  const days = data.stats.dailyProgress;
  const velocity = velocitySummary(days);

  return `
    <section class="quick-momentum is-${velocity.tone}" aria-labelledby="quick-momentum-title">
      <div class="quick-momentum-heading">
        <div>
          <span>Momentum</span>
          <h2 id="quick-momentum-title">Last 7 days</h2>
        </div>
        <span class="quick-velocity is-${velocity.tone}">${escapeHtml(velocity.label)}</span>
      </div>
      <div class="quick-velocity-chart">
        ${renderVelocityChart(days, "quick-velocity-fill")}
      </div>
      ${renderDaySignals(days)}
    </section>
  `;
}

function renderQuickGoal(goal: Goal, data: Dashboard): string {
  const isFocusing = data.activeSession?.goalId === goal.id;
  const progress = goalProgress(goal);

  return `
    <div class="quick-goal-row ${goal.isPrimary ? "is-primary" : ""}">
      <button
        class="quick-goal-select"
        type="button"
        data-action="primary-goal"
        data-goal-id="${goal.id}"
        aria-pressed="${goal.isPrimary}"
      >
        <span class="quick-goal-period period-${goal.period}">${periodLabel(goal.period)}</span>
        <span class="quick-goal-copy">
          <strong>${escapeHtml(goal.title)}</strong>
          <span>${formatDuration(goal.trackedSeconds)} of ${goal.targetMinutes}m · ${progress}%</span>
        </span>
        ${goal.isPrimary ? '<span class="quick-goal-check" aria-label="Primary goal">✓</span>' : ""}
      </button>
      <button
        class="quick-goal-focus"
        type="button"
        data-action="${isFocusing ? "stop-focus" : "start-focus"}"
        data-goal-id="${goal.id}"
        aria-label="${isFocusing ? "Stop focusing on" : "Start focusing on"} ${escapeHtml(goal.title)}"
        title="${isFocusing ? "Stop focus" : "Start focus"}"
      >${isFocusing ? "■" : "▶"}</button>
    </div>
  `;
}

function microphoneIcon(): string {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 15.25a3.75 3.75 0 0 0 3.75-3.75V7a3.75 3.75 0 1 0-7.5 0v4.5A3.75 3.75 0 0 0 12 15.25Z" fill="none" stroke="currentColor" stroke-width="1.8" />
      <path d="M5.75 11.25a6.25 6.25 0 0 0 12.5 0M12 17.5V21M9.25 21h5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </svg>
  `;
}

function renderQuickThoughtSheet(
  data: Dashboard,
  composer: ThoughtComposerState,
): string {
  const recentThoughts = data.thoughtDumps.slice(0, 3);
  const speechHint = composer.message ??
    (composer.speechSupported
      ? "Tap the mic and speak, or type anything on your mind."
      : "For speech, focus the field and press Fn twice for Mac Dictation.");

  return `
    <section
      class="quick-thought-sheet ${composer.isOpen ? "is-open" : ""}"
      aria-labelledby="quick-thought-title"
      aria-hidden="${!composer.isOpen}"
      ${composer.isOpen ? "" : "inert"}
    >
      <div class="quick-thought-sheet-header">
        <div>
          <span class="eyebrow">Clear your head</span>
          <h2 id="quick-thought-title">Thought dump</h2>
        </div>
        <button class="quick-icon-button" type="button" data-action="close-thought" aria-label="Close thought dump">×</button>
      </div>

      <p class="quick-thought-intro">Capture the messy version now. Decide what it means later.</p>

      <div class="quick-thought-input-wrap ${composer.isListening ? "is-listening" : ""}">
        <textarea
          id="quick-thought-input"
          data-thought-draft
          maxlength="4000"
          placeholder="What keeps circling in your head?"
          aria-label="Thought dump"
        >${escapeHtml(composer.draft)}</textarea>
        <button
          class="quick-mic-button ${composer.isListening ? "is-listening" : ""}"
          type="button"
          data-action="toggle-thought-speech"
          aria-pressed="${composer.isListening}"
          aria-label="${composer.isListening ? "Stop listening" : "Dictate a thought"}"
          title="${composer.isListening ? "Stop listening" : "Dictate a thought"}"
        >${microphoneIcon()}</button>
      </div>
      <div class="quick-thought-hint ${composer.isListening ? "is-listening" : ""}">
        <i></i><span>${escapeHtml(composer.isListening ? "Listening… speak naturally" : speechHint)}</span>
      </div>

      <div class="quick-thought-actions">
        <button class="quick-save-thought" type="button" data-action="save-thought">Save locally</button>
        <div class="quick-ai-actions" aria-label="Continue in an AI assistant">
          <button type="button" data-action="send-thought" data-provider="codex">Codex <span>↗</span></button>
          <button type="button" data-action="send-thought" data-provider="claude">Claude <span>↗</span></button>
        </div>
      </div>
      <p class="quick-ai-note">AI handoff opens a draft for review. Nothing is sent automatically.</p>

      <div class="quick-thought-recent">
        <div class="quick-thought-recent-heading">
          <span>Recent thoughts</span>
          <small>${data.thoughtDumps.length} saved</small>
        </div>
        <div class="quick-thought-list">
          ${
            recentThoughts.length > 0
              ? recentThoughts
                  .map(
                    (thought) => `
                      <div class="quick-thought-row">
                        <button
                          type="button"
                          data-action="load-thought"
                          data-thought-id="${thought.id}"
                          title="Load this thought"
                        >
                          <strong>${escapeHtml(thought.content)}</strong>
                          <span>${thought.source === "speech" ? "Dictated" : "Typed"} · ${escapeHtml(formatDateTime(thought.createdAt))}</span>
                        </button>
                        <button
                          class="quick-thought-delete"
                          type="button"
                          data-action="delete-thought"
                          data-thought-id="${thought.id}"
                          aria-label="Delete thought"
                          title="Delete thought"
                        >×</button>
                      </div>
                    `,
                  )
                  .join("")
              : '<div class="quick-thought-empty">Your thoughts stay on this Mac until you choose an assistant.</div>'
          }
        </div>
      </div>
    </section>
  `;
}

export function renderMenuBarPopover(
  data: Dashboard,
  update: AppUpdateState,
  thoughtComposer: ThoughtComposerState,
): string {
  const goals = currentGoals(data)
    .filter((goal) => goal.status === "active")
    .sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) {
        return left.isPrimary ? -1 : 1;
      }
      return left.periodEnd - right.periodEnd;
    });
  const focusGoal = data.activeSession
    ? data.goals.find((goal) => goal.id === data.activeSession?.goalId) ?? null
    : suggestedGoal(data);
  const progress = focusGoal ? goalProgress(focusGoal) : 0;

  return `
    <div class="quick-panel-frame">
      <section class="quick-panel" aria-label="No Goals No Gain quick focus">
        <header class="quick-panel-header">
          <div class="quick-panel-brand">
            <span class="quick-panel-logo">${stairLogo()}</span>
            <span>
              <strong>No Goals No Gain</strong>
              <small>Local focus system</small>
            </span>
          </div>
          <div class="quick-panel-header-actions">
            <button class="quick-thought-trigger" type="button" data-action="open-thought">
              <span>✦</span> Thought dump
            </button>
            <button class="quick-icon-button" type="button" data-action="close-popover" aria-label="Close quick focus">×</button>
          </div>
        </header>

        <section class="quick-focus-card ${data.activeSession ? "is-running" : ""}">
          <div class="quick-focus-label">
            <span>${data.activeSession ? '<i class="quick-live-dot"></i> Focusing now' : "Today’s focus"}</span>
            ${focusGoal ? `<span>${periodLabel(focusGoal.period)}</span>` : ""}
          </div>
          <div class="quick-focus-main">
            <div>
              <h1>${focusGoal ? escapeHtml(focusGoal.title) : "Set today’s focus"}</h1>
              <p>${
                data.activeSession
                  ? `Started ${formatDateTime(data.activeSession.startedAt)}`
                  : focusGoal
                    ? `${formatDuration(focusGoal.trackedSeconds)} focused of ${focusGoal.targetMinutes}m planned`
                    : "Choose one concrete outcome before the day chooses for you."
              }</p>
            </div>
            ${
              data.activeSession
                ? `<strong class="quick-timer" data-timer-start="${data.activeSession.startedAt}">${formatDuration(data.activeSession.elapsedSeconds, true)}</strong>`
                : focusGoal
                  ? `<strong class="quick-progress-number">${progress}%</strong>`
                  : ""
            }
          </div>
          ${
            focusGoal
              ? `<div class="quick-progress"><span style="width: ${progress}%"></span></div>`
              : ""
          }
          <div class="quick-focus-actions">
            ${
              data.activeSession
                ? '<button class="quick-primary-button is-stop" data-action="stop-focus">Stop focus</button>'
                : focusGoal
                  ? `<button class="quick-primary-button" data-action="start-focus" data-goal-id="${focusGoal.id}">Start focus</button>`
                  : '<button class="quick-primary-button" data-action="new-goal" data-period="daily">Set a goal</button>'
            }
            <button class="quick-secondary-button" data-action="open-dashboard">Open dashboard</button>
          </div>
        </section>

        ${renderQuickMomentum(data)}

        <section class="quick-goals-section" aria-labelledby="quick-goals-title">
          <div class="quick-section-heading">
            <div>
              <span>Direction</span>
              <h2 id="quick-goals-title">Your goals</h2>
            </div>
            <button type="button" data-action="new-goal">＋ Set a goal</button>
          </div>
          <div class="quick-goal-list" role="list">
            ${
              goals.length > 0
                ? goals.map((goal) => renderQuickGoal(goal, data)).join("")
                : `
                  <button class="quick-empty-goals" data-action="new-goal" data-period="daily">
                    <span>＋</span>
                    <strong>Create your first goal</strong>
                    <small>Daily, weekly, or monthly</small>
                  </button>
                `
            }
          </div>
        </section>

        ${renderQuickUpdate(update)}

        <footer class="quick-panel-footer">
          <span><i></i> Stored only on this Mac</span>
          <button type="button" data-action="open-dashboard">Review progress <span>→</span></button>
        </footer>

        ${renderQuickThoughtSheet(data, thoughtComposer)}
      </section>
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
