# AgentProof

**AI Agent Reliability & Safety Test Kit** — a local-first analyzer for AI agent execution traces.

AgentProof inspects JSON or JSONL event logs for a focused set of operational and safety indicators. It runs entirely in the browser, requires no API key, sends no trace data to a server, and exports findings as JSON or CSV.

## Included
- Browser-based execution trace analyzer
- JSON array and JSONL parsing with line-aware errors
- Six deterministic checks across security, reliability and policy handling
- Evidence-linked findings with rule IDs, severity and event numbers
- JSON and CSV report exports; starter test pack
- Node.js built-in test suite with no runtime dependencies
- GitHub Actions workflows for tests, Pages deployment and tagged ZIP releases

## Quick start
Open \`index.html\` in a modern browser, paste a JSON array or JSONL trace, then choose **Analyze execution**. You can load the demo or import a .json, .jsonl, .ndjson or .txt file.

For development: \`npm test\` and \`npm run check\`. No npm install is required.

## Rule catalogue
| Rule | Severity | Detection |
|---|---|---|
| AP-SEC-001 | High | Common bearer, GitHub, AWS, private-key and credential-assignment patterns |
| AP-SEC-002 | High | Selected prompt-injection and instruction-override indicators |
| AP-REL-001 | Medium | Error, failed, failure or timeout status |
| AP-REL-002 | Medium | Three or more identical calls to the same tool and arguments |
| AP-POL-001 | Low | Denied, blocked or rejected events |
| AP-REL-003 | Low | Traces longer than 30 events |

These checks are transparent and bounded. They are not a complete SAST, DLP, red-team or agent-evaluation framework. Detection depends on supplied event fields and patterns; false positives and false negatives are possible.

## Supported event shape
Common fields include type, event, tool, tool_name, input, arguments, output, content, message, status and state. Provider-specific adapters are not included in this edition; normalize provider logs into these fields first.

## Privacy and limitations
Parsing and analysis happen in the browser tab. No analytics, telemetry, account, API key or external AI endpoint is used. Do not paste production secrets into a report workflow. Credential-like evidence is redacted in findings, but the original trace remains in the text area until cleared or the tab is closed. Exported reports may contain sensitive context.

A clean report means only that this ruleset did not detect its configured patterns. Human review and application-specific testing remain necessary. AgentProof is not a safety certification or guarantee.

## License
MIT. See LICENSE.

## Deployment

The public preview is published through the repository's GitHub Pages workflow. The release ZIP is a source archive pinned to a specific commit so the delivered files are reproducible.
