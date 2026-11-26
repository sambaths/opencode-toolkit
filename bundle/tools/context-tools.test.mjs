import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const tool = fileURLToPath(new URL('./context-tools.mjs', import.meta.url))
const source = readFileSync(tool, 'utf8')
const tempBase = existsSync('/tmp/opencode') ? '/tmp/opencode' : os.tmpdir()

function fixture(t) {
  const directory = mkdtempSync(path.join(tempBase, 'context-tools-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

function run(args, input) {
  return spawnSync(process.execPath, [tool, ...args], {
    encoding: 'utf8', input, maxBuffer: 4 * 1024 * 1024,
  })
}

function write(root, relative, content) {
  const file = path.join(root, relative)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
}

function snapshot(root) {
  const entries = []
  const walk = (directory, relative) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const next = path.join(relative, entry.name)
      entries.push(next)
      if (entry.isDirectory()) walk(path.join(directory, entry.name), next)
    }
  }
  walk(root, '')
  return entries
}

function plan(overrides = {}) {
  return {
    id: 'TOOLS',
    revision: 'r1',
    goal: 'Ship a bounded context pack',
    constraints: ['read only', 'no writes'],
    steps: ['read only the selected ranges'],
    acceptance: ['A1 plan content is preserved', 'A2 ranges are inclusive'],
    verification: ['node --test context-tools.test.mjs'],
    ...overrides,
  }
}

function packetObject(planOverrides = {}, selections = []) {
  return { plan: plan(planOverrides), selections }
}

function packet(planOverrides = {}, selections = []) {
  return JSON.stringify(packetObject(planOverrides, selections))
}

function audit(root, extra = []) {
  return run(['audit', '--root', root, ...extra])
}

test('audit reports UTF-8 bytes, sorted files, determinism, and hashed repetition', t => {
  const root = fixture(t)
  const paragraph = 'This repeated paragraph is intentionally long enough to be nontrivial and identical across two prompt source files.'
  write(root, 'instructions/a.md', `# A\n\n${paragraph}\n`)
  write(root, 'agents/b.md', `${paragraph}\n`)
  write(root, 'prompts/agents/c.txt', 'short unique text\n')
  write(root, 'prompts/commands/none.txt', 'é'.repeat(10))

  const first = audit(root)
  assert.equal(first.status, 0, first.stderr)
  const report = JSON.parse(first.stdout)
  assert.deepEqual(report.files.map(file => file.path), [
    'agents/b.md', 'instructions/a.md', 'prompts/agents/c.txt', 'prompts/commands/none.txt',
  ])
  assert.equal(report.total.bytes, report.files.reduce((sum, file) => sum + file.bytes, 0))
  assert.equal(report.files.find(file => file.path === 'prompts/commands/none.txt').bytes, 20)
  assert.match(report.units, /UTF-8 bytes \(not tokens\)/)
  assert.ok(report.scope.includes('instructions/*.md'))
  assert.ok(report.scope.includes('prompts/commands/*.txt'))
  assert.ok(report.repetition.groups.some(group => group.count === 2 && group.opportunity_bytes > 0 && /^[a-f0-9]{64}$/.test(group.sha256)))
  assert.ok(!first.stdout.includes(paragraph), 'audit must not print prompt text')
  assert.equal(audit(root).stdout, first.stdout)
})

test('audit ignores unknown and sensitive sources, accepts absent directories, and refuses links', t => {
  const root = fixture(t)
  write(root, 'instructions/keep.md', '# Keep\n')
  write(root, 'agents/.env.md', 'SECRET\n')
  write(root, 'agents/credentials.md', 'SECRET\n')
  write(root, 'agents/credentials.json', 'SECRET\n')
  write(root, 'tools/ignored.md', '# ignored\n')
  write(root, '.git/ignored.md', '# ignored\n')
  write(root, 'node_modules/ignored.md', '# ignored\n')
  write(root, 'README.md', '# ignored\n')

  const clean = audit(root)
  assert.equal(clean.status, 0, clean.stderr)
  const report = JSON.parse(clean.stdout)
  assert.deepEqual(report.files.map(file => file.path), ['instructions/keep.md'])
  assert.equal(report.skipped.sensitive_files, 2)
  assert.equal(report.total.partial, false)

  symlinkSync(path.join(root, 'README.md'), path.join(root, 'agents/link.md'))
  const linked = audit(root)
  assert.notEqual(linked.status, 0)
  assert.match(linked.stderr, /symlinked prompt source/)
  assert.equal(linked.stdout, '')
  unlinkSync(path.join(root, 'agents/link.md'))

  linkSync(path.join(root, 'instructions/keep.md'), path.join(root, 'agents/hard.md'))
  const hard = audit(root)
  assert.notEqual(hard.status, 0)
  assert.match(hard.stderr, /hard-linked prompt source/)
  unlinkSync(path.join(root, 'agents/hard.md'))

  write(root, 'agents/binary.md', 'TEXT\0TEXT')
  const binary = audit(root)
  assert.notEqual(binary.status, 0)
  assert.match(binary.stderr, /binary content refused/)
})

test('audit caps files, repetition reads, and marks partial results honestly', t => {
  const root = fixture(t)
  for (let index = 0; index < 8; index++) write(root, `instructions/f${index}.md`, `unique ${index}\n`)
  write(root, 'agents/large.md', 'x'.repeat(1000))

  const report = JSON.parse(audit(root, ['--max-files', '3']).stdout)
  assert.equal(report.files.length, 3)
  assert.ok(report.omitted.files >= 6)
  assert.equal(report.truncated.files, true)
  assert.equal(report.total.partial, true)

  const large = JSON.parse(audit(root, ['--max-file-bytes', '10']).stdout)
  const entry = large.files.find(file => file.path === 'agents/large.md')
  assert.equal(entry.examined, false)
  assert.equal(entry.bytes, 1000)
  assert.equal(entry.lines, null)
  assert.equal(large.truncated.repetition, true)
  assert.equal(large.truncated.complete, false)
})

test('audit keeps its default and configured output bounded', t => {
  const root = fixture(t)
  for (let index = 0; index < 210; index++) write(root, `instructions/file-${String(index).padStart(3, '0')}.md`, 'small source\n')

  const normal = audit(root)
  assert.equal(normal.status, 0, normal.stderr)
  assert.ok(Buffer.byteLength(normal.stdout) <= 64 * 1024)
  const report = JSON.parse(normal.stdout)
  assert.equal(report.files.length, 200)
  assert.ok(report.omitted.files >= 10)
  assert.equal(report.truncated.files, true)

  const compact = audit(root, ['--max-output-bytes', '2000'])
  assert.equal(compact.status, 0, compact.stderr)
  assert.ok(Buffer.byteLength(compact.stdout) <= 2000)
  const bounded = JSON.parse(compact.stdout)
  assert.equal(bounded.output.truncated, true)
  assert.ok(bounded.output.omitted.files + bounded.output.omitted.largest + bounded.output.omitted.repetition > 0)
})

test('audit treats a capped repeated-paragraph occurrence list as incomplete', t => {
  const root = fixture(t)
  const paragraph = 'Repeated fixture paragraph with more than eighty characters, deliberately identical in all twenty-one occurrences.'
  write(root, 'instructions/a.md', Array(21).fill(paragraph).join('\n\n'))
  const result = audit(root)
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.repetition.groups.length, 1)
  const group = report.repetition.groups[0]
  assert.equal(group.count, 21)
  assert.equal(group.occurrences.length, 20)
  assert.equal(group.occurrences_truncated, true)
  assert.equal(report.repetition.truncated, true)
  assert.equal(report.truncated.repetition, true)
  assert.equal(report.truncated.complete, false)
})

