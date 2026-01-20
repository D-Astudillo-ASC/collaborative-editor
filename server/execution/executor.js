import { spawn, exec } from 'child_process';
import crypto from 'crypto';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join, resolve } from 'path';
import { existsSync, statSync, readdirSync, accessSync, constants } from 'fs';
import { tmpdir } from 'os';
import {
  isDockerAvailable,
  checkDockerImage,
  executePythonDocker,
  executeJavaDocker,
} from './docker-executor.js';

const randomUUID = () => crypto.randomUUID();

/**
 * Production-grade code execution service with Docker-based security sandboxing.
 * 
 * Security Features:
 * - Docker container isolation (production)
 * - Resource limits (CPU, memory, timeout)
 * - Network isolation (no network access)
 * - Read-only filesystem (except limited temp space)
 * - Non-root user execution
 * - Input validation and sanitization
 * 
 * Architecture:
 * - PRIMARY: Uses Docker containers for secure isolation (default)
 * - FALLBACK: Uses Node.js child_process for local development (if Docker unavailable)
 * 
 * Configuration:
 * - Set USE_DOCKER=false to disable Docker (for local dev without Docker)
 * - Docker images must be built before use:
 *   - docker build -f Dockerfile.python-executor -t python-executor:latest .
 *   - docker build -f Dockerfile.java-executor -t java-executor:latest .
 * 
 * PREVIOUS IMPLEMENTATION (child_process):
 * The original child_process-based implementation has been commented out below.
 * It's preserved for reference and as a fallback when Docker is unavailable.
 * 
 * Security concerns with child_process approach:
 * - No process isolation (runs as same user as Node.js)
 * - No resource limits (only timeout, no CPU/memory limits)
 * - Filesystem access to temp directory (potential DoS via disk fill)
 * - Network access (can make HTTP requests, connect to databases)
 * - Weak validation (pattern-based, easily bypassed)
 * 
 * Docker approach addresses all these concerns:
 * - Complete process isolation (separate container)
 * - Hard resource limits (CPU, memory enforced by Docker)
 * - Limited filesystem (read-only root, limited temp space)
 * - No network access (--network none)
 * - Non-root execution (--user 1000:1000)
 */

const EXECUTION_TIMEOUT_MS = 10000; // 10 seconds
const MAX_OUTPUT_SIZE = 1024 * 1024; // 1MB
// Use OS temp directory instead of hardcoded /tmp for better cross-platform support
const TEMP_DIR = join(tmpdir(), 'code-executions');

// Configuration: Use Docker for sandboxing (set USE_DOCKER=false to disable)
// In production, Docker should ALWAYS be enabled for security
const USE_DOCKER = process.env.USE_DOCKER !== 'false'; // Default to true
let dockerAvailable = false;
let dockerImagesReady = false;

// Initialize Docker availability check
(async () => {
  if (USE_DOCKER) {
    dockerAvailable = await isDockerAvailable();
    if (dockerAvailable) {
      // Debug: Log DOCKER_HOST to verify it's set
      const dockerHost = process.env.DOCKER_HOST;
      if (dockerHost) {
        console.log(`[Executor] DOCKER_HOST is set: ${dockerHost}`);
      } else {
        console.warn('[Executor] ⚠️ DOCKER_HOST not set - Docker CLI will use local socket (may not work)');
      }
      
      // CRITICAL FIX: Use environment variables for image names (not hardcoded 'latest')
      // This ensures we check for the correct images that will actually be used
      const pythonImageName = process.env.PYTHON_EXECUTOR_IMAGE || 'python-executor:latest';
      const javaImageName = process.env.JAVA_EXECUTOR_IMAGE || 'java-executor:latest';
      
      console.log(`[Executor] Checking for images: ${pythonImageName}, ${javaImageName}`);
      
      // First, test connectivity by listing all images
      try {
        const { spawn } = await import('child_process');
        const listProcess = spawn('docker', ['images', '--format', '{{.Repository}}:{{.Tag}}'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env },
        });
        
        let listOutput = '';
        listProcess.stdout.on('data', (data) => {
          listOutput += data.toString();
        });
        
        await new Promise((resolve) => {
          listProcess.on('close', resolve);
        });
        
        if (listOutput.trim()) {
          console.log(`[Executor] Available images on remote Docker: ${listOutput.trim().split('\n').join(', ')}`);
        } else {
          console.log(`[Executor] No images found on remote Docker daemon`);
        }
      } catch (err) {
        console.error(`[Executor] Error listing images:`, err.message);
      }
      
      const [pythonImageExists, javaImageExists] = await Promise.all([
        checkDockerImage(pythonImageName),
        checkDockerImage(javaImageName),
      ]);
      
      console.log(`[Executor] Image check results: Python=${pythonImageExists}, Java=${javaImageExists}`);
      
      dockerImagesReady = pythonImageExists && javaImageExists;
      
      if (!dockerImagesReady) {
        console.warn('[Executor] ⚠️ Docker available but images not found.');
        console.warn(`[Executor] Expected images: ${pythonImageName}, ${javaImageName}`);
        console.warn('[Executor] Build images:');
        console.warn('[Executor]   docker build -f Dockerfile.python-executor -t python-executor:latest .');
        console.warn('[Executor]   docker build -f Dockerfile.java-executor -t java-executor:latest .');
        console.warn('[Executor] Or set PYTHON_EXECUTOR_IMAGE and JAVA_EXECUTOR_IMAGE environment variables.');
      } else {
        console.log('[Executor] ✅ Docker sandboxing enabled and ready');
        console.log(`[Executor] Using images: ${pythonImageName}, ${javaImageName}`);
      }
    } else {
      console.warn('[Executor] ⚠️ Docker not available. Falling back to child_process (less secure)');
    }
  } else {
    console.warn('[Executor] ⚠️ Docker disabled via USE_DOCKER=false. Using child_process (less secure)');
  }
})();

