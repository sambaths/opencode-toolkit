import { install } from './install.mjs';
import { provisionRtk, rtkStatus } from './rtk.mjs';
import { RTK_TAG, RTK_VERSION } from './rtk-catalog.mjs';

export const HELP = [
  'Usage: opencode-toolkit [--project <directory>] [--dry-run] [--no-rtk] [--thinking-model <provider/model[#variant]>] [--coding-model <provider/model[#variant]>] [--compaction|--no-compaction] [--tool-output|--no-tool-output] [--usage-audit|--no-usage-audit] [--adopt-usage-audit] [--no-optimizations]',
  'Install or update: npx --yes github:sambaths/opencode-toolkit --project .',
  'Replaces matching project-local toolkit files and definitions, with backups. Unrelated files/settings are retained.',
  'Optimization profiles default ON: compaction (session model, auto, 15000 kept tokens, 15% buffer, background off; no forced agents.compaction.model), tool output caps (2000 lines/51200 bytes), and the standalone usage audit.',
  'Omitted profile flags retain saved state. Positive flags re-enable persisted opt-outs. --no-optimizations disables all three; explicit positive flags then re-enable selected profiles independent of order. Contradictory paired flags are rejected.',
  'Opt-outs remove only matching toolkit-generated values/files. Customized generated values require manual review; user-managed values and root-config conflicts are preserved and reported.',
  '--adopt-usage-audit: explicitly adopt pre-existing unmanaged usage-audit files when enabling, with normal backups. Without it, collisions fail before writes.',
  `RTK: RTK OSS v${RTK_VERSION} (Apache-2.0) is provisioned by default at <project>/.opencode/vendor/rtk/rtk (rtk.exe on Windows) from the pinned ${RTK_TAG} archive.`,
  'The archive SHA-256 is verified before in-memory extraction. The binary is never executed by the installer, no PATH entry or hook is added, and runtime behavior is not tested. Automatic RTK command rewriting stays disabled.',
  '--no-rtk: skip RTK provisioning; no RTK download is attempted and any existing RTK installation is left unchanged.',
  '--dry-run: make no toolkit or RTK writes and no RTK download; report the planned RTK path, optimization state, and local status.',
  'Model flags update only the named tier; omitted tiers retain the saved profile. Installation does not check runtime availability and configures no automatic failover.',
].join('\n');

export function parseArgs(args) {
  const options = { dryRun: false, noRtk: false };
  const selected = new Set();
  const paired = (positive, negative, key) => {
    if (selected.has(negative)) throw new Error(`Conflicting arguments: ${positive} and ${negative}`);
    selected.add(positive); options[key] = true;
  };
  const pairedOff = (positive, negative, key) => {
    if (selected.has(positive)) throw new Error(`Conflicting arguments: ${positive} and ${negative}`);
    selected.add(negative); options[key] = false;
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') return { help: true };
    else if (args[i] === '--dry-run') options.dryRun = true;
    else if (args[i] === '--no-rtk') options.noRtk = true;
    else if (args[i] === '--compaction') paired('--compaction', '--no-compaction', 'compaction');
    else if (args[i] === '--no-compaction') pairedOff('--compaction', '--no-compaction', 'compaction');
    else if (args[i] === '--tool-output') paired('--tool-output', '--no-tool-output', 'toolOutput');
    else if (args[i] === '--no-tool-output') pairedOff('--tool-output', '--no-tool-output', 'toolOutput');
    else if (args[i] === '--usage-audit') paired('--usage-audit', '--no-usage-audit', 'usageAudit');
    else if (args[i] === '--no-usage-audit') pairedOff('--usage-audit', '--no-usage-audit', 'usageAudit');
    else if (args[i] === '--adopt-usage-audit') options.adoptUsageAudit = true;
    else if (args[i] === '--no-optimizations') options.noOptimizations = true;
    else if (args[i] === '--project' && args[i + 1] && !args[i + 1].startsWith('--')) options.project = args[++i];
    else if (args[i] === '--thinking-model' && args[i + 1] && !args[i + 1].startsWith('--')) options.thinkingModel = args[++i];
    else if (args[i] === '--coding-model' && args[i + 1] && !args[i + 1].startsWith('--')) options.codingModel = args[++i];
    else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  }
  return options;
}

