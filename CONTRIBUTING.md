# Contributing

This repository is maintained by the Student Opportunity Finder project team.

## Local setup

1. Clone the repository.
2. Copy each `.env.example` file to `.env` in the same directory.
3. Fill in local development values. Never commit a real `.env` file.
4. Follow the installation and database steps in `README.md`.

## Team workflow

1. Update your local `main` branch before starting work.
2. Create a short branch from `main`, for example:
   - `feature/student-calendar`
   - `fix/login-validation`
   - `docs/viva-notes`
3. Keep one logical change per branch.
4. Run the relevant build or checks locally.
5. Push the branch and open a pull request into `main`.
6. Ask at least one teammate to review it before merging.

Do not push feature work directly to `main`. Never use `git push --force` on a
shared branch.

## Commit messages

Write short action-based messages:

```text
Add deadline filter to discovery page
Fix duplicate opportunity ingestion
Document recommendation score calculation
```

## Required checks

Before opening a pull request:

```bash
cd frontend
npm ci
npm run build

cd ../backend
npm ci
```

For Python changes, compile the modules or start the affected service locally.
GitHub Actions repeats the install/build checks for every pull request.

## Database changes

- Never edit an already deployed migration.
- Add a new numbered migration in `database/`.
- Explain upgrade and rollback impact in the pull request.
- Do not commit database dumps or real student data.

## Secrets and production access

- Never commit `.env` files, API keys, JWT secrets, passwords, VPS addresses,
  private domains, SSH keys, database dumps, or Netlify tokens.
- Store deployment values in the VPS `.env` files and Netlify environment
  variables.
- Do not share the root SSH password. Each operator should use a separate SSH
  key and a non-root account.
- If a secret is committed, notify the team immediately and rotate it. Deleting
  it in a later commit is not enough because Git preserves history.
