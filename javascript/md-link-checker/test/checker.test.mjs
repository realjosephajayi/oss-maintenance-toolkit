import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkMarkdownText, extractAnchors, extractMarkdownLinks } from "../src/checker.mjs";

function withTempDir(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "md-link-check-"));
  try { callback(directory); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test("extracts inline, image, and reference links with line positions", () => {
  const links = extractMarkdownLinks(`# Guide\n\n[Intro](guide.md#start)\n![logo](img/logo.svg)\n[API][api]\n\n[api]: api.md`);
  assert.deepEqual(links.map(({ destination }) => destination), ["guide.md#start", "img/logo.svg", "api.md"]);
  assert.deepEqual(links.map(({ line }) => line), [3, 4, 5]);
});

test("checks relative files, directory indexes, and heading anchors", () => {
  withTempDir((root) => {
    fs.mkdirSync(path.join(root, "docs"));
    fs.writeFileSync(path.join(root, "docs", "guide.md"), "# Getting Started\n\n## Details\n");
    fs.mkdirSync(path.join(root, "reference"));
    fs.writeFileSync(path.join(root, "reference", "index.md"), "# API\n");
    const source = path.join(root, "README.md");
    const text = "[guide](docs/guide.md#getting-started) [details](docs/guide.md#details) [ref](reference/#api)";
    assert.deepEqual(checkMarkdownText({ text, filePath: source, rootDir: root }), []);
  });
});

test("reports missing files, missing anchors, and undefined references", () => {
  withTempDir((root) => {
    const source = path.join(root, "README.md");
    const text = "# Home\n\n[missing](nope.md) [bad anchor](README.md#missing) [unknown][nope]\n";
    const issues = checkMarkdownText({ text, filePath: source, rootDir: root });
    assert.deepEqual(issues.map(({ kind }) => kind), ["missing-file", "missing-anchor", "undefined-reference"]);
    assert.deepEqual(issues.map(({ line }) => line), [3, 3, 3]);
  });
});

test("ignores external links and recognizes duplicate-heading slugs", () => {
  const anchors = extractAnchors("# Setup\n# Setup\n");
  assert(anchors.has("setup"));
  assert(anchors.has("setup-1"));
  const text = "# Setup\n# Setup\n[web](https://example.com) [second](#setup-1)";
  const issues = checkMarkdownText({ text, filePath: "/tmp/README.md" });
  assert.deepEqual(issues, []);
});

test("reports malformed percent-encoding rather than crashing", () => {
  const issues = checkMarkdownText({ text: "[bad](docs.md#%E0%A4%A)", filePath: "/tmp/README.md" });
  assert.equal(issues[0]?.kind, "invalid-url");
});

test("ignores links and headings inside fenced and inline code", () => {
  const text = "```md\n# Example\n[not checked](missing.md)\n```\n\nInline `[also skipped](missing.md)`\n[real](#example)";
  const issues = checkMarkdownText({ text, filePath: "/tmp/README.md" });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].kind, "missing-anchor");
});