test('audit and pack refuse sensitive roots and sensitive ancestors before reading', t => {
  const parent = fixture(t)
  const sensitiveRoots = ['.ssh', '.aws', '.git/project', '.env/project', '.envrc/project', '.envrc.local/project', 'secrets/project', 'credentials/project']
  for (const relative of sensitiveRoots) {
    const root = path.join(parent, relative)
    write(root, 'instructions/a.md', 'SENSITIVE_ROOT_SENTINEL\n')
    write(root, 'src/a.txt', 'SENSITIVE_SOURCE_SENTINEL\n')
  }
  for (const relative of sensitiveRoots) {
    const root = path.join(parent, relative)
    const cases = [
      ['audit', ['audit', '--root', root], undefined],
      ['pack', ['pack', '--root', root], packet({}, [{ path: 'src/a.txt', start: 1, end: 1 }])],
    ]
    for (const [command, args, input] of cases) {
      const result = run(args, input)
      assert.notEqual(result.status, 0, `${command} ${relative}`)
      assert.equal(result.stdout, '', `${command} ${relative}`)
      assert.match(result.stderr, /sensitive root/i, `${command} ${relative}`)
      assert.ok(!result.stderr.includes('SENSITIVE_ROOT_SENTINEL'))
      assert.ok(!result.stderr.includes('SENSITIVE_SOURCE_SENTINEL'))
    }
  }
})

