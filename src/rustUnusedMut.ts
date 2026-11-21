// Final text pass over printed Rust: `let mut x` becomes `let x` when nothing in the binding's scope can mutate x.
// Any doubt (reassignment, `&mut x`, a method outside the read-only list, an index store, a call of x) keeps `mut`.

const READ_METHODS = new Set([
    'clone', 'as_str', 'as_deref', 'as_ref', 'as_map', 'as_array', 'as_i64', 'as_f64', 'as_bool', 'as_dict', 'as_list',
    'is_some', 'is_none', 'is_null', 'is_empty', 'is_ok', 'is_err', 'len', 'get', 'contains_key', 'contains',
    'starts_with', 'ends_with', 'to_string', 'to_owned', 'to_lowercase', 'to_uppercase', 'trim', 'split', 'iter',
    'keys', 'values', 'unwrap', 'unwrap_or', 'unwrap_or_default', 'unwrap_or_else', 'map', 'and_then', 'cloned',
    'into_list', 'into_dict', 'into_opt_dict', 'into_iter', 'into', 'is_truthy', 'raw', 'as_slice',
]);

/** Index just past the brace closing the block that encloses `at`; the text length when unbalanced. */
function blockEnd(text: string, at: number): number {
    let depth = 0;
    for (let i = at; i < text.length; i++) {
        const c = text[i];
        if (c === '"' || (c === 'r' && /^r#*"/.test(text.slice(i, i + 8)) && !/\w/.test(text[i - 1] ?? ''))) {
            let hashes = '';
            if (c === 'r') { const m = /^r(#*)"/.exec(text.slice(i))!; hashes = m[1]; i += m[0].length; } else i++;
            const close = '"' + hashes;
            for (; i < text.length; i++) {
                if (c === '"' && text[i] === '\\') { i++; continue; }
                if (text.startsWith(close, i)) { i += close.length - 1; break; }
            }
            continue;
        }
        if (c === '\'') { const m = /^'(?:\\.|[^\\'\n])'/.exec(text.slice(i, i + 6)); if (m) { i += m[0].length - 1; continue; } }
        if (c === '/' && text[i + 1] === '/') { const nl = text.indexOf('\n', i); if (nl < 0) return text.length; i = nl; continue; }
        if (c === '{') depth++;
        else if (c === '}') { if (depth === 0) return i + 1; depth--; }
    }
    return text.length;
}

function mutated(region: string, name: string): boolean {
    const n = name.replace(/\$/g, '\\$');
    const id = `(?<![\\w])${n}\\b`;
    if (new RegExp(`&\\s*mut\\s+${n}\\b|ref\\s+mut\\b|!\\(\\s*${n}\\b`).test(region)) return true;
    if (new RegExp(`${id}\\s*(?:=(?![=>])|[-+*/%&|^]=|<<=|>>=|\\()`).test(region)) return true;
    // every `x.a.b(..)` chain: fields are walked, the first call must be read-only, and the chain must not be stored to
    for (const m of region.matchAll(new RegExp(`${id}((?:\\s*\\.\\s*\\w+)+)(\\s*\\(|\\s*\\[|\\s*(?:=(?![=>])|[-+*/%]=))?`, 'g'))) {
        const segs = m[1].split('.').map(t => t.trim()).filter(Boolean);
        if (m[2] === undefined || m[2].trim() === '[') { if (m[2] !== undefined) return true; continue; }
        if (m[2].trim() !== '(') return true;
        if (!READ_METHODS.has(segs[segs.length - 1])) return true;
    }
    for (const line of region.split('\n')) {
        if (!new RegExp(id).test(line)) continue;
        if (new RegExp(`${id}\\s*\\[`).test(line) && /\]\s*(?:=(?![=>])|[-+*/%]=)/.test(line)) return true;
        if (/^\s*\(.*\)\s*=(?![=>])/.test(line)) return true;
    }
    return false;
}

/** `let mut x` -> `let x` for every binding the rest of its block never mutates. */
export function rustDropUnusedMut(text: string): string {
    const decl = /(?<![\w.])let mut ([A-Za-z_]\w*)\b(?!\s*!)/g;
    const drops: number[] = [];
    for (const m of text.matchAll(decl)) {
        const after = m.index + m[0].length;
        if (!mutated(text.slice(after, blockEnd(text, after)), m[1])) drops.push(m.index + 'let '.length);
    }
    let out = '', last = 0;
    for (const at of drops) { out += text.slice(last, at); last = at + 'mut '.length; }
    return out + text.slice(last);
}
