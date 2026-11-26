# Managed RTK OSS installation

The normal install includes RTK. `--no-rtk` skips it. This page covers installer
behavior; use and permission boundaries are in [rtk.md](rtk.md).

## Default behavior

The normal toolkit install also provisions a project-local RTK binary:

```sh
npx --yes github:sambaths/opencode-toolkit --project .
```

The same command works with model flags; there's no extra RTK step:

```sh
npx --yes github:sambaths/opencode-toolkit --project . \
  --thinking-model 'provider/thinker#variant' \
  --coding-model 'provider/coder#variant'
```

RTK OSS v1.2.1 lands in `<project>/.opencode/vendor/rtk/` as `rtk` (`rtk.exe` on
Windows), its upstream `LICENSE`, and `metadata.json`. The installer never runs
the binary, changes PATH, installs a plugin/hook, runs `rtk init`, edits
permissions/model settings, or enables automatic command rewriting.

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
- `--dry-run` makes no toolkit/RTK writes or RTK download. It reports the RTK path
  and whether a managed install is absent, would be verified, or would be replaced.
  The surrounding `npx` package fetch is outside this guarantee.
- For a local source install, install Node dependencies first, then run:
  `node /path/to/toolkit/bin/install.mjs --project /path/to/project --no-rtk`.
- Unsupported platforms, network/integrity failures, unmanaged collisions, and
  unsafe paths fail with `--no-rtk` advice. There's no silent fallback to another
  asset, source build, "latest" release, or system RTK.

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

Only these five targets are reviewed. The installer uses HTTPS and the pinned
GitHub release path. It permits only GitHub and the
`release-assets.githubusercontent.com` redirect host, bounds redirects, applies a
timeout, caps the archive at 64 MiB, and verifies SHA-256 before in-memory
extraction. Extraction accepts exactly the binary and `LICENSE`; arbitrary archive
paths aren't written.

Trust is scoped to the reviewed digest. It doesn't establish build reproducibility,
publisher authenticity, or binary safety. The upstream `LICENSE` is preserved.
`metadata.json` records the pin, target, archive hash, and installed-file hashes.

## Updates, failure, and recovery

- Re-running verifies managed files against the pin. Intact files aren't
  downloaded again.
- Replacement stages files in a private temp directory under `.opencode/vendor/`,
  then promotes the managed directory. A caught activation failure restores the
  previous managed install when one existed.
- This isn't a whole-tree transaction. An I/O failure or crash can leave a partial
  toolkit install, staging/backup directory, or toolkit installed without RTK. For
  that last case, the CLI reports the partial outcome and exits nonzero. Rerun
  with `--no-rtk` if you don't want RTK.
- The installer manages only `.opencode/vendor/rtk` plus its own staging and
  backup names. It does not remove unrelated vendor content. A pre-existing
  directory without toolkit metadata, unknown files, symlinks, hardlinks, or
  special files are rejected for manual review rather than silently replaced.
- To recover intentionally, remove the managed directory only after reviewing
  it, then rerun the install. Do not treat an unmanaged directory as a cache.

## Limits

Availability isn't integration. This installer provides no runtime compatibility
proof, token/percentage-savings guarantee, permission enforcement, telemetry
control, or automatic failover. It doesn't configure RTK telemetry or privacy.
Report failures as missing or unverified optional tooling; don't silently
substitute another binary.

## Sources

- [RTK repository](https://github.com/rtk-ai/rtk)
- [RTK v1.2.1 release](https://github.com/rtk-ai/rtk/releases/tag/v1.2.1)
- [Pinned release source](https://github.com/rtk-ai/rtk/tree/d0f0399a5ff8cd1d81325a033f0b2d8864d665f6)
