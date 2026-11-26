# Support

Start with [README.md](README.md). If a setting is unclear, check [configuration](docs/configuration.md). The shipped RTK facts and constraints are in the [configuration RTK section](docs/configuration.md#rtk-is-separate).

## Usage questions

Open a [GitHub issue](https://github.com/sambaths/opencode-toolkit/issues/new/choose) for toolkit usage questions. Include the command you ran, what you expected, and where you got stuck. A small example beats a screenshot of an entire terminal.

For general OpenCode behavior, check the [official documentation](https://opencode.ai/docs) or the [OpenCode Discord](https://opencode.ai/discord). Provider credentials, model availability, and billing belong with the relevant provider; the toolkit doesn’t configure or guarantee them.

## Bug reports

Please include:

- Toolkit release tag or commit.
- Operating system, shell, Node.js, npm, and OpenCode versions.
- The exact install or update command.
- Expected behavior and actual behavior.
- A minimal reproduction and sanitized output.
- Whether this was a fresh install or an update.

Preview an install before writing:

```sh
npx --yes github:sambaths/opencode-toolkit --project . --dry-run
```

Don’t paste secrets or private configuration. In particular, leave out `.env` files, provider keys, session transcripts, and `.opencode/.toolkit-backups/` contents. Describe the relevant shape or provide a sanitized excerpt instead.

For contributor setup and checks, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Security reports

Don’t put vulnerabilities in public issues. Use [GitHub Security Advisories](https://github.com/sambaths/opencode-toolkit/security/advisories/new) and follow [SECURITY.md](SECURITY.md).

## What to expect

This is best-effort maintainer support, with no SLA. I’ll read useful reports and fix what I can, but I can’t promise a response time, a feature, or support for every model/provider combination. Clear reproduction steps and exact errors help a lot.

## Sources

- [GitHub Docs: setting guidelines for repository contributors](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/setting-guidelines-for-repository-contributors)
- [GitHub Docs: community profiles](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories)
- [GitHub Docs: private vulnerability reporting](https://docs.github.com/en/code-security/concepts/vulnerability-reporting-and-management/repository-security-advisories)
- [ATTRIBUTION.md](ATTRIBUTION.md) for the full source and license record.
