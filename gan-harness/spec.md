# Design Brief: Daily Momentum for GoalBar

Refine the existing No Goals No Gain macOS menu-bar panel so it feels quieter,
cleaner, and more informative while adding a real seven-day momentum signal.

The product is a local-first daily, weekly, and monthly goal tracker for
developers and founders. The menu-bar panel should answer three questions at a
glance: What matters now? Did I hit my daily target? Is my focus velocity moving
in the right direction?

## Desired feeling

- A native macOS focus instrument, not a compressed dashboard.
- Calm and spacious, but never empty or unfinished.
- Restrained glass, crisp typography, and deliberate indigo/mint signals.
- Historical data should feel glanceable and motivating rather than analytical.

## Momentum requirements

- Derive the last seven local calendar days from stored focus sessions and
  historical daily goals.
- Give each day a compact color signal: vivid green only at 100% or more,
  restrained pale green for partial progress, and a neutral unfilled state for
  no progress or no target.
- Show focused minutes as a lightweight seven-day velocity graph without adding
  a chart dependency.
- Do not exaggerate a few seconds into a full-height spike; velocity requires at
  least five meaningful minutes and the chart keeps a 30-minute minimum scale.
- Align every daily color cell directly beneath its corresponding graph point,
  including on wide dashboard windows.
- Surface a short trend label based on recent focus velocity.
- Keep exact values available through accessible labels and tooltips.
- Reuse the same data in the full dashboard Insights section.

## Panel refinement

- Preserve the current focus card as the strongest object.
- Reduce the oversized empty space around a short goal list.
- Keep Start/Stop Focus, Open Dashboard, Set a Goal, goal selection, update
  installation, click-away dismissal, and the native right-click menu intact.
- Keep the panel within a practical menu-bar popover height with goal scrolling.
- Preserve the transparent outer window and crisp environmental silhouette.

## Functional constraints

- Data stays local; do not add accounts, analytics, sync, or network tracking.
- Historical calculations must handle sessions crossing midnight.
- Existing saved data must continue working without migration.
- Preserve keyboard focus, reduced-motion behavior, and readable contrast.
- Do not add a remote font, image dependency, or chart package.

## Success criterion

The result should communicate today plus seven-day momentum within one second,
pass all Rust/frontend checks, and score at least 8.0/10 under the design rubric.
