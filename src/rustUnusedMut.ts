// Final text pass over printed Rust: `let mut x` becomes `let x` when nothing in the binding's scope can mutate x.
// Any doubt (reassignment, `&mut x`, a method outside the read-only list, an index store, a call of x) keeps `mut`.

const READ_METHODS = new Set([
    'clone', 'as_str', 'as_deref', 'as_ref', 'as_map', 'as_array', 'as_i64', 'as_f64', 'as_bool', 'as_dict', 'as_list',
    'is_some', 'is_none', 'is_null', 'is_empty', 'is_ok', 'is_err', 'len', 'get', 'contains_key', 'contains',
    'starts_with', 'ends_with', 'to_string', 'to_owned', 'to_lowercase', 'to_uppercase', 'trim', 'split', 'iter',
    'keys', 'values', 'unwrap', 'unwrap_or', 'unwrap_or_default', 'unwrap_or_else', 'map', 'and_then', 'cloned',
    'into_list', 'into_dict', 'into_opt_dict', 'into_iter', 'into', 'is_truthy', 'raw', 'as_slice',
]);

const isWord = (c: number): boolean => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
const isWs = (c: number): boolean => c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 11;

const isAssignAt = (text: string, q: number, end: number, allowBit: boolean): boolean => {
    if (q >= end) return false;
    const c = text.charCodeAt(q);
    if (c === 61) { const n = q + 1 < end ? text.charCodeAt(q + 1) : 0; return n !== 61 && n !== 62; }
    if (q + 1 < end && text.charCodeAt(q + 1) === 61 && (c === 45 || c === 43 || c === 42 || c === 47 || c === 37 || (allowBit && (c === 38 || c === 124 || c === 94)))) return true;
    return allowBit && q + 2 < end && text.charCodeAt(q + 2) === 61 && ((c === 60 && text.charCodeAt(q + 1) === 60) || (c === 62 && text.charCodeAt(q + 1) === 62));
};

const BRACKET_ASSIGN_RE = /\]\s*(?:=(?![=>])|[-+*/%]=)/;
const TUPLE_ASSIGN_RE = /^\s*\(.*\)\s*=(?![=>])/;
const TOKEN_RE = /[{}]|\/\/[^\n]*|"(?:\\.|[^"\\])*"|(?<!\w)r(#{0,6})"[\s\S]*?"\1|'(?:\\.|[^'\\\n])'/g;

/** Fallback brace matcher only if a `let mut` starts inside a string/comment. */
function blockEndFallback(text: string, at: number): number {
    const re = new RegExp(TOKEN_RE.source, 'g');
    re.lastIndex = at;
    let depth = 0, m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const s = m[0];
        if (s === '{') depth++;
        else if (s === '}') { if (depth === 0) return m.index + 1; depth--; }
    }
    return text.length;
}

function lowerBound(arr: number[], x: number): number {
    let lo = 0, hi = arr.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < x) lo = mid + 1; else hi = mid; }
    return lo;
}

