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
const curatedSkills = ['toolkit-grilling', 'toolkit-handoff', 'toolkit-questionnaire', 'toolkit-diagnosing-bugs', 'toolkit-tdd', 'toolkit-retro'];
const skillNames = new Set();
const skillRoot = path.join(bundle, 'skills');
for (const id of curatedSkills) {
  const file = path.join(skillRoot, id, 'SKILL.md');
  check(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) && id.length <= 64, `Nonportable skill ID: ${id}`);
  check(existsSync(file), `Missing curated skill: ${id}`);
  if (!existsSync(file)) continue;
  const content = readFileSync(file, 'utf8');
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  check(Boolean(header), `${id}: missing skill frontmatter`);
  if (!header) continue;
  try {
    const parsed = YAML.parse(header[1], { uniqueKeys: true });
    check(typeof parsed?.name === 'string' && !!parsed.name.trim(), `${id}: missing display name`);
    check(typeof parsed?.description === 'string' && !!parsed.description.trim(), `${id}: missing discovery description`);
    check(!skillNames.has(parsed?.name), `${id}: duplicate skill display name`); skillNames.add(parsed?.name);
    check(parsed?.metadata?.['opencode/autoinvoke'] !== false && parsed?.['disable-model-invocation'] !== true, `${id}: automatic discovery disabled`);
    // V2 IDs come from directory names, not frontmatter display names.
    for (const match of content.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const link = match[1]; if (/^(?:https?:|mailto:|#)/.test(link)) continue;
      const target = path.resolve(path.dirname(file), link.split('#')[0]);
      check(target.startsWith(`${skillRoot}${path.sep}`) && existsSync(target), `${id}: missing/nonportable local reference ${link}`);
    }
  } catch (error) { errors.push(`${id}: ${error.message}`); }
}
if (existsSync(skillRoot)) {
  for (const entry of readdirSync(skillRoot, { withFileTypes: true })) {
    check(!entry.isSymbolicLink(), `Symlinked skill artifact: ${entry.name}`);
    if (entry.isDirectory()) check(curatedSkills.includes(entry.name), `Unexpected skill directory: ${entry.name}`);
  }
}
try {
  const provenance = JSON.parse(readFileSync(path.join(skillRoot, 'provenance.json'), 'utf8'));
  check(provenance.repository === 'https://github.com/mattpocock/skills' && provenance.commit === 'abeeaf95660ba9e8b7c753eb38f441ca707a8823', 'Unrecognized curated skill provenance');
  check(provenance.license === 'MIT' && provenance.runtimeDependencies?.length === 0, 'Curated skills must remain dependency-free MIT content');
  const ids = provenance.skills.map(skill => skill.id);
  check(new Set(ids).size === curatedSkills.length && ids.length === curatedSkills.length && curatedSkills.every(id => ids.includes(id)), 'Incomplete/duplicate curated skill provenance');
  for (const skill of provenance.skills) {
    check(skill.file === `${skill.id}/SKILL.md` && existsSync(path.join(skillRoot, skill.file)), `Invalid skill provenance reference: ${skill.id}`);
    check(Array.isArray(skill.sources) && skill.sources.length > 0 && skill.sources.every(source => typeof source === 'string' && source.startsWith('skills/') && !source.split('/').includes('..')), `Invalid upstream source references: ${skill.id}`);
  }
  check(provenance.licenseFile === 'LICENSE.mattpocock.txt', 'Unexpected upstream license path');
  const license = readFileSync(path.join(skillRoot, 'LICENSE.mattpocock.txt'), 'utf8');
  check(license.includes('Copyright (c) 2026 Matt Pocock') && license.includes('Permission is hereby granted, free of charge'), 'Missing upstream MIT notice');
} catch (error) { errors.push(`Skill provenance/license: ${error.message}`); }
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
for (const file of ['tools/task-state.mjs', 'tools/task-state.test.mjs', 'tools/task-state.md']) {
  check(existsSync(path.join(bundle, file)), `Missing local ledger artifact: ${file}`);
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Valid bundle: ${definitions.agents.size} custom roles, ${Object.keys(config.agents).length} retained agents, ${definitions.commands.size} commands, ${curatedSkills.length} curated skills.`);
