# No Goals No Gain

A local-first macOS focus system for developers and founders. It keeps the current
outcome in the menu bar, tracks focused time against daily, weekly, and monthly
goals, and builds a lightweight decision history through daily reviews.

## What the MVP includes

- Persistent macOS menu-bar text for the primary goal
- Live focus timer that continues when the dashboard is hidden
- Daily, weekly, and monthly goals with focus targets
- Primary-goal selection and goal completion
- Today/week/month focus summaries
- Plan-versus-actual and completion insights
- Daily founder closeout: shipped, blocker, and next focus
- Local JSON persistence with atomic writes
- No accounts, analytics, cloud services, or network access

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

On first launch, the dashboard opens automatically. After that, use the menu-bar
item to show or hide it. Right-click the menu-bar item to open the dashboard,
stop the current focus session, or quit.

## Verify

```bash
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

## Local data

The Rust backend stores data in the platform app-data directory under the bundle
identifier `com.ducnguyen.nogoalsnogain`. On macOS this resolves inside the
user's `~/Library/Application Support` directory.

The state file is written through a temporary file and rename so an interrupted
save is less likely to corrupt the existing data.

## Product boundaries

The MVP tracks intentional focus sessions. It does not monitor applications,
browser activity, keystrokes, or screen contents. Automatic activity detection,
calendar integrations, GitHub/Linear integrations, and sync can be evaluated
after the manual focus loop proves useful.