test('audit handles an empty tree transparently', t => {
  const root = fixture(t)
  const result = audit(root)
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.deepEqual(report.files, [])
  assert.deepEqual(report.total, { files: 0, bytes: 0, partial: false })
  assert.deepEqual(report.repetition.groups, [])
  assert.equal(report.truncated.complete, true)
})

test('pack emits the supplied plan and selected inclusive line ranges only', t => {
  const root = fixture(t)
  write(root, 'src/a.mjs', 'alpha line\nbeta line\ngamma line\ndelta line\n')
  const input = packet({
    scope: ['src only'],
    ownership: ['writer: developer'],
    dependencies: ['none'],
    risks: ['fixture only'],
    budget: { maxRepairs: 2, maxSteps: 3 },
  }, [{ path: 'src/a.mjs', start: 2, end: 3 }])
  const before = snapshot(root)
  const result = run(['pack', '--root', root], input)
  assert.equal(result.status, 0, result.stderr)
  for (const value of [
    'TOOLS', 'r1', 'Ship a bounded context pack', 'read only', 'no writes',
    'read only the selected ranges', 'A1 plan content is preserved', 'A2 ranges are inclusive',
    'node --test context-tools.test.mjs', 'src only', 'writer: developer', 'Dependencies:\n- none',
    'fixture only', '{"maxRepairs":2,"maxSteps":3}',
  ]) assert.ok(result.stdout.includes(value), value)
  assert.match(result.stdout, /Pack status: COMPLETE/)
  assert.match(result.stdout, /2: beta line/)
  assert.match(result.stdout, /3: gamma line/)
  assert.doesNotMatch(result.stdout, /1: alpha line/)
  assert.doesNotMatch(result.stdout, /4: delta line/)
  assert.match(result.stdout, /no files were written/)
  assert.deepEqual(snapshot(root), before)
})

test('pack fails clearly on an oversized plan instead of trimming it', t => {
  const root = fixture(t)
  write(root, 'src/a.txt', 'one\n')
  const input = packet({ goal: 'detail '.repeat(100) }, [{ path: 'src/a.txt', start: 1, end: 1 }])
  const result = run(['pack', '--root', root, '--max-plan-bytes', '200'], input)
  assert.notEqual(result.status, 0)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /max-plan-bytes/)
})

test('pack marks over-limit, out-of-range, and over-byte selections unfulfilled', t => {
  const root = fixture(t)
  write(root, 'src/a.txt', 'first line\nsecond line\nthird line\nfourth line\n')

  const lines = run(['pack', '--root', root, '--max-excerpt-lines', '2'], packet({}, [{ path: 'src/a.txt', start: 1, end: 4 }]))
  assert.equal(lines.status, 1)
  assert.match(lines.stdout, /Pack status: UNFULFILLED \(1\)/)
  assert.match(lines.stdout, /exceeds --max-excerpt-lines 2/)
  assert.ok(!lines.stdout.includes('1: first line'))

  const bytes = run(['pack', '--root', root, '--max-excerpt-bytes', '5'], packet({}, [{ path: 'src/a.txt', start: 1, end: 1 }]))
  assert.equal(bytes.status, 1)
  assert.match(bytes.stdout, /exceeds --max-excerpt-bytes 5/)
  assert.ok(!bytes.stdout.includes('1: first line'))

  const range = run(['pack', '--root', root], packet({}, [{ path: 'src/a.txt', start: 9, end: 10 }]))
  assert.equal(range.status, 1)
  assert.match(range.stdout, /start 9 exceeds file line count 4/)
  assert.ok(!range.stdout.includes('1: first line'))
})

