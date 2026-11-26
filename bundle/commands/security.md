---
description: Run comprehensive security review
agent: security-reviewer
subagent: true
---

# Security Review Command

Review the specified code for security vulnerabilities: $ARGUMENTS

Use OWASP guidance and the project's security requirements. Check what applies;
don't claim a category passed if you didn't inspect it.

## Security Checklist

### OWASP Top 10

1. **Injection**: parameterized queries, input sanitization, dynamic query construction.
2. **Broken authentication**: password storage, sessions, MFA, reset flows.
3. **Sensitive data exposure**: encryption in transit/at rest, key management, PII handling.
4. **XXE**: DTD processing and XML input validation.
5. **Broken access control**: endpoint authorization, roles, resource ownership.
6. **Security misconfiguration**: default credentials, error leaks, security headers.
7. **XSS**: output encoding, CSP, input sanitization.
8. **Insecure deserialization**: serialized-data validation and integrity checks.
9. **Known-vulnerable components**: dependency audit and outdated packages.
10. **Insufficient logging/monitoring**: security events, sensitive-data exclusion, alerts.

### Additional Checks

- [ ] Secrets in code, including API keys and passwords
- [ ] Environment variable handling
- [ ] CORS configuration
- [ ] Rate limiting
- [ ] CSRF protection
- [ ] Secure cookie flags

## Report Format

### Critical Issues

[Issues that must be fixed immediately]

### High Priority

[Issues to fix before release]

### Recommendations

[Security improvements to consider]

Security issues are blockers. Don't proceed until critical issues are resolved.
