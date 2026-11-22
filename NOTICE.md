# Provenance

Retained ECC agent prompts, command templates, and the skill evidence evaluator
derive from Everything Claude Code, https://github.com/affaan-m/ECC (MIT,
copyright 2026 Affaan Mustafa). The MIT notice is included in LICENSE.

Custom team roles and repairs were extracted from the user's Disciple OpenCode
configuration. Disciple source snapshot: d3af24b9; harness repairs are committed
as 8762c355 on branch fix/opencode-toolkit. Some upstream ECC files were machine-local ignored
files, so a precise upstream commit for those files is unknown. This package
includes their actual contents rather than relying on a global ECC installation.

The portable export is allowlisted. It excludes application source, deployment
addresses, project instructions/history, secrets, provider credentials, generated
plugin artifacts, and machine-specific MCP settings. Optional skills and tools
are not bundled and are never silently installed.
