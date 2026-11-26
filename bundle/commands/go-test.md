---
description: Go TDD workflow with table-driven tests
agent: tdd-guide
subagent: true
---

# Go Test Command

Implement this with Go TDD: $ARGUMENTS

## Your Task

Use Go idioms and the project's existing test conventions:

1. **Define types**: interfaces and structs.
2. **Write table-driven tests** for the requested behavior.
3. **Implement minimal code** that passes.
4. **Benchmark** when performance is part of the request.

## TDD Cycle for Go

### Step 1: Define Interface
```go
type Calculator interface {
    Calculate(input Input) (Output, error)
}

type Input struct {
    // fields
}

type Output struct {
    // fields
}
```

### Step 2: Table-Driven Tests
```go
func TestCalculate(t *testing.T) {
    tests := []struct {
        name    string
        input   Input
        want    Output
        wantErr bool
    }{
        {
            name:  "valid input",
            input: Input{...},
            want:  Output{...},
        },
        {
            name:    "invalid input",
            input:   Input{...},
            wantErr: true,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := Calculate(tt.input)
            if (err != nil) != tt.wantErr {
                t.Errorf("Calculate() error = %v, wantErr %v", err, tt.wantErr)
                return
            }
            if !reflect.DeepEqual(got, tt.want) {
                t.Errorf("Calculate() = %v, want %v", got, tt.want)
            }
        })
    }
}
```

### Step 3: Run Tests (RED)
```bash
go test -v ./...
```

### Step 4: Implement (GREEN)
```go
func Calculate(input Input) (Output, error) {
    // Minimal implementation
}
```

### Step 5: Benchmark
```go
func BenchmarkCalculate(b *testing.B) {
    input := Input{...}
    for i := 0; i < b.N; i++ {
        Calculate(input)
    }
}
```

## Go Testing Commands

```bash
# Run all tests
go test ./...

# Run with verbose output
go test -v ./...

# Run with coverage
go test -cover ./...

# Run with race detector
go test -race ./...

# Run benchmarks
go test -bench=. ./...

# Generate coverage report
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

## Test File Organization

```
package/
├── calculator.go       # Implementation
├── calculator_test.go  # Tests
├── testdata/           # Test fixtures
│   └── input.json
└── mock_test.go        # Mock implementations
```

---

Use `testify/assert` only if the project already uses it. The standard library is fine.
