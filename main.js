'use strict';

const { Plugin, ItemView, Notice, MarkdownRenderChild } = require('obsidian');

/* ╔══════════════════════════════════════════════════════════════╗
   ║  DEBUG MODULE                                                ║
   ║  Enable  : debug.true()   (in DevTools console)             ║
   ║  Disable : debug.false()                                     ║
   ╚══════════════════════════════════════════════════════════════╝ */
const debug = (() => {
  let _on = false;

  const C = {
    tag  : 'color:#8b5cf6;font-weight:700;font-size:11px',
    log  : 'color:#60a5fa;font-size:11px',
    warn : 'color:#fb923c;font-size:11px',
    err  : 'color:#f87171;font-size:11px',
    ok   : 'color:#34d399;font-weight:700;font-size:12px',
    off  : 'color:#6b7280;font-weight:700;font-size:12px',
  };
  const TAG = '[ListSheet]';

  return {
    get enabled() { return _on; },

    true() {
      _on = true;
      console.log(`%c${TAG} ▶ Debug ON`, C.ok);
    },

    false() {
      _on = false;
      console.log(`%c${TAG} ■ Debug OFF`, C.off);
    },

    log(scope, ...args) {
      if (!_on) return;
      console.log(`%c${TAG}%c [${scope}]`, C.tag, C.log, ...args);
    },

    warn(scope, ...args) {
      if (!_on) return;
      console.warn(`%c${TAG}%c [${scope}]`, C.tag, C.warn, ...args);
    },

    error(scope, ...args) {
      if (!_on) return;
      console.error(`%c${TAG}%c [${scope}]`, C.tag, C.err, ...args);
    },

    group(label) {
      if (_on) console.group(`${TAG} › ${label}`);
    },

    groupEnd() {
      if (_on) console.groupEnd();
    },

    table(data) {
      if (_on) console.table(data);
    },

    json(scope, data) {
      if (!_on) return;
      console.log(
        `%c${TAG}%c [${scope}]`,
        C.tag, C.log,
        '\n' + JSON.stringify(data, null, 2)
      );
    },
  };
})();

/* expose globally so user can call debug.true() in DevTools */
if (typeof window !== 'undefined') window.debug = debug;


/* ╔══════════════════════════════════════════════════════════════╗
   ║  BANGLA (BENGALI) UTILITIES                                  ║
   ║                                                              ║
   ║  Bengali script digit range : ০ (U+09E6) … ৯ (U+09EF)      ║
   ║  Bengali currency sign      : ৳ (U+09F3)  — auto prefix     ║
   ║  Bengali number markers     : ১. ২. ৩.  — in numbered lists  ║
   ╚══════════════════════════════════════════════════════════════╝ */

/**
 * Convert Bengali digit characters to ASCII digits 0-9.
 * Safe to call on strings with no Bengali digits (no-op).
 *
 * ০→0  ১→1  ২→2  ৩→3  ৪→4  ৫→5  ৬→6  ৭→7  ৮→8  ৯→9
 */
function banglaToAscii(str) {
  return str.replace(/[০-৯]/g, ch => ch.charCodeAt(0) - 0x09E6);
}

/**
 * Normalise a full text line before parsing.
 * · Converts Bengali digits  →  ASCII digits
 * · Keeps all other Bengali characters intact (labels, suffixes, prefixes)
 * · Preserves the ৳ currency sign (treated as a prefix by the value parser)
 */
function normaliseBangla(text) {
  return banglaToAscii(text);
}


/* ╔══════════════════════════════════════════════════════════════╗
   ║  VALUE PARSER                                                ║
   ║  Parses the RHS of  "label = [prefix] <math> [suffix]"      ║
   ║                                                              ║
   ║  Supported math:                                             ║
   ║    · Operators  : + - * / ÷ x % ^(power)                    ║
   ║    · Brackets   : (…)  ((…))                                 ║
   ║    · Functions  : sin cos tan log sqrt abs ceil floor round  ║
   ║    · ASCII nums : 100  3.14  2^4                             ║
   ║    · Bangla nums: ১০০  ৩.১৪  ২^৪  (auto-normalised)         ║
   ╚══════════════════════════════════════════════════════════════╝ */

const MATH_FN_NAMES = ['sin','cos','tan','log','sqrt','abs','ceil','floor','round'];
/* _MATH_FN_MAP (sin/cos/tan/log10/sqrt/abs/ceil/floor/round) is declared
 * once, further down near the formula engine, and shared by both that
 * engine and the _MathParser class below — see its definition for details. */

/*
 * SECURITY NOTE (fixes a critical code-injection bug):
 *
 * This used to be a regex ("MATH_RE") that captured raw characters inside
 * parentheses/function calls, which was then handed straight to
 * `Function(...)()`. Because the regex allowed *any* non-paren characters
 * inside brackets, a list item such as
 *   "x = (require('child_process').execSync('...'))"
 * would be executed with full plugin privileges the moment the note was
 * parsed — no user interaction beyond having the line in a file. The same
 * bracket-matching regex was also exponential-time on unmatched parentheses
 * (catastrophic backtracking / ReDoS), so a single stray "(" in a list item
 * could freeze Obsidian's UI thread.
 *
 * Both issues are fixed by replacing the regex + eval with a small
 * hand-written scanner + recursive-descent parser that:
 *   · never calls eval/Function — only whitelisted arithmetic ops and the
 *     9 named math functions can ever run, so arbitrary code cannot execute;
 *   · matches parentheses with a linear O(n) stack pass (no backtracking),
 *     so pathological input degrades gracefully instead of hanging;
 *   · evaluates directly while parsing, so there's no intermediate string
 *     that could be misinterpreted.
 *
 * As a side benefit, arbitrarily deep bracket nesting is now supported
 * (the old regex only handled one level, e.g. "((100-89*79))").
 */

/** O(n) stack-based paren matcher — no backtracking, so it can't ReDoS. */
function _findMatchingParens(str) {
  const match = new Array(str.length).fill(-1);
  const stack = [];
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '(') stack.push(i);
    else if (str[i] === ')') {
      if (stack.length) {
        const open = stack.pop();
        match[open] = i;
        match[i] = open;
      }
    }
  }
  return match;
}

/** Flat char-level tokenizer — no nested quantifiers, so it's linear/safe. */
const _MATH_CHAR_RE = /(\d+\.\d+|\.\d+|\d+)|([A-Za-z]+)|([+\-*/÷%^()])/g;

function _tokenizeMathChars(str) {
  const tokens = [];
  _MATH_CHAR_RE.lastIndex = 0;
  let m;
  while ((m = _MATH_CHAR_RE.exec(str))) {
    const start = m.index, end = _MATH_CHAR_RE.lastIndex;
    if (m[1] !== undefined) {
      tokens.push({ type: 'NUM', value: m[1], start, end });
    } else if (m[2] !== undefined) {
      const word = m[2];
      if (/^x$/i.test(word)) tokens.push({ type: 'OP', value: '*', start, end });
      else if (MATH_FN_NAMES.includes(word.toLowerCase())) tokens.push({ type: 'FUNC', value: word.toLowerCase(), start, end });
      else tokens.push({ type: 'WORD', value: word, start, end }); // never part of the math grammar — always ignored/rejected
    } else if (m[3] !== undefined) {
      const ch = m[3];
      if (ch === '(') tokens.push({ type: 'LPAREN', start, end });
      else if (ch === ')') tokens.push({ type: 'RPAREN', start, end });
      else tokens.push({ type: 'OP', value: ch, start, end });
    }
  }
  return tokens;
}

/**
 * Recursive-descent parser that evaluates directly to numbers as it goes
 * (no eval/Function is ever involved). Every parse* method returns
 * { ok, value }; ok:false means "can't extend the expression here", which
 * callers use to gracefully stop rather than throw — trailing/leading
 * non-math text becomes prefix/suffix, exactly like the old extraction did.
 */
class _MathParser {
  constructor(tokens, str, matchMap) {
    this.tokens = tokens;
    this.str = str;
    this.matchMap = matchMap;
    this.pos = 0;
  }
  peek() { return this.tokens[this.pos]; }

  parseExpr() { return this.parseAddSub(); }

  parseAddSub() {
    let left = this.parseMulDiv();
    if (!left.ok) return left;
    for (;;) {
      const t = this.peek();
      if (!t || t.type !== 'OP' || (t.value !== '+' && t.value !== '-')) break;
      const saved = this.pos;
      this.pos++;
      const right = this.parseMulDiv();
      if (!right.ok) { this.pos = saved; break; }
      left = { ok: true, value: t.value === '+' ? left.value + right.value : left.value - right.value };
    }
    return left;
  }

  parseMulDiv() {
    let left = this.parsePow();
    if (!left.ok) return left;
    for (;;) {
      const t = this.peek();
      if (!t || t.type !== 'OP' || !['*', '/', '÷', '%'].includes(t.value)) break;
      const saved = this.pos;
      this.pos++;
      const right = this.parsePow();
      if (!right.ok) { this.pos = saved; break; }
      let v;
      if (t.value === '*') v = left.value * right.value;
      else if (t.value === '/' || t.value === '÷') v = right.value === 0 ? NaN : left.value / right.value;
      else v = right.value === 0 ? NaN : left.value % right.value;
      left = { ok: true, value: v };
    }
    return left;
  }

  parsePow() {
    const base = this.parsePrimary();
    if (!base.ok) return base;
    const t = this.peek();
    if (t && t.type === 'OP' && t.value === '^') {
      const saved = this.pos;
      this.pos++;
      const exp = this.parsePow(); // right-associative
      if (!exp.ok) { this.pos = saved; return base; }
      return { ok: true, value: Math.pow(base.value, exp.value) };
    }
    return base;
  }

  parsePrimary() {
    const t = this.peek();
    if (!t) return { ok: false };

    if (t.type === 'NUM') {
      // guard against digits glued to an identifier, e.g. "prefix_1"
      const before = t.start > 0 ? this.str[t.start - 1] : '';
      if (/[A-Za-z_]/.test(before)) return { ok: false };
      this.pos++;
      return { ok: true, value: parseFloat(t.value) };
    }

    if (t.type === 'LPAREN') {
      if (this.matchMap[t.start] === -1) return { ok: false }; // unmatched → not a valid term
      this.pos++;
      const inner = this.parseExpr();
      if (!inner.ok) return { ok: false };
      const close = this.peek();
      if (!close || close.type !== 'RPAREN') return { ok: false };
      this.pos++;
      return inner;
    }

    if (t.type === 'FUNC') {
      const next = this.tokens[this.pos + 1];
      if (!next || next.type !== 'LPAREN' || this.matchMap[next.start] === -1) return { ok: false };
      this.pos += 2;
      const inner = this.parseExpr();
      if (!inner.ok) return { ok: false };
      const close = this.peek();
      if (!close || close.type !== 'RPAREN') return { ok: false };
      this.pos++;
      return { ok: true, value: _MATH_FN_MAP[t.value](inner.value) };
    }

    return { ok: false };
  }
}

