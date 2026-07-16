# Releasing No Goals No Gain

No Goals No Gain uses Tauri's signed updater. GitHub Releases hosts the app
bundle, its signature, and `latest.json`; the installed app checks that manifest
and offers **Install update now** when a newer version exists.

## One-time GitHub setup

The updater signing key is separate from Apple code signing. Its private half
must never be committed or shared. This development Mac keeps it at:

```text
~/.tauri/no-goals-no-gain.key
```

Add these repository secrets in GitHub:

- `TAURI_SIGNING_PRIVATE_KEY`: the complete contents of
  `~/.tauri/no-goals-no-gain.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the password stored in macOS Keychain
  under service `com.ducnguyen.nogoalsnogain.updater`

The password can be retrieved locally without displaying the private key:

```bash
security find-generic-password \
  -a "$USER" \
  -s "com.ducnguyen.nogoalsnogain.updater" \
  -w
```

The matching public key is committed in `src-tauri/tauri.conf.json`. Losing the
private key means existing installations cannot verify future updates, so keep
an encrypted backup outside the repository.

## Publish a release

1. Set the same semantic version in `package.json`, `src-tauri/Cargo.toml`, and
   `src-tauri/tauri.conf.json`, then run `npm install` to refresh the lockfile.
2. Commit and push the version change.
3. Create and push a matching tag, for example `app-v0.1.1`.
4. The `Release desktop app` workflow builds a universal macOS app and creates
   a draft GitHub release.
5. Review and publish the draft. Draft releases are intentionally invisible to
   the in-app updater.

After publication, GitHub serves the manifest at:

```text
https://github.com/ducnguyen67201/NoGoalsNoGain/releases/latest/download/latest.json
```

The app checks on startup and every six hours. It downloads the signed update,
verifies it with the embedded public key, installs it, and relaunches itself.

## Local signed bundle

Because updater artifacts are enabled, a bundled build needs the signing key:

```bash
signing_password="$(security find-generic-password \
  -a "$USER" \
  -s "com.ducnguyen.nogoalsnogain.updater" \
  -w)"

TAURI_SIGNING_PRIVATE_KEY="$HOME/.tauri/no-goals-no-gain.key" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$signing_password" \
npm run tauri build

unset signing_password
```

The current build uses ad-hoc Apple signing in CI. Before public distribution,
configure a Developer ID Application certificate and notarization credentials
to avoid macOS Gatekeeper warnings.

## Bootstrap note

An older build that does not contain the updater cannot update itself. Install
this updater-enabled build once; every newer release can then use the in-app
flow.
