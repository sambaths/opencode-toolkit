# Managed RTK output filtering, manual integration

Read this only when the user asks about RTK, command-output filtering, or an
authorized manual invocation. It covers use, not installation. The toolkit
provisions an Apache-only RTK binary by default, but automatic rewriting stays
disabled. See [rtk-install.md](rtk-install.md) for current install commands,
pinned assets, checksums, targets, and failure/recovery behavior.

## Availability versus integration

**Default binary: managed.** The implemented installer provisions the
Apache-only OSS binary at `.opencode/vendor/rtk/rtk` (`rtk.exe` on Windows)
from the pinned release, verifies the archive SHA-256 before extraction, and
installs its LICENSE and metadata. `--no-rtk` is the explicit offline/skip
switch. The installer adds no PATH entry and no shell or system hook, and never
executes the binary; its runtime behavior remains untested here.

**Integration: off.** No plugin, `rtk init`, automatic rewrite, or global or
project permission edit is included. Binary availability does not enable usage:
each invocation still needs explicit authorization. Standalone context tools
work without RTK.

## Use and authority

Use RTK only when the user explicitly authorizes RTK and the exact invocation.
Authorization is effects-scoped: it does not extend to later commands, other
repositories, or unattended agents. A test command wrapped in RTK can still
write files, use the network, or consume resources. Wrapping changes output,
not effects, so obtain the same authorization the unwrapped command needs.

Keep consequential, admin, publishing, credential, deployment, and destructive
commands unwrapped under the existing safeguards. Examples: `git push`, `gh`,
`sudo`, `rm`, `git reset`, `git clean`, `git restore`, `git checkout`,
`git branch -D`, package publishing, installers, and deploy commands. Leave
those commands unwrapped so the existing ask/deny rules continue to see them as
written.

Treat a wrapped command as a different policy resource. The exact managed path
means `.opencode/vendor/rtk/rtk git status` is not `git status` for policy
matching, so an underlying ask/deny may not see the wrapper. Do not add an RTK
wildcard allow, duplicate rules, or otherwise weaken the permission policy.
Route approval instead of using wrapping to avoid it.

## Manual invocation

Use the managed path rather than relying on `PATH`. From the project root, for
one harmless, explicitly authorized scoped read:

```sh
.opencode/vendor/rtk/rtk git status
```

On Windows, use `.opencode\vendor\rtk\rtk.exe`. Run only commands that are
already allowed for the current agent and scope. Report the filtering: the
model sees RTK's filtered output, not necessarily the original text. RTK does
not change the selected model, provider route, or provider configuration, and
this guide does not edit them.

## Why automatic rewriting remains disabled

The integration decision rests on a develop-branch inspection at commit
`97e68d5358aa5d91d1540ea64df58c9688bcf83d`, not on an audit of the released
v1.2.1 adapter. That inspection found the adapter's permission reader loads the
nearest direct `opencode.json`/`opencode.jsonc` and the global config; it does
not establish reads of this toolkit's project config at
`.opencode/opencode.json(c)` or the effective session/agent permissions. A
rewrite therefore cannot be shown to preserve every project-specific verdict.
The inspected RTK initializer writes `~/.config/opencode/plugins/rtk.ts`;
treat it as out of scope. Do not run init or install its plugin as a trial.

## License and edition

License provenance uses the released OSS v1.2.1 source at tag
`d0f0399a5ff8cd1d81325a033f0b2d8864d665f6`. Its root `Cargo.toml` reports
`Apache-2.0`; the default `engine` feature points at `engine/Cargo.toml`, which
reports `BUSL-1.1`. The release publishes `rtk-oss-*` assets built separately
with `--no-default-features`; the source describes that build as the Apache-2.0
hook core alone, with no BUSL code in the binary. The general `rtk-*` assets are
not blanket Apache-licensed. The managed binary uses the OSS edition; verify its
installed LICENSE and metadata. Keep installer targets and checksums in
[rtk-install.md](rtk-install.md), and avoid `curl | sh` or unsourced installs.

## Record, recover, and privacy

For each authorized trial, record the exact managed-path invocation, the
underlying command, the observed exit status, whether output was filtered, and
any recovery handle. Example: `.opencode/vendor/rtk/rtk git status` ->
`git status`, exit 0, filtered yes/no, recall `<hash>` if printed.

Recovery may use a SQLite recall store (`rtk recall <hash>`), a legacy tee, or a
disabled mode; raw output retention is not guaranteed. Tracking records command
and project metadata with a default 90-day retention, and recovered raw output
can contain sensitive data. Retrieve a stored result only under the user's
authorization. If no raw result is retained, rerun the original raw command only
when it is safe and separately authorized; do not assume a test command is safe.

Leave RTK's stores and telemetry settings alone unless the user asks. Telemetry
is optional and gated, with network behavior controlled by the build and RTK
configuration; do not claim RTK makes no network requests. Review privacy
settings in RTK's own documentation rather than reading or collecting them here.

## Verification boundary

This is a documentation coherence review, not runtime proof. The installer is
implemented, but this guide did not install or execute the managed binary. No
live compatibility, permission decision, recall behavior, telemetry behavior,
or token measurement was tested. The released adapter was not audited; the
permission-reader observation is from the develop commit named above. Installer
review and checksum verification do not establish that the upstream binary is
safe to execute; no binary runtime or security execution audit is claimed.
There is no percentage-savings guarantee and no runtime enforcement. Report observed
results and unverified areas.

## Sources

- Current install commands, pinned assets, checksums, and target details: [rtk-install.md](rtk-install.md).
- Release v1.2.1 tag and OSS assets: [release](https://github.com/rtk-ai/rtk/releases/tag/v1.2.1), [Cargo.toml](https://github.com/rtk-ai/rtk/blob/d0f0399a5ff8cd1d81325a033f0b2d8864d665f6/Cargo.toml), [engine/Cargo.toml](https://github.com/rtk-ai/rtk/blob/d0f0399a5ff8cd1d81325a033f0b2d8864d665f6/engine/Cargo.toml), [LICENSE](https://github.com/rtk-ai/rtk/blob/d0f0399a5ff8cd1d81325a033f0b2d8864d665f6/LICENSE)
- Develop adapter and permission reader (decision provenance): [rtk.ts, lines 291-330](https://github.com/rtk-ai/rtk/blob/97e68d5358aa5d91d1540ea64df58c9688bcf83d/hooks/opencode/rtk.ts#L291-L330), [permissions_opencode.rs, lines 288-395](https://github.com/rtk-ai/rtk/blob/97e68d5358aa5d91d1540ea64df58c9688bcf83d/src/hooks/permissions_opencode.rs#L288-L395)
- Initializer, recall, tracking, and telemetry: [src/hooks/init/opencode.rs](https://github.com/rtk-ai/rtk/blob/d0f0399a5ff8cd1d81325a033f0b2d8864d665f6/src/hooks/init/opencode.rs), [src/core/tee.rs](https://github.com/rtk-ai/rtk/blob/d0f0399a5ff8cd1d81325a033f0b2d8864d665f6/src/core/tee.rs), [src/core/tracking.rs](https://github.com/rtk-ai/rtk/blob/d0f0399a5ff8cd1d81325a033f0b2d8864d665f6/src/core/tracking.rs), [src/core/telemetry.rs](https://github.com/rtk-ai/rtk/blob/d0f0399a5ff8cd1d81325a033f0b2d8864d665f6/src/core/telemetry.rs)
- Official plugin docs: [OpenCode plugin server and V1 support](https://opencode.ai/docs/build/plugins/server#support-v1)
