#!/usr/bin/env node
// Guardrail: fail on raw Date patterns that silently use UTC (or the
// machine's zone) for calendar dates. Use the shared time helper instead.
// Opt out for a genuine exception with a `dates-ok: <reason>` comment on the
// same line or the line above.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const CONFIG = { roots: ["js"], server: [], exempt: ["js/dates.js"], helper: "js/dates.js" };

const root = process.cwd();
const norm = (p) => relative(root, p).split(sep).join("/");
const isExempt = (rel) =>
  CONFIG.exempt.some((e) => rel === e) ||
  /(^|\/)(tests?|__tests__)\//.test(rel) ||
  /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel);

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.[cm]?[jt]sx?$/.test(name)) out.push(p);
  }
  return out;
}

// Return the text of a call's argument list starting at `open` (index of "(").
function callArgs(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return src.slice(open + 1, i);
  }
  return src.slice(open + 1);
}

const DATE_OPTS = /\b(year|month|day|weekday|hour|minute|dateStyle|timeStyle)\s*:/;
const HELP = `use the shared time helper (${CONFIG.helper})`;

const rules = [
  {
    re: /toISOString\(\)\s*\.\s*(slice\(\s*0\s*,\s*10\s*\)|substring\(\s*0\s*,\s*10\s*\)|split\(\s*['"]T['"]\s*\)\s*\[\s*0\s*\])/g,
    msg: `toISOString() date slicing gives the UTC date (tomorrow after 8 PM ET); ${HELP}`,
  },
  {
    re: /\.(toLocaleDateString|toLocaleTimeString)\s*\(/g,
    check: (src, m) => !/timeZone/.test(callArgs(src, m.index + m[0].length - 1)),
    msg: `toLocaleDateString/toLocaleTimeString without timeZone uses the machine's zone; pass timeZone or ${HELP}`,
  },
  {
    re: /\.toLocaleString\s*\(/g,
    check: (src, m) => {
      const args = callArgs(src, m.index + m[0].length - 1);
      return DATE_OPTS.test(args) && !/timeZone/.test(args);
    },
    msg: `toLocaleString with date options but no timeZone uses the machine's zone; ${HELP}`,
  },
  {
    re: /new Date\(\s*['"`]\d{4}-\d{2}-\d{2}['"`]\s*\)/g,
    msg: `new Date('YYYY-MM-DD') is UTC midnight (the previous day in ET); ${HELP}`,
  },
  {
    re: /\.(getDate|getDay|getHours|getMonth|getFullYear|setHours)\s*\(/g,
    serverOnly: true,
    msg: `server code runs in UTC, so local getters/setHours give UTC calendar values; ${HELP}`,
  },
];

const files = CONFIG.roots.flatMap((r) => {
  try { return walk(join(root, r), []); } catch { return []; }
});
const problems = [];
for (const file of files) {
  const rel = norm(file);
  if (isExempt(rel)) continue;
  const isServer = CONFIG.server.some((s) => rel.startsWith(s));
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  for (const rule of rules) {
    if (rule.serverOnly && !isServer) continue;
    for (const m of src.matchAll(rule.re)) {
      if (rule.check && !rule.check(src, m)) continue;
      const line = src.slice(0, m.index).split("\n").length;
      const here = lines[line - 1] || "";
      const prev = lines[line - 2] || "";
      if (/dates-ok/.test(here) || /dates-ok/.test(prev)) continue;
      const trimmed = here.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
      problems.push(`${rel}:${line}  ${rule.msg}`);
    }
  }
}
if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} raw date pattern(s). See "Dates and time zones" in AGENTS.md/CLAUDE.md.`);
  process.exit(1);
}
console.log(`check:dates ok (${files.length} files)`);