test('pack reports a total-budget omission without silently cutting the excerpt', t => {
  const root = fixture(t)
  write(root, 'big.txt', `${'X'.repeat(200)}\n`.repeat(5))
  const planOnly = run(['pack', '--root', root], packet({}, []))
  assert.equal(planOnly.status, 0, planOnly.stderr)
  const limit = Buffer.byteLength(planOnly.stdout) + 300
  const result = run(['pack', '--root', root, '--max-total-bytes', String(limit)], packet({}, [{ path: 'big.txt', start: 1, end: 5 }]))
  assert.equal(result.status, 1)
  assert.ok(Buffer.byteLength(result.stdout) <= limit)
  assert.match(result.stdout, /Pack status: UNFULFILLED/)
  assert.match(result.stdout, /total pack exceeds --max-total-bytes/)
  assert.ok(!result.stdout.includes('X'.repeat(200)))
})

test('pack validates schema, ranges, stdin, and arguments', t => {
  const root = fixture(t)
  write(root, 'src/a.txt', 'one\n')
  const invalid = [
    ['{', /invalid JSON/],
    [JSON.stringify({ plan: { id: 'P', revision: 'r1', goal: 'g', constraints: ['c'], steps: ['s'], verification: ['v'] }, selections: [] }), /plan\.acceptance/],
    [JSON.stringify({ ...packetObject(), extra: true }), /unknown packet field/],
    [packet({ extra: 'x' }), /unknown plan field/],
    [JSON.stringify({ ...packetObject(), selections: [{ path: 'src/a.txt', start: 1, end: 1, reason: 'x' }] }), /unknown selection field/],
    [packet({}, [{ path: 'src/a.txt', start: 0, end: 1 }]), /integer from 1 to 10000000/],
    [packet({}, [{ path: 'src/a.txt', start: 3, end: 2 }]), /start must not exceed end/],
  ]
  for (const [input, pattern] of invalid) {
    const result = run(['pack', '--root', root], input)
    assert.notEqual(result.status, 0, input)
    assert.equal(result.stdout, '', input)
    assert.match(result.stderr, pattern)
  }

  const tooMany = run(['pack', '--root', root, '--max-selections', '1'], packet({}, [
    { path: 'src/a.txt', start: 1, end: 1 }, { path: 'src/a.txt', start: 1, end: 1 },
  ]))
  assert.notEqual(tooMany.status, 0)
  assert.match(tooMany.stderr, /max-selections/)

  const tooMuchInput = run(['pack', '--root', root, '--max-input-bytes', '10'], packet({}, []))
  assert.notEqual(tooMuchInput.status, 0)
  assert.match(tooMuchInput.stderr, /stdin exceeds/)

  const help = run([], packet({}, []))
  assert.equal(help.status, 0)
  assert.match(help.stdout, /Usage:/)
  for (const args of [['audit'], ['pack']]) {
    const result = run(args, packet({}, []))
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /usage:/)
  }
  for (const args of [
    ['audit', '--root', root, '--max-files', '0'],
    ['audit', '--root', root, '--max-files', '1', '--max-files', '2'],
    ['audit', '--root', root, '--unknown', '1'],
    ['pack', '--root', root, '--max-input-bytes', 'nope'],
  ]) {
    const result = run(args, packet({}, []))
    assert.notEqual(result.status, 0, args.join(' '))
    assert.match(result.stderr, /positive integer|duplicate option|unknown option/)
  }
})

