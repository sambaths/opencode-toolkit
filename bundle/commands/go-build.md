---
description: Fix Go build and vet errors
agent: go-build-resolver
subagent: true
---

# Go Build Command

Fix Go build, vet, and compilation errors: $ARGUMENTS

## Your Task

1. Run `go build ./...`.
2. Run `go vet ./...`.
3. Fix errors one at a time.
4. Verify each fix doesn't introduce new errors.

## Common Go Errors

| Error | Fix |
| --- | --- |
| `imported and not used: "package"` | Remove the import or use `_` when the project requires it. |
| `cannot use x (type T) as type U` | Add a conversion or fix the type definition. |
| `undefined: identifier` | Import the package, define the variable, or fix the typo. |
| `printf: call has arguments but no formatting directives` | Add the directive or remove the arguments. |

Fix in this order: imports, type definitions, function signatures, then vet
warnings. Preserve behavior and follow the project's formatting and dependency
conventions.

## Build Commands

```bash
go build ./...
go build -race ./...
GOOS=linux GOARCH=amd64 go build ./...
go vet ./...
staticcheck ./...
gofmt -w .
go mod tidy
```

Run only the commands the project needs. Don't add tools or tidy dependencies
without the required authorization.

## Verification

```bash
go build ./...
go vet ./...
go test ./...
```

Fix errors only. No refactoring or unrelated improvements. Get the build green
with the smallest change that fits the project.