/**
 * Find the first, longest valid math expression in `str` and evaluate it
 * directly. Returns { start, end, value } (character offsets into `str`)
 * or null if no math expression is present.
 * Worst case O(n²), never exponential — safe against ReDoS.
 */
function findMathValue(str) {
  const matchMap = _findMatchingParens(str);
  const tokens = _tokenizeMathChars(str);

  for (let startIdx = 0; startIdx < tokens.length; startIdx++) {
    const t = tokens[startIdx];
    if (t.type !== 'NUM' && t.type !== 'LPAREN' && t.type !== 'FUNC') continue;

    const parser = new _MathParser(tokens, str, matchMap);
    parser.pos = startIdx;
    const result = parser.parseExpr();
    if (result.ok && parser.pos > startIdx) {
      const endTok = tokens[parser.pos - 1];
      return { start: t.start, end: endTok.end, value: result.value };
    }
  }
  return null;
}

/**
 * Safely evaluate a math string to a number. No eval/Function is ever used —
 * only whitelisted arithmetic and the named math functions can execute.
 */
function evalMath(expr) {
  const ascii = banglaToAscii(expr); /* Bengali ০-৯ → ASCII 0-9 */
  const m = findMathValue(ascii);
  if (!m) {
    debug.warn('evalMath', 'No math expression found in:', expr);
    return null;
  }
  const result = m.value;
  if (typeof result === 'number' && isFinite(result)) {
    /* keep up to 10 decimal places, strip trailing zeros */
    return parseFloat(result.toFixed(10));
  }
  debug.warn('evalMath', 'Non-finite result for:', expr, '→', result);
  return null;
}

/**
 * Parse the right-hand side of an assignment.
 * Returns { prefix, value, suffix }.
 *
 * Examples (ASCII):
 *   "100 taka"                  → { prefix:null,      value:100,      suffix:"taka" }
 *   "$ 200 taka"                → { prefix:"$",       value:200,      suffix:"taka" }
 *   "approx 235000 taka"        → { prefix:"approx",  value:235000,   suffix:"taka" }
 *   "log(110)+sin(57)+2^4 mark" → { prefix:null,      value:17.49…,   suffix:"mark" }
 *   "((100-89*79))^2 mark"      → { prefix:null,      value:48038761, suffix:"mark" }
 *
 * Examples (Bangla / mixed):
 *   "১০০ টাকা"                  → { prefix:null,      value:100,      suffix:"টাকা" }
 *   "৳ ২০০ টাকা"                → { prefix:"৳",       value:200,      suffix:"টাকা" }
 *   "প্রায় ২৩৫০০০ টাকা"        → { prefix:"প্রায়",   value:235000,   suffix:"টাকা" }
 *   "log(১১০)+sin(৫৭)+২^৪ একক" → { prefix:null,      value:17.49…,   suffix:"একক" }
 */
function parseRHS(rhs) {
  const s = rhs.trim();
  /* Bengali digits are a strict 1-for-1, same-length substitution, so
   * offsets found in the ASCII-normalised copy are valid offsets into the
   * original `s` too — this lets prefix/suffix keep their original
   * (possibly Bengali) formatting while the matcher only has to understand
   * ASCII digits. */
  const ascii = banglaToAscii(s);
  const m = findMathValue(ascii);

  if (!m) {
    debug.warn('parseRHS', 'No math expression found in:', s);
    return { prefix: s || null, value: null, suffix: null };
  }

  const value = (typeof m.value === 'number' && isFinite(m.value))
    ? parseFloat(m.value.toFixed(10))
    : null;
  if (value === null) debug.warn('parseRHS', 'Non-finite math result for:', s, '→', m.value);

  const parsed = {
    prefix : s.slice(0, m.start).trim() || null,
    value,
    suffix : s.slice(m.end).trim()      || null,
  };

  debug.log('parseRHS', { input: s, ...parsed });
  return parsed;
}

/**
 * Parse a complete list-item text that may or may not contain "=".
 * Returns { label, prefix, value, suffix }.
 */
function parseItemText(text) {
  const eq = text.indexOf('=');
  if (eq === -1) return { label: text.trim(), value: null, prefix: null, suffix: null };
  return { label: text.slice(0, eq).trim(), ...parseRHS(text.slice(eq + 1)) };
}


/* ╔══════════════════════════════════════════════════════════════╗
   ║  LIST PARSER                                                 ║
   ║  Markdown content → raw list blocks → nested node trees     ║
   ║                                                              ║
   ║  Bangla list support:                                        ║
   ║    · Bullet    : - / *  (unchanged — works with any script)  ║
   ║    · Checkbox  : - [ ]  (unchanged)                          ║
   ║    · Numbered  : ১.  ২.  ৩.  as well as  1.  2.  3.         ║
   ║    · Headings  : ## বিভাগ  — Bengali headings work as-is     ║
   ╚══════════════════════════════════════════════════════════════╝ */