test('pack refuses unsafe selections before returning their content', t => {
  const parent = fixture(t)
  const root = path.join(parent, 'project')
  mkdirSync(root)
  write(root, 'ok.txt', 'SAFE_OK\n')
  write(root, '.env', 'TOP_SECRET_VALUE\n')
  write(root, '.envrc', 'ENVRC_SECRET_VALUE\n')
  write(root, '.envrc.local', 'ENVRC_LOCAL_SECRET_VALUE\n')
  write(root, 'auth/config.txt', 'AUTH_SEGMENT_SECRET\n')
  write(root, 'secret/config.txt', 'SECRET_SEGMENT_SECRET\n')
  write(root, 'credential/config.txt', 'CREDENTIAL_SEGMENT_SECRET\n')
  write(root, 'auth.json', 'AUTH_SECRET\n')
  write(root, 'id_rsa', 'RSA_SECRET\n')
  write(root, 'server.pem', 'PEM_SECRET\n')
  write(root, '.ssh/config', 'SSH_SECRET\n')
  write(root, 'bin.dat', 'BINARY_SECRET\0tail')
  write(root, 'huge.txt', 'HUGE_SECRET'.repeat(20))
  write(root, 'dir/inside.txt', 'DIR_SECRET\n')
  const outside = path.join(parent, 'outside.txt')
  writeFileSync(outside, 'OUTSIDE_SECRET\n')
  symlinkSync(outside, path.join(root, 'sym.txt'))
  linkSync(outside, path.join(root, 'hard.txt'))

  const selections = [
    { path: 'ok.txt', start: 1, end: 1 },
    { path: '../outside.txt', start: 1, end: 1 },
    { path: '/etc/passwd', start: 1, end: 1 },
    { path: '.env', start: 1, end: 1 },
    { path: '.envrc', start: 1, end: 1 },
    { path: '.envrc.local', start: 1, end: 1 },
    { path: 'auth/config.txt', start: 1, end: 1 },
    { path: 'secret/config.txt', start: 1, end: 1 },
    { path: 'credential/config.txt', start: 1, end: 1 },
    { path: 'auth.json', start: 1, end: 1 },
    { path: 'id_rsa', start: 1, end: 1 },
    { path: 'server.pem', start: 1, end: 1 },
    { path: '.ssh/config', start: 1, end: 1 },
    { path: 'sym.txt', start: 1, end: 1 },
    { path: 'hard.txt', start: 1, end: 1 },
    { path: 'bin.dat', start: 1, end: 1 },
    { path: 'huge.txt', start: 1, end: 1 },
    { path: 'dir', start: 1, end: 1 },
    { path: '.npmrc.', start: 1, end: 1 },
    { path: '.. ', start: 1, end: 1 },
    { path: 'C:\\outside.txt', start: 1, end: 1 },
    { path: '\\\\server\\share\\outside.txt', start: 1, end: 1 },
  ]
  const result = run(['pack', '--root', root, '--max-file-bytes', '64'], packet({}, selections))
  assert.equal(result.status, 1)
  assert.match(result.stdout, /Pack status: UNFULFILLED/)
  assert.match(result.stdout, /SAFE_OK/)
  for (const secret of ['TOP_SECRET_VALUE', 'ENVRC_SECRET_VALUE', 'ENVRC_LOCAL_SECRET_VALUE', 'AUTH_SEGMENT_SECRET', 'SECRET_SEGMENT_SECRET', 'CREDENTIAL_SEGMENT_SECRET', 'AUTH_SECRET', 'RSA_SECRET', 'PEM_SECRET', 'SSH_SECRET', 'BINARY_SECRET', 'HUGE_SECRET', 'OUTSIDE_SECRET', 'DIR_SECRET', 'root:x:']) {
    assert.ok(!result.stdout.includes(secret), secret)
  }
  for (const reason of [
    /traversal or non-canonical path refused/, /absolute path refused/, /sensitive path refused/, /Windows aliases/,
    /symlink path component refused/, /hard-linked file refused/, /binary content refused/,
    /exceeds 64-byte limit/, /not a regular file/,
  ]) assert.match(result.stdout, reason)

  const linkedRoot = path.join(parent, 'linked-root')
  symlinkSync(root, linkedRoot)
  const linked = audit(linkedRoot)
  assert.notEqual(linked.status, 0)
  assert.match(linked.stderr, /symlinked root/)
})