function toolkitLines(result, { partial = false } = {}) {
  const lines = [];
  const label = partial ? 'Toolkit installed, RTK not installed' : (result.dryRun ? 'DRY RUN' : 'Installed');
  lines.push(`${label}: ${result.project}`);
  lines.push(`Model profile: thinking ${result.models.thinking}; coding ${result.models.coding}`);
  if (result.profiles) {
    const state = value => value ? 'enabled' : 'disabled';
    lines.push(`Optimization profiles: compaction ${state(result.profiles.compaction)}; tool output ${state(result.profiles.toolOutput)}; usage audit ${state(result.profiles.usageAudit)}`);
  }
  if (result.sources) lines.push(`Optimization sources: compaction ${result.sources.compaction}; tool output ${result.sources.toolOutput}; usage audit ${result.sources.usageAudit}`);
  if (result.provenance) lines.push(`Optimization provenance: compaction ${result.provenance.compaction}; tool output ${result.provenance.toolOutput}; usage audit ${result.provenance.usageAudit}`);
  for (const notice of result.optimizationNotices ?? []) lines.push(`Optimization notice: ${notice}`);
  for (const file of result.changes) lines.push(`  ${file}`);
  if (!result.changes.length) lines.push('Already up to date.');
  if (result.backupDirectory) lines.push(`Backup: ${result.backupDirectory}`);
  lines.push(result.permissionReview);
  lines.push('Model availability is not checked during installation. No automatic failover is configured; OpenCode surfaces an unavailable model instead of silently downgrading.');
  if (!result.dryRun) lines.push('Review the shared shell policy. OpenCode reloads configuration automatically; use /reload if needed.');
  return lines;
}

function rtkInstalledLine(result) {
  const status = result.state === 'verified' ? 'verified' : 'installed';
  const proof = result.state === 'verified'
    ? 'managed file hashes verified; no download needed'
    : 'archive SHA-256 verified';
  return `RTK OSS v${result.version} ${status} at ${result.relativeBinaryPath} (${result.target}, ${result.license}; ${proof}; runtime not tested).`;
}

function rtkDryRunLine(options, project, statusFn) {
  if (options.noRtk) {
    return 'RTK: skipped by --no-rtk; no RTK download or write would occur, and any existing installation is unchanged.';
  }
  const status = statusFn({ project });
  if (status.state === 'unsupported') throw status.error;
  if (status.state === 'verified') {
    return `RTK OSS v${status.version}: existing managed install at ${status.relativeBinaryPath} would be verified; no download needed (dry run, no request).`;
  }
  if (status.state === 'stale') {
    return `RTK OSS v${status.version}: managed install at ${status.relativeBinaryPath} would be replaced after a pinned archive download (dry run, no request).`;
  }
  return `RTK OSS v${status.version}: would be downloaded and installed at ${status.relativeBinaryPath} after SHA-256 verification (dry run, no request).`;
}

export async function main(args, deps = {}) {
  const installFn = deps.installFn ?? install;
  const provision = deps.provision ?? provisionRtk;
  const statusFn = deps.statusFn ?? rtkStatus;
  const log = deps.log ?? (line => console.log(line));
  const error = deps.error ?? (line => console.error(line));
  let options;
  try {
    options = parseArgs(args);
  } catch (parseError) {
    error(`Installation failed: ${parseError.message}`);
    return 1;
  }
  if (options.help) {
    log(HELP);
    return 0;
  }

  const installOptions = {};
  if (options.project !== undefined) installOptions.project = options.project;
  if (options.thinkingModel !== undefined) installOptions.thinkingModel = options.thinkingModel;
  if (options.codingModel !== undefined) installOptions.codingModel = options.codingModel;
  if (options.compaction !== undefined) installOptions.compaction = options.compaction;
  if (options.toolOutput !== undefined) installOptions.toolOutput = options.toolOutput;
  if (options.usageAudit !== undefined) installOptions.usageAudit = options.usageAudit;
  if (options.adoptUsageAudit !== undefined) installOptions.adoptUsageAudit = options.adoptUsageAudit;
  if (options.noOptimizations !== undefined) installOptions.noOptimizations = options.noOptimizations;

  try {
    const preview = installFn({ ...installOptions, dryRun: true });
    const project = preview.project;

    if (options.dryRun) {
      const line = rtkDryRunLine(options, project, statusFn);
      for (const output of toolkitLines(preview)) log(output);
      log(line);
      return 0;
    }

    if (options.noRtk) {
      const result = installFn(installOptions);
      for (const output of toolkitLines(result)) log(output);
      log('RTK: skipped by --no-rtk; no RTK download was attempted and any existing RTK installation is unchanged.');
      return 0;
    }

    const status = statusFn({ project });
    if (status.state === 'unsupported') throw status.error;
    const result = installFn(installOptions);
    try {
      const rtk = await provision({ project, validateToolkit: () => preview });
      for (const output of toolkitLines(result)) log(output);
      log(rtkInstalledLine(rtk));
      return 0;
    } catch (rtkError) {
      for (const output of toolkitLines(result, { partial: true })) log(output);
      error(`RTK installation failed: ${rtkError.message}`);
      error('The toolkit is installed, but RTK provisioning did not complete. Use --no-rtk on the next run to install the toolkit only.');
      return 1;
    }
  } catch (failure) {
    error(`Installation failed: ${failure.message}`);
    return 1;
  }
}