const LINE_RE = {
  fence          : /^```/,
  fenceListsheet : /^```listsheet\s*$/i,
  fenceClose     : /^```\s*$/,
  heading        : /^(#{1,6})\s+(.+)$/,
  checkbox       : /^(\s*)[-*] \[([xX ])\]\s+(.+)$/,
  bullet         : /^(\s*)[-*]\s+(.+)$/,
  /* [0-9০-৯]+ catches both ASCII and Bengali digit list markers */
  numbered       : /^(\s*)([0-9০-৯]+)[.)]\s+(.+)$/,
};

/**
 * Convert raw indent string to nesting level (0-based).
 * `unit` is the number of spaces that make up one nesting level (default 2,
 * configurable via plugin settings since many editors indent sub-items with
 * 4 spaces, which previously was always misread as 2 levels deep). Each tab
 * character always counts as exactly one level, regardless of `unit`.
 */
function indentLevel(spaces, unit = 2) {
  const step = Math.max(1, unit);
  return Math.floor(spaces.replace(/\t/g, ' '.repeat(step)).length / step);
}

/**
 * Parse one markdown line into a raw flat node.
 * Returns null if the line is not a list item.
 */
function parseLine(line, indentUnit = 2) {
  let m;

  /* checkbox must be tested before bullet (subset syntax) */
  if ((m = line.match(LINE_RE.checkbox))) {
    return {
      ...parseItemText(normaliseBangla(m[3])),
      type      : 'checkbox',
      isChecked : m[2].toLowerCase() === 'x',
      level     : indentLevel(m[1], indentUnit),
    };
  }
  if ((m = line.match(LINE_RE.numbered))) {
    return {
      ...parseItemText(normaliseBangla(m[3])),
      type      : 'number',
      isChecked : null,
      level     : indentLevel(m[1], indentUnit),
    };
  }
  if ((m = line.match(LINE_RE.bullet))) {
    return {
      ...parseItemText(normaliseBangla(m[2])),
      type      : 'bulletpoint',
      isChecked : null,
      level     : indentLevel(m[1], indentUnit),
    };
  }

  return null;
}

/**
 * Scan full markdown content and group consecutive list lines into blocks.
 * Each block carries the heading/section context that preceded it.
 *
 * Also collects ```listsheet fenced code blocks separately — these hold
 * formula assignments (see parseFormulaLine / evaluateFormula below)
 * rather than list items, so they're never fed into buildListObj().
 * Each collected block records its 0-based `lineStart`/`lineEnd` (the
 * opening/closing fence lines) so a MarkdownPostProcessor can match a
 * rendered DOM element back to the exact block it came from via
 * ctx.getSectionInfo().
 *
 * @param {string} content     Full markdown file text.
 * @param {number} indentUnit  Spaces per nesting level (default 2; see settings).
 * @returns {Promise<{ blocks: Array<{ parentName:string, items:Array }>,
 *             listsheetBlocks: Array<{ section:string, lines:string[], lineStart:number, lineEnd:number }> }>}
 */
async function detectLists(content, indentUnit = 2) {
  const lines           = content.split('\n');
  const blocks          = [];
  const listsheetBlocks = [];
  let block       = null;    // current open list block
  let fence       = false;   // inside a generic (non-listsheet) code fence?
  let inListsheet = false;   // inside a ```listsheet code fence?
  let lsBuffer    = [];      // raw lines collected inside the current listsheet fence
  let lsStart     = -1;      // line index of the opening ```listsheet fence
  let section     = 'default';  // last heading seen

  const flush = () => {
    if (block && block.items.length > 0) blocks.push(block);
    block = null;
  };

  /* yield periodically on large files so a full-document re-scan (which
   * runs on every debounced keystroke) never blocks typing/scrolling */
  const YIELD_EVERY = 2000;

  for (let i = 0; i < lines.length; i++) {
    if (i > 0 && i % YIELD_EVERY === 0) await _yieldToEventLoop();

    const line    = lines[i];
    const trimmed = line.trim();

    /* ── ```listsheet fence handling (takes priority over generic fences) ── */
    if (!inListsheet && LINE_RE.fenceListsheet.test(trimmed)) {
      inListsheet = true;
      lsBuffer    = [];
      lsStart     = i;
      flush();
      continue;
    }
    if (inListsheet) {
      if (LINE_RE.fenceClose.test(trimmed)) {
        inListsheet = false;
        if (lsBuffer.length) {
          listsheetBlocks.push({ section, lines: lsBuffer, lineStart: lsStart, lineEnd: i });
        }
        lsBuffer = [];
        continue;
      }
      if (trimmed) lsBuffer.push(line);
      continue;
    }

    /* toggle generic code-fence, flush any open list block */
    if (LINE_RE.fence.test(trimmed)) { fence = !fence; flush(); continue; }
    if (fence) continue;

    /* heading → new section context */
    const hm = line.match(LINE_RE.heading);
    if (hm) { flush(); section = hm[2].trim(); continue; }

    const item = parseLine(line, indentUnit);
    if (item) {
      item.sourceLine = i; /* 0-based line index — lets checkbox toggles write back to the exact source line */
      /* open a new block if needed */
      if (!block) block = { parentName: section, items: [] };
      block.items.push(item);
    } else {
      /* non-empty non-list line closes the current block */
      if (trimmed && block) flush();
    }
  }

  flush();
  /* unterminated ```listsheet fence at EOF — salvage whatever was collected */
  if (inListsheet && lsBuffer.length) {
    listsheetBlocks.push({ section, lines: lsBuffer, lineStart: lsStart, lineEnd: lines.length - 1 });
  }

  debug.log('detectLists', `${blocks.length} block(s), ${listsheetBlocks.length} listsheet block(s) found`);
  debug.table(blocks.map(b => ({ parentName: b.parentName, items: b.items.length })));
  return { blocks, listsheetBlocks };
}

/**
 * Convert a flat list of level-annotated items into a nested tree.
 * Each node gets an `index` equal to its position among siblings.
 */
function buildTree(items) {
  const root  = [];
  /* stack entries: { level, children[] } */
  const stack = [{ level: -1, children: root }];

  for (const raw of items) {
    /* pop until we find the correct parent */
    while (stack.length > 1 && stack[stack.length - 1].level >= raw.level) stack.pop();

    const parent = stack[stack.length - 1];
    const node = {
      label      : raw.label,
      value      : raw.value,
      prefix     : raw.prefix,
      suffix     : raw.suffix,
      type       : raw.type,
      isChecked  : raw.isChecked,
      sourceLine : raw.sourceLine,          /* 0-based file line — used to persist checkbox toggles */
      index      : parent.children.length,   /* sibling position */
      child      : [],
    };

    parent.children.push(node);
    stack.push({ level: raw.level, children: node.child });
  }

  return root;
}

/**
 * Build the final ListSheet object from detected blocks.
 *
 * Rules:
 *  · A top-level node that has children → becomes its own key.
 *  · A top-level leaf node              → grouped under parentName.
 *
 * @param {Array}  blocks           Output of detectLists()
 * @param {string} duplicateKeyMode 'merge' (default) | 'unique'
 *   merge  – children of a later duplicate block are appended to the
 *             existing key's child array, keeping document order.
 *   unique – a numeric suffix is added to the key so each block gets
 *             its own entry, e.g. "Section A", "Section A #2", …
 * @returns {Object}  { "Parent Label": { label, value, prefix, suffix, type, isChecked, index, child[] }, … }
 */
function buildListObj(blocks, duplicateKeyMode = 'merge') {
  const obj = {};

  /* Bug 3 fix: track how many times each base key has been seen so we can
     either merge into the existing entry or generate a unique suffixed key. */
  const keySeen = {};   // baseKey → count of times already inserted

  /**
   * Resolve the storage key for a given base name.
   * In 'merge'  mode: always returns the base key (creates once, reuses after).
   * In 'unique' mode: returns "base" the first time, "base #2" the second, etc.
   */
  function resolveKey(base) {
    if (duplicateKeyMode === 'unique') {
      keySeen[base] = (keySeen[base] || 0) + 1;
      return keySeen[base] === 1 ? base : `${base} #${keySeen[base]}`;
    }
    /* merge mode — key is always the base; caller decides whether to create
       a fresh entry or append to the existing one. */
    return base;
  }

  for (const blk of blocks) {
    const tree = buildTree(blk.items);
    if (!tree.length) continue;

    for (const node of tree) {
      if (node.child.length > 0) {
        /* ── parent node: promote to top-level key ── */
        /* Bug 2 fix: reset index to 0 so every top-level section starts at 0,
           regardless of the sibling position the node had inside its block. */
        node.index = 0;

        const key = resolveKey(node.label);

        if (duplicateKeyMode === 'merge' && obj[key]) {
          /* merge: re-index and append children into the existing entry */
          const existing = obj[key];
          for (const child of node.child) {
            child.index = existing.child.length;
            existing.child.push(child);
          }
          debug.log('buildListObj', `Merged parent key: "${key}" (+${node.child.length} children)`);
        } else {
          obj[key] = node;
          debug.log('buildListObj', `Parent key: "${key}" (${node.child.length} children)`);
        }
      } else {
        /* ── leaf: collect under section name ── */
        const baseKey = blk.parentName;

        /* In unique mode each new encounter of the base name gets its own key;
           in merge mode we always write to / read from the same base key. */
        let key;
        if (duplicateKeyMode === 'unique') {
          /* For leaves we want all leaves from one block to share the same
             unique key, so we compute it once per block per base name.
             We store it on the block object itself to reuse across loop iters. */
          if (!blk._resolvedLeafKey) blk._resolvedLeafKey = {};
          if (!blk._resolvedLeafKey[baseKey]) {
            blk._resolvedLeafKey[baseKey] = resolveKey(baseKey);
          }
          key = blk._resolvedLeafKey[baseKey];
        } else {
          key = baseKey;
        }

        if (!obj[key]) {
          obj[key] = {
            label     : baseKey,   // human label stays the original name
            value     : null,
            prefix    : null,
            suffix    : null,
            type      : null,
            isChecked : null,
            index     : 0,
            child     : [],
          };
        }
        node.index = obj[key].child.length;
        obj[key].child.push(node);
        debug.log('buildListObj', `Leaf "${node.label}" → key "${key}"`);
      }
    }
  }

  debug.json('buildListObj', obj);
  return obj;
}


/* ╔══════════════════════════════════════════════════════════════╗
   ║  LISTSHEET FORMULA ENGINE                                    ║
   ║  Evaluates ```listsheet code-fence assignments against the   ║
   ║  live listObj produced by buildListObj().                    ║
   ║                                                                ║
   ║  Line syntax : <name> = <expr>                                ║
   ║  Aggregates  : Sum() Avg() First() Last() Mid() Min() Max()   ║
   ║                Count()          — argument is a top-level     ║
   ║                                    listObj key                ║
   ║  Dot access  : Obj.Child        — a single child's own value  ║
   ║  Arithmetic  : + - * / x ÷ % ^  plus sin/cos/tan/log/sqrt/…   ║
   ║                (delegated to evalMath, defined above)         ║
   ╚══════════════════════════════════════════════════════════════╝ */

const AGG_FN_NAMES = ['Sum', 'Avg', 'First', 'Last', 'Mid', 'Min', 'Max', 'Count'];

/* names whose single argument is a *raw* listObj key (an object/section
 * name), not a general sub-expression — kept as regex-based extraction
 * (same strategy the plugin always used for Sum()/Avg()/etc.) since key
 * names may contain spaces, punctuation or non-Latin scripts that a
 * tokenizer would choke on. */
const RAW_ARG_FN_NAMES = [
  ...AGG_FN_NAMES,
  'totalCheck', 'totalUnCheck', 'checkItemName', 'unCheckItemName',
];
const RAW_ARG_FN_RE = new RegExp(`\\b(${RAW_ARG_FN_NAMES.join('|')})\\s*\\(\\s*([^()]*?)\\s*\\)`, 'gi');

/** Split "name = expr" into its parts. Returns null if there's no "=". */
function parseFormulaLine(line) {
  const eq = line.indexOf('=');
  if (eq === -1) {
    debug.warn('parseFormulaLine', 'No "=" found, skipping line:', line);
    return null;
  }
  const name = line.slice(0, eq).trim();
  const expr = line.slice(eq + 1).trim();
  if (!name || !expr) return null;
  return { name, expr };
}

/**
 * Decide whether a child item counts toward a calculation, given
 * checkbox state.
 *
 * Rule (per user spec):
 *  · Non-checkbox items (bullet, number) always count.
 *  · Checkbox items only count if THEY are checked…
 *  · …UNLESS the parent obj itself is a checkbox that is checked, in
 *    which case every child counts regardless of its own checked state
 *    ("parent checked means all checked").
 */
function isIncludedForCalc(child, parentIsCheckedList) {
  if (child.type !== 'checkbox') return true;
  if (parentIsCheckedList) return true;
  return child.isChecked === true;
}

/**
 * Compute one of the aggregate functions over a listObj node's children.
 * `node` is a top-level (or dot-addressed) entry: { value, child:[...] }.
 * "Own value" (per spec) is folded into Sum/Avg alongside the children.
 *
 * `type: 'calc'` children (rows injected by an earlier ```listsheet
 * formula, e.g. when a formula's section heading happens to match a data
 * list's own name) are always excluded — otherwise a later Sum()/Count()
 * over the same key would double-count previously computed results.
 *
 * Checkbox filtering: see isIncludedForCalc(). Applies to every function
 * here (Sum/Avg/First/Last/Mid/Min/Max/Count), and to the node's own
 * value too — an unchecked checkbox item's own value doesn't count
 * unless the checkbox is itself checked.
 */
function aggregate(fnName, node) {
  if (!node) return null;

  /* "parent checked → all children count" only applies when the obj
     being aggregated is itself a checked checkbox item. */
  const parentIsCheckedList = node.type === 'checkbox' && node.isChecked === true;

  const children = (node.child || [])
    .filter(c => c.type !== 'calc')
    .filter(c => isIncludedForCalc(c, parentIsCheckedList));

  const numericVals = children
    .map(c => c.value)
    .filter(v => typeof v === 'number' && isFinite(v));

  const ownIncluded = node.type !== 'checkbox' || node.isChecked === true;
  const ownVal = (ownIncluded && typeof node.value === 'number' && isFinite(node.value))
    ? node.value
    : null;

  switch (fnName.toLowerCase()) {
    case 'sum':
      return numericVals.reduce((a, b) => a + b, 0) + (ownVal ?? 0);

    case 'avg': {
      const total = numericVals.reduce((a, b) => a + b, 0) + (ownVal ?? 0);
      const count = numericVals.length + (ownVal != null ? 1 : 0);
      return count > 0 ? total / count : null;
    }

    case 'first':
      return children.length ? children[0].value : null;

    case 'last':
      return children.length ? children[children.length - 1].value : null;

    case 'mid': {
      /* Works cleanly for an even child count (average of the two middle
         items, in document order). For an odd count the spec calls for a
         different formula entirely — we fall back to the exact middle
         element and flag it, rather than silently guessing. */
      const n = children.length;
      if (n === 0) return null;
      if (n % 2 === 0) {
        const a = children[n / 2 - 1].value;
        const b = children[n / 2].value;
        if (typeof a !== 'number' || typeof b !== 'number') return null;
        return (a + b) / 2;
      }
      debug.warn('aggregate', `Mid() called on odd-count obj (n=${n}) — returning the exact middle element`);
      const midVal = children[Math.floor(n / 2)].value;
      return typeof midVal === 'number' ? midVal : null;
    }

    case 'min':
      return numericVals.length ? Math.min(...numericVals) : null;

    case 'max':
      return numericVals.length ? Math.max(...numericVals) : null;

    case 'count':
      return children.length;

    default:
      return null;
  }
}

/**
 * Count checked/unchecked checkbox items belonging to a listObj node —
 * used by totalCheck()/totalUnCheck(). Includes the node's own checked
 * state (when the node itself is a checkbox with children) alongside its
 * checkbox children, and always excludes `type:'calc'` rows.
 */
function countCheckState(node, wantChecked) {
  if (!node) return null;
  const kids = (node.child || []).filter(c => c.type === 'checkbox');
  let count = kids.filter(c => c.isChecked === wantChecked).length;
  if (node.type === 'checkbox' && node.isChecked === wantChecked) count++;
  return count;
}

/**
 * Collect the labels of checked/unchecked checkbox items belonging to a
 * listObj node — used by checkItemName()/unCheckItemName().
 */
function collectCheckItemNames(node, wantChecked) {
  if (!node) return null;
  const names = (node.child || [])
    .filter(c => c.type === 'checkbox' && c.isChecked === wantChecked)
    .map(c => c.label);
  if (node.type === 'checkbox' && node.isChecked === wantChecked) names.unshift(node.label);
  return names;
}

/** Human-readable "not found" error, shared by every resolution path. */
function itemNotFoundMsg(name) {
  return `Item not exist with this name or position: "${name}"`;
}

/** Escape a raw string so it round-trips safely inside a "..." literal. */
function escapeForLiteral(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}


/* ╔══════════════════════════════════════════════════════════════╗
   ║  FORMULA RESULT WRAPPER                                      ║
   ║  Every formula (and every sub-expression inside it) evaluates ║
   ║  to { value, error, isText }:                                 ║
   ║    · value  : number | string | boolean | null                ║
   ║    · error  : string | null — set the moment a referenced     ║
   ║               name/position could not be found; once set it   ║
   ║               short-circuits and propagates to the final result║
   ║    · isText : true when value is a text result (string          ║
   ║               concatenation / checkItemName() / literal)        ║
   ╚══════════════════════════════════════════════════════════════╝ */
function FR(value, error = null, isText = false) { return { value, error, isText }; }
function FR_ERROR(message) { return { value: null, error: message, isText: false }; }

/** First error found among any number of FR values (ignores nullish args). */
function firstError(...vals) {
  for (const v of vals) if (v && v.error) return v.error;
  return null;
}

function truthy(fr) {
  if (!fr || fr.error) return false;
  if (typeof fr.value === 'string') return fr.value.length > 0;
  return Boolean(fr.value);
}

function toDisplay(v) {
  if (v == null) return '';
  return String(v);
}

function compareValues(op, a, b) {
  let cmp;
  if (typeof a === 'number' && typeof b === 'number') {
    cmp = a < b ? -1 : a > b ? 1 : 0;
  } else {
    const sa = toDisplay(a), sb = toDisplay(b);
    cmp = sa < sb ? -1 : sa > sb ? 1 : 0;
  }
  switch (op) {
    case '==': return typeof a === typeof b ? a === b : toDisplay(a) === toDisplay(b);
    case '!=': return typeof a === typeof b ? a !== b : toDisplay(a) !== toDisplay(b);
    case '<':  return cmp < 0;
    case '<=': return cmp <= 0;
    case '>':  return cmp > 0;
    case '>=': return cmp >= 0;
    default:   return false;
  }
}

function gcd2(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }
function lcm2(a, b) { if (a === 0 || b === 0) return 0; return Math.abs(a * b) / gcd2(a, b); }
function gcdMany(nums) { return nums.reduce((a, b) => gcd2(a, b)); }
function lcmMany(nums) { return nums.reduce((a, b) => lcm2(a, b)); }

const _MATH_FN_MAP = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, log: Math.log10,
  sqrt: Math.sqrt, abs: Math.abs, ceil: Math.ceil, floor: Math.floor, round: Math.round,
};