test('POSIX pack normalizes backslash selections once before symlink traversal and reads', { skip: process.platform === 'win32' }, t => {
  const parent = fixture(t)
  const root = path.join(parent, 'project')
  const outside = path.join(parent, 'outside')
  mkdirSync(root)
  mkdirSync(outside)
  writeFileSync(path.join(outside, 'link.txt'), 'OUTSIDE_BACKSLASH_SENTINEL\n')
  write(root, 'dir\\link.txt', 'POSIX_BACKSLASH_DECOY\n')
  symlinkSync(outside, path.join(root, 'dir'), 'dir')

  const result = run(['pack', '--root', root], packet({}, [{ path: 'dir\\link.txt', start: 1, end: 1 }]))
  assert.equal(result.status, 1)
  assert.match(result.stdout, /symlink path component refused/)
  assert.ok(!result.stdout.includes('OUTSIDE_BACKSLASH_SENTINEL'))
  assert.ok(!result.stdout.includes('POSIX_BACKSLASH_DECOY'))
})

test('audit and pack treat .envrc files and directories as sensitive', t => {
  const root = fixture(t)
  write(root, 'agents/.envrc', 'ENVRC_AGENT_SECRET\n')
  write(root, '.envrc/project/file.txt', 'ENVRC_DIRECTORY_SECRET\n')
  const report = JSON.parse(audit(root).stdout)
  assert.deepEqual(report.files, [])
  assert.ok(!JSON.stringify(report).includes('ENVRC_AGENT_SECRET'))
  assert.ok(!JSON.stringify(report).includes('ENVRC_DIRECTORY_SECRET'))

  const result = run(['pack', '--root', root], packet({}, [
    { path: '.envrc', start: 1, end: 1 },
    { path: '.envrc/project/file.txt', start: 1, end: 1 },
  ]))
  assert.equal(result.status, 1)
  assert.match(result.stdout, /sensitive path refused/)
  assert.ok(!result.stdout.includes('ENVRC_AGENT_SECRET'))
  assert.ok(!result.stdout.includes('ENVRC_DIRECTORY_SECRET'))

  const parent = fixture(t)
  const sensitiveRoot = path.join(parent, '.envrc/project')
  write(sensitiveRoot, 'instructions/a.md', 'ENVRC_ROOT_SECRET\n')
  const refused = audit(sensitiveRoot)
  assert.notEqual(refused.status, 0)
  assert.match(refused.stderr, /sensitive root/i)
  assert.ok(!refused.stderr.includes('ENVRC_ROOT_SECRET'))
})

