/**
 * Tool-chat system prompt builder.
 *
 * All natural-language text comes from the locale system (`messages[locale].prompts.toolChat`).
 * Code examples (JS/Python snippets) are language-neutral and stay inline here.
 */

import type { Locale } from '@/locales'
import { messages } from '@/locales'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiKeyEntry {
  name: string
  value: string
}

export interface ConnectionEntry {
  name: string
  type: string
  dbType?: string
  typeLabel: string
  envVars: Array<{ envName: string; label: string }>
}

export interface ToolChatSpecs {
  codeSpec: string
  securitySpec: string
  inputReqSpec: string
  testingSpec: string
}

// ---------------------------------------------------------------------------
// Code examples (language-neutral, shared between zh/en)
// ---------------------------------------------------------------------------

const JSON_SCHEMA_EXAMPLE = `\`\`\`json
{
  "title": "{titleField}",
  "description": "{descField}",
  "parameters": {
    "type": "object",
    "properties": {
      "paramName": { "type": "string", "description": "{paramDescField}" }
    },
    "required": ["{requiredField}"]
  },
  "code": "{codeField}",
  "testParams": { "paramName": "{testParamsField}" }
}
\`\`\``

const SCRAPING_PREFERRED_CODE = `\`\`\`python
import subprocess, sys
subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--break-system-packages', 'requests', 'beautifulsoup4', 'boto3'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
import requests
from bs4 import BeautifulSoup
\`\`\``

const SCRAPING_FALLBACK_CODE = `\`\`\`python
# playwright package is preinstalled by Deployment, no pip install needed in code
import subprocess, sys, os
from playwright.sync_api import sync_playwright

# Browser binaries are cached on the PVC; they are only downloaded the first time (then skipped)
_cache = '/root/.cache/ms-playwright'
_has_browser = os.path.isdir(_cache) and any(d.startswith('chromium') for d in os.listdir(_cache))
if not _has_browser:
    subprocess.check_call([sys.executable, '-m', 'playwright', 'install', 'chromium'],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
# System shared libraries (libnspr4, etc.) are not on the PVC and must be installed on every Pod startup
try:
    subprocess.check_call([sys.executable, '-m', 'playwright', 'install-deps', 'chromium'],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
except Exception:
    pass  # Ignore when install-deps is unsupported (e.g. on Alpine)
\`\`\``

const DYNAMIC_DEPS_PYTHON_CODE = `\`\`\`python
import subprocess, sys

# Detect before installing — already-installed packages are skipped
def ensure_packages(*packages):
    missing = []
    for pkg in packages:
        try:
            __import__(pkg)
        except ImportError:
            missing.append(pkg)
    if missing:
        try:
            subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--break-system-packages',
                                   '-i', 'https://pypi.tuna.tsinghua.edu.cn/simple',
                                   '--trusted-host', 'pypi.tuna.tsinghua.edu.cn'] + missing,
                                  stdout=subprocess.DEVNULL)
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f'pip install {" ".join(missing)} failed (exit code {e.returncode})') from e

ensure_packages('requests', 'boto3', 'openpyxl')  # Replace with actual dependencies

import requests
import boto3
import openpyxl
\`\`\``

const DYNAMIC_DEPS_PYTHON_NOTE_CODE = `\`\`\`python
try:
    from bs4 import BeautifulSoup
except ImportError:
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--break-system-packages',
                           '-i', 'https://pypi.tuna.tsinghua.edu.cn/simple',
                           '--trusted-host', 'pypi.tuna.tsinghua.edu.cn', 'beautifulsoup4'],
                          stdout=subprocess.DEVNULL)
    from bs4 import BeautifulSoup
\`\`\``

const DYNAMIC_DEPS_JS_CODE = `\`\`\`javascript
const { execSync } = require('child_process');
try {
  require.resolve('playwright');
} catch {
  execSync('npm install playwright', { stdio: 'ignore' });
}
const { chromium } = require('playwright');
\`\`\``