/* ╔══════════════════════════════════════════════════════════════╗
   ║  FORMULA TOKENIZER                                           ║
   ║  Handles string literals, numbers, identifiers/keywords       ║
   ║  (and/or/not/true/false), relational + arithmetic operators.  ║
   ╚══════════════════════════════════════════════════════════════╝ */
/* IDENT allows any Unicode letter (\p{L}) plus combining marks (\p{M}) in
 * the continuation position — not just A-Za-z0-9 — so bare identifiers and
 * dot-notation (see prepassDotRefs) can reference Bengali-named — or any
 * non-Latin-named — lists/sections. \p{M} matters because Indic scripts
 * commonly spell a "letter" as a base consonant plus a separate combining
 * vowel-sign codepoint (matra) that Unicode classifies as a Mark, not a
 * Letter — e.g. "টাকা" is ট + া(mark) + ক + া(mark); without \p{M} the
 * matra breaks the identifier mid-word. Requires the 'u' flag for \p{} to
 * work; \b is intentionally NOT used anywhere here since \b/\w are
 * ASCII-only even under the 'u' flag. */
const TOKEN_RE = /\s*(?:("(?:[^"\\]|\\.)*")|(\d+\.\d+|\.\d+|\d+)|([\p{L}_][\p{L}\p{N}\p{M}_]*)|(==|!=|<=|>=|[+\-*/÷%^<>(),]))/gu;

function tokenizeFormula(expr) {
  const tokens = [];
  let idx = 0;
  TOKEN_RE.lastIndex = 0;
  let m;
  while (idx < expr.length) {
    TOKEN_RE.lastIndex = idx;
    m = TOKEN_RE.exec(expr);
    if (!m || m.index !== idx) {
      /* skip a single unrecognised character (e.g. stray whitespace already
         consumed, or an unsupported symbol) rather than looping forever */
      const rest = expr.slice(idx);
      const ws = rest.match(/^\s+/);
      if (ws) { idx += ws[0].length; continue; }
      throw new Error(`Unexpected character "${expr[idx]}" in formula`);
    }
    idx = TOKEN_RE.lastIndex;

    if (m[1] !== undefined) {
      const raw = m[1].slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      tokens.push({ type: 'STRING', value: raw });
    } else if (m[2] !== undefined) {
      tokens.push({ type: 'NUMBER', value: parseFloat(m[2]) });
    } else if (m[3] !== undefined) {
      const word = m[3];
      if (/^[xX]$/.test(word)) tokens.push({ type: 'OP', value: '*' });
      else if (/^and$/i.test(word)) tokens.push({ type: 'AND' });
      else if (/^or$/i.test(word)) tokens.push({ type: 'OR' });
      else if (/^not$/i.test(word)) tokens.push({ type: 'NOT' });
      else if (/^true$/i.test(word)) tokens.push({ type: 'BOOL', value: true });
      else if (/^false$/i.test(word)) tokens.push({ type: 'BOOL', value: false });
      else tokens.push({ type: 'IDENT', value: word });
    } else if (m[4] !== undefined) {
      const op = m[4];
      if (op === '(') tokens.push({ type: 'LPAREN' });
      else if (op === ')') tokens.push({ type: 'RPAREN' });
      else if (op === ',') tokens.push({ type: 'COMMA' });
      else tokens.push({ type: 'OP', value: op });
    }
  }
  return tokens;
}


/* ╔══════════════════════════════════════════════════════════════╗
   ║  FORMULA PARSER / EVALUATOR                                  ║
   ║  Recursive-descent, precedence (low → high):                  ║
   ║    or → and → not → relational → + - → * / % → ^ → unary     ║
   ║  Evaluates directly to FR() values while parsing (no separate ║
   ║  AST pass), short-circuiting the moment an error appears.     ║
   ╚══════════════════════════════════════════════════════════════╝ */
class FormulaParser {
  constructor(tokens, ctx) {
    this.toks = tokens;
    this.pos  = 0;
    this.ctx  = ctx; // { listObj, scope }
  }

  peek()      { return this.toks[this.pos]; }
  next()      { return this.toks[this.pos++]; }
  isTerminator(t) { return !t || t.type === 'RPAREN' || t.type === 'COMMA'; }

  parseExpression() { return this.parseOr(); }

  parseOr() {
    let left = this.parseAnd();
    while (this.peek() && this.peek().type === 'OR') {
      this.next();
      const right = this.parseAnd();
      const err = firstError(left, right);
      left = err ? FR_ERROR(err) : FR(truthy(left) || truthy(right));
    }
    return left;
  }

  parseAnd() {
    let left = this.parseNot();
    while (this.peek() && this.peek().type === 'AND') {
      this.next();
      const right = this.parseNot();
      const err = firstError(left, right);
      left = err ? FR_ERROR(err) : FR(truthy(left) && truthy(right));
    }
    return left;
  }

  parseNot() {
    if (this.peek() && this.peek().type === 'NOT') {
      this.next();
      const v = this.parseNot();
      if (v.error) return v;
      return FR(!truthy(v));
    }
    return this.parseRel();
  }

  parseRel() {
    const left = this.parseAdd();
    const t = this.peek();
    const relOps = ['==', '!=', '<', '<=', '>', '>='];
    if (t && t.type === 'OP' && relOps.includes(t.value)) {
      this.next();
      const right = this.parseAdd();
      const err = firstError(left, right);
      if (err) return FR_ERROR(err);
      return FR(compareValues(t.value, left.value, right.value));
    }
    return left;
  }

  parseAdd() {
    let left = this.parseMul();
    while (this.peek() && this.peek().type === 'OP' && (this.peek().value === '+' || this.peek().value === '-')) {
      const opTok = this.next();
      if (this.isTerminator(this.peek())) break; // trailing "+"/"-" with nothing after — allow ("text"+)
      const right = this.parseMul();
      const err = firstError(left, right);
      if (err) { left = FR_ERROR(err); continue; }
      if (opTok.value === '+') {
        if (left.isText || right.isText || typeof left.value === 'string' || typeof right.value === 'string') {
          left = FR(toDisplay(left.value) + toDisplay(right.value), null, true);
        } else {
          left = FR((left.value || 0) + (right.value || 0));
        }
      } else {
        if (typeof left.value === 'string' || typeof right.value === 'string') {
          left = FR_ERROR('Cannot use "-" with text values');
        } else {
          left = FR((left.value || 0) - (right.value || 0));
        }
      }
    }
    return left;
  }

  parseMul() {
    let left = this.parsePow();
    while (this.peek() && this.peek().type === 'OP' && ['*', '/', '÷', '%'].includes(this.peek().value)) {
      const opTok = this.next();
      const right = this.parsePow();
      const err = firstError(left, right);
      if (err) { left = FR_ERROR(err); continue; }
      if (typeof left.value === 'string' || typeof right.value === 'string') {
        left = FR_ERROR(`Cannot use "${opTok.value}" with text values`);
        continue;
      }
      const a = left.value, b = right.value;
      if ((opTok.value === '/' || opTok.value === '÷') && b === 0) { left = FR_ERROR('Division by zero'); continue; }
      if (opTok.value === '%' && b === 0) { left = FR_ERROR('Modulo by zero'); continue; }
      let v;
      switch (opTok.value) {
        case '*': v = a * b; break;
        case '/': case '÷': v = a / b; break;
        case '%': v = a % b; break;
      }
      left = FR(v);
    }
    return left;
  }

  parsePow() {
    const base = this.parseUnary();
    if (this.peek() && this.peek().type === 'OP' && this.peek().value === '^') {
      this.next();
      const exp = this.parsePow(); // right-associative
      const err = firstError(base, exp);
      if (err) return FR_ERROR(err);
      if (typeof base.value === 'string' || typeof exp.value === 'string') return FR_ERROR('Cannot use "^" with text values');
      return FR(Math.pow(base.value, exp.value));
    }
    return base;
  }