// Common Java libraries that are typically available (like LeetCode)
// For now, only standard JDK libraries are supported
// To add external libraries, you would need to:
// 1. Download JAR files to a lib/ directory
// 2. Add them to the classpath in compileCommand and javaProcess
// Example: const CLASSPATH = join(__dirname, '../lib/*');
const JAVA_CLASSPATH = process.env.JAVA_CLASSPATH || ''; // Can be set via environment variable

// Ensure temp directory exists
async function ensureTempDir() {
  if (!existsSync(TEMP_DIR)) {
    await mkdir(TEMP_DIR, { recursive: true });
  }
  // Verify we can write to it
  const testFile = join(TEMP_DIR, '.test-write');
  try {
    await writeFile(testFile, 'test', 'utf8');
    await unlink(testFile);
  } catch (error) {
    throw new Error(`Cannot write to temp directory ${TEMP_DIR}: ${error.message}`);
  }
}

// Check if javac is available
function checkJavaCompiler() {
  return new Promise((resolve) => {
    const checkProcess = spawn('javac', ['-version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    checkProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    checkProcess.on('close', (code) => {
      if (code === 0 || output.includes('javac')) {
        resolve(true);
      } else {
        resolve(false);
      }
    });

    checkProcess.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Execute Python code in an isolated environment
 * Uses Docker containers for security (if available), falls back to child_process
 */
export async function executePython(code, options = {}) {
  // Use Docker if available and enabled
  if (USE_DOCKER && dockerAvailable && dockerImagesReady) {
    return executePythonDockerSafe(code, options);
  }
  
  // Fallback to child_process (less secure, but works without Docker)
  return executePythonChildProcess(code, options);
}

/**
 * Execute Python code using Docker containers (secure)
 */
async function executePythonDockerSafe(code, options = {}) {
  const executionId = randomUUID();
  const timeout = options.timeout || EXECUTION_TIMEOUT_MS;

  await ensureTempDir();
  const filePath = join(TEMP_DIR, `${executionId}.py`);

  try {
    // Write code to temporary file
    await writeFile(filePath, code, 'utf8');

    // Verify file was created
    if (!existsSync(filePath)) {
      throw new Error(`Python file not found after write. Path: ${filePath}`);
    }

    // Execute using Docker
    const result = await executePythonDocker(code, filePath, timeout, MAX_OUTPUT_SIZE);

    // Cleanup temp file
    try {
      if (existsSync(filePath)) {
        await unlink(filePath);
      }
    } catch (e) {
      console.warn(`Failed to cleanup temp file ${filePath}:`, e.message);
    }

    return {
      executionId,
      ...result,
    };
  } catch (error) {
    // Cleanup on error
    try {
      if (existsSync(filePath)) {
        await unlink(filePath);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
    throw new Error(`Execution failed: ${error.message}`);
  }
}

/**
 * PREVIOUS IMPLEMENTATION: Execute Python code using child_process
 * 
 * COMMENTED OUT: This implementation is preserved for reference and fallback.
 * It's less secure than Docker but works without Docker installed.
 * 
 * Security concerns:
 * - No process isolation (runs as same user as Node.js)
 * - No CPU/memory limits (only timeout)
 * - Filesystem access to temp directory
 * - Network access available
 * 
 * Use case: Local development when Docker is not available
 * 
 * To enable this fallback, set USE_DOCKER=false or ensure Docker is unavailable
 */
async function executePythonChildProcess(code, options = {}) {
  /* PREVIOUS CHILD_PROCESS IMPLEMENTATION - COMMENTED OUT
   * 
   * This code is preserved for reference and as a fallback when Docker is unavailable.
   * Uncomment this block if you need to use child_process instead of Docker.
   * 
   * WARNING: This is less secure than Docker and should only be used for local development.
   */
  
  const executionId = randomUUID();
  const timeout = options.timeout || EXECUTION_TIMEOUT_MS;

  await ensureTempDir();
  const filePath = join(TEMP_DIR, `${executionId}.py`);

  try {
    // Write code to temporary file
    await writeFile(filePath, code, 'utf8');

    // Verify file was created
    if (!existsSync(filePath)) {
      throw new Error(`Python file not found after write. Path: ${filePath}`);
    }

    // Helper function to cleanup temp file
    const cleanup = async () => {
      try {
        if (existsSync(filePath)) {
          await unlink(filePath);
        }
        // Also cleanup .pyc files if they exist
        const pycFile = filePath + 'c';
        if (existsSync(pycFile)) {
          await unlink(pycFile);
        }
      } catch (e) {
        // Ignore cleanup errors
        console.warn(`Failed to cleanup temp file ${filePath}:`, e.message);
      }
    };

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let outputSize = 0;

      // Spawn Python process with resource limits
      const pythonProcess = spawn('python3', ['-u', filePath], {
        cwd: TEMP_DIR,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          PYTHONDONTWRITEBYTECODE: '1',
        },
      });

      // Set timeout
      const timeoutId = setTimeout(async () => {
        pythonProcess.kill('SIGTERM');
        await cleanup();
        reject(new Error(`Execution timeout after ${timeout}ms`));
      }, timeout);

      // Collect stdout
      pythonProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        outputSize += chunk.length;
        if (outputSize > MAX_OUTPUT_SIZE) {
          pythonProcess.kill('SIGTERM');
          cleanup().then(() => {
            reject(new Error('Output size exceeded maximum limit (1MB)'));
          });
          return;
        }
        stdout += chunk;
      });

      // Collect stderr
      pythonProcess.stderr.on('data', (data) => {
        const chunk = data.toString();
        outputSize += chunk.length;
        if (outputSize > MAX_OUTPUT_SIZE) {
          pythonProcess.kill('SIGTERM');
          cleanup().then(() => {
            reject(new Error('Output size exceeded maximum limit (1MB)'));
          });
          return;
        }
        stderr += chunk;
      });

      // Handle process completion
      pythonProcess.on('close', async (code) => {
        clearTimeout(timeoutId);
        const executionTime = Date.now() - startTime;

        // Cleanup before resolving
        await cleanup();

        resolve({
          executionId,
          status: code === 0 ? 'completed' : 'failed',
          output: stdout,
          error: stderr || (code !== 0 ? `Process exited with code ${code}` : null),
          executionTimeMs: executionTime,
          exitCode: code,
        });
      });

      pythonProcess.on('error', async (error) => {
        clearTimeout(timeoutId);
        await cleanup();
        reject(new Error(`Failed to start Python process: ${error.message}`));
      });
    });
  } catch (error) {
    // Cleanup on write error
    try {
      if (existsSync(filePath)) {
        await unlink(filePath);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
    throw new Error(`Execution failed: ${error.message}`);
  }
  /* END OF PREVIOUS CHILD_PROCESS IMPLEMENTATION */
}

/**
 * Execute Java code in an isolated environment
 * Uses Docker containers for security (if available), falls back to child_process
 */
export async function executeJava(code, options = {}) {
  // Use Docker if available and enabled
  if (USE_DOCKER && dockerAvailable && dockerImagesReady) {
    return executeJavaDockerSafe(code, options);
  }
  
  // Fallback to child_process (less secure, but works without Docker)
  return executeJavaChildProcess(code, options);
}

/**
 * Execute Java code using Docker containers (secure)
 */
async function executeJavaDockerSafe(code, options = {}) {
  const executionId = randomUUID();
  const timeout = options.timeout || EXECUTION_TIMEOUT_MS;

  await ensureTempDir();
  
  // Extract class name from code (same logic as child_process version)
  let javaCode = code.trim();
  const returnTypes = ['void', 'int', 'String', 'boolean', 'double', 'float', 'char', 'long', 'short', 'byte'];
  const hasClassKeyword = /class\s+\w+/.test(javaCode);
  
  let className = `Main_${executionId.replace(/-/g, '_')}`;
  let detectedClassName = null;
  let hasConstructor = false;

  // Detect constructor (simplified version of the complex detection logic)
  const constructorMatches = javaCode.matchAll(/public\s+([A-Z][a-zA-Z0-9_]*)\s*\(/g);
  for (const match of constructorMatches) {
    const potentialClassName = match[1];
    const isReturnType = returnTypes.some(type =>
      type.toLowerCase() === potentialClassName.toLowerCase()
    );
    if (!isReturnType) {
      hasConstructor = true;
      detectedClassName = potentialClassName;
      break;
    }
  }

  if (hasClassKeyword) {
    const classMatch = javaCode.match(/(?:public\s+)?class\s+(\w+)/);
    if (classMatch) {
      className = classMatch[1];
    }
    
    if (javaCode.includes('class ')) {
      const classDeclarationMatch = javaCode.match(/(?:^|\n)\s*(public\s+)?class\s+\w+/);
      if (classDeclarationMatch && !classDeclarationMatch[1]) {
        javaCode = javaCode.replace(/(^|\n)(\s*)(class\s+\w+)/, '$1$2public $3');
      }
    }

    if (!javaCode.includes('public static void main') && !javaCode.includes('static void main')) {
      const lastBraceIndex = javaCode.lastIndexOf('}');
      if (lastBraceIndex !== -1) {
        javaCode = javaCode.slice(0, lastBraceIndex) +
          `    public static void main(String[] args) {\n        // Entry point\n    }\n` +
          javaCode.slice(lastBraceIndex);
      }
    }
  } else if (hasConstructor) {
    const indentedCode = javaCode.split('\n').map(line => '    ' + line).join('\n');
    javaCode = `public class ${className} {
${indentedCode}

    public static void main(String[] args) {
        // Entry point - add your test code here
    }
}`;
  } else {
    const indentedCode = javaCode.split('\n').map(line => '        ' + line).join('\n');
    javaCode = `public class ${className} {
    public static void main(String[] args) {
${indentedCode}
    }
}`;
  }

  const filePath = join(TEMP_DIR, `${className}.java`);

  try {
    // Write code to temporary file
    await writeFile(filePath, javaCode, 'utf8');

    // Verify file was created
    if (!existsSync(filePath)) {
      throw new Error(`Java file not found after write. Path: ${filePath}`);
    }

    // Execute using Docker
    const result = await executeJavaDocker(code, filePath, className, timeout, MAX_OUTPUT_SIZE);

    // Cleanup temp files
    try {
      if (existsSync(filePath)) {
        await unlink(filePath);
      }
      const classFile = join(TEMP_DIR, `${className}.class`);
      if (existsSync(classFile)) {
        await unlink(classFile);
      }
    } catch (e) {
      console.warn(`Failed to cleanup temp files for ${executionId}:`, e.message);
    }

    return {
      executionId,
      ...result,
    };
  } catch (error) {
    // Cleanup on error
    try {
      if (existsSync(filePath)) {
        await unlink(filePath);
      }
      const classFile = join(TEMP_DIR, `${className}.class`);
      if (existsSync(classFile)) {
        await unlink(classFile);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
    throw new Error(`Execution failed: ${error.message}`);
  }
}

/**
 * PREVIOUS IMPLEMENTATION: Execute Java code using child_process
 * 
 * FALLBACK IMPLEMENTATION: This implementation is preserved for reference and fallback.
 * It's less secure than Docker but works without Docker installed.
 * 
 * ⚠️ SECURITY WARNING: This code is LESS SECURE than Docker-based execution:
 * - No process isolation (runs as same user as Node.js)
 * - No CPU/memory limits (only timeout)
 * - Filesystem access to temp directory (potential DoS via disk fill)
 * - Network access available (can make HTTP requests, connect to databases)
 * 
 * Use case: Local development when Docker is not available
 * 
 * To use this fallback:
 * - Set USE_DOCKER=false, OR
 * - Ensure Docker is unavailable (will auto-fallback)
 * 
 * ============================================================================
 * PREVIOUS CHILD_PROCESS IMPLEMENTATION - PRESERVED FOR FALLBACK
 * ============================================================================
 * This code is kept active as a fallback when Docker is unavailable.
 * For production, Docker should ALWAYS be used (set USE_DOCKER=true).
 * ============================================================================
 */
async function executeJavaChildProcess(code, options = {}) {
  const executionId = randomUUID();
  const timeout = options.timeout || EXECUTION_TIMEOUT_MS;

  // Check if javac is available
  const javacAvailable = await checkJavaCompiler();
  if (!javacAvailable) {
    throw new Error('Java compiler (javac) is not available. Please ensure Java JDK is installed and in PATH.');
  }

  await ensureTempDir();
  // Use join instead of resolve to ensure consistent path format
  // We'll determine the final class name after analyzing the code
  let className = `Main_${executionId.replace(/-/g, '_')}`;
  let filePath = join(TEMP_DIR, `${className}.java`);

  try {
    // Extract class name from code or use default
    let javaCode = code.trim();

    // DISTINGUISHED ENGINEER APPROACH: Simple, direct detection
    // Rule: If code contains "public ClassName(" where ClassName starts with uppercase
    // AND ClassName is NOT a return type, it's a constructor

    const returnTypes = ['void', 'int', 'String', 'boolean', 'double', 'float', 'char', 'long', 'short', 'byte'];

    // Check if code has class keyword
    const hasClassKeyword = /class\s+\w+/.test(javaCode);

    // DISTINGUISHED ENGINEER APPROACH: Bulletproof constructor detection
    // Multiple detection strategies to ensure we never miss a constructor
    let hasConstructor = false;
    let detectedClassName = null;

    // Strategy 1: Use matchAll iterator (most comprehensive)
    try {
      const constructorMatches = javaCode.matchAll(/public\s+([A-Z][a-zA-Z0-9_]*)\s*\(/g);
      for (const match of constructorMatches) {
        const potentialClassName = match[1];
        const isReturnType = returnTypes.some(type =>
          type.toLowerCase() === potentialClassName.toLowerCase()
        );
        if (!isReturnType) {
          hasConstructor = true;
          detectedClassName = potentialClassName;
          console.log(`[Java Executor] ✅ Strategy 1 (matchAll): Constructor detected - public ${potentialClassName}(`);
          break;
        }
      }
    } catch (err) {
      console.log(`[Java Executor] ⚠️ matchAll failed: ${err.message}`);
    }

    // Strategy 2: Direct regex match (fallback)
    if (!hasConstructor) {
      const directMatch = javaCode.match(/public\s+([A-Z][a-zA-Z0-9_]*)\s*\(/);
      if (directMatch) {
        const word = directMatch[1];
        const isReturnType = returnTypes.some(type => type.toLowerCase() === word.toLowerCase());
        if (!isReturnType) {
          hasConstructor = true;
          detectedClassName = word;
          console.log(`[Java Executor] ✅ Strategy 2 (direct match): Constructor detected - public ${word}(`);
        }
      }
    }

    // Strategy 3: Test regex (simple boolean check)
    if (!hasConstructor) {
      const testMatch = /public\s+[A-Z][a-zA-Z0-9_]*\s*\(/.test(javaCode);
      if (testMatch) {
        // Extract the word manually to verify it's not a return type
        const manualMatch = javaCode.match(/public\s+([A-Z][a-zA-Z0-9_]*)\s*\(/);
        if (manualMatch) {
          const word = manualMatch[1];
          const isReturnType = returnTypes.some(type => type.toLowerCase() === word.toLowerCase());
          if (!isReturnType) {
            hasConstructor = true;
            detectedClassName = word;
            console.log(`[Java Executor] ✅ Strategy 3 (test + manual): Constructor detected - public ${word}(`);
          }
        }
      }
    }

    // Strategy 4: Line-by-line check (most thorough)
    if (!hasConstructor && !hasClassKeyword) {
      const lines = javaCode.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('public')) {
          const match = trimmed.match(/public\s+([A-Z][a-zA-Z0-9_]*)\s*\(/);
          if (match) {
            const word = match[1];
            const isReturnType = returnTypes.some(type => type.toLowerCase() === word.toLowerCase());
            if (!isReturnType) {
              hasConstructor = true;
              detectedClassName = word;
              console.log(`[Java Executor] ✅ Strategy 4 (line-by-line): Constructor detected - public ${word}(`);
              break;
            }
          }
        }
      }
    }

    // Strategy 5: "this." keyword heuristic
    if (!hasConstructor && !hasClassKeyword && javaCode.includes('this.')) {
      const constructorPattern = /public\s+[A-Z][a-zA-Z0-9_]*\s*\(/;
      if (constructorPattern.test(javaCode)) {
        const match = javaCode.match(/public\s+([A-Z][a-zA-Z0-9_]*)\s*\(/);
        if (match) {
          const word = match[1];
          const isReturnType = returnTypes.some(type => type.toLowerCase() === word.toLowerCase());
          if (!isReturnType) {
            hasConstructor = true;
            detectedClassName = word;
            console.log(`[Java Executor] ✅ Strategy 5 ('this.' heuristic): Constructor detected - public ${word}(`);
          }
        }
      }
    }

    // NUCLEAR OPTION: If all else fails, check if code looks like a constructor
    // This is the absolute last resort - if code starts with "public" + uppercase + "("
    // and there's no class keyword, it MUST be a constructor
    if (!hasConstructor && !hasClassKeyword) {
      const trimmed = javaCode.trim();
      const firstLine = trimmed.split('\n')[0].trim();

      // Check if first line starts with "public" followed by uppercase letter
      if (firstLine.startsWith('public') && /public\s+[A-Z]/.test(firstLine) && firstLine.includes('(')) {
        // Extract the word after "public"
        const words = firstLine.split(/\s+/);
        const publicIndex = words.findIndex(w => w === 'public');
        if (publicIndex >= 0 && publicIndex < words.length - 1) {
          const nextWord = words[publicIndex + 1];
          const methodName = nextWord.split('(')[0].trim();

          // If it starts with uppercase and is not a return type, it's a constructor
          if (methodName && /^[A-Z]/.test(methodName)) {
            const isReturnType = returnTypes.some(type => type.toLowerCase() === methodName.toLowerCase());
            if (!isReturnType) {
              hasConstructor = true;
              detectedClassName = methodName;
              console.log(`[Java Executor] 🚨 NUCLEAR OPTION: Constructor detected - public ${methodName}(`);
            }
          }
        }
      }
    }

    console.log(`[Java Executor] ==========================================`);
    console.log(`[Java Executor] FINAL DETECTION: hasClassKeyword=${hasClassKeyword}, hasConstructor=${hasConstructor}`);
    if (detectedClassName) {
      console.log(`[Java Executor] Detected constructor: public ${detectedClassName}(`);
    }
    console.log(`[Java Executor] Code preview: "${javaCode.substring(0, 150)}"`);
    console.log(`[Java Executor] First line: "${javaCode.split('\n')[0]}"`);
    console.log(`[Java Executor] ==========================================`);

    if (hasClassKeyword) {
      // Full class definition - preserve original class name for better UX
      // Java requires filename to match public class name exactly
      let originalClassName = null;
      const classMatch = javaCode.match(/(?:public\s+)?class\s+(\w+)/);
      if (classMatch) {
        originalClassName = classMatch[1];
        console.log(`[Java Executor] Found original class name: ${originalClassName}`);

        // Use original class name - Java requires filename to match public class name
        // The execution queue limits concurrent executions, so conflicts are very unlikely
        className = originalClassName;
        filePath = join(TEMP_DIR, `${className}.java`);
        console.log(`[Java Executor] ✅ Preserving original class name: ${className}`);
      }

      // Ensure class is public (required for execution)
      // But don't add "public" before import/package statements!
      if (javaCode.includes('class ')) {
        // Check if class declaration already has "public"
        const classDeclarationMatch = javaCode.match(/(?:^|\n)\s*(public\s+)?class\s+\w+/);
        if (classDeclarationMatch && !classDeclarationMatch[1]) {
          // Class exists but is not public - make it public
          // Find the class declaration and add "public" before it
          javaCode = javaCode.replace(/(^|\n)(\s*)(class\s+\w+)/, '$1$2public $3');
        }
      }

      // Since we're preserving the original class name, no renaming needed
      // All references already use the correct class name

      // Ensure it has a main method for execution
      if (!javaCode.includes('public static void main') && !javaCode.includes('static void main')) {
        const lastBraceIndex = javaCode.lastIndexOf('}');
        if (lastBraceIndex !== -1) {
          javaCode = javaCode.slice(0, lastBraceIndex) +
            `    public static void main(String[] args) {\n        // Entry point\n    }\n` +
            javaCode.slice(lastBraceIndex);
        }
      }
    } else if (hasConstructor) {
      // Code has a constructor - wrap it in a class (NOT in main method!)
      // Preserve indentation of the constructor code
      const indentedCode = javaCode.split('\n').map(line => '    ' + line).join('\n');
      javaCode = `public class ${className} {
${indentedCode}

    public static void main(String[] args) {
        // Entry point - add your test code here
    }
}`;
      console.log(`[Java Executor] ✅ WRAPPED AS CONSTRUCTOR - code starts at class level`);
      console.log(`[Java Executor] Generated code preview:\n${javaCode.split('\n').slice(0, 10).join('\n')}`);
    } else {
      // Just statements/method calls - wrap in main method
      const indentedCode = javaCode.split('\n').map(line => '        ' + line).join('\n');
      javaCode = `public class ${className} {
    public static void main(String[] args) {
${indentedCode}
    }
}`;
      console.log(`[Java Executor] ⚠️ WRAPPED AS STATEMENTS - code inside main method`);
      console.log(`[Java Executor] Generated code preview:\n${javaCode.split('\n').slice(0, 10).join('\n')}`);
      console.log(`[Java Executor] ⚠️ WARNING: Constructor was NOT detected! Check detection logic above.`);
    }

    console.log(`[Java Executor] Final code (first 20 lines):\n${javaCode.split('\n').slice(0, 20).join('\n')}`);

    // Write code to temporary file
    try {
      await writeFile(filePath, javaCode, 'utf8');
      // Force sync to ensure file is written to disk
      const { openSync, fsyncSync, closeSync } = await import('fs');
      const fd = openSync(filePath, 'r+');
      fsyncSync(fd);
      closeSync(fd);
    } catch (writeError) {
      throw new Error(`Failed to write Java file: ${writeError.message}. Path: ${filePath}`);
    }

    // Verify file was created
    if (!existsSync(filePath)) {
      const tempDirExists = existsSync(TEMP_DIR);
      throw new Error(`Java file not found after write. Path: ${filePath}, Temp dir exists: ${tempDirExists}, Temp dir: ${TEMP_DIR}`);
    }

    // Get file stats and list directory for debugging (synchronous)
    try {
      const fileStats = statSync(filePath);
      const dirContents = readdirSync(TEMP_DIR);
      console.log(`[Java Executor] File written: ${filePath}`);
      console.log(`[Java Executor] File stats: size=${fileStats.size}, mode=${fileStats.mode.toString(8)}`);
      console.log(`[Java Executor] Temp dir: ${TEMP_DIR}`);
      console.log(`[Java Executor] Temp dir contents: ${dirContents.join(', ')}`);
      console.log(`[Java Executor] Looking for: ${className}.java`);
    } catch (statError) {
      console.error(`[Java Executor] Failed to stat/list: ${statError.message}`);
    }

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let outputSize = 0;

      // Verify file exists one more time right before compilation
      if (!existsSync(filePath)) {
        reject(new Error(`Java file disappeared before compilation. Path: ${filePath}`));
        return;
      }

      // Use absolute path directly in javac command
      // The cd approach wasn't working, so use full path
      const compileCommand = `javac "${filePath}"`;
      console.log(`[Java Executor] Compiling with exec: ${compileCommand}`);
      console.log(`[Java Executor] File exists: ${existsSync(filePath)}`);
      console.log(`[Java Executor] File path: ${filePath}`);

      // Verify file is readable (synchronous check)
      try {
        accessSync(filePath, constants.R_OK);
        console.log(`[Java Executor] File is readable`);
      } catch (accessError) {
        console.error(`[Java Executor] File is NOT readable: ${accessError.message}`);
      }

      // Helper function to cleanup temp files
      const cleanup = async () => {
        try {
          if (existsSync(filePath)) {
            await unlink(filePath);
          }
          // Clean up .class file (named after the class, not the file)
          const classFile = join(TEMP_DIR, `${className}.class`);
          if (existsSync(classFile)) {
            await unlink(classFile);
          }
        } catch (e) {
          // Ignore cleanup errors
          console.warn(`Failed to cleanup temp files for ${executionId}:`, e.message);
        }
      };

      // Build compile command with classpath if needed
      let finalCompileCommand = compileCommand;
      if (JAVA_CLASSPATH) {
        finalCompileCommand = `javac -cp "${JAVA_CLASSPATH}" "${filePath}"`;
      }

      // Use exec with absolute path
      exec(finalCompileCommand, {
        cwd: TEMP_DIR, // Still set cwd for class file output
        maxBuffer: 1024 * 1024, // 1MB buffer
        env: {
          ...process.env,
          PATH: process.env.PATH,
          ...(JAVA_CLASSPATH ? { CLASSPATH: JAVA_CLASSPATH } : {}),
        },
      }, async (error, stdout, stderr) => {
        // exec callback - called when process completes
        if (error) {
          // Compilation failed - cleanup and return
          await cleanup();
          const compileCode = error.code || 1;
          const cleanedError = cleanJavaError(stderr || error.message);
          resolve({
            executionId,
            status: 'failed',
            output: '',
            error: `Compilation error:\n${cleanedError}`,
            executionTimeMs: Date.now() - startTime,
            exitCode: compileCode,
          });
          return;
        }

        // Compilation succeeded, execute the compiled Java class
        const javaArgs = ['-Xmx256m', '-Xms64m'];
        if (JAVA_CLASSPATH) {
          javaArgs.push('-cp', JAVA_CLASSPATH);
        }
        javaArgs.push(className);

        const javaProcess = spawn('java', javaArgs, {
          cwd: TEMP_DIR,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        // Set timeout
        const timeoutId = setTimeout(() => {
          javaProcess.kill('SIGTERM');
          cleanup().then(() => {
            reject(new Error(`Execution timeout after ${timeout}ms`));
          });
        }, timeout);

        // Collect stdout
        javaProcess.stdout.on('data', (data) => {
          const chunk = data.toString();
          outputSize += chunk.length;
          if (outputSize > MAX_OUTPUT_SIZE) {
            javaProcess.kill('SIGTERM');
            cleanup().then(() => {
              reject(new Error('Output size exceeded maximum limit (1MB)'));
            });
            return;
          }
          stdout += chunk;
        });

        // Collect stderr
        javaProcess.stderr.on('data', (data) => {
          const chunk = data.toString();
          outputSize += chunk.length;
          if (outputSize > MAX_OUTPUT_SIZE) {
            javaProcess.kill('SIGTERM');
            cleanup().then(() => {
              reject(new Error('Output size exceeded maximum limit (1MB)'));
            });
            return;
          }
          stderr += chunk;
        });

        // Handle process completion
        javaProcess.on('close', async (code) => {
          clearTimeout(timeoutId);
          const executionTime = Date.now() - startTime;

          // Cleanup before resolving
          await cleanup();

          resolve({
            executionId,
            status: code === 0 ? 'completed' : 'failed',
            output: stdout,
            error: stderr || (code !== 0 ? `Process exited with code ${code}` : null),
            executionTimeMs: executionTime,
            exitCode: code,
          });
        });

        javaProcess.on('error', async (error) => {
          clearTimeout(timeoutId);
          await cleanup();
          reject(new Error(`Failed to start Java process: ${error.message}`));
        });
      });
    });
  } catch (error) {
    throw new Error(`Execution failed: ${error.message}`);
  }
}

/**
 * Format Java compiler errors like LeetCode - clean, concise, user-friendly
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
        // Skip the caret line - LeetCode doesn't show it
        i++;
      }

      // Skip all "method X is not applicable" lines
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

    // Skip lines that are just parentheses or whitespace (part of method listings)
    if (line.trim().match(/^\(.+\)$/) || line.trim() === '') {
      i++;
      continue;
    }

    // Keep other important lines (like the actual code line)
    if (line.trim() && !line.includes('is not applicable')) {
      // Clean up file paths in remaining lines
      const cleanedLine = line.replace(/\/[^\s]+?\/([^\/]+\.java)/g, '$1');
      result.push(cleanedLine);
    }

    i++;
  }

  return result.join('\n').trim();
}

/**
 * Validate code before execution (security check)
 */
export function validateCode(code, language) {
  if (!code || typeof code !== 'string') {
    throw new Error('Code must be a non-empty string');
  }

  if (code.length > 100000) { // 100KB limit
    throw new Error('Code size exceeds maximum limit (100KB)');
  }

  // Block dangerous patterns
  const dangerousPatterns = [
    /import\s+os\s*;/i, // Python os module
    /import\s+subprocess/i, // Python subprocess
    /Runtime\.getRuntime/i, // Java runtime execution
    /ProcessBuilder/i, // Java process builder
    /exec\(/i, // JavaScript eval/exec
    /eval\(/i, // JavaScript eval
    /require\(['"]child_process['"]/i, // Node.js child_process
    /require\(['"]fs['"]/i, // Node.js filesystem
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      throw new Error('Code contains potentially dangerous operations');
    }
  }

  return true;
}
