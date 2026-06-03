# Contributing to FocusGate

## Workflow: one branch, one PR, per change

`main` is protected by convention — **never push directly to `main`.** Every change,
however small, goes through a pull request:

```bash
git checkout main && git pull
git checkout -b feat/short-description   # or fix/, chore/, docs/
# ...make the change...
npm run typecheck && npm test            # must pass before you push
git push -u origin HEAD
gh pr create --fill                      # opens the PR
```

CI (`.github/workflows/ci.yml`) runs typecheck + tests + build on every PR. Don't merge
red.

### Branch naming

| prefix | for |
| --- | --- |
| `feat/` | new functionality |
| `fix/` | bug fixes |
| `chore/` | tooling, deps, CI, config |
| `docs/` | documentation only |

### Before you open a PR

- `npm run typecheck` is clean
- `npm test` passes
- No secrets committed (`.env` is gitignored — keep it that way)
- The PR description says **what changed and why**, not just what

### Recommended branch protection (set once in GitHub settings)

Settings → Branches → add rule for `main`:
- Require a pull request before merging
- Require the `build` status check to pass
- (Solo dev: you can still approve your own PRs; the value is the green check + the diff review.)
