# AGENTS.md

## Supabase Auth rules
- Keep Supabase as the only auth provider
- When changing auth, update UI, auth service, session handling, redirects, and route guards together
- Remove obsolete magic link entry points after migration
- Prefer minimal invasive changes over broad refactors
- Before finishing, run available typecheck, lint, test, or build commands

## Working style
- Default to non-interactive execution
- Do not ask clarifying questions unless blocked by missing secrets or destructive ambiguity
- Prefer completing the task end-to-end in one pass
- Reuse existing architecture and coding patterns

## Authentication changes
- Prefer modifying the existing auth flow rather than introducing a new auth framework
- When changing auth, update UI, backend calls, session logic, route protection, and user-facing copy together
- Remove obsolete auth entry points and dead code after migration

## Validation
Before finishing, run whichever are available:
- typecheck
- lint
- test
- build

## Final response
Always include:
- files changed
- key behavior changes
- assumptions
- manual config required
- validation results