function mutated(text: string, start: number, end: number, name: string, occs: number[] | undefined, refMutS: number[], refMutE: number[]): boolean {
    if (refMutS.length > 0) {
        const idx = lowerBound(refMutS, start);
        if (idx < refMutS.length && refMutE[idx] <= end) return true;
    }
    if (occs === undefined) return false;
    const len = name.length;
    let lastLine = -1;
    for (let k = lowerBound(occs, start); k < occs.length; k++) {
        const p = occs[k];
        if (p + len > end) break;
        if (p > start && isWord(text.charCodeAt(p - 1))) continue;
        // `& mut x` or `!( x`
        let b = p - 1;
        while (b >= start && isWs(text.charCodeAt(b))) b--;
        if (b >= start + 1 && text.charCodeAt(b) === 40 && text.charCodeAt(b - 1) === 33) return true;
        if (b >= start + 3 && text.charCodeAt(b) === 116 && text.charCodeAt(b - 1) === 117 && text.charCodeAt(b - 2) === 109 && b < p - 1) {
            let a = b - 3;
            while (a >= start && isWs(text.charCodeAt(a))) a--;
            if (a >= start && text.charCodeAt(a) === 38) return true;
        }
        // direct assign or call: `x =`, `x +=`, `x(`
        let q = p + len;
        while (q < end && isWs(text.charCodeAt(q))) q++;
        if (q < end && (text.charCodeAt(q) === 40 || isAssignAt(text, q, end, true))) return true;
        // every `x.a.b(..)` chain
        if (q < end && text.charCodeAt(q) === 46) {
            let r = q, lastSeg = '', segCount = 0;
            while (r < end) {
                let d = r;
                while (d < end && isWs(text.charCodeAt(d))) d++;
                if (d >= end || text.charCodeAt(d) !== 46) break;
                d++;
                while (d < end && isWs(text.charCodeAt(d))) d++;
                const s0 = d;
                while (d < end && isWord(text.charCodeAt(d))) d++;
                if (d === s0) break;
                lastSeg = text.slice(s0, d);
                segCount++;
                r = d;
            }
            if (segCount > 0) {
                let s = r;
                while (s < end && isWs(text.charCodeAt(s))) s++;
                if (s < end) {
                    const sc = text.charCodeAt(s);
                    if (sc === 91) return true;
                    if (sc === 40) { if (!READ_METHODS.has(lastSeg)) return true; }
                    else if (isAssignAt(text, s, end, false)) return true;
                }
            }
        }
        // line checks: index store `x[..] =` or tuple destructuring assignment `(..) =`
        const ls = Math.max(start, text.lastIndexOf('\n', p - 1) + 1);
        const nl = text.indexOf('\n', p + len);
        const le = nl < 0 || nl > end ? end : nl;
        if (q < le && text.charCodeAt(q) === 91 && BRACKET_ASSIGN_RE.test(text.slice(ls, le))) return true;
        if (ls !== lastLine) {
            lastLine = ls;
            if (text.indexOf('(', ls) >= 0 && text.indexOf('(', ls) < le && TUPLE_ASSIGN_RE.test(text.slice(ls, le))) return true;
        }
    }
    return false;
}

/** `let mut x` -> `let x` for every binding the rest of its block never mutates. */
export function rustDropUnusedMut(text: string): string {
    const decl = /(?<![\w.])let mut ([A-Za-z_]\w*)\b(?!\s*!)/g;
    const matches: Array<{ idx: number, after: number, name: string, end: number }> = [];
    const byName = new Map<string, number[]>();
    for (const m of text.matchAll(decl)) {
        matches.push({ idx: m.index, after: m.index + m[0].length, name: m[1], end: -1 });
        if (!byName.has(m[1])) byName.set(m[1], []);
    }
    if (matches.length === 0) return text;
    // Single native-regex pass for brace boundaries
    const frames: number[][] = [[]];
    let mi = 0, tm: RegExpExecArray | null;
    TOKEN_RE.lastIndex = 0;
    while ((tm = TOKEN_RE.exec(text)) !== null) {
        const pos = tm.index, tok = tm[0];
        while (mi < matches.length && matches[mi].after <= pos) frames[frames.length - 1].push(mi++);
        if (tok === '{') {
            frames.push([]);
        } else if (tok === '}') {
            const closed = frames.pop()!;
            for (const k of closed) matches[k].end = pos + 1;
            if (frames.length === 0) frames.push([]);
        } else {
            const tokEnd = pos + tok.length;
            while (mi < matches.length && matches[mi].after < tokEnd) {
                matches[mi].end = blockEndFallback(text, matches[mi].after);
                mi++;
            }
        }
    }
    while (mi < matches.length) matches[mi++].end = text.length;
    for (const f of frames) for (const k of f) matches[k].end = text.length;
    // Single pass indexing all word occurrences of candidate names
    const identRe = /[A-Za-z_]\w*/g;
    let im: RegExpExecArray | null;
    while ((im = identRe.exec(text)) !== null) {
        const list = byName.get(im[0]);
        if (list !== undefined) list.push(im.index);
    }
    const refMutS: number[] = [], refMutE: number[] = [];
    if (text.includes('ref')) {
        for (const m of text.matchAll(/ref\s+mut\b/g)) { refMutS.push(m.index); refMutE.push(m.index + m[0].length); }
    }
    const parts: string[] = [];
    let last = 0;
    for (const m of matches) {
        if (!mutated(text, m.after, m.end, m.name, byName.get(m.name), refMutS, refMutE)) {
            const at = m.idx + 4;
            parts.push(text.slice(last, at));
            last = at + 4;
        }
    }
    if (parts.length === 0) return text;
    parts.push(text.slice(last));
    return parts.join('');
}
