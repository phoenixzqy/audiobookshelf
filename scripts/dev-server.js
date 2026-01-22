#!/usr/bin/env node

/**
 * Cross-platform dev server script
 * Works on both Windows and macOS
 *
 * On macOS: Optionally starts PostgreSQL via brew services
 * On Windows: Assumes PostgreSQL is running as a service or started manually
 */

const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

const isWindows = os.platform() === 'win32';
const isMac = os.platform() === 'darwin';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(prefix, message, color = colors.reset) {
  console.log(`${color}[${prefix}]${colors.reset} ${message}`);
}

function logInfo(message) {
  log('INFO', message, colors.cyan);
}

function logSuccess(message) {
  log('SUCCESS', message, colors.green);
}

function logWarning(message) {
  log('WARNING', message, colors.yellow);
}

function logError(message) {
  log('ERROR', message, colors.red);
}

/**
 * Try to start PostgreSQL on macOS using brew
 */
async function startPostgresOnMac() {
  return new Promise((resolve) => {
    logInfo('Attempting to start PostgreSQL via Homebrew...');

    const brew = spawn('brew', ['services', 'start', 'postgresql@16'], {
      stdio: 'pipe',
    });

    brew.on('close', (code) => {
      if (code === 0) {
        logSuccess('PostgreSQL started (or already running)');
      } else {
        logWarning('Could not start PostgreSQL via brew (it may already be running or use a different method)');
      }
      resolve();
    });

    brew.on('error', () => {
      logWarning('Homebrew not found or brew services failed');
      resolve();
    });
  });
}

/**
 * Check if PostgreSQL is running by attempting a connection
 */
async function checkPostgresConnection() {
  return new Promise((resolve) => {
    // Try to connect to PostgreSQL using psql
    const psqlCommand = isWindows ? 'psql' : 'psql';
    const psql = spawn(psqlCommand, ['-c', 'SELECT 1', '-d', 'postgres'], {
      stdio: 'pipe',
      shell: isWindows,
    });

    psql.on('close', (code) => {
      resolve(code === 0);
    });

    psql.on('error', () => {
      resolve(false);
    });

    // Timeout after 3 seconds
    setTimeout(() => {
      psql.kill();
      resolve(false);
    }, 3000);
  });
}

/**
 * Start a process with colored output
 */
function startProcess(name, command, args, cwd, color) {
  const proc = spawn(command, args, {
    cwd,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: isWindows,
  });

  proc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        console.log(`${color}[${name}]${colors.reset} ${line}`);
      }
    });
  });

  proc.stderr.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        console.log(`${color}[${name}]${colors.reset} ${line}`);
      }
    });
  });

  proc.on('error', (err) => {
    logError(`Failed to start ${name}: ${err.message}`);
  });

  proc.on('close', (code) => {
    if (code !== 0 && code !== null) {
      logError(`${name} exited with code ${code}`);
    }
  });

  return proc;
}

async function main() {
  console.log('');
  logInfo('Starting Audiobookshelf Development Server');
  logInfo(`Platform: ${os.platform()} (${os.arch()})`);
  console.log('');

  // Try to ensure PostgreSQL is running
  if (isMac) {
    await startPostgresOnMac();
  } else if (isWindows) {
    logInfo('On Windows, ensure PostgreSQL is running as a Windows service');
    logInfo('You can start it via: net start postgresql-x64-16');
    logInfo('Or use pgAdmin to start the service');
  }

  // Quick connection check
  const pgConnected = await checkPostgresConnection();
  if (pgConnected) {
    logSuccess('PostgreSQL connection verified');
  } else {
    logWarning('Could not verify PostgreSQL connection - the app may fail to connect');
    logWarning('Make sure PostgreSQL is running and the database exists');
  }

  console.log('');
  logInfo('Starting backend and frontend servers...');
  console.log('');

  // Get project root directory
  const projectRoot = path.resolve(__dirname, '..');
  const backendDir = path.join(projectRoot, 'backend');
  const frontendDir = path.join(projectRoot, 'frontend');

  // Start backend
  const npmCmd = isWindows ? 'npm.cmd' : 'npm';
  const backend = startProcess('backend', npmCmd, ['run', 'dev'], backendDir, colors.blue);

  // Small delay before starting frontend to let backend initialize
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Start frontend
  const frontend = startProcess('frontend', npmCmd, ['run', 'dev'], frontendDir, colors.green);

  // Handle process termination
  const cleanup = () => {
    logInfo('Shutting down development servers...');
    backend.kill();
    frontend.kill();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Keep the main process running
  process.stdin.resume();
}

main().catch((err) => {
  logError(`Failed to start dev server: ${err.message}`);
  process.exit(1);
});
