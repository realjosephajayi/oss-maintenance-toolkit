# OSS Maintenance Toolkit

Small, offline-first command-line tools for catching common repository maintenance issues. The tools are independently runnable, dependency-light, and covered by automated tests.

## Tools

- [Markdown Local Link Checker](javascript/md-link-checker/README.md) — check local Markdown links and heading anchors with Node.js.
- [JUnit Summary](python/junit-summary/README.md) — summarize JUnit/pytest XML reports as text or JSON with Python.

## Development

Requirements: Node.js 20+ and Python 3.10+.

```bash
cd javascript/md-link-checker
npm test
npm run lint

cd ../../python/junit-summary
python -m unittest discover -s tests -v
```

The tools do not need credentials, network access, or production data. Contributions should include tests and keep each utility focused on local, reproducible checks.