const DB_CODE_MYSQL = `\`\`\`javascript
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection({
  host: process.env.CONN_HOST,
  port: Number(process.env.CONN_PORT) || 3306,
  user: process.env.CONN_USERNAME,
  password: process.env.CONN_PASSWORD,
  database: process.env.CONN_DATABASE,
});
const [rows] = await conn.execute('SELECT 1');
await conn.end();
\`\`\``

const DB_CODE_POSTGRESQL = `\`\`\`javascript
import pg from 'pg';
const client = new pg.Client({
  host: process.env.CONN_HOST,
  port: Number(process.env.CONN_PORT) || 5432,
  user: process.env.CONN_USERNAME,
  password: process.env.CONN_PASSWORD,
  database: process.env.CONN_DATABASE,
});
await client.connect();
const res = await client.query('SELECT 1');
await client.end();
\`\`\``

const DB_CODE_MONGODB = `\`\`\`javascript
import { MongoClient } from 'mongodb';
const url = process.env.CONN_CONNECTION_STRING || \`mongodb://\${process.env.CONN_USERNAME}:\${process.env.CONN_PASSWORD}@\${process.env.CONN_HOST}:\${process.env.CONN_PORT || 27017}\`;
const client = new MongoClient(url);
await client.connect();
\`\`\``

// ---------------------------------------------------------------------------
// Base prompt builder
// ---------------------------------------------------------------------------

