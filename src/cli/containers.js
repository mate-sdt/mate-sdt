'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { COLORS, color } = require('./ui');

/**
 * Runs Stryker mutation testing inside an isolated rootless Podman container
 */
function runPodmanMutation(targetDir = '.', configFile = 'stryker.config.json') {
  const resolved = path.resolve(targetDir);
  console.log(
    color(
      '\n💣 [M.A.T.E. Pillar T] Launching Mutation Testing Suite via Rootless Podman...',
      COLORS.bold,
      COLORS.brightGreen
    )
  );
  console.log(`   📁 Target Project: ${resolved}`);
  console.log(`   ⚙️  Config File:    ${configFile}\n`);

  const check = spawnSync('podman', ['--version'], { encoding: 'utf8' });
  if (check.status !== 0) {
    console.error(
      color(
        "❌ Error: 'podman' is not installed or not in PATH. Rootless Podman is required by M.A.T.E. Pillar T.",
        COLORS.red,
        COLORS.bold
      )
    );
    return 1;
  }

  console.log(color(`   🐳 Container Engine: ${check.stdout.trim()}`, COLORS.cyan));

  const podmanArgs = [
    'run',
    '--rm',
    '-v',
    `${resolved}:/app:Z`,
    '-w',
    '/app',
    'node:20-alpine',
    'sh',
    '-c',
    `npm install --legacy-peer-deps && npx stryker run ${configFile}`,
  ];

  console.log(color(`   🚀 Executing: podman ${podmanArgs.join(' ')}\n`, COLORS.gray));
  const run = spawnSync('podman', podmanArgs, { stdio: 'inherit' });
  if (run.status === 0) {
    console.log(
      color(
        '\n✅ [Pillar T Passed] Mutation Score meets the >= 85% M.A.T.E. threshold!',
        COLORS.brightGreen,
        COLORS.bold
      )
    );
  } else {
    console.error(
      color(
        '\n❌ [Pillar T Failed] Mutation testing failed or score fell below the 85% M.A.T.E. threshold.',
        COLORS.red,
        COLORS.bold
      )
    );
  }
  return run.status ?? 1;
}

function handleK6Exit(status) {
  if (status === 0) {
    console.log(
      color(
        '\n✅ [Performance Oracles Passed] All k6 SLA thresholds satisfied!',
        COLORS.brightGreen,
        COLORS.bold
      )
    );
  } else {
    console.error(
      color(
        '\n❌ [Performance Oracles Failed] k6 run failed or violated SLA thresholds.',
        COLORS.red,
        COLORS.bold
      )
    );
  }
  return status ?? 1;
}

/**
 * Runs Grafana k6 performance script:
 * 1. Checks if Podman is available to execute inside container sandbox (`grafana/k6:latest`)
 * 2. If Podman is not found, falls back to native host `k6` binary if available
 * 3. If neither is found, prints diagnostic and OS-specific installation instructions
 */
function runPodmanK6(scriptPath = 'tests/nfr/order-load.k6.js', targetDir = '.') {
  const resolved = path.resolve(targetDir);
  const relScript = path.isAbsolute(scriptPath)
    ? path.relative(resolved, scriptPath).replace(/\\/g, '/')
    : scriptPath.replace(/\\/g, '/');

  console.log(
    color(
      '\n⚡ [M.A.T.E. Performance Oracles] Launching Grafana k6 Suite...',
      COLORS.bold,
      COLORS.brightGreen
    )
  );
  console.log(`   📁 Target Project: ${resolved}`);
  console.log(`   📈 k6 Script:      ${relScript}\n`);

  // 1. Try Podman container engine
  let podmanAvailable = false;
  let podmanVersion = '';
  try {
    const check = spawnSync('podman', ['--version'], { encoding: 'utf8' });
    if (check.status === 0 && check.stdout) {
      podmanAvailable = true;
      podmanVersion = check.stdout.trim();
    }
  } catch {
    podmanAvailable = false;
  }

  if (podmanAvailable) {
    console.log(color(`   🐳 Container Engine: ${podmanVersion} (sandbox: grafana/k6:latest)`, COLORS.cyan));

    const podmanArgs = [
      'run',
      '--rm',
      '-i',
      '-v',
      `${resolved}:/app:Z`,
      '-w',
      '/app',
      'grafana/k6:latest',
      'run',
      relScript,
    ];

    console.log(color(`   🚀 Executing: podman ${podmanArgs.join(' ')}\n`, COLORS.gray));
    const run = spawnSync('podman', podmanArgs, { stdio: 'inherit' });
    return handleK6Exit(run.status);
  }

  // 2. Try native host k6 binary fallback
  let nativeK6Available = false;
  let nativeK6Version = '';
  try {
    const k6Cmd = process.platform === 'win32' ? 'k6.exe' : 'k6';
    const checkK6 = spawnSync(k6Cmd, ['version'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    if (checkK6.status === 0 && checkK6.stdout) {
      nativeK6Available = true;
      nativeK6Version = checkK6.stdout.trim().split('\n')[0];
    }
  } catch {
    nativeK6Available = false;
  }

  if (nativeK6Available) {
    console.log(
      color(
        '   ℹ️  Podman container engine not detected. Falling back to native host k6 runner...',
        COLORS.yellow
      )
    );
    console.log(color(`   ⚡ Native Host Engine: ${nativeK6Version}`, COLORS.cyan));
    const fullScript = path.resolve(resolved, relScript);
    const k6Cmd = process.platform === 'win32' ? 'k6.exe' : 'k6';
    console.log(color(`   🚀 Executing: k6 run ${relScript}\n`, COLORS.gray));
    const run = spawnSync(k6Cmd, ['run', fullScript], {
      cwd: resolved,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    return handleK6Exit(run.status);
  }

  // 3. Neither Podman nor native k6 found -> Provide actionable installation instructions
  console.error(
    color(
      '❌ Error: Neither Podman container runtime nor native Grafana k6 was detected in PATH.',
      COLORS.red,
      COLORS.bold
    )
  );
  console.log(color('\n  💡 How to install Grafana k6 or Podman on your machine:\n', COLORS.yellow, COLORS.bold));
  console.log(color('  • Windows:', COLORS.bold, COLORS.cyan));
  console.log('      winget install k6 --source winget');
  console.log('      choco install k6');
  console.log(color('\n  • macOS:', COLORS.bold, COLORS.cyan));
  console.log('      brew install k6');
  console.log(color('\n  • Linux (Debian/Ubuntu):', COLORS.bold, COLORS.cyan));
  console.log('      sudo gpg -k && sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69');
  console.log('      echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list');
  console.log('      sudo apt-get update && sudo apt-get install k6');
  console.log(color('\n  • Container Sandbox (Podman):', COLORS.bold, COLORS.cyan));
  console.log('      Windows: winget install RedHat.Podman-Desktop');
  console.log('      macOS:   brew install podman && podman machine init && podman machine start');
  console.log('      Linux:   sudo apt install podman (or sudo dnf install podman)\n');

  return 1;
}

module.exports = {
  runPodmanMutation,
  runPodmanK6,
};
