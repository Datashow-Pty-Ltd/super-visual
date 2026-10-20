# Security policy

## Supported versions

Security fixes are applied to the latest published release candidate or stable
release. The project is pre-1.0; consumers should pin exact versions.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability, exposed credential,
unsafe deployment path, or tenant data disclosure. Use GitHub's private
security-advisory reporting for this repository at
https://github.com/Datashow-Pty-Ltd/super-visual/security/advisories/new. Include
the affected version, reproduction, impact, and any known mitigation. Datashow
will acknowledge a complete report as soon as practicable and coordinate
disclosure after a fix is available.

Never include access tokens, workspace exports, connection credentials, or
customer data in a report. Revoke an exposed credential immediately through its
identity provider; deleting it from Git history is not sufficient.

## Published assurance

The repository publishes its automated security controls and known limitations
in [docs/security-assurance.md](docs/security-assurance.md). Passing scans are
evidence, not a guarantee that the software is vulnerability-free.
