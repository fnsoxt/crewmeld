/**
 * Tool code security check
 * Spec source: docs/skills-specs/security-check.md
 */

export interface SecurityCheckResult {
  passed: boolean
  errors: string[]
  warnings: string[]
  /** Security items requiring user confirmation to proceed (e.g. import/require) */
  confirmations: string[]
}

// ---------------------------------------------------------------------------
// Dependency extraction - extract specific package names from import/require
// ---------------------------------------------------------------------------

// Python standard library (no pip install needed, should not appear in confirmation list)
const PY_STDLIB = new Set([
  'abc',
  'argparse',
  'array',
  'ast',
  'asyncio',
  'atexit',
  'base64',
  'binascii',
  'bisect',
  'builtins',
  'calendar',
  'cgi',
  'cmd',
  'code',
  'codecs',
  'collections',
  'colorsys',
  'compileall',
  'concurrent',
  'configparser',
  'contextlib',
  'contextvars',
  'copy',
  'csv',
  'ctypes',
  'dataclasses',
  'datetime',
  'dbm',
  'decimal',
  'difflib',
  'dis',
  'email',
  'encodings',
  'enum',
  'errno',
  'faulthandler',
  'filecmp',
  'fileinput',
  'fnmatch',
  'fractions',
  'ftplib',
  'functools',
  'gc',
  'getopt',
  'getpass',
  'gettext',
  'glob',
  'gzip',
  'hashlib',
  'heapq',
  'hmac',
  'html',
  'http',
  'imaplib',
  'importlib',
  'inspect',
  'io',
  'ipaddress',
  'itertools',
  'json',
  'keyword',
  'linecache',
  'locale',
  'logging',
  'lzma',
  'mailbox',
  'math',
  'mimetypes',
  'mmap',
  'multiprocessing',
  'netrc',
  'numbers',
  'operator',
  'os',
  'pathlib',
  'pdb',
  'pickle',
  'platform',
  'plistlib',
  'poplib',
  'posixpath',
  'pprint',
  'profile',
  'pstats',
  'queue',
  'random',
  're',
  'readline',
  'reprlib',
  'resource',
  'runpy',
  'sched',
  'secrets',
  'select',
  'selectors',
  'shelve',
  'shlex',
  'shutil',
  'signal',
  'site',
  'smtplib',
  'socket',
  'socketserver',
  'sqlite3',
  'ssl',
  'stat',
  'statistics',
  'string',
  'struct',
  'subprocess',
  'sys',
  'sysconfig',
  'tarfile',
  'tempfile',
  'textwrap',
  'threading',
  'time',
  'timeit',
  'tkinter',
  'token',
  'tokenize',
  'tomllib',
  'trace',
  'traceback',
  'tracemalloc',
  'tty',
  'turtle',
  'types',
  'typing',
  'unicodedata',
  'unittest',
  'urllib',
  'uuid',
  'venv',
  'warnings',
  'wave',
  'weakref',
  'webbrowser',
  'xml',
  'xmlrpc',
  'zipfile',
  'zipimport',
  'zlib',
  '_thread',
])

// Node.js built-in modules
const JS_BUILTIN = new Set([
  'assert',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'dns',
  'domain',
  'events',
  'fs',
  'http',
  'http2',
  'https',
  'inspector',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'repl',
  'stream',
  'string_decoder',
  'sys',
  'timers',
  'tls',
  'trace_events',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'wasi',
  'worker_threads',
  'zlib',
])

/** Extract 3rd-party deps from JS (excluding built-ins) */
function extractJsImports(code: string): string[] {
  const pkgs = new Set<string>()
  const importRe = /\bimport\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = importRe.exec(code)) !== null) {
    const pkg = m[1].startsWith('@') ? m[1] : m[1].split('/')[0]
    if (!JS_BUILTIN.has(pkg) && !pkg.startsWith('node:') && !pkg.startsWith('.')) pkgs.add(pkg)
  }
  const requireRe = /\brequire\s*\(\s*['"]([^'"./][^'"]*)['"]\s*\)/g
  while ((m = requireRe.exec(code)) !== null) {
    const pkg = m[1].startsWith('@') ? m[1] : m[1].split('/')[0]
    if (!JS_BUILTIN.has(pkg) && !pkg.startsWith('node:')) pkgs.add(pkg)
  }
  return Array.from(pkgs)
}

