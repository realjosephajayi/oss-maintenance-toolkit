import fs from "node:fs";
import path from "node:path";

const LINK_PATTERN = /!?\[([^\]]*)\]\(\s*(<[^>\n]*>|(?:\\.|[^\s()\\]|\([^)]*\))+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
const REFERENCE_PATTERN = /^\s{0,3}\[([^\]]+)\]:\s*(<[^>]+>|\S+)/gm;
const REFERENCE_USE_PATTERN = /!?\[([^\]]+)\]\[([^\]]*)\]/g;
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "coverage", "vendor"]);

function normalizeReference(value) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function unescapeMarkdownDestination(value) {
  return value.replace(/^<|>$/g, "").replace(/\\([\\`*_{}[\]()#+.!|>~-])/g, "$1");
}

function sourcePosition(text, offset) {
  const before = text.slice(0, offset);
  const lastNewline = before.lastIndexOf("\n");
  return { line: before.split("\n").length, column: offset - lastNewline };
}

function maskMarkdownCode(text) {
  const chars = text.split("");
  let fence = null;
  let offset = 0;
  for (const line of text.match(/[^\n]*(?:\n|$)/g) ?? []) {
    if (!line) continue;
    const content = line.replace(/\n$/, "");
    const marker = content.match(/^ {0,3}(`{3,}|~{3,})/);
    const maskLine = () => {
      for (let i = offset; i < offset + content.length; i += 1) chars[i] = " ";
    };

    if (fence) {
      maskLine();
      if (marker && marker[1][0] === fence.character && marker[1].length >= fence.length
        && new RegExp(`^ {0,3}${fence.character === "`" ? "`" : "~"}{${fence.length},}\\s*$`).test(content)) {
        fence = null;
      }
    } else if (marker) {
      maskLine();
      fence = { character: marker[1][0], length: marker[1].length };
    }
    offset += line.length;
  }

  let masked = chars.join("");
  masked = masked.replace(/(`+)([\s\S]*?)\1/g, (match) => match.replace(/[^\n]/g, " "));
  return masked;
}

export function extractMarkdownLinks(text) {
  const searchableText = maskMarkdownCode(text);
  const found = [];
  const ranges = [];
  let match;

  while ((match = LINK_PATTERN.exec(searchableText)) !== null) {
    const destination = unescapeMarkdownDestination(match[2]);
    found.push({ destination, ...sourcePosition(searchableText, match.index) });
    ranges.push([match.index, LINK_PATTERN.lastIndex]);
  }
  LINK_PATTERN.lastIndex = 0;

  const definitions = new Map();
  REFERENCE_PATTERN.lastIndex = 0;
  while ((match = REFERENCE_PATTERN.exec(searchableText)) !== null) {
    definitions.set(normalizeReference(match[1]), unescapeMarkdownDestination(match[2]));
  }

  REFERENCE_USE_PATTERN.lastIndex = 0;
  while ((match = REFERENCE_USE_PATTERN.exec(searchableText)) !== null) {
    if (ranges.some(([start, end]) => match.index >= start && match.index < end)) continue;
    const reference = normalizeReference(match[2] || match[1]);
    const destination = definitions.get(reference);
    if (destination) found.push({ destination, ...sourcePosition(searchableText, match.index) });
    else found.push({ destination: null, reference, ...sourcePosition(searchableText, match.index) });
  }

  return found.sort((a, b) => a.line - b.line || a.column - b.column);
}

function headingSlug(heading) {
  return heading
    .replace(/<[^>]*>/g, "")
    .replace(/!?(\[([^\]]*)\])\([^)]*\)/g, "$2")
    .replace(/[`*_~]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-");
}

export function extractAnchors(text) {
  const searchableText = maskMarkdownCode(text);
  const anchors = new Set();
  const used = new Map();
  const headingPattern = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/gm;
  let match;

  while ((match = headingPattern.exec(searchableText)) !== null) {
    const explicit = match[2].match(/\s*\{#([^}]+)\}\s*$/);
    const base = explicit ? explicit[1] : headingSlug(match[2]);
    const occurrence = used.get(base) ?? 0;
    used.set(base, occurrence + 1);
    anchors.add(occurrence === 0 ? base : `${base}-${occurrence}`);
  }

  for (const htmlAnchor of searchableText.matchAll(/\b(?:id|name)=["']([^"']+)["']/gi)) anchors.add(htmlAnchor[1]);
  return anchors;
}

function isExternal(destination) {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(destination);
}

function splitDestination(destination) {
  const hashAt = destination.indexOf("#");
  const hash = hashAt >= 0 ? destination.slice(hashAt + 1) : "";
  const beforeHash = hashAt >= 0 ? destination.slice(0, hashAt) : destination;
  const queryAt = beforeHash.indexOf("?");
  const pathname = queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash;
  return { pathname, fragment: decodeURIComponent(hash) };
}

function resolveFileTarget(target) {
  if (!fs.existsSync(target)) return null;
  if (fs.statSync(target).isFile()) return target;
  if (fs.statSync(target).isDirectory()) {
    for (const candidate of ["index.md", "README.md", "index.html"]) {
      const file = path.join(target, candidate);
      if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
    }
    return null;
  }
  return null;
}

export function checkMarkdownText({ text, filePath, rootDir = process.cwd() }) {
  const issues = [];
  const sourceFile = path.resolve(filePath);
  const links = extractMarkdownLinks(text);
  const anchors = extractAnchors(text);

  for (const link of links) {
    if (!link.destination) {
      issues.push({ ...link, kind: "undefined-reference", message: `Reference [${link.reference}] has no definition` });
      continue;
    }
    const rawDestination = link.destination.trim();
    if (!rawDestination || isExternal(rawDestination)) continue;

    let parsed;
    try {
      parsed = splitDestination(rawDestination);
    } catch {
      issues.push({ ...link, kind: "invalid-url", message: `Invalid encoded destination: ${rawDestination}` });
      continue;
    }

    let targetFile = sourceFile;
    if (parsed.pathname) {
      try {
        const decodedPath = decodeURIComponent(parsed.pathname);
        const resolvedPath = path.resolve(path.dirname(sourceFile), decodedPath);
        targetFile = resolvedPath === sourceFile ? sourceFile : resolveFileTarget(resolvedPath);
      } catch {
        issues.push({ ...link, kind: "invalid-url", message: `Invalid encoded destination: ${rawDestination}` });
        continue;
      }
    }

    if (!targetFile) {
      issues.push({ ...link, kind: "missing-file", message: `Target does not exist: ${parsed.pathname}` });
      continue;
    }

    if (parsed.fragment) {
      let targetAnchors = anchors;
      if (targetFile !== sourceFile) {
        try {
          targetAnchors = extractAnchors(fs.readFileSync(targetFile, "utf8"));
        } catch {
          targetAnchors = new Set();
        }
      }
      if (!targetAnchors.has(parsed.fragment)) {
        issues.push({ ...link, kind: "missing-anchor", message: `Anchor #${parsed.fragment} not found in ${path.relative(rootDir, targetFile) || path.basename(targetFile)}` });
      }
    }
  }

  return issues;
}

export function collectMarkdownFiles(directory) {
  const root = path.resolve(directory);
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) visit(path.join(current, entry.name));
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        files.push(path.join(current, entry.name));
      }
    }
  };
  visit(root);
  return files.sort();
}

export function checkFiles(files, rootDir = process.cwd()) {
  const issues = [];
  for (const filePath of files) {
    const text = fs.readFileSync(filePath, "utf8");
    for (const issue of checkMarkdownText({ text, filePath, rootDir })) issues.push({ filePath, ...issue });
  }
  return issues;
}
