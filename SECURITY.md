# Security Policy

This document describes how to report security issues in Promptium and what security boundaries the project currently assumes.

## Reporting a Vulnerability

Please do not open a public issue with full exploit details for a suspected security vulnerability.

Preferred reporting path:

1. use GitHub private vulnerability reporting or a private security advisory for the repository if available
2. if private reporting is not available, contact the repository owner privately through GitHub first
3. share enough detail to reproduce the issue safely without publishing secrets or exploit instructions publicly

Please include:

- affected version or commit
- impacted area of the extension
- reproduction steps
- expected impact
- any mitigation ideas if you already have them

## Scope

Security reports are especially relevant for issues involving:

- API key exposure or unintended persistence
- prompt or conversation data leakage
- unsafe DOM injection or XSS in extension surfaces
- permission abuse or overbroad host access behavior
- insecure communication with AI providers
- export or storage flows that expose sensitive content unexpectedly

## Current Security Model

Promptium is designed as a local-first extension.

Key assumptions:

- there is no Promptium-owned backend service for user data processing
- provider-backed AI requests are sent directly to the configured provider endpoint
- API keys are intended to live in `chrome.storage.session`, not persistent local storage
- content scripts are injected only on supported host permissions listed in the manifest
- semantic search uses a local embedding pipeline rather than a required cloud search service

Relevant documentation:

- [docs/reference/PERMISSIONS.md](./docs/reference/PERMISSIONS.md)
- [docs/reference/STORAGE.md](./docs/reference/STORAGE.md)
- [docs/reference/AI_PROVIDERS.md](./docs/reference/AI_PROVIDERS.md)
- [docs/reference/LOCALMODELS.md](./docs/reference/LOCALMODELS.md)

## What to Avoid in Public Reports

Do not post publicly:

- active API keys
- raw personal conversation exports
- private prompts or sensitive user content
- step-by-step exploit details before maintainers can assess the issue

## Response Expectations

Maintainers should aim to:

- acknowledge receipt of a credible report promptly
- reproduce and assess severity
- prepare a fix or mitigation when confirmed
- disclose publicly after a fix is available or the risk is otherwise addressed

Response time depends on maintainer availability. If a report is incomplete, maintainers may need follow-up details before triage can proceed.

## Supported Versions

Security fixes should be assumed to target the current main development line unless maintainers state otherwise.
