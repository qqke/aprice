import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

import { chromium } from 'playwright';

function resolveChromiumExecutablePath() {
  const cacheRoot = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), '.cache', 'ms-playwright');
  const envCandidates = [
    process.env.PLAYWRIGHT_CHROMIUM_PATH,
    process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    process.env.CHROMIUM_EXECUTABLE_PATH,
    path.join(cacheRoot, 'chromium-1217', 'chrome-linux64', 'chrome'),
    path.join(cacheRoot, 'chromium_headless_shell-1217', 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
  ].filter(Boolean);

  for (const candidate of envCandidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

function hasMissingSharedLibraries(executablePath) {
  if (process.platform !== 'linux') return false;

  try {
    const output = execFileSync('ldd', [executablePath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return output.includes('not found');
  } catch (error) {
    const output = `${error.stdout || ''}${error.stderr || ''}`;
    return output.includes('not found');
  }
}

export async function launchChromiumForTest(testName) {
  const executablePath = resolveChromiumExecutablePath();
  const launchOptions = { headless: true };

  if (executablePath) {
    if (hasMissingSharedLibraries(executablePath)) {
      console.log(`${testName} browser test skipped: Chromium binary is missing Linux shared libraries`);
      return null;
    }
    launchOptions.executablePath = executablePath;
  }

  try {
    return await chromium.launch(launchOptions);
  } catch (error) {
    console.log(`${testName} browser test skipped: ${error.message}`);
    return null;
  }
}
