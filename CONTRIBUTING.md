# Contributing to Hack-A-Gent

## Getting Started

1. Fork the repository
2. Clone your fork
3. Run `npm install`
4. Run `npm run build`
5. Run `npm test` to verify everything works

## Development Workflow

```bash
# Build the project
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type-check without emitting
npm run typecheck

# Lint
npm run lint

# Format
npm run format
```

## Pull Request Guidelines

- Keep changes focused and small
- Include tests for new functionality
- Update documentation when changing behavior
- Run `npm run build && npm test && npm run lint` before submitting
- Use conventional commit messages

## Code Style

- TypeScript with strict mode
- No `any` types (use `unknown` and type guards)
- Prefer `const` over `let`
- Use template literals over string concatenation
- Use `camelCase` for variables and functions
- Use `PascalCase` for classes and interfaces
- Use `kebab-case` for file names

## Testing

- Unit tests go in `tests/unit/`
- Integration tests go in `tests/integration/`
- Use Vitest for testing
- Tests must be deterministic (same seed = same result)
- No network calls in unit tests

## Commit Messages

```
feat: add competition intelligence analysis
fix: resolve pipeline hang on LLM timeout
docs: update README with example output
test: add router-engine fallback tests
chore: update dependencies
```

## Questions?

Open a [Discussion](https://github.com/Theuser1211/Hack-A-Gent/discussions) or [Issue](https://github.com/Theuser1211/Hack-A-Gent/issues).
