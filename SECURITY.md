# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability within mac-dash, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please send an email to **talhaorak.git@gmail.com** with:

- A description of the vulnerability
- Steps to reproduce the issue
- Potential impact assessment
- Any suggested fixes (if applicable)

### What to expect

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Resolution timeline**: Depends on severity, typically within 2 weeks

### Scope

mac-dash runs locally on macOS and interacts with system services via `launchctl`, `sysctl`, and other macOS APIs. Security concerns may include:

- Unauthorized service start/stop operations
- Information disclosure through the web interface
- WebSocket injection attacks
- Path traversal in log reading
- Plugin system security

### Important Note

mac-dash is designed to run **locally** on your Mac and binds to `localhost` by default. It should **never** be exposed to the public internet without proper authentication and authorization mechanisms.

## Security Best Practices

When using mac-dash:

1. **Keep it local**: Only bind to `localhost` (default behavior)
2. **Update regularly**: Keep mac-dash and Bun runtime updated
3. **Review plugins**: Only install plugins from trusted sources
4. **Restrict access**: Use macOS firewall rules if needed
