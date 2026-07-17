# No Goals No Gain

A local-first macOS focus system for developers and founders. It keeps the current
outcome in the menu bar, tracks focused time against daily, weekly, and monthly
goals, and builds a lightweight decision history through daily reviews.

## What the MVP includes

- Persistent macOS menu-bar text for the primary goal
- Exact menu-bar status preview in the dashboard
- Optional launch at login so the goal returns after a Mac restart
- Signed in-app updates with download progress and automatic relaunch
- Live focus timer that continues when the dashboard is hidden
- Daily, weekly, and monthly goals with focus targets
- Primary-goal selection and goal completion
- Today/week/month focus summaries
- Seven-day target colors and focus-velocity graph
- Local thought-dump inbox with typed or dictated capture
- Review-first handoff to Codex or Claude through their desktop deep links
- Plan-versus-actual and completion insights
- Daily founder closeout: shipped, blocker, and next focus
- Local JSON persistence with atomic writes
- No accounts, analytics, or cloud sync

## Stack

- [Tauri 2](https://v2.tauri.app/) desktop shell
- Rust for state, persistence, period logic, timer lifecycle, and tray behavior
- Vanilla TypeScript and CSS for the interface

## Run locally

Requirements:

- macOS
- Rust toolchain
- Node.js 20 or newer
- Xcode Command Line Tools

```bash
npm install
npm run tauri dev
```

On first launch, the light glass dashboard opens automatically. After that, use
the goal text in the menu bar to show or hide it. Right-click the menu-bar item
to open the dashboard, stop the current focus session, or quit. The menu-bar
panel in the dashboard can enable launch at login.

If you use a menu-bar organizer such as Ice or Bartender, mark No Goals No Gain
as always visible so the goal text is not moved into the hidden-items section.

## Verify

```bash
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Bundled updater builds require the private signing key. See
[docs/RELEASING.md](docs/RELEASING.md) for the local build and GitHub release
workflow.

## Local data

The Rust backend stores data in the platform app-data directory under the bundle
identifier `com.ducnguyen.nogoalsnogain`. On macOS this resolves inside the
user's `~/Library/Application Support` directory.

The state file is written through a temporary file and rename so an interrupted
save is less likely to corrupt the existing data.

Thought dumps stay in the same local state file. Choosing **Codex** or **Claude**
opens a new assistant draft with the thought prefilled; the app never submits it
automatically. Voice capture uses WebKit speech recognition when available and
falls back to macOS Dictation (press Fn twice in the thought field).

## Product boundaries

The MVP tracks intentional focus sessions. It does not monitor applications,
browser activity, keystrokes, or screen contents. Automatic activity detection,
calendar integrations, GitHub/Linear integrations, and sync can be evaluated
after the manual focus loop proves useful.
