# AgentProof

**Inspect. Diagnose. Report.**

AgentProof is a browser-local source-code diagnostic tool. It scans selected source files, summarizes findings for free, and unlocks detailed findings, developer remediation guidance and illustrative code examples, an inspection certificate and downloadable reports after Professional Diagnosis purchase verification.

AgentProof is diagnosis-only. It does not patch, repair, execute, overwrite or upload customer source files.

## Product workflow

1. **Free Scan:** scan up to 500 files / 20 MB total / 2 MB per file. The free result reveals only total, high, medium and low finding counts.
2. **Professional Diagnosis ($29):** Gumroad license verification unlocks file and line locations, rule IDs, severity, evidence and suggested remediation guidance.
3. **Inspection certificate:** print or save a PDF certificate containing report ID, issue date, file count, rule coverage and severity totals.
4. **Report handoff:** download JSON or CSV, or request delivery to the customer's email. The report directs the customer to share it with the developer who created or maintains the code and request corrections.

## Diagnosis coverage

The current heuristic scanner checks for:
- Credential-like strings, common tokens and private-key markers.
- Bearer authorization values.
- Dynamic execution (eval, new Function).
- Potential unsafe HTML assignment (innerHTML).
- Potential shell command execution.
- Disabled TLS certificate verification.
- Potential SQL string concatenation.
- Debug logging statements.

Supported extensions include JS, JSX, MJS, CJS, TS, TSX, Python, PHP, Ruby, Go, Java, Kotlin, C#, C/C++, Rust, Swift, Vue, Svelte, HTML, CSS, JSON, YAML, shell and SQL.

These are bounded pattern checks, not a full SAST, dependency audit, runtime test suite, penetration test or security guarantee. False positives and false negatives are possible. A zero-finding result means only that the configured checks did not match the selected files.

## Privacy

Scanning and diagnosis run in the browser. Source files are never sent to the API. Credential-like evidence is redacted. The license API receives only the Gumroad license key for verification.

When a customer explicitly requests email delivery, the report findings and recommendations (not source files) are sent to the configured email provider and delivered to the requested address. JSON and CSV are attached.

## Development

No runtime npm dependencies are required.

    npm test
    npm run check

## Paid diagnosis API

The api/ directory contains a dependency-free Node.js API for Gumroad license verification and optional report email delivery.

### Runtime configuration

- PORT=8080
- ALLOWED_ORIGIN=https://zopair.github.io
- GUMROAD_DIAGNOSIS_PRODUCT_ID=<Gumroad product ID>
- RESEND_API_KEY=<Resend API key>
- REPORT_FROM_EMAIL=reports@your-verified-domain.example

Run with Node.js 20+:

    node api/index.js

Endpoints:
- GET /health — service and configuration status (never returns secrets).
- POST /api/licenses/verify — verifies the Gumroad license without incrementing usage count.
- POST /api/reports/email — sends the customer-requested diagnosis report through Resend.

Email delivery requires a Resend account, a verified sender domain/address, and the two email environment variables above. If not configured, the UI clearly directs customers to the local JSON/CSV and PDF options. The API sends JSON and CSV attachments and does not persist report data or customer email addresses.

## License

MIT. See LICENSE.
