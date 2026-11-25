# Managed RTK OSS installation

This page covers installer behavior for the optional RTK binary. Use and
permission boundaries are in [rtk.md](rtk.md).

## Default behavior

The normal toolkit install also provisions a project-local RTK binary:

```sh
npx --yes github:sambaths/opencode-toolkit --project .
```

The same command and the same model flags remain the only required steps:

```sh
npx --yes github:sambaths/opencode-toolkit --project . \
  --thinking-model 'provider/thinker#variant' \
  --coding-model 'provider/coder#variant'
```

RTK OSS v1.2.1 is installed under `<project>/.opencode/vendor/rtk/` as `rtk`
(`rtk.exe` on Windows), its upstream `LICENSE`, and `metadata.json`. The
installer never runs the binary, adds no `PATH` entry, installs no plugin or
hook, runs no `rtk init`, edits no permissions or model settings, and enables no
automatic command rewriting.

Invoke the managed path explicitly when a separately authorized trial calls for
it:

```sh
.opencode/vendor/rtk/rtk git status
```

A wrapped command is a different policy resource from the bare command. See
[rtk.md](rtk.md) before using it.

## Offline, dry-run, and opt-out

- `--no-rtk` skips RTK completely. No RTK network request is made, and an
  existing managed RTK installation is left untouched.
- `--dry-run` makes no toolkit or RTK writes and no RTK download. It reports the
  effective RTK path and whether a managed install is absent, would be verified,
  or would be replaced. The surrounding `npx` package fetch is outside this
  guarantee.
- For a local source install, install Node dependencies first, then run:
  `node /path/to/toolkit/bin/install.mjs --project /path/to/project --no-rtk`.
- Unsupported platforms, HTTPS/network failures, archive-integrity failures,
  unmanaged collisions, and unsafe paths fail explicitly with `--no-rtk`
  advice. There is no silent fallback to another asset, a source build, a
  "latest" release, or an already-present system RTK.

## Pinned release

Release: <https://github.com/rtk-ai/rtk/releases/tag/v1.2.1>
Tag: `v1.2.1`; target commit:
`d0f0399a5ff8cd1d81325a033f0b2d8864d665f6`.
Edition: Apache-2.0 OSS assets (`rtk-oss-*`), not the general `rtk-*` assets.

| Target | Asset | SHA-256 |
| --- | --- | --- |
| linux-x64 | `rtk-oss-x86_64-unknown-linux-musl.tar.gz` | `44aa460c4827d206d11405c652832c9f7082edccfbc3a9f15a69a851e8a9e8b4` |
| linux-arm64 | `rtk-oss-aarch64-unknown-linux-musl.tar.gz` | `b01860ae2d3f44e0f7fc4431a95dd66b29b4bd87ec7f5e60aff13681b05db5dd` |
| darwin-x64 | `rtk-oss-x86_64-apple-darwin.tar.gz` | `5e39ee8c4613c798f8d62868d4851bacca5aefcc134301052841e458ed71c797` |
| darwin-arm64 | `rtk-oss-aarch64-apple-darwin.tar.gz` | `5a37e5e8e016b559597024900e7b21cff7a0015aa189ac6ac80d461cbb4be65b` |
| win32-x64 | `rtk-oss-x86_64-pc-windows-msvc.zip` | `43124168ec0733b50f7e9e1f1b994ced9b0693b9e92281428f64990c308bf1c8` |

Only these five targets are reviewed. The installer downloads over HTTPS from
the pinned GitHub release path, permits only the initial GitHub host and the
`release-assets.githubusercontent.com` redirect host, bounds redirects, applies
a timeout, caps the archive at 64 MiB, and verifies the archive SHA-256 before
in-memory extraction. Extraction accepts exactly the binary and `LICENSE` from
the archive; it does not extract arbitrary paths to disk.

Trust is scoped to the reviewed archive digest. It does **not** establish build
reproducibility, publisher authenticity, or that a binary is safe to execute.
The upstream `LICENSE` is preserved. `metadata.json` records the pin, target,
archive hash, and installed-file hashes.

## Updates, failure, and recovery

- Re-running the install verifies the managed files against the recorded pin and
  does not download again when they are intact.
- Replacement stages files in a private temporary directory under
  `.opencode/vendor/`, then promotes the managed directory. A caught activation
  failure restores the previous managed installation when one existed.
- This is not a whole-tree transaction. An I/O failure or process crash can
  leave a partial toolkit install, a staging/backup directory, or a toolkit that
  installed successfully while RTK did not. In that last case the CLI prints
  that partial outcome and exits nonzero; rerun with `--no-rtk` if RTK is not
  wanted.
- The installer manages only `.opencode/vendor/rtk` plus its own staging and
  backup names. It does not remove unrelated vendor content. A pre-existing
  directory without toolkit metadata, unknown files, symlinks, hardlinks, or
  special files are rejected for manual review rather than silently replaced.
- To recover intentionally, remove the managed directory only after reviewing
  it, then rerun the install. Do not treat an unmanaged directory as a cache.

## Limits

Availability is not integration. This installer provides no runtime
compatibility proof, token or percentage-savings guarantee, permission
enforcement, telemetry control, or automatic failover. It configures no RTK
telemetry or privacy settings. Report failures as missing or unverified optional
tooling rather than silently substituting another binary.
