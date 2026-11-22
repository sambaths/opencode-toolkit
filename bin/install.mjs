#!/usr/bin/env node
import { install } from '../lib/install.mjs';

try {
  const options = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage: opencode-toolkit [--project <directory>] [--dry-run]\nReplaces matching project-local toolkit files and definitions, with backups. Unrelated files/settings are retained.');
      process.exit(0);
    } else if (args[i] === '--dry-run') options.dryRun = true;
    else if (args[i] === '--project' && args[i + 1] && !args[i + 1].startsWith('--')) options.project = args[++i];
    else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  }
  const result = install(options);
  console.log(`${result.dryRun ? 'DRY RUN' : 'Installed'}: ${result.project}`);
  for (const file of result.changes) console.log(`  ${file}`);
  if (!result.changes.length) console.log('Already up to date.');
  if (result.backupDirectory) console.log(`Backup: ${result.backupDirectory}`);
  console.log(result.permissionReview);
  console.log('Review the shared shell policy. OpenCode reloads configuration automatically; use /reload if needed.');
} catch (error) {
  console.error(`Installation failed: ${error.message}`);
  process.exitCode = 1;
}
