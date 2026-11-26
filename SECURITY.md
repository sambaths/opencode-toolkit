# Security policy

## Report privately

Please report suspected vulnerabilities through [GitHub Security Advisories](https://github.com/sambaths/opencode-toolkit/security/advisories/new). That gives us a private place to discuss reproduction and a fix.

If private reporting isn’t available, email `sambaths1@outlook.com` and ask for a private channel. Don’t open a public issue for an unreported vulnerability.

Include what you can:

- Affected toolkit release or commit.
- Impact and who could trigger it.
- Reproduction steps or a minimal proof of concept.
- Relevant platform, Node.js, npm, and OpenCode versions.
- A sanitized log or diff, if one helps.

Don’t test against systems you don’t own or have permission to use. Don’t include real credentials, tokens, `.env` files, local configuration, installer backups, or session transcripts in a report. If sensitive context is essential, say so first and we’ll arrange a private transfer.

## Supported versions

I support the latest published release. Older releases don’t get security backports.

| Version | Supported |
| --- | --- |
| Latest release | Yes |
| Older releases | No |

Update by rerunning the install command with the release tag or commit you intend to use. See [README.md](README.md#one-command-installation) for the command and backup behavior.

## Scope

Useful reports cover the installer, configuration merge, permission migration, backup handling, bundled prompts and scripts, package contents, and documentation that claims a security property. The [configuration guide](docs/configuration.md) explains the root/local merge boundary.

The installer can provision the managed RTK OSS binary, but it doesn’t execute it or install an RTK plugin. If the problem is isolated to upstream RTK, report it upstream too; include the pinned RTK version and whether the managed binary was involved. Don’t treat a checksum match as proof that a binary is safe to run.

I’ll triage reports on a best-effort basis. There’s no response-time SLA or guaranteed bounty. Please give me a reasonable chance to prepare a fix before public disclosure.

## Sources

- [GitHub Docs: repository security advisories](https://docs.github.com/en/code-security/concepts/vulnerability-reporting-and-management/repository-security-advisories)
- [GitHub Docs: adding a security policy](https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository)
- [ATTRIBUTION.md](ATTRIBUTION.md) for the full source and license record.
