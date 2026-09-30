# Security Policy

## Reporting a problem

Do not open a public GitHub issue for a leaked credential or exploitable bug.
Contact the project owner privately and include the affected component and steps
to reproduce it.

## Repository rules

- Real `.env` files, server addresses, credentials, private keys, database
  exports, access tokens and production logs must not be committed.
- Frontend variables beginning with `VITE_` are public after a build. Never put
  secrets in them.
- Use parameterized SQL queries and validate all request input.
- Keep dependencies updated and review automated security alerts.

## If a secret is exposed

1. Revoke or rotate it immediately at the provider or server.
2. Remove it from the current source tree.
3. Purge it from Git history before pushing, or create a clean repository
   history.
4. Invalidate sessions if the JWT secret was exposed.
5. Review access logs for misuse.

This repository starts with a clean public history. Old local development
history containing deployment values must never be pushed.
