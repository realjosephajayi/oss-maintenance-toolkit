# Markdown Local Link Checker

A dependency-free Node.js CLI that finds broken local links and heading anchors in Markdown documentation. It checks inline links, images, reference-style links, relative files, directory index files, and same-file or cross-file heading fragments. HTTP(S), mail, and other URI-scheme destinations are intentionally skipped, so the tool works offline.

## Requirements

Node.js 20 or newer. No package installation is required.

## Run

```bash
node bin/md-link-check.mjs .
```

Point it at a documentation directory to scan that tree recursively. The process exits `0` when all checked local links resolve, `1` when it finds broken links or anchors, and `2` for invalid command usage or an unreadable input. `.git`, `node_modules`, `dist`, `coverage`, `vendor`, and hidden directories are skipped.

## Check and lint

```bash
npm test
npm run lint
```

The checker recognizes Markdown inline links and images, explicit/collapsed reference links, ATX headings, duplicate heading slugs, and HTML `id`/`name` anchors. It does not fetch external URLs, parse raw HTML links, or implement every extension of the CommonMark/GitHub Flavored Markdown specifications. Use these checks as a fast local-docs guard, not as a full Markdown parser.
