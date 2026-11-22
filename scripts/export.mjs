import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Explicit allowlist: never copy a whole project or its .opencode directory.
const source = path.resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('Usage: node scripts/export.mjs <source-.opencode-directory>');
const destination = fileURLToPath(new URL('../bundle/', import.meta.url));
const config = JSON.parse(readFileSync(path.join(source, 'opencode.json'), 'utf8'));
delete config.mcp;
const commands = [
  'build-fix', 'code-review', 'e2e', 'go-build', 'go-review', 'go-test',
  'orchestrate', 'plan', 'refactor-clean', 'rust-build', 'rust-review', 'rust-test',
  'security-scan', 'security', 'tdd', 'test-coverage', 'update-codemaps',
  'update-docs', 'verify', 'council', 'harness-audit', 'setup-pm', 'skill-create',
];
const files = [
  ...readdirSync(path.join(source, 'agents')).filter(f => f.endsWith('.md')).map(f => `agents/${f}`),
  ...commands.map(f => `commands/${f}.md`),
  'instructions/INSTRUCTIONS.md', 'tools/evaluate-skill.mjs',
  'tools/evaluate-skill.test.mjs', 'tools/harness-config.test.mjs',
  ...[...JSON.stringify(config).matchAll(/\{file:([^}]+)\}/g)].map(m => m[1]),
];
for (const relative of new Set(files)) {
  const output = path.join(destination, relative);
  mkdirSync(path.dirname(output), { recursive: true });
  copyFileSync(path.join(source, relative), output);
}
mkdirSync(destination, { recursive: true });
writeFileSync(path.join(destination, 'opencode.json'), `${JSON.stringify(config, null, 2)}\n`);
console.log(`Exported ${new Set(files).size + 1} allowlisted files; machine MCP settings excluded.`);
