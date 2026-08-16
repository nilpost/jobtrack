# Security policy

## Supported versions

Only the latest commit on the default branch is supported. Older builds, forks, and unmaintained sync-server deployments are unsupported.

## Private vulnerability reporting

Use GitHub private vulnerability reporting from the repository's **Security** tab, or contact the owner privately through the owner's GitHub profile if unavailable. Do not include real job applications, resumes, tokens, or OAuth credentials.

Do **not** disclose vulnerabilities through public GitHub issues, discussions, or pull requests before coordinated disclosure.

## Security expectations

- Treat job applications, resumes, profile data, and sync payloads as sensitive personal data.
- Deploy the optional sync server only with HTTPS, strong independent secrets, an exact CORS origin, and a minimal Google email allowlist.
- Keep the sync server single-tenant unless storage and authorization are redesigned and tested per account.
- Define backup, retention, device revocation, and deletion practices for local and synced data.

# Security & Privacy Remediation Backlog

The standard scan found no validated vulnerabilities in the reviewed scope. Token and allowlisted-Google sync authorization, OAuth state, signed cookies, exact-origin CORS, redirect handling, SQLite storage, and client-side import/parsing paths were reviewed without inventing remediation work.
