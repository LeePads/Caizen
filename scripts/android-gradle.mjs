import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(root, 'android');
const wrapperPath = path.join(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
// Absolute path, not a bare name: with `shell: true` the shell resolves a bare
// `gradlew.bat` against PATH rather than cwd, so it failed with "not
// recognized" whenever the wrapper was not also on PATH.
const wrapper = wrapperPath;
const tasks = process.argv.slice(2);
const childEnvironment = { ...process.env };

if (process.platform === 'win32' && !childEnvironment.ANDROID_HOME) {
  const conventionalSdk = path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk');
  if (fs.existsSync(conventionalSdk)) {
    childEnvironment.ANDROID_HOME = conventionalSdk;
    childEnvironment.ANDROID_SDK_ROOT = conventionalSdk;
  }
}

if (!fs.existsSync(wrapperPath)) {
  console.error('Android project is missing. Run "pnpm cap:sync" first.');
  process.exit(1);
}

if (tasks.length === 0) {
  console.error('Pass at least one Gradle task.');
  process.exit(1);
}

const result = spawnSync(wrapper, tasks, {
  cwd: androidDir,
  shell: process.platform === 'win32',
  stdio: 'inherit',
  env: childEnvironment,
});

process.exit(result.status ?? 1);