  parseUnary() {
    const t = this.peek();
    if (t && t.type === 'OP' && (t.value === '+' || t.value === '-')) {
      this.next();
      if (this.isTerminator(this.peek()) || !this.peek()) return FR(0); // stray leading operator, nothing to apply to
      const val = this.parseUnary();
      if (val.error) return val;
      if (t.value === '-') {
        if (typeof val.value === 'string') return FR_ERROR('Cannot negate text');
        return FR(-val.value);
      }
      return val; // unary "+" passthrough — supports  +"text"+...
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    const t = this.peek();
    if (!t) return FR_ERROR('Unexpected end of formula');

    if (t.type === 'NUMBER') { this.next(); return FR(t.value); }
    if (t.type === 'STRING') { this.next(); return FR(t.value, null, true); }
    if (t.type === 'BOOL')   { this.next(); return FR(t.value); }

    if (t.type === 'LPAREN') {
      this.next();
      const inner = this.parseExpression();
      if (!this.peek() || this.peek().type !== 'RPAREN') return FR_ERROR('Missing closing ")" in formula');
      this.next();
      return inner;
    }

    if (t.type === 'IDENT') {
      const next = this.toks[this.pos + 1];
      if (next && next.type === 'LPAREN') return this.parseFunctionCall();
      this.next();
      return this.resolveIdent(t.value);
    }

    return FR_ERROR(`Unexpected token in formula near "${t.value ?? t.type}"`);
  }

  parseFunctionCall() {
    const nameTok = this.next(); // IDENT
    const name = nameTok.value;
    this.next(); // LPAREN
    const args = [];
    if (!this.peek() || this.peek().type !== 'RPAREN') {
      args.push(this.parseExpression());
      while (this.peek() && this.peek().type === 'COMMA') {
        this.next();
        args.push(this.parseExpression());
      }
    }
    if (!this.peek() || this.peek().type !== 'RPAREN') return FR_ERROR(`Missing closing ")" in ${name}(...)`);
    this.next();

    const lower = name.toLowerCase();

    if (MATH_FN_NAMES.includes(lower)) {
      const err = firstError(...args);
      if (err) return FR_ERROR(err);
      if (args.length !== 1 || typeof args[0].value !== 'number') return FR_ERROR(`${name}() expects a single number`);
      return FR(_MATH_FN_MAP[lower](args[0].value));
    }

    if (lower === 'if') {
      if (args.length !== 3) return FR_ERROR('If() requires 3 arguments: If(condition, trueValue, falseValue)');
      if (args[0].error) return FR_ERROR(args[0].error);
      return truthy(args[0]) ? args[1] : args[2];
    }

    if (lower === 'lcm' || lower === 'gcd') {
      const err = firstError(...args);
      if (err) return FR_ERROR(err);
      if (args.length < 2) return FR_ERROR(`${name}() requires at least 2 numbers`);
      if (args.some(a => typeof a.value !== 'number')) return FR_ERROR(`${name}() only accepts numbers`);
      const nums = args.map(a => Math.round(a.value));
      return FR(lower === 'lcm' ? lcmMany(nums) : gcdMany(nums));
    }

    return FR_ERROR(`Unknown function "${name}()"`);
  }

  resolveIdent(name) {
    const { scope, listObj } = this.ctx;
    if (scope && Object.prototype.hasOwnProperty.call(scope, name)) {
      const v = scope[name];
      if (v && typeof v === 'object' && 'value' in v) {
        return v.error ? FR_ERROR(v.error) : FR(v.value, null, !!v.isText);
      }
      if (typeof v === 'string') return FR(v, null, true);
      if (typeof v === 'number' && isFinite(v)) return FR(v);
      return FR_ERROR(itemNotFoundMsg(name));
    }
    if (listObj[name]) {
      const val = listObj[name].value;
      if (typeof val === 'number' && isFinite(val)) return FR(val);
      if (typeof val === 'string') return FR(val, null, true);
      /* the object exists but has no usable own value (e.g. a section with
         only children) — legacy behaviour treats this as 0, not an error */
      return FR(0);
    }
    return FR_ERROR(itemNotFoundMsg(name));
  }
}

/**
 * Pre-pass: resolve every Sum()/Avg()/…/totalCheck()/checkItemName() call
 * (raw-identifier-argument functions) into literal numbers/strings before
 * tokenizing the rest of the expression. Pushes onto `errors` the moment a
 * referenced object name doesn't exist in listObj at all.
 */
function prepassRawArgFns(expr, listObj, errors) {
  return expr.replace(RAW_ARG_FN_RE, (full, fnName, argRaw) => {
    const argName = argRaw.trim();
    const node = listObj[argName];
    if (!node) {
      errors.push(itemNotFoundMsg(argName));
      return '0';
    }
    const lower = fnName.toLowerCase();

    if (lower === 'totalcheck' || lower === 'totaluncheck') {
      const n = countCheckState(node, lower === 'totalcheck');
      return String(n ?? 0);
    }
    if (lower === 'checkitemname' || lower === 'uncheckitemname') {
      const names = collectCheckItemNames(node, lower === 'checkitemname') || [];
      return `"${escapeForLiteral(names.join(', '))}"`;
    }

    const v = aggregate(fnName, node);
    return String(v == null ? 0 : v);
  });
}

/* Same Unicode-letter+mark identifier shape as TOKEN_RE (see its comment
 * for why \p{M} is required for Indic scripts). \b can't be used here
 * since it's defined in terms of ASCII \w and doesn't create a boundary
 * around non-Latin letters (e.g. Bengali) — so a plain \b-based version of
 * this pattern silently never matched dot-refs like "টাকা.খরচ", even
 * though Sum()/Avg() already supported Bengali names via their own
 * unrestricted raw-argument regex. Lookarounds against the identifier
 * character class itself give the same "isolated word" guarantee without
 * relying on \w. */
const _DOT_REF_RE = /(?<![\p{L}\p{N}\p{M}_])([\p{L}_][\p{L}\p{N}\p{M}_]*)\.([\p{L}_][\p{L}\p{N}\p{M}_]*)(?![\p{L}\p{N}\p{M}_])/gu;

/**
 * Pre-pass: resolve every Obj.Child dot reference into a literal
 * number/string before tokenizing. Pushes onto `errors` the moment the
 * parent object or the named child doesn't exist.
 */
function prepassDotRefs(expr, listObj, errors) {
  return expr.replace(_DOT_REF_RE, (full, objName, childName) => {
    const node = listObj[objName];
    if (!node) { errors.push(itemNotFoundMsg(objName)); return '0'; }

    const parentIsCheckedList = node.type === 'checkbox' && node.isChecked === true;
    const child = (node.child || []).find(c => c.label === childName && c.type !== 'calc');
    if (!child) { errors.push(itemNotFoundMsg(`${objName}.${childName}`)); return '0'; }
    if (!isIncludedForCalc(child, parentIsCheckedList)) return '0';

    const v = child.value;
    if (typeof v === 'number' && isFinite(v)) return String(v);
    if (typeof v === 'string') return `"${escapeForLiteral(v)}"`;
    return '0';
  });
}

/**
 * Evaluate one formula's RHS against the live listObj + prior scope vars.
 * Returns { value, error, isText }. `error` is set (and `value` is null)
 * the moment any referenced name/position could not be found — callers
 * should render `error` instead of a computed value in that case.
 */
function evaluateFormula(expr, listObj, scope) {
  const errors = [];
  let e = expr;

  /* 1) Obj.Child dot notation → literals */
  e = prepassDotRefs(e, listObj, errors);

  /* 2) Sum()/Avg()/…/totalCheck()/checkItemName() → literals */
  e = prepassRawArgFns(e, listObj, errors);

  if (errors.length) return FR_ERROR(errors[0]);

  /* 3) full arithmetic/logical/If/LCM/GCD/text-concat evaluation */
  let tokens;
  try {
    tokens = tokenizeFormula(e);
  } catch (err) {
    return FR_ERROR(`Formula syntax error: ${err.message}`);
  }
  if (!tokens.length) return FR_ERROR('Empty formula');

  const parser = new FormulaParser(tokens, { listObj, scope });
  let result;
  try {
    result = parser.parseExpression();
  } catch (err) {
    return FR_ERROR(`Formula syntax error: ${err.message}`);
  }
  if (parser.pos < tokens.length) {
    const leftover = tokens[parser.pos];
    return FR_ERROR(`Unexpected token near "${leftover.value ?? leftover.type}"`);
  }
  return result;
}

/* small time-boxed yield helper for the async formula runner below —
 * lets the event loop (typing, scrolling, other renders) breathe between
 * chunks of formula evaluation instead of blocking it on large files. */
function _yieldToEventLoop() {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

/**
 * Run every ```listsheet block (in document order) against `listObj`,
 * mutating it in place so results render alongside the parsed lists.
 * Each block's assignments are grouped as child items under a section
 * keyed by the heading that preceded the block (or "Calculations").
 *
 * Formula results are also kept in a running `scope` so later formulas —
 * even in a different block — can reference earlier ones by name, and
 * results are written into listObj itself so Sum()/dot-notation can, in
 * turn, reach them.
 *
 * Asynchronous by design: on files with many ```listsheet blocks/lines,
 * evaluation is chunked and yields to the event loop periodically (see
 * _yieldToEventLoop) so a large note never freezes typing/scrolling.
 * Pass `options.signal`/`options.isStale()` to cooperatively abort a run
 * that's been superseded by a newer one (prevents race conditions where
 * a slow, stale computation would otherwise overwrite fresher results).
 *
 * @param {Array} listsheetBlocks  Output of detectLists().listsheetBlocks
 * @param {Object} listObj         Mutated in place with `type:'calc'` result rows
 * @param {Object} [options]
 * @param {Object}   [options.stopAt]     A specific block (by reference) after
 *   which processing stops — used by the inline code-block renderer, which
 *   only needs scope/results up to and including the block it's rendering.
 * @param {Function} [options.isStale]    Called between chunks; if it returns
 *   true, processing aborts immediately (stale/superseded run).
 * @param {number}   [options.timeBudgetMs=12]  Max ms of synchronous work
 *   per chunk before yielding to the event loop.
 * @returns {Promise<Map<Object, Array<{name:string, expr:string, value:*, error:string|null, isText:boolean}>>>}
 *   Per-block results, keyed by the block object itself — lets callers
 *   (like the inline renderer) grab just the rows for one block.
 *   Resolves to `null` if aborted early via `options.isStale`.
 */
async function applyListsheetBlocks(listsheetBlocks, listObj, options = {}) {
  const { stopAt = null, isStale = null, timeBudgetMs = 12 } = options;
  const scope          = {};
  const resultsByBlock = new Map();

  let chunkStart = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  for (const block of listsheetBlocks) {
    if (isStale && isStale()) return null;

    const sectionKey = block.section || 'Calculations';

    if (!listObj[sectionKey]) {
      listObj[sectionKey] = {
        label: sectionKey, value: null, prefix: null, suffix: null,
        type: 'listsheet-section', isChecked: null, index: 0, child: [],
      };
    }
    const sectionNode  = listObj[sectionKey];
    const blockResults = [];

    for (const rawLine of block.lines) {
      const parsed = parseFormulaLine(normaliseBangla(rawLine));
      if (!parsed) continue;

      const { name, expr } = parsed;
      const result = evaluateFormula(expr, listObj, scope);
      scope[name] = result;
      blockResults.push({ name, expr, value: result.value, error: result.error, isText: result.isText });

      const resultNode = {
        label: name, value: result.error ? null : result.value,
        error: result.error, isText: result.isText,
        prefix: null, suffix: null,
        type: 'calc', isChecked: null, index: 0, child: [],
      };

      const existingIdx = sectionNode.child.findIndex(c => c.label === name && c.type === 'calc');
      if (existingIdx >= 0) {
        resultNode.index = existingIdx;
        sectionNode.child[existingIdx] = resultNode;
      } else {
        resultNode.index = sectionNode.child.length;
        sectionNode.child.push(resultNode);
      }

      debug.log('applyListsheetBlocks', `${name} = ${expr}  →  ${result.error ? '⚠ ' + result.error : result.value}`);

      /* yield if this chunk has been running too long — keeps the UI
         responsive on notes with many/heavy formulas */
      if (now() - chunkStart > timeBudgetMs) {
        await _yieldToEventLoop();
        if (isStale && isStale()) return null;
        chunkStart = now();
      }
    }

    resultsByBlock.set(block, blockResults);
    if (stopAt && block === stopAt) break;
  }

  return resultsByBlock;
}


/* ╔══════════════════════════════════════════════════════════════╗
   ║  VIRTUAL DOM                                                 ║
   ║  Minimal h() / mount() for declarative rendering            ║
   ╚══════════════════════════════════════════════════════════════╝ */

/**
 * Create a virtual node descriptor.
 * @param {string}   tag
 * @param {Object}   attrs   Plain key-value pairs.
 *                           Prefix event listeners with "on:" e.g. "on:change".
 * @param {...*}     kids    Child vnodes or strings.
 */
function h(tag, attrs, ...kids) {
  return {
    tag,
    attrs    : attrs ?? {},
    children : kids.flat().filter(k => k != null),
  };
}

/**
 * Recursively convert a vnode tree into real DOM nodes.
 * Event listener attrs use the "on:<event>" convention.
 */
function mount(vnode) {
  if (vnode == null) return null;
  if (typeof vnode === 'string' || typeof vnode === 'number') {
    return document.createTextNode(String(vnode));
  }

  const el = document.createElement(vnode.tag);

  for (const [k, v] of Object.entries(vnode.attrs)) {
    if (v == null) continue;

    if (k === 'checked') {
      /* use property, not attribute, for live checkbox state */
      el.checked = Boolean(v);
    } else if (k.startsWith('on:')) {
      el.addEventListener(k.slice(3), v);
    } else {
      el.setAttribute(k, v);
    }
  }

  for (const child of vnode.children) {
    const node = mount(child);
    if (node) el.appendChild(node);
  }

  return el;
}


/* ╔══════════════════════════════════════════════════════════════╗
   ║  RENDERER                                                    ║
   ║  Builds a vDOM from listObj and patches the container.       ║
   ╚══════════════════════════════════════════════════════════════╝ */

class Renderer {
  /**
   * @param {HTMLElement} container  Element whose content we own.
   */
  constructor(container) {
    this.container  = container;
    this.listObj    = null;

    /** Callback: (sourceLine:number|null, checked:boolean, item:object) => void */
    this.onCheckbox = null;
  }

  /* ── public API ─────────────────────────────────────────────── */

  render(listObj) {
    debug.group('Renderer.render');

    this.listObj = listObj;
    const vnode  = this._vRoot(listObj);
    /* Build the new tree off-screen first, then clear+swap in one go.
     * (Note: this isn't full reconciliation/diffing despite the "vnode"
     * naming below — every render still replaces the whole subtree. True
     * diffing would need element identity across renders, e.g. keyed by
     * sourceLine, which is a larger change; this at least avoids leaving
     * the container visibly empty for a tick, and avoids doing any DOM
     * work at all before we know mount() succeeded.) */
    const el = mount(vnode);

    this.container.innerHTML = '';
    if (el) this.container.appendChild(el);

    debug.log('Renderer', `Rendered ${Object.keys(listObj).length} section(s)`);
    debug.groupEnd();
  }

  clear() {
    this.container.innerHTML = '';
    this.listObj = null;
  }

  /* ── vDOM builders ──────────────────────────────────────────── */

  _vRoot(obj) {
    return h('div', { class: 'ls-root' },
      ...Object.entries(obj).map(([key, data]) => this._vSection(key, data))
    );
  }

  _vSection(key, data) {
    /* header row */
    const header = h('header', { class: 'ls-head' },
      h('span', { class: 'ls-head-label' }, key),
      (data.value != null || data.error) ? this._vBadge(data, 'ls-head-badge') : null,
    );

    /* children list */
    const list = h('ul', { class: 'ls-list' },
      ...(data.child || []).map((child, i) => this._vItem(child, i, key))
    );

    return h('section', { class: 'ls-section', 'data-key': key },
      header, list
    );
  }

  _vItem(item, idx, parentKey) {
    const isCheck = item.type === 'checkbox';
    const isNum   = item.type === 'number';

    /* bullet / checkbox / number indicator */
    const indicator = isCheck
      ? h('input', {
          type    : 'checkbox',
          class   : 'ls-cb',
          checked : item.isChecked || null,
          'data-line' : item.sourceLine != null ? String(item.sourceLine) : null,
          'on:change': e => {
            const checked = e.target.checked;
            debug.log('Checkbox', `line ${item.sourceLine} → ${checked}`);
            /* sourceLine (the item's own file line) is used instead of
             * parentKey/idx — those are positions among rendered
             * siblings, which drift under nesting/merge/unique dedup
             * modes and previously made checkbox writes address the
             * wrong item. sourceLine always points at the exact line. */
            if (this.onCheckbox) this.onCheckbox(item.sourceLine, checked, item);
          },
        })
      : h('span', { class: 'ls-bullet' },
          /* Bug 4 fix: use item.index (the node's own sibling position stored
             during tree-building) rather than the map-callback idx, which
             diverges if items are ever reordered or the list is filtered. */
          isNum ? `${item.index + 1}.` : '•'
        );

    /* label, with strikethrough when checked */
    const labelCls = 'ls-lbl' + (isCheck && item.isChecked ? ' ls-done' : '');
    const label    = h('span', { class: labelCls }, item.label || '');

    /* value badge (if any) — also shown for a formula result that errored
       (item.error set, item.value null) so the error surfaces in-place */
    const valBadge = (item.value != null || item.error) ? this._vBadge(item, 'ls-val') : null;

    /* nested children */
    const nested = item.child && item.child.length > 0
      ? h('ul', { class: 'ls-list ls-nested' },
          ...item.child.map((c, i) => this._vItem(c, i, parentKey))
        )
      : null;

    return h('li', { class: `ls-item ls-${item.type}` },
      indicator, label, valBadge, nested
    );
  }

  /** Shared prefix + number + suffix badge. Renders an error message
   *  instead of a value when the underlying formula couldn't resolve a
   *  referenced name/position (node.error set). */
  _vBadge(node, cls) {
    if (node.error) {
      return h('span', { class: `${cls} ls-badge-error`, title: node.error }, `⚠ ${node.error}`);
    }
    return h('span', { class: cls },
      node.prefix ? h('span', { class: 'ls-pfx' }, node.prefix) : null,
      h('b',        { class: 'ls-num' }, String(node.value)),
      node.suffix ? h('span', { class: 'ls-sfx' }, node.suffix) : null,
    );
  }
}


/* ╔══════════════════════════════════════════════════════════════╗
   ║  LISTSHEET VIEW   (Obsidian side-panel)                      ║
   ╚══════════════════════════════════════════════════════════════╝ */

const VIEW_TYPE = 'listsheet';

class ListSheetView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin   = plugin;
    this.file     = null;
    this.listObj  = {};
    this.renderer = null;
    /* bumped on every loadFile()/_process() call; a stale async run checks
     * this before touching the DOM so a slow computation for a file the
     * user has since navigated away from can never clobber newer results
     * (prevents the race condition / stale-DOM-write class of bug). */
    this._loadGen = 0;
  }

