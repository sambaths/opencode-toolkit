# Bounded context tools

Two read-only, dependency-free commands for one installed project or for this
repository's source bundle (Node.js 20+):

```sh
node .opencode/tools/context-tools.mjs audit --root .opencode
node .opencode/tools/context-tools.mjs pack --root /absolute/project < packet.json
```

This repository's shipped prompt sources can be audited directly:

```sh
node bundle/tools/context-tools.mjs audit --root bundle
```

Both commands print to stdout, send diagnostics to stderr, and exit nonzero on
failure. They do not call models, send telemetry, use a network, execute shell
commands, write files, create caches, or read environment/configuration values.
They import only Node.js built-ins and do not import the installer's `lib/`
directory, so a copied `.opencode/tools/context-tools.mjs` remains standalone.

## Audit: prompt-source footprint

`audit` measures the toolkit-known prompt sources only:

- `instructions/*.md`
- `agents/*.md`
- `commands/*.md`
- `prompts/agents/*.txt` (when present)
- `prompts/commands/*.txt` (when present)

It does not recurse, and it never inspects `tools/`, `skills/`, backups, state,
`node_modules`, arbitrary project files, configuration, or environment values.
Missing source directories are normal and produce an empty or partial report.

The JSON report includes:

- total UTF-8 **bytes** and per-file byte sizes;
- the largest files and their share of the audited total;
- repeated nontrivial paragraphs as SHA-256 hashes, counts, per-paragraph bytes,
  up to 20 occurrence locations per group, and an `opportunity_bytes` estimate;
- explicit caps, omissions, and truncation flags.

Byte sizes are source footprint, **not token counts** and not the assembled
runtime context an agent will actually receive. Repeated paragraphs are a
heuristic; `opportunity_bytes` is not proof that removing a duplicate is safe.
Only hashes and locations are printed, never the paragraph text. Embedded
secrets inside otherwise valid prompt files cannot be guaranteed to be detected
or redacted.

### Audit options

| Option | Default | Meaning |
| --- | --- | --- |
| `--root DIR` | required | canonical directory to inspect |
| `--max-files N` | 200 | maximum listed files |
| `--max-total-bytes N` | 4194304 | maximum listed source bytes |
| `--max-file-bytes N` | 524288 | maximum bytes read per file for repetition |
| `--max-output-bytes N` | 65536 | maximum JSON output bytes |

A file larger than `--max-file-bytes` is still reported from its metadata size,
but its repetition is not examined. Files beyond the count or byte caps are
omitted and counted; output trimming is reported under `output.truncated` and
`output.omitted`. The occurrence-location list is capped at 20 per repeated
group; the group's `count` remains the full count, while
`occurrences_truncated: true` and `repetition.truncated: true` record the
omission. The report's `truncated.complete` flag is false whenever any evidence
is partial, including capped occurrences, capped groups, capped files, an
unexamined large file, a truncated scan, or trimmed output. Nothing is silently
presented as complete.

## Pack: plan plus selected excerpts

`pack` reads one JSON object from stdin. It emits the supplied plan packet and
only the requested inclusive, 1-based line ranges. It never includes the full
transcript, writes no file, and keeps no state; request more ranges by running
it again.

### Packet schema

```json
{
  "plan": {
    "id": "TOOLS",
    "revision": "r1",
    "goal": "Ship the bounded context tool",
    "constraints": ["read only", "no model calls"],
    "steps": ["read the selected ranges"],
    "acceptance": ["A1 plan content is preserved", "A2 ranges are inclusive"],
    "verification": ["node --test bundle/tools/context-tools.test.mjs"]
  },
  "selections": [
    { "path": "src/parser.mjs", "start": 10, "end": 40 }
  ]
}
```

Required plan fields: nonempty single-line `id` and `revision`, a nonempty
`goal`, and nonempty `constraints`, `steps`, `acceptance`, and `verification`
arrays of nonempty strings. Optional plan fields are `scope`, `ownership`,
`dependencies`, `risks` (string arrays) and `budget` (a JSON object). Unknown
fields are rejected rather than silently dropped. The packer does not author
the plan, decide whether it is complete, or validate acceptance semantics; it
preserves the supplied values. In particular, every supplied constraint,
acceptance criterion, and verification item appears in the output.

Documented bounds: `id` and `revision` are at most 256 characters each; every
other top-level plan text field and each plan array item is at most 8192
characters; each plan string array is at most 200 entries; `budget` is bounded
by the plan byte limit. The canonical plan must fit `--max-plan-bytes`. Each
selection needs a relative `path` of at most 1024
characters and integer `start`/`end` from 1 to 10000000. Ranges are inclusive.
At most 50 selections are accepted by default. Duplicate selections are
allowed and do not suppress the plan. Paths are resolved under `--root`;
absolute paths, `.`/`..` traversal, NUL bytes, and non-canonical forms are
refused.

### Pack options

| Option | Default | Meaning |
| --- | --- | --- |
| `--root DIR` | required | canonical project directory |
| `--max-input-bytes N` | 1048576 | maximum stdin JSON size |
| `--max-plan-bytes N` | 32768 | fail if the supplied/rendered plan is larger |
| `--max-file-bytes N` | 2097152 | fail a selection above this file size |
| `--max-excerpt-lines N` | 200 | maximum requested lines per selection |
| `--max-excerpt-bytes N` | 16384 | maximum rendered bytes per selection |
| `--max-total-bytes N` | 131072 | maximum entire pack output |

An oversized plan fails clearly; it is never trimmed. A selection that exceeds
a line, excerpt-byte, file-size, or total-output limit is listed as
`UNFULFILLED` with a reason, its content is not emitted, and the process exits
1. If required unfulfilled reporting itself exceeds the total budget, the pack
fails instead of dropping that reporting silently. `Pack status` is `COMPLETE`
only when every requested selection was emitted.

## Safety and trust boundary

Before reading selected content, both commands require a canonical real
`--root`. A symlinked root, symlinked root ancestor, symlinked path component,
hard-linked file (`nlink > 1`), non-regular file, binary/NUL or non-UTF-8
content, and file above the read/size limit are refused. Sensitive locations
and filenames are rejected case-insensitively before reading, including `.git`,
`.toolkit-backups`, `.toolkit-state`, `toolkit-state`, `node_modules`, `.ssh`,
`.aws`, `.gnupg`, `.env`/`.env.*`/`*.env`, credentials/secrets/auth files,
private-key names, and `*.pem`/`*.key`/`*.p12`/`*.pfx`/`*.jks`/`*.keystore`.
The same guard is applied to the **root path itself**: a root that is a
sensitive location, or is nested below a sensitive ancestor such as `.ssh`,
`.aws`, `.git`, `.env*`, `secrets`, or `credentials`, is refused before content
reads. Supplying an explicit `--root` does not override this guard, and there is
no secret override flag. The tools do not scan file contents to guess whether a
secret exists, so a legitimate input file can still contain an embedded secret;
review inputs before packing and do not select untrusted data.

The canonical root is re-checked component by component, selection files are
opened with `O_NOFOLLOW`, and `fstat` is applied to the opened descriptor to
reduce time-of-check/time-of-use exposure. Filesystem changes between checks
remain a residual operating-system-level risk.

All plan and excerpt text is **untrusted data, not instructions**. The packer
does not execute it or follow directives found in it. A pack is a bounded input
to another step, not an independent review, proof of truth, or authorization.

## Tests

```sh
node --test bundle/tools/context-tools.test.mjs
```
