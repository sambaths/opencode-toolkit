# Standalone OpenCode usage audit

Run the installed Node.js 20+ ESM tool from the project root:

```sh
node .opencode/tools/usage-audit.mjs --root /absolute/project --days 7 --format markdown --tools summary --timezone UTC
```

It is dependency-free and read-only. The script makes no direct filesystem writes; the invoked `opencode api` CLI/service may write logs/state or use a remote server. Its only external action is invoking that CLI with an argv array and `shell: false`; it does not call model providers or interpolate a shell command.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `--root DIR` | current directory | Project root, resolved to a canonical real path |
| `--days N` | `7` | Lookback from the current Unix timestamp; integer 1–3650 |
| `--format markdown\|json` | `markdown` | One bounded report on stdout |
| `--tools none\|summary\|detail` | `summary` | API tool aggregation mode |
| `--timezone ZONE` | `UTC` | Valid IANA time zone sent to the API |
| `--help`, `-h` | — | Usage and safety summary |

Arguments are validated before the CLI is invoked. Duplicate, missing, unknown, positional, and out-of-range values fail with exit status 1.

## API contract

1. Canonicalize `--root` with the filesystem and prefer the exact `GET /api/location` operation (`location.get`) with `location[directory]`.
2. Require that response's `project.canonical` to equal the requested root. If the location operation is unavailable, call `GET /api/project` and require exactly one canonical match; zero or multiple matches fail. Use the returned `id` as `Project.ID`; never derive an ID from the path.
3. Call `GET /api/experimental/session/stats` with separate `--param key=value` argv entries for `project`, inclusive `from`, exclusive `to`, `timezone`, and `tools`.
4. Validate the JSON envelope and numeric shapes, require `data.range.from/to` to exactly match the requested range, aggregate duplicate model rows, and whitelist the report fields. Statistics are never requested without a resolved project ID.

The report contains only:

- input, output, reasoning, cache-read, and cache-write token counts;
- USD cost;
- per-model token/cost usage, retaining provider, model ID, and optional variant;
- tool totals or per-tool call/outcome counts and optional duration p50;
- project/range metadata and explicit truncation/limit state.

Session/prompt/step counts, activity, transcripts, titles, message content, file content, credentials, and unknown response fields are neither aggregated nor rendered. Canonical roots and tool/model labels reject terminal control characters; Markdown labels escape backticks and formatting characters. Raw CLI stdout/stderr is not echoed on failure, so an API error cannot accidentally print response content or secrets.

## Bounds and failures

Defaults are an 8 MiB response cap per API call, a 30-second timeout per call, 1000 model rows and 1000 tool-detail rows, and a 256 KiB rendered-output cap. The runner enforces byte limits while reading and aborts timed-out requests. Over-limit responses fail clearly. Rows beyond the cap are omitted and counted; output trimming removes additional rows and sets `truncation.complete` to `false`. JSON remains valid when trimmed.

Missing `opencode`, an unavailable local API, a nonzero CLI exit, malformed JSON, a missing/ambiguous project, malformed stats, or a tool-mode mismatch fails with exit status 1. The tool never replaces missing values with zero. A legitimate API zero remains zero. An empty model/tool array is valid only when the API actually returns it.

## Sources

- [OpenCode V2 CLI: `api` command](https://opencode.ai/v2/docs/cli/commands#api)
- [OpenCode V2 API reference: session statistics](https://opencode.ai/v2/docs/api#tag-session)
- [OpenCode V2 OpenAPI document](https://opencode.ai/v2/openapi.json): `/api/project`, `/api/experimental/session/stats`, `Project`, `SessionStats.Info`, `TokenUsage.Info`, and tool schemas

## Invocation and model-context boundary

Invoking `opencode api` may start the OpenCode service or use its configured remote server; this tool does not control that routing and makes no direct provider calls. Running the command through an agent tool also places the aggregate report metadata in that agent's current model context. Run it directly in a terminal when the report should stay outside the model conversation. Do not pass credentials, transcripts, or prompt content to the tool.

The endpoint is experimental. A successful static audit establishes only what the resolved API returned for the requested range; it does not establish provider invoice accuracy, live model availability, prompt contents, or runtime configuration effectiveness.
