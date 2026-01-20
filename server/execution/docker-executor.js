/**
 * Docker-based code execution sandbox
 * 
 * Provides secure isolation using Docker containers with:
 * - Resource limits (CPU, memory)
 * - Network isolation (no network access)
 * - Read-only filesystem (except /code)
 * - Non-root user execution
 * - Automatic cleanup
 */

import { spawn } from 'child_process';

// Docker image names (configurable via environment variables)
// CRITICAL: Use specific version tags in production (not 'latest') to prevent unpredictable behavior
// For Fly.io: registry.fly.io/your-app-name:python-executor:v1.0.0
// For local dev: python-executor:latest (acceptable for development only)
// 
// Production should use:
// - Specific version tags: python-executor:v1.0.0
// - Or image digests: python-executor@sha256:94c0e866c197cf383bc9672fc0d636fb5bb0d1e759b3c71104eb3f079944aaae
const PYTHON_IMAGE = process.env.PYTHON_EXECUTOR_IMAGE || 'python-executor:latest';
const JAVA_IMAGE = process.env.JAVA_EXECUTOR_IMAGE || 'java-executor:latest';

// Warn if using 'latest' tag in production (security/reliability risk)
if (process.env.NODE_ENV === 'production' &&
  (PYTHON_IMAGE.includes(':latest') || JAVA_IMAGE.includes(':latest'))) {
  console.warn('[Docker Executor] ⚠️ WARNING: Using :latest tag in production. Use specific version tags for reliability.');
}

// Resource limits
const MAX_MEMORY = '256m'; // 256MB memory limit
const MAX_CPUS = '1'; // 1 CPU core
const MAX_TEMP_SIZE = '10m'; // 10MB temp filesystem

/**
 * Check if Docker is available
 * CRITICAL FIX: Added timeout to prevent hanging if Docker daemon is unresponsive
 */
