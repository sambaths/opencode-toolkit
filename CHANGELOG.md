# Changelog

Notable changes to OpenCode Toolkit live here. Exact verification evidence belongs in the relevant change or release, not in marketing copy.

## 0.2.0 - 2026-11-25

### Added

- Default-on compaction settings: summaries use the current session model, automatic compaction is on, `keep.tokens` is `15000`, `buffer` is `"15%"`, and background compaction is off.
- Default-on tool-output limits: `max_lines: 2000` and `max_bytes: 51200`.
- Default-on `/usage-audit` command and local audit tool, guide, and tests, plus a broader `/harness-audit` review of settings, role/tool use, dependencies, and permission boundaries. The audit remains read-only unless fixes are separately requested.
- `--no-optimizations` plus paired controls: `--compaction`/`--no-compaction`, `--tool-output`/`--no-tool-output`, and `--usage-audit`/`--no-usage-audit`.
- OSS project files: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`, `ATTRIBUTION.md`, this changelog, and guides for configuration, safe RTK evaluation, GitHub launch work, the native-harness roadmap, long-horizon execution, skill candidates, and domain learning.
- [docs/configuration.md](docs/configuration.md) documents defaults, opt-outs, RTK provisioning, configuration preservation, and the root/local conflict caveat.
- [docs/rtk-evaluation.md](docs/rtk-evaluation.md) documents a manual raw-versus-filtered check with exit status, bytes, lines, owner-only captures, cleanup, and permission boundaries.
- [docs/harness-roadmap.md](docs/harness-roadmap.md) maps native OpenCode v2.3.1–v2.4.1 capabilities and a five-step implementation order without unattended defaults.
- [docs/long-horizon.md](docs/long-horizon.md) records the supervised LH1–LH6 workflow, native gaps, concrete schema-v2/file seams, and LH-01–LH-17 acceptance groups. It does not ship unattended execution.
- [docs/skill-candidates.md](docs/skill-candidates.md) and [docs/domain-learning.md](docs/domain-learning.md) record evaluated-but-not-bundled candidates and the proposed six-step `toolkit-domain-onramp`.

### Changed

- Unrelated user settings and JSONC comments are retained. Format-1 manifests migrate with defaults on while existing customization stays protected. Contradictory paired flags are rejected before writes.
- Root `compaction` and `tool_output` features suppress toolkit management of the corresponding local profile as a whole. Matching generated values are removed, user-managed local values are preserved, and conflicts are reported without leaf-by-leaf default merging.
- The usage audit reports recorded OpenCode API token, cost, model, and tool data without rendering prompt/activity content. Its CLI may start the service or use a configured remote server; an agent-run report’s aggregate metadata enters that model/provider turn, while direct terminal use avoids that. Customized files preserved by `--no-usage-audit` become unmanaged, and re-enable fails on collision unless `--adopt-usage-audit` is explicitly requested. The separate context audit reports source bytes, not live request loads. None of this proves a provider bill or a percentage saving.

### Notes

- The managed RTK OSS binary remains a default install. `--no-rtk` skips it.
- RTK rewrite remains off. There’s no `rtk init`, RTK plugin, automatic command rewriting, PATH entry, or wrapper-specific permission allow in this release.
- The catch is deliberate: compaction is lossy, output caps can hide detail and recovery is tool-dependent, and a filtered command still needs the same authorization and exit-status checks as the raw command.
- Optional autonomy stays opt-in: no automations are created, warming and `full_codemode` stay off, plugins must be pinned, and each MCP server needs an explicit protocol. See [configuration](docs/configuration.md#optional-autonomy).