  getViewType()    { return VIEW_TYPE; }
  getDisplayText() { return 'ListSheet'; }
  getIcon()        { return 'list'; }

  /* ── lifecycle ──────────────────────────────────────────────── */

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass('ls-view');

    /* ── toolbar ── */
    const bar      = this.contentEl.createDiv({ cls: 'ls-bar' });
    this._titleEl  = bar.createSpan({ cls: 'ls-bar-title', text: 'ListSheet' });
    this._statsEl  = bar.createSpan({ cls: 'ls-bar-stats' });

    /* debug toggle button */
    const dbgBtn  = bar.createEl('button', { cls: 'ls-dbg-btn', text: '🐛', title: 'Toggle debug mode (or run debug.true() in console)' });
    dbgBtn.addEventListener('click', () => {
      if (debug.enabled) {
        debug.false();
        dbgBtn.classList.remove('ls-dbg-on');
        new Notice('ListSheet: Debug OFF');
      } else {
        debug.true();
        dbgBtn.classList.add('ls-dbg-on');
        new Notice('ListSheet: Debug ON — check DevTools console');
      }
    });

    /* export JSON button */
    const expBtn = bar.createEl('button', { cls: 'ls-exp-btn', text: '{ }', title: 'Copy listObj JSON to clipboard' });
    expBtn.addEventListener('click', () => this._exportJSON());

    /* ── scrollable content area ── */
    const area    = this.contentEl.createDiv({ cls: 'ls-area' });
    this.renderer = new Renderer(area);
    this.renderer.onCheckbox = async (sourceLine, checked, item) => {
      /* optimistic local update for instant visual feedback (badges that
       * depend on this checkbox — totalCheck(), Sum(), etc. — get their
       * real recompute a moment later once the file write below lands
       * and triggers the plugin's existing reactive repaint pipeline). */
      if (item) item.isChecked = checked;
      debug.json('onCheckbox', this.listObj);

      if (sourceLine == null || !this.file) {
        debug.warn('onCheckbox', 'No source line for this item — cannot persist to file');
        return;
      }
      try {
        /* Persist to the actual note. This used to be missing entirely:
         * toggling a checkbox only changed in-memory state, so it never
         * survived a reload/re-edit and totals never recomputed. Writing
         * the file lets the plugin's own file-watcher repaint everything
         * (badges, totalCheck(), Sum(), etc.) through the normal path. */
        await this.plugin.setCheckboxState(this.file, sourceLine, checked);
      } catch (err) {
        debug.error('onCheckbox', 'Failed to save checkbox change', err);
        new Notice('ListSheet: failed to save checkbox change');
      }
    };