test('POSIX pack reads stay anchored to the opened root during a parent-swap race', { skip: process.platform === 'win32' }, t => {
  const parent = fixture(t)
  const root = path.join(parent, 'project')
  const source = path.join(root, 'src')
  const held = path.join(parent, 'held-src')
  const external = path.join(parent, 'external-src')
  mkdirSync(source, { recursive: true })
  writeFileSync(path.join(source, 'a.txt'), 'ANCHORED_ORIGINAL\n')
  mkdirSync(external)
  writeFileSync(path.join(external, 'a.txt'), 'EXTERNAL_RACE_CANARY\n')
  const hook = path.join(parent, 'swap-hook.cjs')
  writeFileSync(hook, `
    const fs = require('node:fs');
    const original = fs.openSync;
    let swapped = false;
    fs.openSync = function(file, flags, mode) {
      if (!swapped && typeof file === 'string' && /\\/a\\.txt$/.test(file) &&
          (file.includes('/proc/self/fd/') || file.includes('/dev/fd/'))) {
        swapped = true;
        fs.renameSync(${JSON.stringify(source)}, ${JSON.stringify(held)});
        fs.symlinkSync(${JSON.stringify(external)}, ${JSON.stringify(source)}, 'dir');
      }
      return original.call(fs, file, flags, mode);
    };
    require('node:module').syncBuiltinESMExports();
  `)
  const env = { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ${hook}`.trim() }
  const result = spawnSync(process.execPath, [tool, 'pack', '--root', root], {
    encoding: 'utf8', env, input: packet({}, [{ path: 'src/a.txt', start: 1, end: 1 }]),
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /ANCHORED_ORIGINAL/)
  assert.ok(!result.stdout.includes('EXTERNAL_RACE_CANARY'))
  assert.equal(readFileSync(path.join(held, 'a.txt'), 'utf8'), 'ANCHORED_ORIGINAL\n')
})

test('POSIX root open stays anchored through an ancestor-symlink race', { skip: process.platform === 'win32' }, t => {
  const parent = fixture(t)
  const grand = path.join(parent, 'grand')
  const ancestor = path.join(grand, 'ancestor')
  const root = path.join(ancestor, 'project')
  const held = path.join(parent, 'held-grand')
  const external = path.join(parent, 'external')
  mkdirSync(path.join(root, 'src'), { recursive: true })
  writeFileSync(path.join(root, 'src/a.txt'), 'ANCESTOR_ORIGINAL\n')
  mkdirSync(path.join(external, 'ancestor/project/src'), { recursive: true })
  writeFileSync(path.join(external, 'ancestor/project/src/a.txt'), 'ANCESTOR_EXTERNAL_CANARY\n')
  const hook = path.join(parent, 'ancestor-hook.cjs')
  writeFileSync(hook, `
    const fs = require('node:fs');
    const original = fs.openSync;
    let swapped = false;
    fs.openSync = function(file, flags, mode) {
      if (!swapped && typeof file === 'string' && file.endsWith('/project')) {
        swapped = true;
        fs.renameSync(${JSON.stringify(grand)}, ${JSON.stringify(held)});
        fs.symlinkSync(${JSON.stringify(external)}, ${JSON.stringify(grand)}, 'dir');
      }
      return original.call(fs, file, flags, mode);
    };
    require('node:module').syncBuiltinESMExports();
  `)
  const env = { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ${hook}`.trim() }
  const result = spawnSync(process.execPath, [tool, 'pack', '--root', root], {
    encoding: 'utf8', env, input: packet({}, [{ path: 'src/a.txt', start: 1, end: 1 }]),
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /ANCESTOR_ORIGINAL/)
  assert.ok(!result.stdout.includes('ANCESTOR_EXTERNAL_CANARY'))
  assert.equal(readFileSync(path.join(held, 'ancestor/project/src/a.txt'), 'utf8'), 'ANCESTOR_ORIGINAL\n')
  assert.equal(lstatSync(grand).isSymbolicLink(), true)
})

test('duplicate selections do not silence the supplied plan', t => {
  const root = fixture(t)
  write(root, 'src/a.txt', 'duplicate line\n')
  const selection = { path: 'src/a.txt', start: 1, end: 1 }
  const result = run(['pack', '--root', root], packet({}, [selection, selection]))
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Plan ID: TOOLS/)
  assert.equal((result.stdout.match(/### src\/a\.txt/g) ?? []).length, 2)
})

test('copied tool remains standalone inside an installed .opencode tools directory', t => {
  const project = fixture(t)
  const tools = path.join(project, '.opencode/tools')
  mkdirSync(tools, { recursive: true })
  const installed = path.join(tools, 'context-tools.mjs')
  copyFileSync(tool, installed)
  write(project, '.opencode/instructions/INSTALLED.md', '# Installed instructions\n')
  write(project, '.opencode/agents/example.md', '# Agent\n')
  write(project, '.opencode/prompts/agents/example.txt', 'prompt text\n')
  write(project, 'src/a.txt', 'source line\n')

  assert.ok(!/\.\.\/\.\.\/lib/.test(source))
  assert.ok(!/from ['"][^'"]*\/lib\//.test(source))

  const audited = spawnSync(process.execPath, [installed, 'audit', '--root', path.join(project, '.opencode')], { encoding: 'utf8', cwd: os.tmpdir() })
  assert.equal(audited.status, 0, audited.stderr)
  const report = JSON.parse(audited.stdout)
  assert.deepEqual(report.files.map(file => file.path), [
    'agents/example.md', 'instructions/INSTALLED.md', 'prompts/agents/example.txt',
  ])

  const packed = spawnSync(process.execPath, [installed, 'pack', '--root', project], {
    encoding: 'utf8', cwd: os.tmpdir(),
    input: packet({}, [{ path: 'src/a.txt', start: 1, end: 1 }]),
  })
  assert.equal(packed.status, 0, packed.stderr)
  assert.match(packed.stdout, /1: source line/)
})
