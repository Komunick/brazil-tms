## Delivery Workflow (Git, PRs, Deployments)

This is the single source of truth for how changes move from a feature branch to production.

### Branch Roles
- `main` is the **Production** branch.
- `dev` is the **Development/Integration** branch (DEV environment).
- All work happens on short-lived feature branches. Never commit directly to `dev` or `main`.

### Merge Policy
- No direct pushes to `dev` or `main` — all changes land via PR.
- **Feature PRs MUST target `dev`.**
- **Promotion to production is a PR from `dev` → `main`.** Only `dev → main` promotion PRs may target `main`.
- **Production merges are human-only:** only a human maintainer may merge a `dev → main` promotion PR.

### Deployment Mapping
- Merges into `dev` deploy to **DEV**.
- Merges into `main` deploy to **PROD**.

### Quality Gates (Required Before Merge)
- Lint + typecheck pass.
- Tests pass (when applicable).
- Build passes.
- PR description follows the PR Template below (including how to test, or why it is not needed).

These gates are enforced in CI.

### Responsibilities

**AI may:**
1. Create/update a feature branch from `dev`.
2. Implement changes with small, reviewable commits.
3. Run checks locally when possible (lint/typecheck/tests/build).
4. Open a PR targeting `dev` with summary + test plan + screenshots (if UI).
5. If requested, prepare a promotion PR `dev → main` with a clean release note.

**AI must NOT:**
- Merge any PR into `main`.
- Approve/force production deployment.
- Bypass CI or branch protections.

**Human maintainer:**
- Validates DEV deployment after merge to `dev`.
- Reviews and merges the promotion PR `dev → main`.
- Smoke tests PROD.

### PR Template
- **What changed:** …
- **Why:** …
- **How to test (DEV):** …
- **Migration/Env var notes:** …
- **Risks / rollback:** …
