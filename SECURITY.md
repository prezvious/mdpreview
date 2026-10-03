# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately through [GitHub security advisories](https://github.com/prezvious/mdpreview/security/advisories/new). Do not open a public issue. If private reporting is unavailable, contact the repository owner privately.

Include steps to reproduce and, where possible, a markdown sample that triggers the problem. Never include real credentials or private documents.

## Scope

This policy covers the latest version on `main` in this repository. The upstream [mdfor.dev](https://mdfor.dev) deployment is maintained separately. Issues of particular interest:

- Script execution or HTML injection through rendered markdown, Mermaid diagrams, or KaTeX
- Bypasses of the Content Security Policy in [`_headers`](_headers)
- Anything that causes document content to leave the user's device
