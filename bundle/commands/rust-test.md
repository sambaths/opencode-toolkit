---
description: Rust TDD workflow with unit and property tests
agent: tdd-guide
subagent: true
---

# Rust Test Command

Implement with Rust TDD: $ARGUMENTS

## Your Task

1. Define structs, enums, and traits.
2. Write unit tests in `#[cfg(test)]` modules.
3. Add the minimum code that passes.
4. Check coverage only against project-defined targets; don't invent a threshold.

## TDD Cycle for Rust

### Step 1: Define Interface

```rust
pub struct Input {
    // fields
}

pub fn process(input: &Input) -> Result<Output, Error> {
    todo!()
}
```

### Step 2: Write Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_input_succeeds() {
        let input = Input { /* ... */ };
        assert!(process(&input).is_ok());
    }

    #[test]
    fn invalid_input_returns_error() {
        let input = Input { /* ... */ };
        assert!(process(&input).is_err());
    }
}
```

### Step 3: Run Tests (RED)

```bash
cargo test
```

### Step 4: Implement (GREEN)

```rust
pub fn process(input: &Input) -> Result<Output, Error> {
    validate(input)?;
    Ok(Output { /* ... */ })
}
```

### Step 5: Check Coverage

```bash
cargo llvm-cov
# Add --fail-under-lines only with the project's documented target.
```

## Rust Testing Commands

```bash
cargo test
cargo test -- --nocapture
cargo test test_name
cargo test --no-fail-fast
cargo test --lib
cargo test --test integration
cargo test --doc
cargo bench
```

## Test File Organization

```text
src/
├── lib.rs
├── service.rs
└── service/
    └── tests.rs       # Or inline #[cfg(test)] mod tests {}
tests/
└── integration.rs
benches/
└── benchmark.rs
```

Use `rstest` for parameterized tests and `proptest` for property-based tests
when they fit the project.
