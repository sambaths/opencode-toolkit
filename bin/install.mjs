#!/usr/bin/env node
import { install } from '../lib/install.mjs';

try {
  const options = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') {
      console.log([
        'Usage: opencode-toolkit [--project <directory>] [--dry-run] [--thinking-model <provider/model[#variant]>] [--coding-model <provider/model[#variant]>]',
        'Replaces matching project-local toolkit files and definitions, with backups. Unrelated files/settings are retained.',
        'Model flags update only the named tier; omitted tiers retain the saved profile. Installation does not check runtime availability and configures no automatic failover.',
      ].join('\n'));
      process.exit(0);
    } else if (args[i] === '--dry-run') options.dryRun = true;
    else if (args[i] === '--project' && args[i + 1] && !args[i + 1].startsWith('--')) options.project = args[++i];
    else if (args[i] === '--thinking-model' && args[i + 1] && !args[i + 1].startsWith('--')) options.thinkingModel = args[++i];
    else if (args[i] === '--coding-model' && args[i + 1] && !args[i + 1].startsWith('--')) options.codingModel = args[++i];
    else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  }
  const result = install(options);
  console.log(`${result.dryRun ? 'DRY RUN' : 'Installed'}: ${result.project}`);
  console.log(`Model profile: thinking ${result.models.thinking}; coding ${result.models.coding}`);
  for (const file of result.changes) console.log(`  ${file}`);
  if (!result.changes.length) console.log('Already up to date.');
  if (result.backupDirectory) console.log(`Backup: ${result.backupDirectory}`);
  console.log(result.permissionReview);
  console.log('Model availability is not checked during installation. No automatic failover is configured; OpenCode surfaces an unavailable model instead of silently downgrading.');
  console.log('Review the shared shell policy. OpenCode reloads configuration automatically; use /reload if needed.');
} catch (error) {
  console.error(`Installation failed: ${error.message}`);
  process.exitCode = 1;
}
