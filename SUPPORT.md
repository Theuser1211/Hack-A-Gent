# Support

## Getting Help

### Documentation

Start with the [README](README.md) for installation and usage instructions.

### Issues

If you encounter a bug or have a feature request, [open an issue](https://github.com/Theuser1211/Hack-A-Gent/issues/new/choose). Choose the appropriate template:

- **Bug report** — for crashes, errors, unexpected behavior
- **Feature request** — for new capabilities or improvements
- **Question** — for general help

### Discussions

For questions, ideas, and community discussion, use [GitHub Discussions](https://github.com/Theuser1211/Hack-A-Gent/discussions).

### Quick Diagnosis

```bash
# Run the diagnostic tool
hag doctor

# Check provider status
hag providers

# Verify configuration
hag config --show
```

## Before Opening an Issue

1. Run `hag doctor` and include the output
2. Check if your provider API key is valid with `hag config --verify`
3. Include your Node.js version (`node --version`)
4. Include your operating system
5. Include the full error output (use `--debug` flag)