export async function isDockerAvailable() {
  return new Promise((resolve) => {
    const checkProcess = spawn('docker', ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Add timeout to prevent hanging (5 seconds)
    const timeout = setTimeout(() => {
      checkProcess.kill('SIGKILL');
      resolve(false);
    }, 5000);

    checkProcess.on('close', (code) => {
      clearTimeout(timeout);
      resolve(code === 0);
    });

    checkProcess.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

/**
 * Check if Docker image exists
 * CRITICAL FIX: Added timeout to prevent hanging if Docker daemon is unresponsive
 */
export async function checkDockerImage(imageName) {
  return new Promise((resolve) => {
    // CRITICAL: Ensure DOCKER_HOST is passed to spawn (for remote Docker daemon)
    // Docker CLI automatically uses DOCKER_HOST from environment
    const dockerHost = process.env.DOCKER_HOST;
    if (dockerHost) {
      console.log(`[Docker] Checking image ${imageName} on remote Docker daemon: ${dockerHost}`);
    }
    
    // Try docker images with filter first (more reliable for remote daemons)
    // Format: REPOSITORY:TAG (e.g., registry.fly.io/app:tag)
    const [repo, tag] = imageName.includes(':') 
      ? imageName.split(':')
      : [imageName, 'latest'];
    
    const checkProcess = spawn('docker', ['images', '--format', '{{.Repository}}:{{.Tag}}', '--filter', `reference=${imageName}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env, // Inherit all env vars including DOCKER_HOST
      },
    });

    // Add timeout to prevent hanging (5 seconds)
    const timeout = setTimeout(() => {
      checkProcess.kill('SIGKILL');
      console.log(`[Docker] Image check timeout for ${imageName}`);
      resolve(false);
    }, 5000);

    let output = '';
    let errorOutput = '';
    
    checkProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    checkProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    checkProcess.on('close', (code) => {
      clearTimeout(timeout);
      
      if (errorOutput) {
        console.log(`[Docker] Stderr for ${imageName}: ${errorOutput.trim()}`);
      }
      
      // Check if the image name appears in the output
      const exists = code === 0 && output.trim().length > 0 && output.includes(imageName);
      
      if (!exists) {
        console.log(`[Docker] Image ${imageName} not found (exit code ${code})`);
        if (output.trim()) {
          console.log(`[Docker] Available images: ${output.trim()}`);
        }
        // Fallback: try docker image inspect as backup
        console.log(`[Docker] Trying fallback: docker image inspect ${imageName}`);
        return checkDockerImageFallback(imageName).then(resolve);
      } else {
        console.log(`[Docker] ✅ Image ${imageName} found`);
        resolve(true);
      }
    });

    checkProcess.on('error', (error) => {
      clearTimeout(timeout);
      console.error(`[Docker] Error checking image ${imageName}:`, error.message);
      // Fallback to inspect
      return checkDockerImageFallback(imageName).then(resolve);
    });
  });
}

// Fallback method using docker image inspect
async function checkDockerImageFallback(imageName) {
  return new Promise((resolve) => {
    const checkProcess = spawn('docker', ['image', 'inspect', imageName], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
      },
    });

    const timeout = setTimeout(() => {
      checkProcess.kill('SIGKILL');
      resolve(false);
    }, 5000);

    let errorOutput = '';
    checkProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    checkProcess.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        console.log(`[Docker] ✅ Image ${imageName} found (via inspect fallback)`);
        resolve(true);
      } else {
        console.log(`[Docker] Image ${imageName} not found via inspect: ${errorOutput.trim()}`);
        resolve(false);
      }
    });

    checkProcess.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

/**
 * Execute Python code in Docker container
 */
export async function executePythonDocker(code, filePath, timeout, maxOutputSize) {
  // CRITICAL FIX: Validate code size before processing (defense in depth)
  // This prevents DoS attacks even if queue validation is bypassed
  const { readFileSync, statSync } = await import('fs');

  // Check file size before reading
  try {
    const fileStats = statSync(filePath);
    if (fileStats.size > 100000) { // 100KB limit
      throw new Error('Code size exceeds maximum limit (100KB)');
    }
  } catch (statError) {
    // If stat fails, file might not exist - will be caught by readFileSync
  }

  // CRITICAL FIX: Read file content and pass via stdin instead of mounting read-only file
  // This ensures the file is writable in the tmpfs and avoids permission issues
  const pythonCodeContent = readFileSync(filePath, 'utf8');

  // Double-check content size after reading
  if (pythonCodeContent.length > 100000) {
    throw new Error('Code size exceeds maximum limit (100KB)');
  }

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let outputSize = 0;

    // Docker run command with security constraints
    // Copy file via stdin instead of mounting (allows Python to write .pyc files if needed)
    // SECURITY: Don't run as root - rely on Dockerfile's USER executor (1000)
    // tmpfs mounts are root-owned by default, but we can use mode=1777 (world-writable + sticky bit)
    // This is safe because: container is isolated, only one process runs, and we use non-root user
    const dockerArgs = [
      'run',
      '--rm', // Auto-remove container after execution
      '--memory', MAX_MEMORY, // Memory limit
      '--cpus', MAX_CPUS, // CPU limit
      '--network', 'none', // No network access
      '--read-only', // Read-only root filesystem
      '--tmpfs', `/tmp:rw,size=${MAX_TEMP_SIZE},noexec,nosuid,nodev`, // Limited temp space, no execution
      '--tmpfs', `/code:rw,size=${MAX_TEMP_SIZE},noexec,nosuid,nodev,mode=1777`, // mode=1777: world-writable + sticky bit
      '--workdir', '/code',
      '--interactive', // Allow stdin input
      // Don't override --user - Dockerfile sets USER executor (1000), which is non-root
      PYTHON_IMAGE,
      'sh', '-c', 'cat > /code/script.py && python3 -u /code/script.py',
    ];

    const dockerProcess = spawn('docker', dockerArgs, {
      stdio: ['pipe', 'pipe', 'pipe'], // stdin, stdout, stderr
      env: {
        ...process.env,
        // Don't pass sensitive environment variables
      },
    });

    // Write Python code to stdin
    dockerProcess.stdin.write(pythonCodeContent);
    dockerProcess.stdin.end();

    // Set timeout
    const timeoutId = setTimeout(() => {
      dockerProcess.kill('SIGKILL'); // Force kill on timeout
      reject(new Error(`Execution timeout after ${timeout}ms`));
    }, timeout);

    // Collect stdout
    dockerProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      outputSize += chunk.length;
      if (outputSize > maxOutputSize) {
        dockerProcess.kill('SIGKILL');
        reject(new Error('Output size exceeded maximum limit (1MB)'));
        return;
      }
      stdout += chunk;
    });

    // Collect stderr
    dockerProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      outputSize += chunk.length;
      if (outputSize > maxOutputSize) {
        dockerProcess.kill('SIGKILL');
        reject(new Error('Output size exceeded maximum limit (1MB)'));
        return;
      }
      stderr += chunk;
    });

    // Handle process completion
    dockerProcess.on('close', (code) => {
      clearTimeout(timeoutId);
      clearTimeout(spawnTimeout);
      const executionTime = Date.now() - startTime;

      resolve({
        status: code === 0 ? 'completed' : 'failed',
        output: stdout,
        error: stderr || (code !== 0 ? `Process exited with code ${code}` : null),
        executionTimeMs: executionTime,
        exitCode: code,
      });
    });

    dockerProcess.on('error', (error) => {
      clearTimeout(timeoutId);
      clearTimeout(spawnTimeout);
      reject(new Error(`Failed to start Docker container: ${error.message}`));
    });
  });
}

/**
 * Execute Java code in Docker container
 * Handles both compilation and execution
 */
export async function executeJavaDocker(code, filePath, className, timeout, maxOutputSize) {
  // CRITICAL FIX: Validate className to prevent command injection
  // className is interpolated into shell command - must be sanitized
  if (!/^[a-zA-Z0-9_]+$/.test(className)) {
    throw new Error(`Invalid class name: ${className}. Class names must contain only letters, numbers, and underscores.`);
  }

  // CRITICAL FIX: Read file content and pass via stdin instead of mounting read-only file
  // Mounting a file as read-only into tmpfs prevents javac from writing .class files
  // Also, compile and run in the SAME container to avoid .class file sharing issues
  const { readFileSync } = await import('fs');
  const javaCodeContent = readFileSync(filePath, 'utf8');

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let outputSize = 0;

    // Compile and run in single container (simpler and avoids .class file sharing)
    // SECURITY: Don't run as root - rely on Dockerfile's USER executor (1000)
    // tmpfs mounts are root-owned by default, but we can use mode=1777 (world-writable + sticky bit)
    // This is safe because: container is isolated, only one process runs, and we switch to non-root immediately
    // Alternative: Use an entrypoint script, but that adds complexity
    const compileAndRunArgs = [
      'run',
      '--rm',
      '--memory', MAX_MEMORY,
      '--cpus', MAX_CPUS,
      '--network', 'none',
      '--read-only',
      '--tmpfs', `/tmp:rw,size=${MAX_TEMP_SIZE},noexec,nosuid,nodev`,
      '--tmpfs', `/code:rw,size=${MAX_TEMP_SIZE},noexec,nosuid,nodev,mode=1777`, // mode=1777: world-writable + sticky bit
      '--workdir', '/code',
      '--interactive',
      // Don't override --user - Dockerfile sets USER executor (1000), which is non-root
      JAVA_IMAGE,
      'sh', '-c', `cat > /code/${className}.java && javac /code/${className}.java && java -Xmx256m -Xms64m -cp /code ${className}`,
    ];

    const runProcess = spawn('docker', compileAndRunArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // CRITICAL FIX: Add spawn timeout to prevent hanging if Docker daemon is unresponsive
    const spawnTimeout = setTimeout(() => {
      if (!runProcess.killed) {
        runProcess.kill('SIGKILL');
        reject(new Error('Docker process spawn timeout - Docker daemon may be unresponsive'));
      }
    }, 5000); // 5 second spawn timeout

    runProcess.on('spawn', () => {
      clearTimeout(spawnTimeout);
    });

    // Write Java code to stdin (will be compiled and executed in same container)
    runProcess.stdin.write(javaCodeContent);
    runProcess.stdin.end();

    const timeoutId = setTimeout(() => {
      runProcess.kill('SIGKILL');
      reject(new Error(`Execution timeout after ${timeout}ms`));
    }, timeout);

    runProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      outputSize += chunk.length;
      if (outputSize > maxOutputSize) {
        runProcess.kill('SIGKILL');
        reject(new Error('Output size exceeded maximum limit (1MB)'));
        return;
      }
      stdout += chunk;
    });

    runProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      outputSize += chunk.length;
      if (outputSize > maxOutputSize) {
        runProcess.kill('SIGKILL');
        reject(new Error('Output size exceeded maximum limit (1MB)'));
        return;
      }
      stderr += chunk;
    });

    runProcess.on('close', (code) => {
      clearTimeout(timeoutId);
      const executionTime = Date.now() - startTime;

      // Check if stderr contains compilation errors (javac outputs errors to stderr)
      // Compilation errors typically have format: "filename:line: error: message"
      const hasCompilationError = stderr && (
        stderr.includes(': error:') ||
        stderr.includes('javac:') ||
        stderr.match(/\.java:\d+:/)
      );

      if (hasCompilationError) {
        // It's a compilation error
        const cleanedError = cleanJavaError(stderr);
        resolve({
          status: 'failed',
          output: '',
          error: `Compilation error:\n${cleanedError}`,
          executionTimeMs: executionTime,
          exitCode: code || 1,
        });
        return;
      }

      // Otherwise, it's runtime output/errors
      resolve({
        status: code === 0 ? 'completed' : 'failed',
        output: stdout,
        error: stderr || (code !== 0 ? `Process exited with code ${code}` : null),
        executionTimeMs: executionTime,
        exitCode: code,
      });
    });

    runProcess.on('error', (error) => {
      clearTimeout(timeoutId);
      clearTimeout(spawnTimeout);
      reject(new Error(`Failed to start Java container: ${error.message}`));
    });
  });
}

/**
 * Format Java compiler errors - clean, concise, user-friendly
 */
function cleanJavaError(errorMessage) {
  if (!errorMessage) return errorMessage;

  const lines = errorMessage.split('\n');
  const result = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Match error line: /path/to/File.java:line: error: message
    const errorMatch = line.match(/^(.+?)\/([^\/]+\.java):(\d+):\s*error:\s*(.+)$/);
    if (errorMatch) {
      const [, , filename, lineNum, errorMsg] = errorMatch;
      result.push(`${filename}:${lineNum}: error: ${errorMsg}`);
      i++;

      // Look for the code line with caret (^)
      if (i < lines.length && lines[i].trim().startsWith('^')) {
        i++;
      }

      while (i < lines.length &&
        (lines[i].trim().startsWith('method ') ||
          lines[i].trim().startsWith('(') ||
          lines[i].trim() === '')) {
        i++;
      }

      continue;
    }

    // Skip method overload listings
    if (line.trim().startsWith('method ') && line.includes('is not applicable')) {
      i++;
      continue;
    }

    // Skip lines that are just parentheses or whitespace
    if (line.trim().match(/^\(.+\)$/) || line.trim() === '') {
      i++;
      continue;
    }

    // Keep other important lines
    if (line.trim() && !line.includes('is not applicable')) {
      const cleanedLine = line.replace(/\/[^\s]+?\/([^\/]+\.java)/g, '$1');
      result.push(cleanedLine);
    }

    i++;
  }

  return result.join('\n').trim();
}