    debug.log('View', 'onOpen');
  }

  async onClose() {
    debug.log('View', 'onClose');
  }

  /* ── file handling ──────────────────────────────────────────── */

  /**
   * @param {TFile} file
   * @param {string|null} [liveContent]  When provided, used instead of
   *   reading the file from disk — this is what lets the panel update on
   *   every keystroke (live, unsaved editor text) the same way inline
   *   ```listsheet code blocks already did, instead of only refreshing
   *   once Obsidian actually writes the file to disk.
   */
  async loadFile(file, liveContent = null) {
    this.file     = file;
    const content = liveContent != null ? liveContent : await this.plugin.app.vault.read(file);
    /* file read is itself async — another loadFile() may have started (and
     * even finished) while we were awaiting it, so re-check before we go
     * any further rather than processing content that's already stale. */
    if (this.file !== file) return;
    await this._process(content, file.name);
  }

  /* Asynchronous by design (see applyListsheetBlocks): parses/builds the
   * list structure synchronously (cheap), renders it immediately so the
   * panel never sits blank while formulas crunch, then evaluates
   * ```listsheet blocks in yielding chunks and patches the results in
   * once done. `myGen` guards every DOM-touching step against a newer
   * _process() call having superseded this one in the meantime. */
  async _process(content, filename) {
    const myGen = ++this._loadGen;

    debug.group(`Process: ${filename}`);
    try {
      const indentUnit = this.plugin.settings?.indentSize ?? 2;
      const { blocks, listsheetBlocks } = await detectLists(content, indentUnit);
      if (this._loadGen !== myGen) { debug.groupEnd(); return; } // superseded while awaiting
      /* Bug 3 fix: forward the user-chosen duplicate-key mode from settings */
      const mode   = this.plugin.settings?.duplicateKeyMode ?? 'merge';
      const listObj = buildListObj(blocks, mode);
      if (this._loadGen !== myGen) { debug.groupEnd(); return; } // superseded already

      this.listObj = listObj;
      const n = Object.keys(this.listObj).length;

      this._titleEl.setText(filename.replace(/\.md$/i, ''));
      this._statsEl.setText(n ? `${n} list${n !== 1 ? 's' : ''}` : 'no lists');

      const area = this.contentEl.querySelector('.ls-area');
      area.innerHTML = '';

      if (n > 0) {
        this.renderer.render(this.listObj);
      } else {
        const empty = document.createElement('div');
        empty.className = 'ls-empty';
        empty.textContent = '📋 No lists found in this file.';
        area.appendChild(empty);
      }

      /* run ```listsheet formula blocks against the freshly-built obj —
         results are written back into listObj so they render live and
         stay in sync as the source file changes. Chunked/yielding, and
         aborts cleanly (returns null) if a newer file load supersedes it. */
      if (listsheetBlocks.length) {
        const resultsByBlock = await applyListsheetBlocks(listsheetBlocks, this.listObj, {
          isStale: () => this._loadGen !== myGen,
        });
        if (resultsByBlock == null || this._loadGen !== myGen) { debug.groupEnd(); return; }
        /* re-render now that calc sections/results are populated */
        this.renderer.render(this.listObj);
      }
    } catch (err) {
      debug.error('_process', err);
      if (this._loadGen === myGen) new Notice(`ListSheet error: ${err.message}`);
    }
    debug.groupEnd();
  }

  /* ── utilities ──────────────────────────────────────────────── */

  async _exportJSON() {
    try {
      const json = JSON.stringify(this.listObj, null, 2);
      await navigator.clipboard.writeText(json);
      new Notice('ListSheet: listObj JSON copied to clipboard!');
      debug.json('Export', this.listObj);
    } catch (e) {
      /* await + try/catch here (matching _copyToClipboard elsewhere) so an
       * async rejection — e.g. clipboard permission denied — is actually
       * caught, instead of only synchronous throws being handled and the
       * rejection surfacing as a silent unhandled-promise-rejection. */
      debug.error('_exportJSON', e);
      new Notice('ListSheet: Clipboard copy failed.');
    }
  }
}


/* ╔══════════════════════════════════════════════════════════════╗
   ║  SETTINGS                                                    ║
   ╚══════════════════════════════════════════════════════════════╝ */

const DEFAULT_SETTINGS = {
  /**
   * How to handle duplicate section / parent-node keys across blocks.
   *
   *  'merge'  (default) — append children of the later block into the
   *                       existing key, preserving document order.
   *  'unique'           — auto-suffix the key with a counter so every
   *                       block gets its own entry  (e.g. "Section A #2").
   */
  duplicateKeyMode: 'merge',

  /**
   * Spaces per nesting level when reading list indentation (default 2,
   * matching the plugin's original hardcoded assumption). Editors that
   * indent sub-items with 4 spaces should set this to 4, otherwise every
   * level of nesting is read as twice as deep as intended.
   */
  indentSize: 2,
};

const { PluginSettingTab, Setting } = require('obsidian');

class ListSheetSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'ListSheet Settings' });

    new Setting(containerEl)
      .setName('Duplicate section handling')
      .setDesc(
        'What to do when two list blocks share the same section name or parent label. ' +
        '"Merge" joins them into one section (default). ' +
        '"Auto-unique name" keeps them separate by appending a counter (#2, #3 …).'
      )
      .addDropdown(drop => {
        drop
          .addOption('merge',  'Merge serially (default)')
          .addOption('unique', 'Auto-unique name')
          .setValue(this.plugin.settings.duplicateKeyMode)
          .onChange(async value => {
            this.plugin.settings.duplicateKeyMode = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('List indent size')
      .setDesc(
        'How many spaces count as one level of list nesting (default 2). ' +
        'A Tab key-press always counts as exactly one level regardless of this ' +
        'setting — this only affects space-indented sub-items. If your editor ' +
        'indents nested list items with 4 spaces, set this to 4 so nesting depth ' +
        'is read correctly.'
      )
      .addDropdown(drop => {
        drop
          .addOption('2', '2 spaces (default)')
          .addOption('4', '4 spaces')
          .setValue(String(this.plugin.settings.indentSize ?? 2))
          .onChange(async value => {
            this.plugin.settings.indentSize = parseInt(value, 10) || 2;
            await this.plugin.saveSettings();
          });
      });
  }
}

/* ╔══════════════════════════════════════════════════════════════╗
   ║  MAIN PLUGIN                                                 ║
   ╚══════════════════════════════════════════════════════════════╝ */

class ListSheetPlugin extends Plugin {

  async onload() {
    console.log('[ListSheet] Plugin loaded. Run %cdebug.true()%c in DevTools to enable verbose logs.', 'color:#8b5cf6;font-weight:bold', '');

    /* registry of currently-mounted ```listsheet blocks, so we can
     * repaint them directly when a file changes elsewhere — Obsidian
     * only re-invokes the codeblock processor when the block's OWN
     * source text changes, not when other content it depends on does. */
    this._inlineBlocks = new Set(); // { el, ctx, filePath }

    /* per-file debounce timers for fast live updates (see editor-change
     * handler below). Kept short (FAST_DEBOUNCE_MS) since editor-change
     * fires on every keystroke and we don't want to recompute on each one. */
    this._debounceTimers = new Map(); // filePath -> timeoutId
    this.FAST_DEBOUNCE_MS = 120;

    /* ── settings ── */
    await this.loadSettings();
    this.addSettingTab(new ListSheetSettingTab(this.app, this));

    /* make debug available immediately */
    window.debug = debug;

    /* ── Bengali font injection ──────────────────────────────────
     * Load "Hind Siliguri" from Google Fonts so Bengali labels,
     * prefixes and suffixes render with correct glyphs on every OS.
     * The link is only added once; duplicate calls are skipped.
     * ─────────────────────────────────────────────────────────── */
    const FONT_LINK_ID = 'listsheet-bengali-font';
    if (!document.getElementById(FONT_LINK_ID)) {
      const link = document.createElement('link');
      link.id   = FONT_LINK_ID;
      link.rel  = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600&display=swap';
      document.head.appendChild(link);
      debug.log('Plugin', 'Bengali font (Hind Siliguri) injected');
    }

    /* ── inline result styling ──────────────────────────────────
     * Minimal, theme-friendly styles for the ```listsheet code-block
     * results rendered directly in Reading view / Live Preview (see
     * registerMarkdownCodeBlockProcessor below). Kept inline so the
     * feature works even without a bundled styles.css.
     * ─────────────────────────────────────────────────────────── */
    const INLINE_STYLE_ID = 'listsheet-inline-style';
    if (!document.getElementById(INLINE_STYLE_ID)) {
      const style = document.createElement('style');
      style.id = INLINE_STYLE_ID;
      style.textContent = `
        .ls-inline {
          border: 1px solid var(--background-modifier-border);
          border-radius: var(--radius-m, 6px);
          background: var(--background-secondary);
          padding: 8px 12px;
          margin: 0.5em 0;
        }
        .ls-inline-header {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 4px;
          margin-bottom: 2px;
        }
        .ls-inline-row {
          display: flex;
          align-items: baseline;
          gap: 6px;
          font-family: var(--font-monospace, monospace);
          font-size: 0.9em;
          padding: 2px 0;
        }
        .ls-inline-name  { color: var(--text-normal); font-weight: 600; }
        .ls-inline-eq    { color: var(--text-faint); }
        .ls-inline-value { color: var(--text-accent); font-weight: 600; flex: 1; }
        .ls-inline-value-error {
          color: var(--text-error, #e06c75);
          font-weight: 500;
          font-style: italic;
          white-space: normal;
        }
        .ls-inline-error, .ls-inline-empty {
          font-size: 0.85em;
          color: var(--text-error, #e06c75);
          font-style: italic;
        }
        .ls-inline-empty { color: var(--text-faint); }

        .ls-badge-error {
          color: var(--text-error, #e06c75);
          font-weight: 500;
          font-style: italic;
        }

        .ls-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: transparent;
          color: var(--text-faint);
          cursor: pointer;
          padding: 2px 5px;
          border-radius: var(--radius-s, 4px);
          font-size: 0.85em;
          line-height: 1;
        }
        .ls-btn:hover  { background: var(--background-modifier-hover); color: var(--text-normal); }
        .ls-btn.is-ok  { color: var(--text-success, #34d399); }
        .ls-btn-refresh { font-size: 0.9em; }
        .ls-btn-row-copy { margin-left: auto; opacity: 0.65; }
        .ls-btn-row-copy:hover { opacity: 1; }
      `;
      document.head.appendChild(style);
    }

    /* register view */
    this.registerView(VIEW_TYPE, leaf => new ListSheetView(leaf, this));

    /* ── inline rendering: turn every ```listsheet block into its
     * computed results, right where it sits in the note (Reading view
     * and Live Preview) — not just in the side panel. Reads the whole
     * file so Sum()/Avg()/dot-notation can see the surrounding lists,
     * then shows only the rows that belong to *this* fenced block
     * (matched via its exact source line range). ─────────────────── */
    this.registerMarkdownCodeBlockProcessor('listsheet', async (source, el, ctx) => {
      const entry = { el, ctx, source, filePath: ctx.sourcePath };
      this._inlineBlocks.add(entry);

      /* deregister automatically when Obsidian tears this block down
       * (note closed, block scrolled out & unmounted, block deleted, etc.) */
      const child = new MarkdownRenderChild(el);
      child.onunload = () => this._inlineBlocks.delete(entry);
      ctx.addChild(child);

      await this._renderListsheetBlock(entry);
    });

    /* ribbon button */
    this.addRibbonIcon('list', 'Open ListSheet', () => this._openPanel());

    /* commands */
    this.addCommand({
      id       : 'open-listsheet',
      name     : 'Open ListSheet panel',
      callback : () => this._openPanel(),
    });

    this.addCommand({
      id       : 'listsheet-debug-on',
      name     : 'ListSheet: Enable debug mode',
      callback : () => { debug.true(); new Notice('ListSheet debug ON'); },
    });

    this.addCommand({
      id       : 'listsheet-debug-off',
      name     : 'ListSheet: Disable debug mode',
      callback : () => { debug.false(); new Notice('ListSheet debug OFF'); },
    });

    /* sync view when user switches to a different file */
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => this._syncActiveFile())
    );

    /* ── fast live update ─────────────────────────────────────────
     * editor-change fires on every keystroke in the active editor —
     * far sooner than vault.modify, which only fires after Obsidian's
     * debounced disk write. We read the editor's live (unsaved) text
     * directly and repaint any listsheet blocks for that file after a
     * short debounce, so typing in a list feels like it updates live. */
    this.registerEvent(
      this.app.workspace.on('editor-change', (editor, info) => {
        const file = info?.file;
        if (!file) return;
        this._scheduleRepaint(file, editor.getValue());
      })
    );

    /* backstop: covers changes that don't go through editor-change —
     * external edits, other panes, programmatic writes, etc. Slower
     * (governed by Obsidian's own debounce) but ensures correctness. */
    this.registerEvent(
      this.app.vault.on('modify', file => {
        this._scheduleRepaint(file, null);
      })
    );
  }

  /* debounce repaints per file path so rapid keystrokes/writes collapse
   * into a single recompute instead of one per event. */
  _scheduleRepaint(file, liveContent) {
    const path = file.path;
    clearTimeout(this._debounceTimers.get(path));
    this._debounceTimers.set(path, setTimeout(() => {
      this._debounceTimers.delete(path);
      this._repaintFile(file, liveContent);
    }, this.FAST_DEBOUNCE_MS));
  }

  _repaintFile(file, liveContent) {
    const path = file.path;

    const view = this._getView();
    if (view && view.file && view.file.path === path) {
      debug.log('Plugin', `File changed → re-render side panel: ${path}`);
      /* loadFile() is async (chunked formula evaluation) and guards its
       * own staleness internally via _loadGen — fire-and-forget here, just
       * surface unexpected errors instead of leaving a silent rejection.
       * Forwarding liveContent here (instead of always re-reading from
       * disk) is what makes the panel update on every keystroke the same
       * way inline ```listsheet blocks already did. */
      view.loadFile(file, liveContent).catch(err => debug.error('Plugin', 'loadFile failed', err));
    }

    /* repaint every live ```listsheet block belonging to this file.
     * Obsidian will NOT call registerMarkdownCodeBlockProcessor again
     * on its own just because content elsewhere in the file changed —
     * only when the block's own source text changes — so we drive the
     * repaint manually here instead of waiting for that callback. */
    let repainted = 0;
    for (const entry of this._inlineBlocks) {
      if (entry.filePath === path) {
        this._renderListsheetBlock(entry, liveContent);
        repainted++;
      }
    }
    if (repainted) {
      debug.log('Plugin', `File changed → repainted ${repainted} inline listsheet block(s): ${path}`);
    }
  }

  /* ── inline rendering: turn a ```listsheet block into its computed
   * results, right where it sits in the note (Reading view and Live
   * Preview) — not just in the side panel. Reads the whole file so
   * Sum()/Avg()/dot-notation can see the surrounding lists, then shows
   * only the rows that belong to *this* fenced block (matched via its
   * exact source line range). Called both on first mount and whenever
   * the underlying file changes elsewhere. ──────────────────────────── */
  async _renderListsheetBlock(entry, liveContent = null) {
    /* per-entry render token: bumped on every call (auto repaint, manual
     * refresh, editor-change, vault modify — any of which can overlap).
     * Every await point below re-checks it and bails out silently the
     * moment a newer render has superseded this one, so a slow/stale
     * computation can never win a race and clobber fresher results. */
    const myToken = (entry._renderToken = (entry._renderToken || 0) + 1);
    const isStale = () => entry._renderToken !== myToken || !this._inlineBlocks.has(entry);

    /* Build the whole new block into a detached buffer first and only
     * swap it into the live DOM once we know it's current — this avoids
     * "DOM fallback": flashing the block to empty (or to a half-built
     * state) the instant it's superseded, and avoids ever writing into
     * an `el` Obsidian has since recycled for a different block. */
    const buffer = document.createElement('div');

    const header = buffer.createDiv({ cls: 'ls-inline-header' });
    const refreshBtn = header.createEl('button', {
      cls: 'ls-btn ls-btn-refresh', attr: { 'aria-label': 'Refresh' }, text: '↻',
    });
    const copyAllBtn = header.createEl('button', {
      cls: 'ls-btn ls-btn-copy-all', attr: { 'aria-label': 'Copy all results' }, text: '⧉',
    });
    refreshBtn.addEventListener('click', () => {
      debug.log('Plugin', `Manual refresh: ${entry.filePath}`);
      this._renderListsheetBlock(entry);
    });

    try {
      const { el, ctx, source } = entry;
      const info    = ctx.getSectionInfo(el);
      const file    = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
      const content = liveContent != null
        ? liveContent
        : (file ? await this.app.vault.cachedRead(file) : (info ? info.text : source));

      if (isStale()) return;

      const indentUnit = this.settings?.indentSize ?? 2;
      const { blocks, listsheetBlocks } = await detectLists(content, indentUnit);
      if (isStale()) return;
      const mode    = this.settings?.duplicateKeyMode ?? 'merge';
      const listObj = buildListObj(blocks, mode);

      /* find the exact block this render call belongs to */
      let targetBlock = info
        ? listsheetBlocks.find(b => b.lineStart === info.lineStart)
        : null;
      if (!targetBlock) {
        const srcTrim = source.trim();
        targetBlock = listsheetBlocks.find(b => b.lines.join('\n').trim() === srcTrim) || null;
      }

      if (!targetBlock) {
        copyAllBtn.remove();
        buffer.createDiv({ cls: 'ls-inline-empty', text: 'ListSheet: could not locate this block — try reopening the file.' });
        this._swapInlineContent(entry, buffer, isStale);
        return;
      }

      /* chunked/yielding — a note with many listsheet blocks or heavy
       * formulas won't block typing/scrolling while this resolves, and
       * aborts cleanly (null) if superseded mid-flight. */
      const resultsByBlock = await applyListsheetBlocks(listsheetBlocks, listObj, {
        stopAt: targetBlock,
        isStale,
      });
      if (resultsByBlock == null || isStale()) return;

      const results = resultsByBlock.get(targetBlock) || [];

      if (results.length === 0) {
        copyAllBtn.remove();
        buffer.createDiv({ cls: 'ls-inline-empty', text: 'ListSheet: no "name = expr" lines found.' });
        this._swapInlineContent(entry, buffer, isStale);
        return;
      }

      const fmt = r => `${r.name} = ${r.error ? `⚠ ${r.error}` : r.value}`;

      copyAllBtn.addEventListener('click', () => {
        this._copyToClipboard(results.map(fmt).join('\n'), copyAllBtn);
      });

      for (const r of results) {
        const row = buffer.createDiv({ cls: 'ls-inline-row' });
        row.createSpan({ cls: 'ls-inline-name', text: r.name });
        row.createSpan({ cls: 'ls-inline-eq', text: '=' });
        row.createSpan({
          cls  : r.error ? 'ls-inline-value ls-inline-value-error' : 'ls-inline-value',
          text : r.error ? `⚠ ${r.error}` : String(r.value),
        });
        const rowCopyBtn = row.createEl('button', {
          cls: 'ls-btn ls-btn-row-copy', attr: { 'aria-label': `Copy ${r.name}` }, text: '⧉',
        });
        rowCopyBtn.addEventListener('click', () => this._copyToClipboard(fmt(r), rowCopyBtn));
      }

      this._swapInlineContent(entry, buffer, isStale);
    } catch (err) {
      debug.error('MarkdownCodeBlockProcessor(listsheet)', err);
      if (isStale()) return;
      copyAllBtn.remove();
      buffer.createDiv({ cls: 'ls-inline-error', text: `ListSheet error: ${err.message}` });
      this._swapInlineContent(entry, buffer, isStale);
    }
  }

  /* Swap a fully-built off-DOM buffer into the live block element in one
   * shot — only if the render is still current. Keeps the block visibly
   * stable (no empty flash) while async work runs, and never overwrites
   * a block that a newer render has since taken over (race prevention). */
  _swapInlineContent(entry, buffer, isStale) {
    if (isStale()) return;
    const { el } = entry;
    el.empty();
    el.addClass('ls-inline');
    while (buffer.firstChild) el.appendChild(buffer.firstChild);
  }

  /* copy text to clipboard and briefly flash the triggering button
   * as visual confirmation, without relying on a Notice popup. */
  async _copyToClipboard(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      const original = btn.textContent;
      btn.textContent = '✓';
      btn.addClass('is-ok');
      setTimeout(() => {
        btn.textContent = original;
        btn.removeClass('is-ok');
      }, 900);
    } catch (err) {
      debug.error('_copyToClipboard', err);
      new Notice('ListSheet: copy failed');
    }
  }

  async onunload() {
    for (const timer of this._debounceTimers?.values() ?? []) clearTimeout(timer);
    this._debounceTimers?.clear();
    console.log('[ListSheet] Plugin unloaded.');
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    /* re-render the active view so the new duplicate-key mode takes effect */
    await this._syncActiveFile();
  }

  /* ── helpers ────────────────────────────────────────────────── */

  /**
   * Write a checkbox toggle back to its exact source line in the note.
   * Uses vault.process for an atomic read-modify-write (avoids clobbering
   * a concurrent edit). After this resolves, the existing 'modify' file
   * watcher fires naturally and repaints the panel/inline blocks with
   * fully recomputed totals — no separate re-render call needed here.
   */
  async setCheckboxState(file, lineIndex, checked) {
    const CHECKBOX_LINE_RE = /^(\s*[-*]\s\[)[ xX](\])/;
    await this.app.vault.process(file, content => {
      const lines = content.split('\n');
      if (lineIndex < 0 || lineIndex >= lines.length) {
        debug.warn('setCheckboxState', `Line ${lineIndex} out of range for ${file.path}`);
        return content;
      }
      if (!CHECKBOX_LINE_RE.test(lines[lineIndex])) {
        debug.warn('setCheckboxState', `Line ${lineIndex} is no longer a checkbox — file changed underneath us, skipping write`);
        return content;
      }
      lines[lineIndex] = lines[lineIndex].replace(CHECKBOX_LINE_RE, (m, pre, post) => pre + (checked ? 'x' : ' ') + post);
      return lines.join('\n');
    });
  }

  _getView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    return leaves.length > 0 ? leaves[0].view : null;
  }

  async _openPanel() {
    /* avoid duplicate panels */
    if (!this.app.workspace.getLeavesOfType(VIEW_TYPE).length) {
      const leaf = this.app.workspace.getRightLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }

    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (leaves.length) this.app.workspace.revealLeaf(leaves[0]);

    await this._syncActiveFile();
  }

  async _syncActiveFile() {
    const view = this._getView();
    const file = this.app.workspace.getActiveFile();
    if (view && file && file.extension === 'md') {
      await view.loadFile(file);
    }
  }
}

module.exports = ListSheetPlugin;