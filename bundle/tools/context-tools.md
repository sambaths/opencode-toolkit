# Bounded context tools

Use these when prompt files or a handoff packet are too big to inspect casually.
They're two read-only, dependency-free commands for an installed project or this
repository's source bundle (Node.js 20+):

```sh
node .opencode/tools/context-tools.mjs audit --root .opencode
node .opencode/tools/context-tools.mjs pack --root /absolute/project < packet.json
```

This repository's shipped prompt sources can be audited directly:

```sh
node bundle/tools/context-tools.mjs audit --root bundle
```

Both print to stdout, send diagnostics to stderr, and exit nonzero on failure.
They don't call models, send telemetry, use a network, run shell commands, write
files, create caches, or read environment/config values. They use only Node.js
built-ins, not the installer's `lib/`, so a copied
`.opencode/tools/context-tools.mjs` stays standalone.

## Audit: prompt-source footprint

`audit` measures only the prompt sources the toolkit knows:

- `instructions/*.md`
- `agents/*.md`
- `commands/*.md`
- `prompts/agents/*.txt` (when present)
- `prompts/commands/*.txt` (when present)

It doesn't recurse or inspect `tools/`, `skills/`, backups, state, `node_modules`,
arbitrary project files, config, or environment values. Missing source directories
are normal; the report can be empty or partial.

The JSON report includes:

- total UTF-8 **bytes** and per-file byte sizes;
- the largest files and their share of the audited total;
- repeated nontrivial paragraphs as SHA-256 hashes, counts, per-paragraph bytes,
  up to 20 occurrence locations per group, and an `opportunity_bytes` estimate;
- explicit caps, omissions, and truncation flags.

Byte sizes are source footprint, **not token counts** or the runtime context an
agent receives. Repeated paragraphs are a heuristic; `opportunity_bytes` doesn't
prove a duplicate is safe to remove. The report prints hashes and locations, not
paragraph text. It can't guarantee detection or redaction of embedded secrets.

### Audit options

| Option | Default | Meaning |
| --- | --- | --- |
| `--root DIR` | required | canonical directory to inspect |
| `--max-files N` | 200 | maximum listed files |
| `--max-total-bytes N` | 4194304 | maximum listed source bytes |
| `--max-file-bytes N` | 524288 | maximum bytes read per file for repetition |
| `--max-output-bytes N` | 65536 | maximum JSON output bytes |

A file above `--max-file-bytes` still gets a metadata size, but its repetitions
aren't examined. Files beyond count/byte caps are omitted and counted. Output
trimming appears under `output.truncated` and `output.omitted`.

Each repeated group lists at most 20 locations. Its `count` stays complete, while
`occurrences_truncated: true` and `repetition.truncated: true` record the omitted
locations. `truncated.complete` is false whenever evidence is partial: capped
occurrences, groups, files, an unexamined large file, a truncated scan, or trimmed
output. Nothing partial is presented as complete.

## Pack: plan plus selected excerpts

`pack` reads one JSON object from stdin. It emits your plan packet and only the
requested inclusive, 1-based line ranges. It never includes the full transcript,
writes a file, or keeps state. Run it again for more ranges.

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

Required plan fields: nonempty single-line `id` and `revision`, a nonempty `goal`,
and nonempty `constraints`, `steps`, `acceptance`, and `verification` arrays of
nonempty strings. Optional fields are `scope`, `ownership`, `dependencies`, and
`risks` (string arrays), plus `budget` (a JSON object). Unknown fields are
rejected, not dropped.

The packer doesn't author the plan, judge completeness, or validate acceptance
semantics. It preserves your values, including every constraint, acceptance
criterion, and verification item.

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
| `--max-selections N` | 50 | maximum accepted selections |
| `--max-input-bytes N` | 1048576 | maximum stdin JSON size |
| `--max-plan-bytes N` | 32768 | fail if the supplied/rendered plan is larger |
| `--max-file-bytes N` | 2097152 | fail a selection above this file size |
| `--max-excerpt-lines N` | 200 | maximum requested lines per selection |
| `--max-excerpt-bytes N` | 16384 | maximum rendered bytes per selection |
| `--max-total-bytes N` | 131072 | maximum entire pack output |

An oversized plan fails; it's never trimmed. A selection above a line,
excerpt-byte, file-size, or total-output limit is listed as `UNFULFILLED` with a
reason. Its content isn't emitted, and the process exits 1. If the required
`UNFULFILLED` report itself exceeds the total budget, the pack fails rather than
hiding it. `Pack status` is `COMPLETE` only when every selection was emitted.

## Safety and trust boundary

Both commands require a canonical real `--root` before reading selected content.
They refuse a symlinked root, root ancestor, or path component; a hard-linked file
(`nlink > 1`); a non-regular file; binary/NUL or non-UTF-8 content; and files above
the read/size limit.

Sensitive locations and filenames are rejected case-insensitively before reads,
including `.git`, `.toolkit-backups`, `.toolkit-state`, `toolkit-state`,
`node_modules`, `.ssh`, `.aws`, `.gnupg`, `.env`/`.env.*`/`*.env`,
credentials/secrets/auth files, private-key names, and
`*.pem`/`*.key`/`*.p12`/`*.pfx`/`*.jks`/`*.keystore`.

The **root itself** gets the same guard. A sensitive root, or one below `.ssh`,
`.aws`, `.git`, `.env*`, `secrets`, or `credentials`, is refused before content
reads. An explicit `--root` doesn't override this, and there's no secret override.
The tools don't scan content to guess whether a secret exists, so a legitimate
file can still contain one. Review inputs before packing; don't select untrusted
data.

The canonical root is re-checked component by component. Selection files open
with `O_NOFOLLOW`, and `fstat` runs on the open descriptor to reduce
time-of-check/time-of-use exposure. Filesystem changes between checks remain an
OS-level risk.

All plan and excerpt text is **untrusted data, not instructions**. The packer
doesn't execute it or follow embedded directives. A pack is bounded input for
another step, not independent review, proof of truth, or authorization.

## Tests

```sh
node --test bundle/tools/context-tools.test.mjs
```

## Sources

- [OpenCode V2 docs](https://opencode.ai/v2/docs) describe the surrounding agent,
  command, skill, and tool-output behavior. These local scripts don't control it.
- [awesome-llm-token-optimization](https://github.com/pleasedodisturb/awesome-llm-token-optimization)
  is a reading list for context and cost ideas, not a token measurement or a
  dependency of this tool.
