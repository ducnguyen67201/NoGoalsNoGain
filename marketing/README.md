# GoalBar marketing site

This folder is a dependency-free static landing page for `goalbar.top`.

## Preview locally

From the repository root:

```bash
npx vite marketing --host 127.0.0.1 --port 4174
```

Then open `http://127.0.0.1:4174`.

## macOS download

The download buttons use the stable GitHub Release asset URL:

```text
https://github.com/ducnguyen67201/NoGoalsNoGain/releases/latest/download/GoalBar-macOS.dmg
```

The desktop release workflow uploads that filename alongside each versioned DMG.
The URL begins working after the first draft release is published.

## Deploy to Cloudflare Pages

Connect this GitHub repository to Cloudflare Pages and use:

- Framework preset: `None`
- Build command: leave blank
- Build output directory: `marketing`

After the first deployment, add `goalbar.top` and `www.goalbar.top` under the
Pages project's custom domains.
