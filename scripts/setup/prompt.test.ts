import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, it } from 'node:test';
import {
  acceptsWrite,
  adminSubjectWarnings,
  createLineReader,
  iconFileWarnings,
  readPngSize,
  stripPasteMarkers,
} from './prompt.ts';

function reader() {
  const input = new PassThrough();
  const output = new PassThrough();
  output.resume();
  return { input, lines: createLineReader(input, output) };
}

describe('interactive line reader', () => {
  it('submits a bare carriage return, which is what the last prompt receives', async () => {
    const { input, lines } = reader();
    const pending = lines.ask('Local dev port [5173]: ');
    input.write('\r');
    assert.equal(await pending, '');
    lines.close();
  });

  it('submits when Enter arrives after a bracketed paste in the same chunk', async () => {
    const { input, lines } = reader();
    const pending = lines.ask('Admins: ');
    input.write('\u001b[200~admin@contoso.example\u001b[201~\r');
    assert.equal(await pending, 'admin@contoso.example');
    lines.close();
  });

  it('does not wait forever when a paste marker is split and then Enter is pressed', async () => {
    const { input, lines } = reader();
    const pending = lines.ask('Notebook workspace id (GUID): ');
    input.write('\u001b[');
    input.write('200~aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\u001b[201~');
    input.write('\n');
    assert.equal(await pending, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    lines.close();
  });

  it('keeps a second line that arrived with the first', async () => {
    const { input, lines } = reader();
    input.write('one\r\ntwo\n');
    assert.equal(await lines.ask('First: '), 'one');
    assert.equal(await lines.ask('Second: '), 'two');
    lines.close();
  });

  it('strips paste markers without dropping the text', () => {
    assert.equal(stripPasteMarkers('\u001b[200~hello\u001b[201~'), 'hello');
  });
});

describe('setup warnings and confirmation', () => {
  it('warns when every admin subject is an email', () => {
    const warnings = adminSubjectWarnings('admin@contoso.example, owner@contoso.example');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0] ?? '', /object id/);
  });

  it('stays quiet when an object id is included', () => {
    assert.deepEqual(
      adminSubjectWarnings('admin@contoso.example, 00000000-0000-0000-0000-000000000001'),
      [],
    );
  });

  it('warns on a large or non-square icon', () => {
    const png = Buffer.alloc(24);
    png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    png.write('IHDR', 12, 'ascii');
    png.writeUInt32BE(32, 16);
    png.writeUInt32BE(16, 20);
    assert.deepEqual(readPngSize(png), { width: 32, height: 16 });
    const warnings = iconFileWarnings(201 * 1024, readPngSize(png));
    assert.equal(warnings.length, 2);
    assert.match(warnings[0] ?? '', /200 KB/);
    assert.match(warnings[1] ?? '', /not square/);
  });

  it('treats an empty confirmation as yes', () => {
    assert.equal(acceptsWrite(''), true);
    assert.equal(acceptsWrite('Y'), true);
    assert.equal(acceptsWrite('n'), false);
  });
});

describe('the wizard process accepts Enter on the last prompt', () => {
  it('finishes under a pty when the port prompt gets a bare return', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'setup-wizard-'));
    const script = `
import os, pty, select, subprocess, sys, time
root, dest = sys.argv[1], sys.argv[2]
master, slave = pty.openpty()
import termios
attrs = termios.tcgetattr(slave)
attrs[3] = attrs[3] | termios.ICANON | termios.ECHO | termios.ECHOE
attrs[0] = attrs[0] | termios.ICRNL
termios.tcsetattr(slave, termios.TCSANOW, attrs)
env = os.environ.copy()
env['SETUP_ROOT'] = dest
proc = subprocess.Popen(
    ['node', '--experimental-strip-types', os.path.join(root, 'scripts/setup/setup.ts')],
    stdin=slave, stdout=slave, stderr=slave, cwd=root, env=env,
)
os.close(slave)
answers = [
    'Contoso Backup\\n',
    'Lakehouse archive\\n',
    '\\n',
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\\n',
    '11111111-2222-3333-4444-555555555555\\n',
    '66666666-7777-8888-9999-aaaaaaaaaaaa\\n',
    'contosobackups\\n',
    'lakehouse-backups\\n',
    '\\n',
    '\\x1b[200~admin@contoso.example\\x1b[201~\\r',
    '\\r',
    'y\\n',
]
buf = b''
deadline = time.time() + 12
step = 0
while time.time() < deadline:
    ready, _, _ = select.select([master], [], [], 0.2)
    if master in ready:
        try:
            buf += os.read(master, 8192)
        except OSError:
            break
    text = buf.decode('utf-8', 'replace')
    if step < len(answers) and (
        (step == 0 and 'App title' in text)
        or (step == 1 and 'Subtitle' in text)
        or (step == 2 and 'Icon PNG' in text)
        or (step == 3 and 'Notebook workspace' in text)
        or (step == 4 and 'Staging workspace' in text)
        or (step == 5 and 'Staging lakehouse' in text)
        or (step == 6 and 'ADLS storage' in text)
        or (step == 7 and 'ADLS container' in text)
        or (step == 8 and 'Archive folder' in text)
        or (step == 9 and 'Admin UPNs' in text)
        or (step == 10 and 'Local dev port' in text)
        or (step == 11 and 'Write these files?' in text)
    ):
        os.write(master, answers[step].encode())
        step += 1
        buf = b''
    if proc.poll() is not None:
        break
else:
    proc.kill()
    sys.stderr.write(buf.decode('utf-8', 'replace'))
    raise SystemExit(f'timed out at step {step}')
code = proc.wait(timeout=3)
sys.stdout.write(f'{code} step={step}\\n')
if code != 0:
    sys.stderr.write(buf.decode('utf-8', 'replace'))
    raise SystemExit(code)
`;
    const child = spawn('python3', ['-c', script, process.cwd(), dir], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const code = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`pty wizard timed out\n${stdout}\n${stderr}`));
      }, 15000);
      child.on('close', (status) => {
        clearTimeout(timer);
        resolve(status ?? 1);
      });
    });
    assert.equal(stderr, '', stderr);
    assert.equal(code, 0, stdout);
    const secrets = await readFile(join(dir, 'rayfin/.env.secrets'), 'utf8');
    assert.match(secrets, /ADMIN_SUBJECTS=admin@contoso\.example/);
    assert.match(secrets, /ADLS_ARCHIVE_FOLDER=-/);
    const env = await readFile(join(dir, 'rayfin/.env'), 'utf8');
    assert.match(env, /DEV_PORT=5173/);
    await rm(dir, { recursive: true, force: true });
  });
});
