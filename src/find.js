// Finds Supabase updates and deletes that cannot tell whether they saved.
//
//   JavaScript, TypeScript, Vue, Svelte, HTML and Dart (Flutter): a .from(...) chain
//   with .update( or .delete( and no .select( after it.
//   Plain requests: fetch(... "/rest/v1/..." ...) with method PATCH or DELETE and
//   no "return=representation" or "count=exact", so no rows or count come back.
//   Python: a .table(...) or .from_(...) chain with .update( or .delete( whose result
//   is never kept, or that asks for no rows back (returning minimal).
//
// A "wrote-ok" comment (// or #) on the line above, on the same line or inside the
// chain marks a write where zero rows is expected, and skips it.
// It reads source files as text. It is a quick guide, not a full parser.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const JS_LIKE = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts', '.vue', '.svelte', '.astro', '.html', '.htm', '.dart'])
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.next', '.svelte-kit', '.output', 'coverage', '.dart_tool', '__pycache__', '.venv', 'venv'])

/** Which rules a file gets: 'js' (also HTML and Dart), 'py', or null. */
export function languageOf(path) {
  const ext = extname(path).toLowerCase()
  if (ext === '.py') return 'py'
  return JS_LIKE.has(ext) ? 'js' : null
}

/** Every source file under dir. */
export function sourceFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const path = join(dir, name)
    const st = statSync(path)
    if (st.isDirectory()) out.push(...sourceFiles(path))
    else if (languageOf(name)) out.push(path)
  }
  return out
}

// From an opening bracket, the index just past its match. Strings, template
// literals and comments are stepped over so brackets inside them do not count.
function pastMatching(text, open, py = false) {
  const pairs = { '(': ')', '[': ']', '{': '}' }
  const stack = [pairs[text[open]]]
  let i = open + 1
  while (i < text.length && stack.length) {
    const c = text[i]
    if (c === '"' || c === "'" || (c === '`' && !py)) {
      i++
      while (i < text.length && text[i] !== c) i += text[i] === '\\' ? 2 : 1
    } else if (!py && c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
    } else if (!py && c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2)
      if (i < 0) return text.length
      i++
    } else if (py && c === '#') {
      while (i < text.length && text[i] !== '\n') i++
    } else if (pairs[c]) stack.push(pairs[c])
    else if (c === stack[stack.length - 1]) stack.pop()
    i++
  }
  return i
}

function skipSpace(text, i, py) {
  for (;;) {
    while (i < text.length && /\s/.test(text[i])) i++
    if (py && text[i] === '\\') {
      i++
      continue
    }
    if (py && text[i] === '#') {
      while (i < text.length && text[i] !== '\n') i++
    } else if (!py && text.startsWith('//', i)) {
      while (i < text.length && text[i] !== '\n') i++
    } else if (!py && text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2)
      i = end < 0 ? text.length : end + 2
    } else return i
  }
}

/** The rest of a method chain from an opening bracket: .eq(...).select(...) and so on. */
function chainAfter(text, open, py = false) {
  let i = pastMatching(text, open, py)
  for (;;) {
    const j = skipSpace(text, i, py)
    const m = /^\??\.\s*([A-Za-z_$][\w$]*)\s*/.exec(text.slice(j, j + 200))
    if (!m) return text.slice(open, i)
    let k = j + m[0].length
    if (text[k] === '(') k = pastMatching(text, k, py)
    i = k
  }
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length

// "wrote-ok" on the line above, on the same line, or anywhere in the chain.
function markedOk(text, index, chain) {
  const lineStart = text.lastIndexOf('\n', index) + 1
  const lineAbove = text.slice(text.lastIndexOf('\n', lineStart - 2) + 1, lineStart)
  const lineEnd = text.indexOf('\n', index)
  const sameLine = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd)
  return /wrote-ok/.test(lineAbove + sameLine + chain)
}