function buildBasePrompt(
  t: (typeof messages)['zh-CN']['prompts']['toolChat'],
  specs: ToolChatSpecs
): string {
  const jsonExample = JSON_SCHEMA_EXAMPLE.replace('{titleField}', t.jsonTitleField)
    .replace('{descField}', t.jsonDescField)
    .replace('{paramDescField}', t.jsonParamDescField)
    .replace('{requiredField}', t.jsonRequiredField)
    .replace('{codeField}', t.jsonCodeField)
    .replace('{testParamsField}', t.jsonTestParamsField)

  return [
    t.roleIntro,
    '',
    `## ${t.workflowTitle}`,
    t.workflowItems,
    '',
    `## ${t.thinkingTitle}`,
    t.thinkingItems,
    '',
    `## ${t.codeGenTitle}`,
    t.codeGenDesc,
    jsonExample,
    '',
    `## ${t.testParamsTitle}`,
    t.testParamsItems,
    '',
    `## ${t.apiKeyPriorityTitle}`,
    t.apiKeyPriorityDesc,
    t.apiKeyPriorityItems,
    '',
    `## ${t.pauseTitle}`,
    t.pauseDesc,
    t.pauseItems,
    '',
    `## ${t.paramNamingTitle}`,
    t.paramNamingItems,
    '',
    `## ${t.justAnsweringTitle}`,
    t.justAnsweringDesc,
    '',
    `## ${t.inputReqSpecTitle}`,
    specs.inputReqSpec || t.inputReqSpecDefault,
    '',
    `## ${t.codeSpecTitle}`,
    specs.codeSpec || t.codeSpecDefault,
    '',
    `## ${t.scrapingTitle}`,
    `### ${t.scrapingPreferredTitle}`,
    t.scrapingPreferredDesc,
    SCRAPING_PREFERRED_CODE,
    '',
    `### ${t.scrapingFallbackTitle}`,
    t.scrapingFallbackDesc,
    SCRAPING_FALLBACK_CODE,
    t.scrapingRule,
    '',
    `## ${t.fileToolTitle}`,
    t.fileToolDesc,
    t.fileToolEnvDesc,
    t.fileToolSdkDesc,
    t.fileToolReturnFormat,
    t.fileToolForbiddenTitle,
    t.fileToolForbiddenItems,
    '',
    `## ${t.envVarTitle}`,
    t.envVarDesc,
    t.envVarItems,
    '',
    `## ${t.securitySpecTitle}`,
    specs.securitySpec || t.securitySpecDefault,
    '',
    `## ${t.testingSpecTitle}`,
    specs.testingSpec || t.testingSpecDefault,
    '',
    `## ${t.resultValidationTitle}`,
    t.resultValidationDesc,
    t.resultValidationExamples,
    '',
    t.resultValidationOnReceive,
    t.resultValidationSteps,
    '',
    `## ${t.githubImportTitle}`,
    t.githubImportTrigger,
    t.githubImportItems,
    '',
    `## ${t.dynamicDepsTitle}`,
    t.dynamicDepsDesc,
    t.dynamicDepsPattern,
    '',
    `### ${t.dynamicDepsPythonTitle}`,
    DYNAMIC_DEPS_PYTHON_CODE,
    '',
    t.dynamicDepsImportNote,
    DYNAMIC_DEPS_PYTHON_NOTE_CODE,
    '',
    `### ${t.dynamicDepsJsTitle}`,
    DYNAMIC_DEPS_JS_CODE,
    '',
    t.dynamicDepsRulesTitle,
    t.dynamicDepsRules,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// API key section
// ---------------------------------------------------------------------------

function formatApiKeySection(
  t: (typeof messages)['zh-CN']['prompts']['toolChat'],
  apiKeys: ApiKeyEntry[] | undefined
): string {
  if (apiKeys && apiKeys.length > 0) {
    return [
      '',
      `## ${t.apiKeysAvailableTitle}`,
      t.apiKeysAvailableDesc,
      ...apiKeys.map((k, i) => `${i + 1}. **${k.name}**`),
      '',
      t.apiKeysUsage,
      t.apiKeysDeployNote,
      t.apiKeysExample,
    ].join('\n')
  }
  return ['', `## ${t.apiKeysEmptyTitle}`, t.apiKeysEmptyDesc].join('\n')
}

// ---------------------------------------------------------------------------
// Connection section
// ---------------------------------------------------------------------------

function formatConnectionSection(
  t: (typeof messages)['zh-CN']['prompts']['toolChat'],
  connections: ConnectionEntry[] | undefined
): string {
  if (!connections || connections.length === 0) return ''

  const items = connections.map((c) => {
    if (c.type === 'database' && c.dbType) {
      const dbType = c.dbType.toLowerCase()
      const envList = c.envVars.map((e) => `- \`${e.envName}\`: ${e.label}`).join('\n')
      let codeExample = ''
      if (dbType === 'mysql' || dbType === 'mariadb') codeExample = DB_CODE_MYSQL
      else if (dbType === 'postgresql') codeExample = DB_CODE_POSTGRESQL
      else if (dbType === 'mongodb') codeExample = DB_CODE_MONGODB

      return [
        `### ${c.name} (${c.typeLabel} / ${c.dbType})`,
        `> ${t.connDbWarning.replace(/\{dbType\}/g, dbType.toUpperCase())}`,
        t.connEnvLabel,
        envList,
        '',
        codeExample ? `${t.connCodeMustUse}\n${codeExample}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    }
    return [
      `### ${c.name} (${c.typeLabel})`,
      t.connGenericEnvLabel,
      ...c.envVars.map((e) => `- \`${e.envName}\`: ${e.label}`),
    ].join('\n')
  })

  return [
    '',
    `## ${t.connTitle}`,
    t.connDesc,
    '',
    ...items,
    '',
    t.connRulesTitle,
    t.connRules,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const isDev = process.env.NODE_ENV !== 'production'
const cachedBasePromptByLocale: Partial<Record<Locale, string>> = {}

export async function getToolChatSystemPrompt(
  locale: Locale,
  apiKeys: ApiKeyEntry[] | undefined,
  connections: ConnectionEntry[] | undefined,
  specs: ToolChatSpecs
): Promise<string> {
  const t = messages[locale].prompts.toolChat

  let basePrompt: string
  if (!isDev && cachedBasePromptByLocale[locale]) {
    basePrompt = cachedBasePromptByLocale[locale] as string
  } else {
    basePrompt = buildBasePrompt(t, specs)
    if (!isDev) cachedBasePromptByLocale[locale] = basePrompt
  }

  return basePrompt + formatApiKeySection(t, apiKeys) + formatConnectionSection(t, connections)
}
