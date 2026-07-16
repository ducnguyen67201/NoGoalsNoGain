# Design Brief: Crisp Founder Focus Dashboard

Refine the existing No Goals No Gain macOS dashboard so it feels notably crisper, more intentional, and more premium while retaining its light glassmorphism direction.

The product is a local-first daily, weekly, and monthly goal tracker for developers and founders. The app lives in the macOS menu bar and the dashboard helps a user choose one primary outcome, start a focus session, review progress, and configure launch at login.

## Desired feeling

- Calm founder command center, not a generic SaaS dashboard.
- Light, airy, native to macOS, and visually precise.
- Glass is structural and restrained: translucent surfaces, thin luminous borders, controlled shadows, and crisp typography. Avoid milky haze and excessive blur.
- A distinctive indigo/periwinkle accent with a small mint signal color.
- Strong information hierarchy that makes the primary outcome and next action obvious within one second.

## Visual requirements

- Sharpen typography, spacing, alignment, borders, and control states.
- Reduce the current soft/foggy feeling and improve text contrast.
- Preserve the compact 1040 × 760 desktop window and make the first viewport feel complete.
- Give the sidebar, header, menu-bar preview, launch-at-login row, primary outcome, and stat cards a coherent visual system.
- Use deliberate micro-interactions and focus/hover states without distracting motion.
- Preserve accessible contrast, reduced-motion behavior, and clear keyboard focus.
- Keep the interface light; no dark-theme redesign.

## Functional constraints

- Preserve every existing action, `data-action` hook, form, ID, and Tauri integration.
- Launch at login, goal creation, primary goal selection, focus timer, completion, review, history, and menu-bar preview must continue to work.
- Prefer targeted edits to `src/ui.ts` and `src/styles.css`; do not change Rust behavior unless required.
- Do not add a remote font, image dependency, or heavyweight frontend package.

## Success criterion

The result should look polished enough for a startup launch screenshot and score at least 7.5/10 under the design rubric.

## Menu-bar quick focus extension

Add the app logo and live primary-goal text directly to the macOS menu bar. A left click should open a compact, Control Center-inspired popover anchored beneath the item. The popover must make the current focus, progress, Start/Stop Focus, Open Dashboard, and Set a Goal actions immediately available. Goals should remain usable in a compact scroll area, while right click preserves a native fallback menu.
