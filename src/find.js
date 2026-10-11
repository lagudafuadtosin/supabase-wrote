// Finds Supabase updates and deletes that cannot tell whether they saved:
// a .from(...) chain with .update( or .delete( and no .select( after it.
// It reads source files as text. It is a quick guide, not a full parser.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const EXTENSIONS = /\.(m?[jt]sx?|cjs|vue|svelte)$/
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.next', '.svelte-kit', '.output', 'coverage'])

/** Every source file under dir. */
export function sourceFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const path = join(dir, name)
    const st = statSync(path)
    if (st.isDirectory()) out.push(...sourceFiles(path))
    else if (EXTENSIONS.test(name)) out.push(path)
  }
  return out
}

// From an opening bracket, the index just past its match. Strings, template
// literals and comments are stepped over so brackets inside them do not count.
function pastMatching(text, open) {
  const pairs = { '(': ')', '[': ']', '{': '}' }
  const stack = [pairs[text[open]]]
  let i = open + 1
  while (i < text.length && stack.length) {
    const c = text[i]
    if (c === '"' || c === "'" || c === '`') {
      i++
      while (i < text.length && text[i] !== c) i += text[i] === '\\' ? 2 : 1
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2)
      if (i < 0) return text.length
      i++
    } else if (pairs[c]) stack.push(pairs[c])
    else if (c === stack[stack.length - 1]) stack.pop()
    i++
  }
  return i
}

function skipSpace(text, i) {
  for (;;) {
    while (i < text.length && /\s/.test(text[i])) i++
    if (text.startsWith('//', i)) {
      while (i < text.length && text[i] !== '\n') i++
    } else if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2)
      i = end < 0 ? text.length : end + 2
    } else return i
  }
}

/** The rest of a method chain from an opening bracket: .eq(...).select(...) and so on. */
function chainAfter(text, open) {
  let i = pastMatching(text, open)
  const start = open
  for (;;) {
    const j = skipSpace(text, i)
    const m = /^\??\.\s*([A-Za-z_$][\w$]*)\s*/.exec(text.slice(j, j + 200))
    if (!m) return text.slice(start, i)
    let k = j + m[0].length
    if (text[k] === '(') k = pastMatching(text, k)
    i = k
  }
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length

/**
 * Updates and deletes in one file's text with no .select() in their chain.
 * @returns {{ line: number, kind: 'update' | 'delete' }[]}
 */
export function findInText(text) {
  const found = []
  const re = /\.\s*(update|delete)\s*\(/g
  let m
  while ((m = re.exec(text))) {
    // Only Supabase query chains: a .from( earlier in the same statement.
    const before = text.slice(Math.max(0, m.index - 400), m.index)
    const statement = before.slice(Math.max(before.lastIndexOf(';'), before.lastIndexOf('\n\n')) + 1)
    if (!/\.\s*from\s*\(/.test(statement)) continue
    const open = m.index + m[0].length - 1
    const chain = chainAfter(text, open)
    if (/\.\s*select\s*\(/.test(chain)) continue
    found.push({ line: lineOf(text, m.index), kind: /** @type {'update' | 'delete'} */ (m[1]) })
  }
  return found
}

/** Every unchecked write under dir. */
export function findInDir(dir) {
  const out = []
  for (const file of sourceFiles(dir)) {
    for (const hit of findInText(readFileSync(file, 'utf8'))) out.push({ file: relative(dir, file) || file, ...hit })
  }
  return out
}