const WHY = {
  js: 'no .select() after it: cannot tell if it saved',
  fetch: 'no "return=representation" or "count=exact": cannot tell if it saved',
  py: 'result never checked: data is [] when nothing saved',
  pyMinimal: 'asks for no rows back (returning minimal): cannot tell if it saved',
}

/**
 * Updates and deletes in one file's text that cannot tell whether they saved.
 * @param {string} text
 * @param {'js' | 'py'} [lang]
 * @returns {{ line: number, kind: string, why: string }[]}
 */
export function findInText(text, lang = 'js') {
  return (lang === 'py' ? findPython(text) : [...findJs(text), ...findFetch(text)]).sort((a, b) => a.line - b.line)
}

function findJs(text) {
  const found = []
  const re = /\.\s*(update|delete)\s*\(/g
  let m
  while ((m = re.exec(text))) {
    // Only Supabase query chains: a .from( earlier in the same statement.
    const before = text.slice(Math.max(0, m.index - 400), m.index)
    const statement = before.slice(Math.max(before.lastIndexOf(';'), before.lastIndexOf('\n\n')) + 1)
    if (!/\.\s*from\s*\(/.test(statement)) continue
    const chain = chainAfter(text, m.index + m[0].length - 1)
    if (/\.\s*select\s*\(/.test(chain)) continue
    if (markedOk(text, m.index, chain)) continue
    found.push({ line: lineOf(text, m.index), kind: m[1], why: WHY.js })
  }
  return found
}

// fetch() straight to the Data API with PATCH or DELETE.
function findFetch(text) {
  const found = []
  const re = /\bfetch\s*\(/g
  let m
  while ((m = re.exec(text))) {
    const open = m.index + m[0].length - 1
    const call = text.slice(open, pastMatching(text, open))
    if (!/rest\/v1\//.test(call)) continue
    const method = /method\s*:\s*['"`](PATCH|DELETE)['"`]/i.exec(call)
    if (!method) continue
    if (/return=representation|count=exact/.test(call)) continue
    if (markedOk(text, m.index, call)) continue
    found.push({ line: lineOf(text, m.index), kind: `fetch ${method[1].toUpperCase()}`, why: WHY.fetch })
  }
  return found
}

function findPython(text) {
  const found = []
  const re = /\.\s*(update|delete)\s*\(/g
  let m
  while ((m = re.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 400), m.index)
    const from = Math.max(before.lastIndexOf('.table('), before.lastIndexOf('.from_('))
    if (from < 0) continue
    // The statement starts on the line that holds .table( or .from_(, or on the
    // line above when the chain is wrapped in brackets: res = (\n supabase.table(...
    const at = m.index - before.length + from
    const lineStart = text.lastIndexOf('\n', at) + 1
    let head = text.slice(lineStart, at)
    if (/^\s*$/.test(head) || /^\s*(await\s+)?[\w.]*\s*$/.test(head)) {
      const prevStart = text.lastIndexOf('\n', lineStart - 2) + 1
      const prev = text.slice(prevStart, lineStart)
      if (/[(\\]\s*$/.test(prev)) head = prev + head
    }
    const chain = chainAfter(text, m.index + m[0].length - 1, true)
    if (markedOk(text, m.index, chain)) continue
    if (/returning\s*=\s*(['"]minimal['"]|ReturningOption\.MINIMAL)/.test(chain)) {
      found.push({ line: lineOf(text, m.index), kind: m[1], why: WHY.pyMinimal })
      continue
    }
    const kept = /(^|[^=!<>])=(?!=)/.test(head) || /\breturn\b/.test(head) || /\b(if|assert|while)\b/.test(head)
    if (!kept) found.push({ line: lineOf(text, m.index), kind: m[1], why: WHY.py })
  }
  return found
}

/** Every unchecked write under dir. */
export function findInDir(dir) {
  const out = []
  for (const file of sourceFiles(dir)) {
    const lang = languageOf(file)
    for (const hit of findInText(readFileSync(file, 'utf8'), lang)) out.push({ file: relative(dir, file) || file, ...hit })
  }
  return out
}
