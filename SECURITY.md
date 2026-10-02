# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

Hack-A-Gent uses LLM APIs that require API keys. Protecting these keys is critical.

**Do not** open public issues for security vulnerabilities.

Instead, email the maintainer directly or open a [security advisory](https://github.com/Theuser1211/Hack-A-Gent/security/advisories/new).

### What to include

- Description of the vulnerability
- Steps to reproduce
- Affected versions
- Potential impact
- Suggested fix (if any)

### What happens next

1. We will acknowledge receipt within 48 hours
2. We will investigate and provide a timeline for a fix
3. A fix will be released and disclosed after the vulnerability is patched

## Security Practices

- API keys are stored in local config only (never sent to third parties)
- No telemetry or analytics
- All network requests use HTTPS
- Generated projects are sandboxed in the local filesystem
- Git commands validate repository names against injection patterns
- Path traversal is blocked on file read/write operations
