---
description: Update codemaps for codebase navigation
agent: doc-updater
subagent: true
---

# Update Codemaps Command

Update codemaps to reflect the current structure: $ARGUMENTS

Generate or update maps in `docs/CODEMAPS/`:

1. Analyze the codebase structure.
2. Map components and relationships.
3. Document dependencies and data flow.
4. Update navigation guides.

## Codemap Types

- `docs/CODEMAPS/ARCHITECTURE.md`: system overview, components, data flow.
- `docs/CODEMAPS/MODULES.md`: modules, public APIs, dependencies.
- `docs/CODEMAPS/FILES.md`: directories, file purposes, key files.

## Codemap Format

### [Module Name]

**Purpose**: [Brief description]

**Location**: `src/[path]/`

**Key Files**:
- `file1.ts` - [purpose]
- `file2.ts` - [purpose]

**Dependencies**:
- [Module A]
- [Module B]

**Exports**:
- `functionName()` - [description]
- `ClassName` - [description]

**Usage Example**:

```typescript
import { functionName } from '@/module'
```

## Generation Process

1. Scan the directory structure.
2. Parse imports/exports.
3. Build the dependency graph.
4. Generate Markdown maps.
5. Validate links.

Keep codemaps current when modules or major structure change.
