'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { COLORS, color } = require('./ui');

/**
 * Resolves the active container sandbox runtime for the target project:
 * - Checks .mate/config.json ("containerRuntime": "podman" | "docker" | "none")
 * - If not explicitly configured, auto-detects: podman -> docker -> none
 */
function resolveContainerRuntime(targetDir = '.') {
  const resolved = path.resolve(targetDir);
  const configPath = path.join(resolved, '.mate', 'config.json');

  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (cfg.containerRuntime) {
        const val = String(cfg.containerRuntime).toLowerCase().trim();
        if (['podman', 'docker', 'none'].includes(val)) {
          return val;
        }
      }
    } catch {
      // ignore malformed config
    }
  }

  // Auto-detection
  try {
    const pCheck = spawnSync('podman', ['--version'], { encoding: 'utf8' });
    if (pCheck.status === 0) return 'podman';
  } catch {}

  try {
    const dCheck = spawnSync('docker', ['--version'], { encoding: 'utf8' });
    if (dCheck.status === 0) return 'docker';
  } catch {}

  return 'none';
}

/**
 * Saves container sandbox configuration to .mate/config.json
 */
function saveContainerConfig(targetDir = '.', runtime = 'podman') {
  const resolved = path.resolve(targetDir);
  const mateDir = path.join(resolved, '.mate');
  fs.mkdirSync(mateDir, { recursive: true });
  const configPath = path.join(mateDir, 'config.json');
  let existing = {};
  if (fs.existsSync(configPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      existing = {};
    }
  }
  const safeRuntime = ['podman', 'docker', 'none'].includes(runtime) ? runtime : 'podman';
  existing.containerRuntime = safeRuntime;
  fs.writeFileSync(configPath, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
  return safeRuntime;
}

function handleMutationExit(status) {
  if (status === 0) {
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
  return status ?? 1;
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
 * Runs Stryker mutation testing inside an isolated container sandbox (Podman, Docker, or native host)
 */
function runContainerMutation(targetDir = '.', configFile = 'stryker.config.json') {
  const resolved = path.resolve(targetDir);
  const runtime = resolveContainerRuntime(resolved);

  console.log(
    color(
      '\n💣 [M.A.T.E. Pillar T] Launching Mutation Testing Suite...',
      COLORS.bold,
      COLORS.brightGreen
    )
  );
  console.log(`   📁 Target Project:   ${resolved}`);
  console.log(`   ⚙️  Config File:      ${configFile}`);
  console.log(`   🐳 Container Engine: ${runtime.toUpperCase()}\n`);

  if (runtime === 'podman') {
    const check = spawnSync('podman', ['--version'], { encoding: 'utf8' });
    if (check.status !== 0) {
      console.error(
        color(
          "❌ Error: 'podman' is configured as your container runtime, but it was not found in PATH.",
          COLORS.red,
          COLORS.bold
        )
      );
      return 1;
    }

    console.log(color(`   🐳 Podman Version: ${check.stdout.trim()}`, COLORS.cyan));

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
    return handleMutationExit(run.status);
  }

  if (runtime === 'docker') {
    const check = spawnSync('docker', ['--version'], { encoding: 'utf8' });
    if (check.status !== 0) {
      console.error(
        color(
          "❌ Error: 'docker' is configured as your container runtime, but it was not found in PATH or the Docker daemon is not running.",
          COLORS.red,
          COLORS.bold
        )
      );
      return 1;
    }

    console.log(color(`   🐳 Docker Version: ${check.stdout.trim()}`, COLORS.cyan));

    const dockerArgs = [
      'run',
      '--rm',
      '-v',
      `${resolved}:/app`,
      '-w',
      '/app',
      'node:20-alpine',
      'sh',
      '-c',
      `npm install --legacy-peer-deps && npx stryker run ${configFile}`,
    ];

    console.log(color(`   🚀 Executing: docker ${dockerArgs.join(' ')}\n`, COLORS.gray));
    const run = spawnSync('docker', dockerArgs, { stdio: 'inherit' });
    return handleMutationExit(run.status);
  }

  // Runtime is 'none': execute natively on host
  console.log(
    color(
      '   ℹ️  No container sandbox configured ("none"). Executing Stryker natively on host system...',
      COLORS.yellow
    )
  );
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  console.log(color(`   🚀 Executing: npx stryker run ${configFile}\n`, COLORS.gray));
  const run = spawnSync(npxCmd, ['stryker', 'run', configFile], {
    cwd: resolved,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return handleMutationExit(run.status);
}

/**
 * Runs Grafana k6 performance script:
 * 1. Checks configured runtime (Podman or Docker) to execute inside container sandbox (`grafana/k6:latest`)
 * 2. If runtime is 'none' or no container engine exists, falls back to native host `k6` binary if available
 * 3. If neither is found, prints diagnostic and OS-specific installation instructions
 */
function runContainerK6(scriptPath = 'tests/nfr/order-load.k6.js', targetDir = '.') {
  const resolved = path.resolve(targetDir);
  const relScript = path.isAbsolute(scriptPath)
    ? path.relative(resolved, scriptPath).replace(/\\/g, '/')
    : scriptPath.replace(/\\/g, '/');
  const runtime = resolveContainerRuntime(resolved);

  console.log(
    color(
      '\n⚡ [M.A.T.E. Performance Oracles] Launching Grafana k6 Suite...',
      COLORS.bold,
      COLORS.brightGreen
    )
  );
  console.log(`   📁 Target Project:   ${resolved}`);
  console.log(`   📈 k6 Script:        ${relScript}`);
  console.log(`   🐳 Container Engine: ${runtime.toUpperCase()}\n`);

  if (runtime === 'podman') {
    const check = spawnSync('podman', ['--version'], { encoding: 'utf8' });
    if (check.status === 0 && check.stdout) {
      console.log(color(`   🐳 Podman Version: ${check.stdout.trim()} (sandbox: grafana/k6:latest)`, COLORS.cyan));

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
  }

  if (runtime === 'docker') {
    const check = spawnSync('docker', ['--version'], { encoding: 'utf8' });
    if (check.status === 0 && check.stdout) {
      console.log(color(`   🐳 Docker Version: ${check.stdout.trim()} (sandbox: grafana/k6:latest)`, COLORS.cyan));

      const dockerArgs = [
        'run',
        '--rm',
        '-i',
        '-v',
        `${resolved}:/app`,
        '-w',
        '/app',
        'grafana/k6:latest',
        'run',
        relScript,
      ];

      console.log(color(`   🚀 Executing: docker ${dockerArgs.join(' ')}\n`, COLORS.gray));
      const run = spawnSync('docker', dockerArgs, { stdio: 'inherit' });
      return handleK6Exit(run.status);
    }
  }

  // Runtime is 'none' or container engine check failed: try native host k6
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
        `   ℹ️  ${runtime === 'none' ? 'Container sandbox set to "none"' : 'Configured container engine unavailable'}. Falling back to native host k6 runner...`,
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

  // Neither container nor native k6 found
  console.error(
    color(
      '❌ Error: No container engine (Podman or Docker) or native Grafana k6 was detected in PATH.',
      COLORS.red,
      COLORS.bold
    )
  );
  console.log(color('\n  💡 How to install Grafana k6, Podman, or Docker on your machine:\n', COLORS.yellow, COLORS.bold));
  console.log(color('  • Native Grafana k6 (Quickest):', COLORS.bold, COLORS.cyan));
  console.log('      Windows: winget install k6 --source winget   (or: choco install k6)');
  console.log('      macOS:   brew install k6');
  console.log('      Linux:   sudo apt-get install k6');
  console.log(color('\n  • Container Sandbox (Podman or Docker):', COLORS.bold, COLORS.cyan));
  console.log('      Podman:  winget install RedHat.Podman-Desktop  (or: brew install podman)');
  console.log('      Docker:  Download Docker Desktop from https://www.docker.com/products/docker-desktop/\n');

  return 1;
}

module.exports = {
  resolveContainerRuntime,
  saveContainerConfig,
  runContainerMutation,
  runContainerK6,
  // Backward-compatible aliases
  runPodmanMutation: runContainerMutation,
  runPodmanK6: runContainerK6,
};
