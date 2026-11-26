# Managed RTK output filtering, manual integration

Read this when the user asks about RTK, output filtering, or an authorized manual
invocation. It covers use, not installation. The toolkit installs an Apache-2.0
RTK OSS binary by default, but automatic rewriting stays disabled. See
[rtk-install.md](rtk-install.md) for install commands, pinned assets, checksums,
targets, and recovery behavior.

## Availability versus integration

**Default binary: managed.** The installer puts the Apache-2.0 OSS binary at
`.opencode/vendor/rtk/rtk` (`rtk.exe` on Windows). It verifies the pinned archive's
SHA-256 before extraction and installs its LICENSE and metadata. `--no-rtk` is
the offline/skip switch. The installer adds no PATH entry or shell/system hook and
never executes the binary; runtime behavior remains untested here.

**Integration: off.** The binary is default-on; all rewrite integration is off.
There's no plugin, `rtk init`, automatic rewrite, or global/project permission
edit. Availability doesn't enable usage: each invocation needs explicit
authorization. Standalone context tools work without RTK. Runtime behavior and
security weren't audited here.

## Use and authority

Use RTK only when the user authorizes RTK and the exact invocation. That
permission doesn't extend to later commands, other repositories, or unattended
agents. A wrapped test can still write files, use the network, or consume
resources. Wrapping changes output, not effects, so get the same authorization
the raw command needs.

Keep consequential, admin, publishing, credential, deployment, and destructive
commands unwrapped: `git push`, `gh`, `sudo`, `rm`, `git reset`, `git clean`,
`git restore`, `git checkout`, `git branch -D`, publishing, installers, and
deploys. The existing ask/deny rules need to see those commands as written.

A wrapped command is a different policy resource. For policy matching,
`.opencode/vendor/rtk/rtk git status` isn't `git status`, so an underlying ask/deny
may not see the wrapper. Don't add an RTK wildcard allow, duplicate rules, or
weaken permissions. Ask for approval instead of wrapping around it.

## Manual invocation

Use the managed path rather than relying on `PATH`. From the project root, for
one harmless, explicitly authorized scoped read:

```sh
.opencode/vendor/rtk/rtk git status
```

On Windows, use `.opencode\vendor\rtk\rtk.exe`. Run only commands already allowed
for the agent and scope. Report whether output was filtered: the model sees RTK's
output, not necessarily the original text. RTK doesn't change the model, provider
route, or provider config, and this guide doesn't edit them.

## Why automatic rewriting remains disabled

This decision comes from a develop-branch inspection at commit
`97e68d5358aa5d91d1540ea64df58c9688bcf83d`, not an audit of the released v1.2.1
adapter. The permission reader loads the nearest direct
`opencode.json`/`opencode.jsonc` and global config. That doesn't establish reads
of this toolkit's `.opencode/opencode.json(c)` or effective session/agent
permissions, so a rewrite can't be shown to preserve every project verdict.

The inspected initializer writes `~/.config/opencode/plugins/rtk.ts`. That's out
of scope. Don't run init or install its plugin as a trial.

## License and edition

License provenance comes from the released OSS v1.2.1 source at tag
`d0f0399a5ff8cd1d81325a033f0b2d8864d665f6`. The root `Cargo.toml` says
`Apache-2.0`; the default `engine` feature points to `engine/Cargo.toml`, which
says `BUSL-1.1`. The `rtk-oss-*` assets are built separately with
`--no-default-features`. The source describes that build as the Apache-2.0 hook
core alone, with no BUSL code in the binary. General `rtk-*` assets aren't all
Apache-licensed. The managed binary uses the OSS edition; check its installed
LICENSE and metadata. Targets and checksums live in
[rtk-install.md](rtk-install.md). Avoid `curl | sh` or unsourced installs.

## Record, recover, and privacy

For each authorized trial, record the managed-path invocation, underlying command,
exit status, whether output was filtered, and any recovery handle. Example:
`.opencode/vendor/rtk/rtk git status` -> `git status`, exit 0, filtered yes/no,
recall `<hash>` if printed.

Recovery may use SQLite recall (`rtk recall <hash>`), a legacy tee, or disabled
mode; raw output retention isn't guaranteed. Tracking stores command/project
metadata with a default 90-day retention. Recovered output can contain sensitive
data, so retrieve it only with user authorization. If no raw result remains,
rerun the raw command only when safe and separately authorized; a test command
isn't automatically safe.

Leave RTK stores and telemetry settings alone unless asked. Telemetry is optional
and gated; network behavior depends on the build and RTK config. Don't claim RTK
makes no network requests. Review privacy settings in RTK's own docs rather than
collecting them here.

## Verification boundary

This is a docs coherence review, not runtime proof. The installer is implemented,
but this guide didn't install or execute the managed binary. Live compatibility,
permission decisions, recall, telemetry, and token use weren't tested. The
released adapter wasn't audited; the permission-reader observation comes from the
develop commit above. Installer review and checksum verification don't establish
binary safety. No runtime/security execution audit, percentage-savings guarantee,
or runtime enforcement is claimed. Report observed results and unverified areas.

## Sources

- Upstream project and documentation: [RTK repository](https://github.com/rtk-ai/rtk).
- Current install commands, pinned assets, checksums, and target details: [rtk-install.md](rtk-install.md).
- Release v1.2.1 tag and OSS assets: [release](https://github.com/rtk-ai/rtk/releases/tag/v1.2.1), [Cargo.toml](https://github.com/rtk-ai/rtk/blob/d0f0399a5ff8cd1d81325a033f0b2d8864d665f6/Cargo.toml), [engine/Cargo.toml](https://github.com/rtk-ai/rtk/blob/d0f0399a5ff8cd1d81325a033f0b2d8864d665f6/engine/Cargo.toml), [LICENSE](https://github.com/rtk-ai/rtk/blob/d0f0399a5ff8cd1d81325a033f0b2d8864d665f6/LICENSE)
- Develop adapter and permission reader (decision provenance): [rtk.ts, lines 291-330](https://github.com/rtk-ai/rtk/blob/97e68d5358aa5d91d1540ea64df58c9688bcf83d/hooks/opencode/rtk.ts#L291-L330), [permissions_opencode.rs, lines 288-395](https://github.com/rtk-ai/rtk/blob/97e68d5358aa5d91d1540ea64df58c9688bcf83d/src/hooks/permissions_opencode.rs#L288-L395)
- Initializer, recall, tracking, and telemetry: [src/hooks/init/opencode.rs](https://github.com/rtk-ai/rtk/blob/d0f0399a5ff8cd1d81325a033f0b2d8864d665f6/src/hooks/init/opencode.rs), [src/core/tee.rs](https://github.com/rtk-ai/rtk/blob/d0f0399a5ff8cd1d81325a033f0b2d8864d665f6/src/core/tee.rs), [src/core/tracking.rs](https://github.com/rtk-ai/rtk/blob/d0f0399a5ff8cd1d81325a033f0b2d8864d665f6/src/core/tracking.rs), [src/core/telemetry.rs](https://github.com/rtk-ai/rtk/blob/d0f0399a5ff8cd1d81325a033f0b2d8864d665f6/src/core/telemetry.rs)
- Official plugin docs: [OpenCode plugin server and V1 support](https://opencode.ai/docs/build/plugins/server#support-v1)