/** Extract 3rd-party deps from Python (excluding stdlib) */
function extractPyImports(code: string): string[] {
  const pkgs = new Set<string>()
  const importRe = /^(?:import|from)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm
  let m: RegExpExecArray | null
  while ((m = importRe.exec(code)) !== null) {
    if (!PY_STDLIB.has(m[1])) {
      pkgs.add(m[1])
    }
  }
  return Array.from(pkgs)
}

// ---------------------------------------------------------------------------
// JavaScript rules
// ---------------------------------------------------------------------------

// Rules requiring user confirmation (confirmations) - excluding import/require, handled separately
const JS_CONFIRM_PATTERNS: { pattern: RegExp; message: string }[] = [
  { pattern: /\bfs\./, message: 'Code uses filesystem operations (fs)' },
  { pattern: /child_process/, message: 'Code uses child_process' },
  { pattern: /\beval\s*\(/, message: 'Code uses eval()' },
  { pattern: /new\s+Function\s*\(/, message: 'Code uses new Function()' },
  { pattern: /__proto__/, message: 'Code accesses __proto__ (prototype pollution risk)' },
  { pattern: /\.constructor\s*\(/, message: 'Code accesses constructor (sandbox escape risk)' },
]

// Blocking rules (errors) - completely forbidden, cannot be bypassed
const JS_BLOCKED_PATTERNS: { pattern: RegExp; message: string }[] = [
  {
    pattern: /\bprocess\.(?!env\b)/,
    message: 'Access to process object forbidden (except process.env)',
  },
]

// ---------------------------------------------------------------------------
// Python rules
// ---------------------------------------------------------------------------

/** Check if subprocess is only used for allowed install ops (pip install / playwright install / install-deps) */
function isSubprocessOnlyForAllowedInstalls(code: string): boolean {
  if (!/\bsubprocess\b/.test(code)) return true
  // Remove all allowed subprocess calls, check for remaining
  let stripped = code
  // 1. subprocess.check_call([...pip install...])
  stripped = stripped.replace(
    /subprocess\.check_call\s*\(\s*\[.*?['"]pip['"]\s*,\s*['"]install['"].*?\][^)]*\)/gs,
    ''
  )
  // 2. subprocess.check_call([...playwright install...]) and subprocess.check_call([...playwright install-deps...])
  stripped = stripped.replace(
    /subprocess\.check_call\s*\(\s*\[.*?['"]playwright['"]\s*,\s*['"]install(?:-deps)?['"].*?\][^)]*\)/gs,
    ''
  )
  // 3. Remove subprocess.DEVNULL and subprocess.CalledProcessError refs (not dangerous)
  stripped = stripped.replace(/subprocess\.DEVNULL/g, '')
  stripped = stripped.replace(/subprocess\.CalledProcessError/g, '')
  return !/\bsubprocess\b/.test(stripped)
}

const PY_CONFIRM_PATTERNS: { pattern: RegExp; message: string }[] = [
  { pattern: /\bos\.system\s*\(/, message: 'Code uses os.system' },
  { pattern: /\bos\.popen\s*\(/, message: 'Code uses os.popen' },
  { pattern: /\b__import__\s*\(/, message: 'Code uses __import__' },
]

/** Separate subprocess check: allowed only for pip install / playwright install, otherwise needs confirmation */
const PY_SUBPROCESS_CONFIRM = {
  pattern: /\bsubprocess\b/,
  message: 'Code uses subprocess module (non-install usage)',
}

const PY_BLOCKED_PATTERNS: { pattern: RegExp; message: string }[] = [
  { pattern: /\bexec\s*\(/, message: 'Forbidden: exec() (dynamic code execution)' },
  { pattern: /\beval\s*\(/, message: 'Forbidden: eval() (dynamic code execution)' },
]

// ---------------------------------------------------------------------------
// Common rules
// ---------------------------------------------------------------------------

// Warning rules (warnings)
const WARNING_PATTERNS: { pattern: RegExp; message: string }[] = [
  {
    pattern: /['"]sk-[a-zA-Z0-9]{20,}['"]/,
    message: 'Suspected hardcoded API Key detected, consider passing as parameter',
  },
  {
    pattern: /['"]Bearer\s+[a-zA-Z0-9._-]{20,}['"]/,
    message: 'Suspected hardcoded Bearer Token detected, consider passing as parameter',
  },
  {
    pattern: /password\s*[:=]\s*['"][^'"]{6,}['"]/,
    message: 'Suspected hardcoded password detected, consider passing as parameter',
  },
  {
    pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY/,
    message: 'Suspected embedded private key detected, consider passing as parameter',
  },
]

const SAFE_IDENT = /^[\p{L}_$][\p{L}\p{N}_$]*$/u
const MAX_CODE_SIZE = 100 * 1024 // 100KB

export function checkSecurity(
  code: string,
  paramNames: string[] = [],
  language: 'javascript' | 'python' = 'javascript'
): SecurityCheckResult {
  const errors: string[] = []
  const warnings: string[] = []
  const confirmations: string[] = []

  const isJs = language === 'javascript'
  const confirmPatterns = isJs ? JS_CONFIRM_PATTERNS : PY_CONFIRM_PATTERNS
  const blockedPatterns = isJs ? JS_BLOCKED_PATTERNS : PY_BLOCKED_PATTERNS

  // 0. Dependency import detection - extract package names, generate confirmation
  const imports = isJs ? extractJsImports(code) : extractPyImports(code)
  if (imports.length > 0) {
    const pkgList = imports.map((pkg) => `  · ${pkg}`).join('\n')
    confirmations.push(
      `Code imports the following dependencies (will be auto-installed on deploy):\n${pkgList}\nPlease confirm these dependencies are necessary`
    )
  }

  // 1. Keywords requiring confirmation (excluding import/require)
  for (const rule of confirmPatterns) {
    if (rule.pattern.test(code)) {
      confirmations.push(rule.message)
    }
  }

  // Python subprocess: allowed only for pip install
  if (
    !isJs &&
    PY_SUBPROCESS_CONFIRM.pattern.test(code) &&
    !isSubprocessOnlyForAllowedInstalls(code)
  ) {
    confirmations.push(PY_SUBPROCESS_CONFIRM.message)
  }

  // 2. Forbidden keywords
  for (const rule of blockedPatterns) {
    if (rule.pattern.test(code)) {
      errors.push(rule.message)
    }
  }

  // 3. Hardcoded secrets
  for (const rule of WARNING_PATTERNS) {
    if (rule.pattern.test(code)) {
      warnings.push(rule.message)
    }
  }

  // 4. Parameter name validity
  for (const name of paramNames) {
    if (!SAFE_IDENT.test(name)) {
      errors.push(
        `Invalid parameter name: ${name} (only letters, digits, underscores, and $ allowed)`
      )
    }
  }

  // 5. Result output check
  if (isJs) {
    if (!/\breturn\b/.test(code)) {
      errors.push('Code missing return statement, tool must return a result')
    }
  } else {
    if (!/\bresult\s*=/.test(code)) {
      errors.push(
        'Code missing result variable assignment, Python tool must assign result to the result variable'
      )
    }
  }

  // 6. Code size
  if (code.length > MAX_CODE_SIZE) {
    errors.push(
      `Code size exceeds limit: ${(code.length / 1024).toFixed(1)}KB, maximum allowed 100KB`
    )
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    confirmations,
  }
}
