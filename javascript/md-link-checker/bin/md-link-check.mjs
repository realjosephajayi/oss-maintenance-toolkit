#!/usr/bin/env node
import path from "node:path";
import { checkFiles, collectMarkdownFiles } from "../src/checker.mjs";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: md-link-check [directory]\n\nChecks local links and heading anchors in Markdown files. External URLs are skipped.");
  process.exit(0);
}
if (args.length > 1) {
  console.error("Usage: md-link-check [directory]");
  process.exit(2);
}

const root = path.resolve(args[0] ?? ".");
try {
  const files = collectMarkdownFiles(root);
  const issues = checkFiles(files, root);
  if (issues.length === 0) {
    console.log(`Checked ${files.length} Markdown file${files.length === 1 ? "" : "s"}; no broken local links found.`);
    process.exit(0);
  }

  for (const issue of issues) {
    const relativeFile = path.relative(root, issue.filePath);
    console.error(`${relativeFile}:${issue.line}:${issue.column}: ${issue.kind}: ${issue.message}`);
  }
  console.error(`\nFound ${issues.length} issue${issues.length === 1 ? "" : "s"} in ${files.length} Markdown file${files.length === 1 ? "" : "s"}.`);
  process.exit(1);
} catch (error) {
  console.error(`md-link-check: ${error.message}`);
  process.exit(2);
}
