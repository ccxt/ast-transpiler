// hx11 W9 (rust): `let mut X: Value = Value::Str("lit".into());` locals become a native `String`.
// Pure text pass over the final Rust; the declaration and every later write are literals.

/**
 * A literal-backed local whose every write is `Value::Str("lit".into())` and whose every later
 * use is a `format!` slot, `X.as_str()`, `stringify_param(&X)` or a by-value operand becomes a
 * `String`. A by-value operand re-boxes through `Value::from`, which builds the `Value::Str`
 * the literal was. Any other use (`&X`, `&mut`, a closure, a second binding, a write from
 * another expression) keeps `Value`.
 */
export function hx11w9RustStrLiteralLocalNativeString(content: string): string {
    const declRe = /^([ \t]*)let mut ([a-zA-Z_][a-zA-Z0-9_]*): Value = Value::Str\(("(?:[^"\\\n]|\\.)*")\.(?:into|to_string)\(\)\);[ \t]*$/gm;
    const litWriteRe = /^\s*=\s*Value::Str\(("(?:[^"\\\n]|\\.)*")\.(?:into|to_string)\(\)\);/;
    // Blank string bodies and line comments; same length, quotes kept.
    const maskText = (src: string): string => {
        let out = ''; let i = 0;
        while (i < src.length) {
            const c = src[i];
            if (c === '/' && src[i + 1] === '/') {
                while (i < src.length && src[i] !== '\n') { out += ' '; i++; }
                continue;
            }
            if (c === '"') {
                out += '"'; i++;
                while (i < src.length && src[i] !== '"') {
                    if (src[i] === '\\') { out += '  '; i += 2; continue; }
                    out += src[i] === '\n' ? '\n' : ' ';
                    i++;
                }
                if (i < src.length) { out += '"'; i++; }
                continue;
            }
            out += c; i++;
        }
        return out;
    };
    const closeParen = (src: string, open: number): number => {
        let depth = 0;
        for (let k = open; k < src.length; k++) {
            const c = src[k];
            if (c === '(') depth++;
            else if (c === ')') { depth--; if (depth === 0) return k + 1; }
        }
        return -1;
    };
    const braceEnd = (src: string, from: number): number => {
        let depth = 0;
        for (let k = from; k < src.length; k++) {
            const c = src[k];
            if (c === '{') depth++;
            else if (c === '}') { depth--; if (depth < 0) return k; }
        }
        return src.length;
    };
    const argSpans = (src: string): Array<[number, number]> => {
        const out: Array<[number, number]> = [];
        let depth = 0; let start = 0;
        for (let i = 0; i < src.length; i++) {
            const c = src[i];
            if (c === '(' || c === '[' || c === '{') depth++;
            else if (c === ')' || c === ']' || c === '}') depth--;
            else if (c === ',' && depth === 0) { out.push([start, i]); start = i + 1; }
        }
        out.push([start, src.length]);
        return out;
    };

    // The re-box consumes the `String`: only a last use outside any loop may move it.
    const boxUse = (name: string, kept: string, after: string, used: number, body: string): string => {
        const later = new RegExp(`(?<![A-Za-z0-9_.:])${name}(?![A-Za-z0-9_])`).test(after.slice(used));
        const inLoop = /\b(?:loop|while|for)\b/.test(body);
        const arg = kept === '' && (later || inLoop) ? `${name}.clone()` : `${name}${kept}`;
        return `Value::from(${arg})`;
    };

    const masked = maskText(content);
    type Edit = { start: number, end: number, text: string };
    const groups: Edit[][] = [];
    const grown = new Map<number, number>();
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(masked)) !== null) {
        const name = m[2];
        const stmtEnd = m.index + m[0].length;
        const lit = /Value::Str\(("(?:[^"\\\n]|\\.)*")\.(?:into|to_string)\(\)\);/.exec(content.slice(m.index, stmtEnd));
        if (lit === null) continue;
        const end = braceEnd(masked, stmtEnd);
        const body = masked.slice(stmtEnd, end);
        if (new RegExp(`\\b(?:let|for|fn)\\s+(?:mut\\s+)?${name}\\b`).test(body)) continue;
        if (new RegExp(`\\|[^|\\n]*\\b${name}\\b[^|\\n]*\\|`).test(body)) continue;
        const fRe = /format!\(/g;
        const fSpans: Array<[number, number, boolean]> = [];
        let f: RegExpExecArray | null;
        while ((f = fRe.exec(body)) !== null) {
            const close = closeParen(body, f.index + f[0].length - 1);
            if (close < 0) continue;
            const fl = /^"(?:[^"\\]|\\.)*"/.exec(body.slice(f.index + f[0].length, close));
            fSpans.push([f.index, close, fl !== null && /:\?/.test(fl[0])]);
        }
        const useRe = new RegExp(`(?<![A-Za-z0-9_.:])${name}(?![A-Za-z0-9_])`, 'g');
        const edits: Edit[] = [];
        let ok = true; let u: RegExpExecArray | null;
        while ((u = useRe.exec(body)) !== null) {
            const at = u.index; const abs = stmtEnd + at;
            const after = body.slice(at + name.length);
            const before = body.slice(0, at);
            let g: RegExpExecArray | null;
            // 1. A write: only another literal.
            if ((g = /^\s*=(?!=)/.exec(after)) !== null && !/[!<>=&|]\s*$/.test(before)) {
                const w = litWriteRe.exec(content.slice(abs + name.length));
                if (w === null) { ok = false; break; }
                edits.push({ start: abs + name.length, end: abs + name.length + w[0].length, text: ` = ${w[1]}.to_string();` });
                continue;
            }
            // 2. A whole `format!` slot (not a `{:?}` sink): `String` prints the same text.
            const cand = fSpans.filter(([s, e]) => at > s && at < e);
            if (cand.length > 0) {
                const hit = cand.reduce((a, b) => (b[0] > a[0] ? b : a));
                const inner = hit[0] + 'format!('.length;
                const slot = argSpans(body.slice(inner, hit[1] - 1))
                    .filter(([a, b]) => inner + a <= at && at + name.length <= inner + b);
                if (slot.length > 0 && body.slice(inner + slot[0][0], inner + slot[0][1]).replace(/\s+/g, '') === name) {
                    if (hit[2]) { ok = false; break; }
                    continue;
                }
            }
            if ((g = /^\.as_str\(\)/.exec(after)) !== null && !/&\s*$/.test(before)) {
                // `Option<&str>` as the boxed accessor gave.
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: `Some(${name}.as_str())` });
            } else if (/crate::runtime::stringify_param\(&$/.test(before) && /^\)/.test(after)) {
                // The helper prints a `Str` as its text.
                const from = abs - 'crate::runtime::stringify_param(&'.length;
                edits.push({ start: from, end: abs + name.length + 1, text: `${name}.clone()` });
            } else if (/(?:[(,\[]\s*)$/.test(before) && !/&\s*$/.test(before)
                && (g = /^(\.clone\(\))?(?=\s*[,)\];])/.exec(after)) !== null) {
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: boxUse(name, g[0], after, g[0].length, body) });
            } else if (/(?<![=!<>])=\s$/.test(before) && (g = /^(\.clone\(\))?(?=\s*[;,)])/.exec(after)) !== null) {
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: boxUse(name, g[0], after, g[0].length, body) });
            } else { ok = false; break; }
        }
        if (!ok) continue;
        // Every edit keeps its line at most 400 chars unless it was already longer.
        // keep a trailing `// comment` the declaration regex swallowed
        const tail = content.slice(m.index + lit.index + lit[0].length, stmtEnd);
        const declText = `${m[1]}let mut ${name}: String = ${lit[1]}.to_string();${tail}`;
        const all: Edit[] = [{ start: m.index, end: stmtEnd, text: declText }, ...edits];
        const lineGrow = new Map<number, number>();
        for (const e of all) {
            const ls = content.lastIndexOf('\n', e.start) + 1;
            lineGrow.set(ls, (lineGrow.get(ls) ?? 0) + e.text.length - (e.end - e.start));
        }
        let longer = false;
        for (const [ls, grow] of lineGrow) {
            let le = content.indexOf('\n', ls); if (le < 0) le = content.length;
            const cur = le - ls + (grown.get(ls) ?? 0);
            if (cur <= 400 && cur + grow > 400) longer = true;
        }
        if (longer) continue;
        for (const [ls, grow] of lineGrow) grown.set(ls, (grown.get(ls) ?? 0) + grow);
        groups.push(all);
    }
    const rewrites = groups.flat();
    if (rewrites.length === 0) return content;
    rewrites.sort((a, b) => a.start - b.start);
    let out = ''; let last = 0;
    for (const r of rewrites) {
        if (r.start < last) continue; // overlapping: keep the first
        out += content.slice(last, r.start) + r.text;
        last = r.end;
    }
    out += content.slice(last);
    return out;
}
