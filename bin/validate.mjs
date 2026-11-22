#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import YAML from 'yaml';

const bundle = fileURLToPath(new URL('../bundle/', import.meta.url));
const config = JSON.parse(readFileSync(path.join(bundle, 'opencode.json'), 'utf8'));
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const names = directory => readdirSync(path.join(bundle, directory)).filter(f => f.endsWith('.md'));
const definitions = {};
for (const directory of ['agents', 'commands']) {
  definitions[directory] = new Map();
  for (const name of names(directory)) {
    const file = `${directory}/${name}`;
    const body = readFileSync(path.join(bundle, file), 'utf8');
    const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(body);
    check(Boolean(header), `${file}: missing frontmatter`);
    if (!header) continue;
    let parsed;
    try { parsed = YAML.parse(header[1], { uniqueKeys: true }); }
    catch (error) { errors.push(`${file}: ${error.message}`); continue; }
    definitions[directory].set(name.slice(0, -3), parsed);
    check(Boolean(parsed?.description), `${file}: missing description`);
    const seen = new Set();
    for (const rule of parsed.permissions ?? []) {
      const key = `${rule.action}:${rule.resource}`;
      check(!seen.has(key), `${file}: repeated permission ${key}`); seen.add(key);
      check(!['shell', '*'].includes(rule.action), `${file}: overrides shared shell safeguards`);
      check(['allow', 'ask', 'deny'].includes(rule.effect), `${file}: invalid effect`);
      if (parsed.mode === 'subagent') check(!(rule.action === 'subagent' && rule.effect === 'allow'), `${file}: nested delegation`);
    }
  }
}
const allAgents = new Set(['build', 'plan', 'general', 'explore', ...Object.keys(config.agents), ...definitions.agents.keys()]);
for (const name of definitions.agents.keys()) check(!config.agents[name], `Duplicate agent: ${name}`);
for (const [name, command] of definitions.commands) {
  check(!config.commands?.[name], `Duplicate command: ${name}`);
  if (command.agent) check(allAgents.has(command.agent), `${name}: unknown agent ${command.agent}`);
}
for (const match of JSON.stringify(config).matchAll(/\{file:([^}]+)\}/g)) {
  check(existsSync(path.join(bundle, match[1])), `Missing prompt: ${match[1]}`);
}
for (const instruction of config.instructions) {
  check(instruction.startsWith('.opencode/'), `Nonportable instruction: ${instruction}`);
  check(existsSync(path.join(bundle, instruction.replace(/^\.opencode\//, ''))), `Missing instruction: ${instruction}`);
}
check(config.experimental.subagent_depth === 1, 'Delegation must be shallow');
check(!config.mcp && !config.plugins, 'Machine-specific MCP/plugin configuration exported');
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Valid bundle: ${definitions.agents.size} custom roles, ${Object.keys(config.agents).length} retained agents, ${definitions.commands.size} commands.`);
