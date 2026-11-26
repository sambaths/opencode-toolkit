---
description: Update documentation for recent changes
agent: doc-updater
subagent: true
---

# Update Docs Command

Update docs for recent changes: $ARGUMENTS

## Your Task

1. Identify changed code, such as `git diff --name-only`.
2. Find related README, API, and guide files.
3. Update them to match the implementation.
4. Verify commands, examples, links, and version claims.

## Documentation Types

### README.md

- Installation and quick start
- Feature overview
- Configuration options

### API Documentation

- Endpoints and request/response formats
- Authentication and error codes

### Code Comments

- Public API docs such as JSDoc
- Complex logic explanations
- Relevant TODO/FIXME cleanup

### Guides

- How-to tutorials
- Architecture decisions
- Troubleshooting

## Update Checklist

- [ ] README reflects current features.
- [ ] API docs match endpoints.
- [ ] JSDoc covers changed functions.
- [ ] Examples work.
- [ ] Links resolve.
- [ ] Version numbers match.

Good docs are accurate, concise, current, and clear about edge cases. Avoid stale
information, missing parameters, broken examples, and ambiguous language.

Update docs alongside code changes, not as an afterthought.
