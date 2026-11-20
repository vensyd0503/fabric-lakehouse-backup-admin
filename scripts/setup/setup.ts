/**
 * Interactive installer. Writes local config only.
 * It does not call Rayfin, Fabric, or Azure.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { stdin as input, stdout as output } from 'node:process';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  answersFromEnv,
  answersFromRecord,
  renderEnvFile,
  renderSecretsFile,
  mergeLocalSettings,
  validateAnswers,
  BRANDING_DEFAULTS,
  type SetupAnswers,
} from './answers.ts';
import {
  acceptsWrite,
  adminSubjectWarnings,
  createLineReader,
  iconFileWarnings,
  readPngSize,
  type LineInput,
} from './prompt.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function projectRoot(): string {
  const override = process.env.SETUP_ROOT?.trim();
  return override ? resolve(override) : repoRoot;
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function readAnswersFile(path: string): SetupAnswers {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Answers file ${path} must be a JSON object.`);
  }
  return answersFromRecord(parsed as Record<string, unknown>);
}

async function askInteractive(): Promise<SetupAnswers> {
  const lines = createLineReader(input as LineInput, output);
  const ask = async (label: string, fallback = ''): Promise<string> => {
    const suffix = fallback ? ` [${fallback}]` : '';
    const answer = await lines.ask(`${label}${suffix}: `);
    return answer || fallback;
  };
  try {
    const title = await ask('App title', BRANDING_DEFAULTS.title);
    const subtitle = await ask('Subtitle', BRANDING_DEFAULTS.subtitle);
    const iconPath = await ask('Icon PNG path (blank keeps the built-in icon)');
    const notebookWorkspaceId = await ask('Notebook workspace id (GUID)');
    const stagingWorkspaceId = await ask('Staging workspace id (GUID)');
    const stagingLakehouseId = await ask('Staging lakehouse id (GUID, must already exist)');
    const adlsAccount = (await ask('ADLS storage account name')).toLowerCase();
    const adlsContainer = (await ask('ADLS container name')).toLowerCase();
    const archiveFolder = await ask('Archive folder inside the container (blank = container root)');
    const adminSubjects = await ask('Admin UPNs or Entra object ids, comma-separated');
    const devPort = await ask('Local dev port', '5173');
    return answersFromRecord({
      title,
      subtitle,
      iconPath,
      notebookWorkspaceId,
      stagingWorkspaceId,
      stagingLakehouseId,
      adlsAccount,
      adlsContainer,
      archiveFolder,
      adminSubjects,
      devPort,
    });
  } finally {
    lines.close();
  }
}

function iconSource(iconPath: string): string | null {
  if (!iconPath) return null;
  const source = isAbsolute(iconPath) ? iconPath : resolve(repoRoot, iconPath);
  if (!existsSync(source)) throw new Error(`Icon file not found: ${source}`);
  if (!source.toLowerCase().endsWith('.png')) throw new Error('Icon must be a PNG file.');
  return source;
}

function warningsFor(answers: SetupAnswers): string[] {
  const warnings = [...adminSubjectWarnings(answers.adminSubjects)];
  const source = answers.iconPath ? iconSource(answers.iconPath) : null;
  if (source) {
    const bytes = readFileSync(source);
    warnings.push(...iconFileWarnings(statSync(source).size, readPngSize(bytes)));
  }
  return warnings;
}

function summary(answers: SetupAnswers): string {
  const folder = answers.archiveFolder.trim() === '' ? '(container root)' : answers.archiveFolder.trim();
  const icon = answers.iconPath.trim() === '' ? '(built-in)' : answers.iconPath.trim();
  return [
    '',
    `App title: ${answers.title}`,
    `Subtitle: ${answers.subtitle}`,
    `Icon: ${icon}`,
    `Notebook workspace: ${answers.notebookWorkspaceId}`,
    `Staging workspace: ${answers.stagingWorkspaceId}`,
    `Staging lakehouse: ${answers.stagingLakehouseId}`,
    `ADLS: ${answers.adlsAccount} / ${answers.adlsContainer}`,
    `Archive folder: ${folder}`,
    `Admins: ${answers.adminSubjects}`,
    `Local dev port: ${answers.devPort}`,
    '',
  ].join('\n');
}

function writeOutputs(root: string, answers: SetupAnswers): void {
  const source = iconSource(answers.iconPath);
  const envPath = resolve(root, 'rayfin/.env');
  const secretsPath = resolve(root, 'rayfin/.env.secrets');
  const localSettingsPath = resolve(root, 'packages/functions/local.settings.json');
  mkdirSync(dirname(envPath), { recursive: true });
  writeFileSync(envPath, renderEnvFile(answers), 'utf8');
  writeFileSync(secretsPath, renderSecretsFile(answers), 'utf8');
  let existing: string | null = null;
  if (existsSync(localSettingsPath)) existing = readFileSync(localSettingsPath, 'utf8');
  mkdirSync(dirname(localSettingsPath), { recursive: true });
  writeFileSync(localSettingsPath, mergeLocalSettings(existing, answers), 'utf8');
  if (source) {
    for (const name of ['app-icon.png', 'favicon.png']) {
      const target = resolve(root, 'packages/frontend/public', name);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
    }
  }
}

function printNext(): void {
  output.write(
    [
      '',
      'Wrote rayfin/.env, rayfin/.env.secrets and packages/functions/local.settings.json.',
      'Nothing was changed in Fabric.',
      '',
      'Next, from the project root:',
      '  npm run setup:notebooks',
      '  npx rayfin login',
      '  npx rayfin up --workspace-id <APP_WORKSPACE_ID> --item-name backup-admin',
      '  npx rayfin secret set --env-file rayfin/.env.secrets',
      '  npx rayfin up --workspace-id <APP_WORKSPACE_ID> --item-name backup-admin',
      '',
      'Replace <APP_WORKSPACE_ID> with the Fabric workspace that will host the app.',
      'The staging lakehouse must already exist. This setup does not create it.',
      'Bring your own Azure sign-in before setup:notebooks (az login), or set FABRIC_ACCESS_TOKEN.',
      '',
    ].join('\n'),
  );
}

async function confirmWrite(): Promise<boolean> {
  const lines = createLineReader(input as LineInput, output);
  try {
    const answer = await lines.ask('Write these files? [Y/n] ');
    return acceptsWrite(answer);
  } finally {
    lines.close();
  }
}

async function main(): Promise<void> {
  const root = projectRoot();
  const answersFlag = argValue('--answers');
  const nonInteractive = process.argv.includes('--non-interactive') || !input.isTTY;
  let answers: SetupAnswers;
  if (answersFlag) {
    answers = readAnswersFile(resolve(repoRoot, answersFlag));
  } else if (nonInteractive) {
    answers = answersFromEnv(process.env);
  } else {
    answers = await askInteractive();
  }
  const problems = validateAnswers(answers);
  if (problems.length > 0) {
    output.write(`${problems.join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  let warnings: string[] = [];
  try {
    warnings = warningsFor(answers);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not read the icon.';
    output.write(`${message}\n`);
    process.exitCode = 1;
    return;
  }
  if (warnings.length > 0) output.write(`${warnings.join('\n')}\n`);
  if (!nonInteractive && !answersFlag) {
    output.write(summary(answers));
    if (!(await confirmWrite())) {
      output.write('Did not write any files.\n');
      process.exitCode = 1;
      return;
    }
  }
  writeOutputs(root, answers);
  printNext();
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirect) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Setup failed.';
    output.write(`${message}\n`);
    process.exitCode = 1;
  });
}
