# CI/CD Pipeline Architecture

This document describes the modern CI/CD pipeline architecture for the Promptium extension, outlining the design patterns, workflows, and automated checks in place.

---

## 1. Overview & Core Philosophy

Promptium uses a deterministic, secure, and production-ready GitHub Actions (GHA) CI/CD setup. The configuration follows these core principles:

- **Single Source of Truth**: Tool versions are declared in `package.json` (`"packageManager": "pnpm@10.34.3"`).
- **DRY Workflows**: A composite setup action encapsulates the project bootstrap steps.
- **Deterministic & Reproducible Builds**: Successive compiles are verified to produce identical bundle hashes before a commit is approved or released.
- **Least-Privilege Security**: GitHub Actions execution scopes are constrained globally to `contents: read` except where write permissions are explicitly needed.

---

## 2. Reusable Composite Setup Action

To prevent duplication and guarantee identical environment setup across all jobs, all workflows reuse the setup action defined in [action.yml](file:///.github/actions/setup-project/action.yml).

### Action Flow

1. **Node.js Setup**: Uses `actions/setup-node@v4` pinned to Node `22`.
2. **PNPM Setup**: Configures Corepack and PNPM `10.34.3`.
3. **Optimized Store Caching**: Caches the global PNPM store and WXT caches (`~/.local/share/pnpm/store`, `.wxt/cache`) using `actions/cache@v4` with a lockfile-based key.
4. **Dependency Installation**: Runs `pnpm install --frozen-lockfile` to ensure exact lockfile compliance.

---

## 3. Workflows

### A. CI Workflow (`ci.yml`)

Runs on push/pull requests to `main` and `develop`. It is split into fast-feedback and long-running verification jobs:

- **Lint & Format (Fast)**: Runs Prettier and ESLint in parallel.
- **Typecheck (Fast)**: Runs TypeScript compiler checks without output emitting.
- **Tests (Parallel)**: Runs Knip unused-code analysis and the complete test suites.
- **Build & Validation (Staged)**:
  - Runs the custom verification script ([verify-build.js](file:///scripts/verify-build.js)).
  - Generates a step summary detailing Node/PNPM versions and production bundle sizes.
  - Uploads build artifacts (`promptium-chrome-extension` & packaged `.zip`).

### B. Release Workflow (`release.yml`)

Triggered by pushing version tags (`v*`).

- Runs the verification script to confirm build reproducibility.
- Prepares the release zip package.
- Automatically drafts a GitHub Release with compiled extension binaries.
- Scope-restricted to `contents: write` for release publishing.

### C. Scheduled Maintenance (`maintenance.yml`)

Runs every Sunday at midnight UTC or on manual dispatch.

- Scans codebase dependencies for vulnerabilities using `pnpm audit`.
- Verifies lockfile integrity.
- Runs Knip checks to prune dead code.

---

## 4. Custom Verification Script (`scripts/verify-build.js`)

To keep validation identical between local environments and CI runners, the build verification logic is implemented as a cross-platform Node.js script:

1. **Build Reproducibility Check**:
   - Compiles the production bundle via `pnpm build`.
   - Computes sha256 checksums of all output files.
   - Cleans the output directory and compiles again.
   - Asserts that files and hashes match perfectly.
2. **Structural Validation**:
   - Verifies the presence of key bundle targets (`manifest.json`, `background.js`, `content-scripts/content.js`).
   - Validates presence of assets (Chrome Web Store icons and packaged ZIP).
3. **Size Regression Report**:
   - Logs a clean table of output sizes.
