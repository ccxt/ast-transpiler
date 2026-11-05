import { BaseTranspiler } from "./baseTranspiler.js";
import { NodeFlags, SyntaxKind, type Block, type CallExpression, type Declaration, type Expression, type Identifier, type Node, type NodeArray, type ParameterDeclaration, type SourceFile, type VariableDeclaration } from "typescript/unstable/ast";
import { isArrayLiteralExpression, isArrowFunction, isAsExpression, isBinaryExpression, isBindingElement, isBlock, isCallExpression, isClassDeclaration, isClassExpression, isConditionalExpression, isDeleteExpression, isElementAccessExpression, isForInStatement, isForOfStatement, isIdentifier, isMethodDeclaration, isNoSubstitutionTemplateLiteral, isNonNullExpression, isNumericLiteral, isObjectLiteralExpression, isParameterDeclaration, isParenthesizedExpression, isPrefixUnaryExpression, isPropertyAccessExpression, isReturnStatement, isShorthandPropertyAssignment, isSourceFile, isStatement, isStringLiteral, isStringLiteralLikeNode, isTypeAssertion, isVariableDeclaration } from "typescript/unstable/ast/is";
import { IndexKind, ObjectFlags, SignatureKind, SymbolFlags, TypeFlags, type Symbol as TsSymbol, type Type } from "typescript/unstable/sync";
import { findAncestor, getAllSuperTypeNodes, isFunctionLike, signatureDeclaration, symbolDeclarations, symbolValueDeclaration, typeParts, typeTarget } from "./tsUtils.js";
import * as fs from 'fs';

// ---- native get_value ----
// Native `get_value` on a receiver whose container shape the emitted text pins: an Arr-init local read only by
// index/length becomes `Vec<Value>`, a never-reassigned marker-free literal dict reads `as_map().get(k)`. Both
// match the helper exactly (its array arm and marker-free dict arm); anything unproven keeps `get_value(...)`.

const IDENT = '[A-Za-z_][A-Za-z0-9_]*';

// Keys whose presence in a Dict activates a fetch/store routing arm of
// `get_value` (runtime value.rs): book/cache handle ids and markers.
const MARKER_KEYS = ['__book_id', '__cache_id', '__cacheKind', '__sideKind', '__live_id'];
// Keys the Dict branch special-cases on the way through.
const ROUTED_KEYS = ['cache', 'hashmap', 'subscriptions', 'futures', 'timestamp', 'datetime', 'nonce', 'symbol', 'checksum'];

function maskText(src: string): string {
    let out = '';
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (c === '/' && src[i + 1] === '/') {
            while (i < src.length && src[i] !== '\n') { out += ' '; i++; }
            continue;
        }
        if (c === '"') {
            out += ' ';
            i++;
            while (i < src.length && src[i] !== '"') {
                if (src[i] === '\\') { out += '  '; i += 2; continue; }
                out += src[i] === '\n' ? '\n' : ' ';
                i++;
            }
            if (i < src.length) { out += ' '; i++; }
            continue;
        }
        out += c;
        i++;
    }
    return out;
}

function closeBracket(src: string, open: number): number {
    let depth = 0;
    for (let k = open; k < src.length; k++) {
        const c = src[k];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') {
            depth--;
            if (depth === 0) return k + 1;
        }
    }
    return -1;
}

function statementEnd(src: string, from: number): number {
    let depth = 0;
    for (let k = from; k < src.length; k++) {
        const c = src[k];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') {
            if (depth === 0) return -1;
            depth--;
        } else if (c === ';' && depth === 0) return k + 1;
        else if (c === '\n' && depth === 0) return -1;
    }
    return -1;
}

// Initializers the runtime only ever answers with a fresh `Value::Array`.
// `promise_all` is NOT one (it is `v.clone()`), nor `index_by` (a map for a
// non-array arg), nor any `safe_value*`.
const ARRAY_INIT = /^(?:Value::Array\(|Value::from\(\s*vec!\[|Value::from\(\s*std::sync::Arc::new\(\s*vec!\[|split\(|object_keys\(|object_values\(|self\.array_concat\(|self\.safe_list(?:_k|_n)?\()/;
// A fresh dict literal: `Value::Map({.. let mut m = indexmap::IndexMap::new(); ..})`.
const DICT_INIT = /^(?:Value::Map\(|Value::Dict\()/;
const SEQ_TYPE = /^(?:&)?(?:mut )?(?:Vec<(?:crate::)?Value>|\[(?:crate::)?Value\])$/;
const INDEXED = '.cloned().unwrap_or(Value::Null)';

type Edit = { start: number, end: number, text: string };

function literalIndex(keyText: string): number {
    const key = keyText.trim().replace(/^&/, '').trim();
    const int = /^Value::Int\(\s*(\d+)\s*\)$/.exec(key);
    if (int !== null) return Number(int[1]);
    const str = /^Value::Str\(\s*"(\d+)"\s*(?:\.into\(\)|\.to_string\(\))?\s*\)$/.exec(key);
    if (str !== null) return Number(str[1]);
    return -1;
}

function literalStrKey(keyText: string): string | undefined {
    const key = keyText.trim().replace(/^&/, '').trim();
    const m = /^Value::Str\(\s*"([^"\\]*)"\s*(?:\.into\(\)|\.to_string\(\))?\s*\)$/.exec(key);
    return m === null ? undefined : m[1];
}

/** Bare identifier used as a key, or undefined. */
function identKey(keyText: string): string | undefined {
    const m = /^&?([A-Za-z_][A-Za-z0-9_]*)$/.exec(keyText.trim());
    return m === null ? undefined : m[1];
}

/** Split `get_value(&RECV, &KEY)` at `callStart`; returns [recvEnd, close]. */
function callArgs(masked: string, callStart: number, recv: string): [number, number] | undefined {
    const head = 'get_value(&' + recv;
    if (masked.slice(callStart, callStart + head.length) !== head) return undefined;
    const afterRecv = callStart + head.length;
    if (masked[afterRecv] !== ',') return undefined;
    const close = closeBracket(masked, masked.indexOf('(', callStart));
    if (close < 0) return undefined;
    return [afterRecv, close];
}

/**
 * True when `name` in this region can only ever hold `Value::Int`: one
 * declaration initialised with an int literal, mutated only by the printer's
 * `if let Value::Int(n) = &mut name { *n += 1; }` counter step.
 */
function intPinned(region: string, name: string): boolean {
    const declRe = new RegExp('^[ \\t]*let (?:mut )?' + name + ':\\s*(?:crate::)?Value\\s*=\\s*Value::Int\\(\\s*\\d+\\s*\\);', 'm');
    const decl = declRe.exec(region);
    if (decl === null) return false;
    const declEnd = decl.index + decl[0].length;
    const useRe = new RegExp('(?<![A-Za-z0-9_.])' + name + '(?![A-Za-z0-9_])', 'g');
    let um: RegExpExecArray | null;
    while ((um = useRe.exec(region)) !== null) {
        const at = um.index;
        if (at >= decl.index && at < declEnd) continue;
        const before = region.slice(Math.max(0, at - 5), at);
        const after = region.slice(at + name.length);
        if (before === '&mut ' && /^\s*\{\s*\*n \+= 1;\s*\}/.test(after)) continue;
        if (before.endsWith('&')) continue;
        if (/^\.(?:as_(?:i64|f64)|clone)\(\)/.test(after)) continue;
        return false;
    }
    return true;
}

export type NativeGetValueStats = { seqLocals: number, seqReads: number, dictLocals: number, dictReads: number };

/** Native `get_value` on statically pinned receivers. `stats` counts rewritten locals and reads. */
export function nativeGetValue(content: string, stats?: NativeGetValueStats): string {
    const masked = maskText(content);
    const edits: Edit[] = [];

    // Fn regions: a local of one fn is never in scope in another.
    const headers: number[] = [];
    const headerRe = /^[ \t]*(?:pub )?(?:async )?fn /gm;
    let hm: RegExpExecArray | null;
    while ((hm = headerRe.exec(masked)) !== null) headers.push(hm.index);
    headers.push(content.length);

    for (let h = 0; h + 1 < headers.length; h++) {
        const from = headers[h];
        const to = h + 2 < headers.length ? headers[h + 1] : content.length;
        const region = masked.slice(from, to);

        // A read's replacement text, or undefined when the receiver/key pair is
        // not one this rule can prove.
        const readText = (recv: string, seq: boolean, keyText: string): string | undefined => {
            if (seq) {
                const idx = literalIndex(keyText);
                if (idx >= 0) return recv + '.get(' + idx + ')' + INDEXED;
                const key = identKey(keyText);
                if (key !== undefined && intPinned(region, key)) {
                    return recv + '.get(' + key + '.as_i64().unwrap() as usize)' + INDEXED;
                }
                return undefined;
            }
            const str = literalStrKey(keyText);
            if (str === undefined || ROUTED_KEYS.indexOf(str) >= 0) return undefined;
            return recv + '.as_map().unwrap().get("' + str + '").cloned().unwrap_or(Value::Null)';
        };
        const rewriteRead = (recv: string, seq: boolean, callStart: number): Edit | undefined => {
            const args = callArgs(masked, callStart, recv);
            if (args === undefined) return undefined;
            const text = readText(recv, seq, content.slice(args[0] + 1, args[1] - 1));
            return text === undefined ? undefined : { start: callStart, end: args[1], text };
        };

        // Receivers already declared as a sequence of `Value`.
        const declared = new Map<string, string>();
        const declType = new RegExp('\\blet (?:mut )?(' + IDENT + ')\\s*:\\s*([^=;]+?)\\s*=', 'g');
        let dm: RegExpExecArray | null;
        while ((dm = declType.exec(region)) !== null) declared.set(dm[1], dm[2].trim());
        const headerEnd = region.indexOf('{');
        const headerText = headerEnd < 0 ? region : region.slice(0, headerEnd);
        const paramRe = new RegExp('\\b(?:mut )?(' + IDENT + ')\\s*:\\s*([&\\[A-Za-z_][A-Za-z0-9_:<>,\\s&\\[\\]]*)', 'g');
        while ((dm = paramRe.exec(headerText)) !== null) {
            if (!declared.has(dm[1])) declared.set(dm[1], dm[2].trim());
        }
        for (const [name, type] of declared) {
            if (!SEQ_TYPE.test(type)) continue;
            const useRe = new RegExp('get_value\\(&' + name + '(?![A-Za-z0-9_])', 'g');
            let um: RegExpExecArray | null;
            while ((um = useRe.exec(region)) !== null) {
                const read = rewriteRead(name, true, from + um.index);
                if (read === undefined) continue;
                edits.push(read);
                if (stats) stats.seqReads++;
            }
        }

        // Locals whose initializer pins the container shape.
        const declRe = new RegExp('^([ \\t]*)let (mut )?(' + IDENT + '):\\s*(?:crate::)?Value\\s*=\\s*', 'gm');
        while ((dm = declRe.exec(region)) !== null) {
            const name = dm[3];
            const declAt = from + dm.index;
            const initStart = declAt + dm[0].length;
            const stmtEnd = statementEnd(masked, initStart);
            if (stmtEnd < 0) continue;
            const initText = content.slice(initStart, stmtEnd).trim();
            const isSeq = ARRAY_INIT.test(initText);
            const isDict = DICT_INIT.test(initText);
            if (!isSeq && !isDict) continue;
            const declCount = (region.match(new RegExp('\\blet (?:mut )?' + name + '\\b', 'g')) ?? []).length;
            if (declCount !== 1) continue;
            // A reassignment could hand the local another shape.
            if (new RegExp('(?<![A-Za-z0-9_.])' + name + '\\s*=[^=]').test(region)) continue;
            // A dict's key set must be literal and marker-free for the native
            // read to skip the same routing the helper does.
            const dictKeys: string[] = [];
            if (isDict) {
                const keys = insertedKeys(initText);
                if (keys === undefined) continue;
                for (const k of keys) dictKeys.push(k);
            }

            // Every later use must be one this rule keeps exact.
            const useRe = new RegExp('(?<![A-Za-z0-9_.])' + name + '(?![A-Za-z0-9_])', 'g');
            const reads: Edit[] = [];
            let ok = true;
            let um: RegExpExecArray | null;
            while ((um = useRe.exec(region)) !== null) {
                const at = um.index;
                if (at >= dm.index && at < dm.index + dm[0].length) continue;
                const gv = region.lastIndexOf('get_value(', at);
                if (gv >= 0 && region.slice(gv, at) === 'get_value(&') {
                    const read = rewriteRead(name, isSeq, from + gv);
                    if (read === undefined) { ok = false; break; }
                    reads.push(read);
                    continue;
                }
                // A length sink reads the same on a Vec and on a `Value` array.
                if (isSeq && /^\.\s*(?:len|is_empty)\s*\(\s*\)/.test(region.slice(at + name.length))) continue;
                if (isSeq) { ok = false; break; }
                // A dict keeps its `Value` type, so only writes can change what
                // the read would have to route: they must land on literal,
                // non-marker keys. Reads by other means and Value sinks are fine.
                const before = region.slice(Math.max(0, at - 24), at);
                const writeHead = /(?:add_element_to_object|set_value)\(\s*&mut\s+$/.exec(before);
                if (writeHead !== null) {
                    const keyStart = at + name.length;
                    const key = /^\s*,\s*&?\s*Value::Str\(\s*"([^"\\]*)"\s*(?:\.into\(\)|\.to_string\(\))?\s*\)\s*,/.exec(region.slice(keyStart));
                    if (key === null) { ok = false; break; }
                    if (ROUTED_KEYS.indexOf(key[1]) >= 0 || MARKER_KEYS.indexOf(key[1]) >= 0) { ok = false; break; }
                    dictKeys.push(key[1]);
                    continue;
                }
                if (/&mut\s+$/.test(before)) { ok = false; break; }
            }
            if (!ok || reads.length === 0) continue;
            if (dictKeys.some((k) => MARKER_KEYS.indexOf(k) >= 0)) continue;

            if (isSeq) {
                const typeAt = declAt + dm[0].length - 'Value = '.length;
                edits.push({ start: typeAt, end: typeAt + 'Value'.length, text: 'Vec<Value>' });
                // The initializer still yields a `Value`; unwrap the array this
                // rule just proved it holds (same value, no copy for a literal).
                const initExpr = content.slice(initStart, stmtEnd - 1).replace(/\s+$/, '');
                const inner = arrayPayload(initExpr);
                edits.push({
                    start: initStart,
                    end: initStart + initExpr.length,
                    text: inner !== undefined ? inner : initExpr + '.as_array().unwrap().clone()',
                });
                if (stats) {
                    stats.seqLocals++;
                    stats.seqReads += reads.length;
                }
            } else if (stats) {
                stats.dictLocals++;
                stats.dictReads += reads.length;
            }
            for (const r of reads) edits.push(r);
        }
    }

    if (edits.length === 0) return content;
    edits.sort((a, b) => a.start - b.start);
    let out = '';
    let at = 0;
    for (const e of edits) {
        if (e.start < at) continue;
        out += content.slice(at, e.start) + e.text;
        at = e.end;
    }
    return out + content.slice(at);
}

/**
 * The literal key set of a fresh dict literal, or undefined when any insert key
 * is computed (then neither the set nor marker-freeness is static).
 */
/**
 * The `Vec<Value>` expression inside an array-valued `Value` constructor, or
 * undefined when the initializer is a call whose result must be unwrapped.
 */
function arrayPayload(initExpr: string): string | undefined {
    const strip = (text: string, prefix: string): string | undefined => {
        if (!text.startsWith(prefix) || !text.endsWith(')')) return undefined;
        return text.slice(prefix.length, -1).trim();
    };
    // `Value::Array(x)` takes the Vec, so the payload is exactly `x`.
    const direct = strip(initExpr, 'Value::Array(');
    if (direct !== undefined && direct.length > 0) return direct;
    let inner = strip(initExpr, 'Value::from(');
    if (inner !== undefined) inner = strip(inner, 'std::sync::Arc::new(') ?? inner;
    if (inner === undefined || !inner.startsWith('vec![')) return undefined;
    return inner;
}

function insertedKeys(initText: string): string[] | undefined {
    const keys: string[] = [];
    const insertRe = /\.insert\(\s*(?:"([^"\\]*)"\s*(?:\.to_string\(\)|\.into\(\))|([^,]+?))\s*,/g;
    let im: RegExpExecArray | null;
    while ((im = insertRe.exec(initText)) !== null) {
        if (im[1] === undefined) return undefined;
        keys.push(im[1]);
    }
    return keys;
}

// ── self-test ────────────────────────────────────────────────────────────────
// Each case is a shape the rule must transform (or must leave alone).

type Case = { name: string, src: string, want: string[], gone: string[] };

const CASES: Case[] = [
    {
        name: 'seq: Value::from(vec![..]) local retyped, literal int key',
        src: [
            'pub fn demo(&mut self) -> Value {',
            '    let mut rows: Value = Value::from(vec![Value::Int(1), Value::Int(2)]);',
            '    let mut first: Value = get_value(&rows, &Value::Int(1));',
            '    return first;',
            '}',
        ].join('\n'),
        want: ['let mut rows: Vec<Value> =', 'rows.get(1).cloned().unwrap_or(Value::Null)'],
        gone: ['get_value('],
    },
    {
        name: 'seq: safe_list_k local, numeric-string key',
        src: [
            'pub fn demo(&mut self) -> Value {',
            '    let mut data: Value = self.safe_list_k(response.clone(), "data", &[Value::from(vec![])]);',
            '    let mut head: Value = get_value(&data, &Value::Str("0".into()));',
            '    return head;',
            '}',
        ].join('\n'),
        want: ['let mut data: Vec<Value> =', 'data.get(0).cloned().unwrap_or(Value::Null)'],
        gone: ['get_value('],
    },
    {
        name: 'seq: split local read by a Value::Int-pinned counter',
        src: [
            'pub fn demo(&mut self) -> Value {',
            '    let mut parts: Value = split(&raw, &Value::Str("_".into()));',
            '    let mut i: Value = Value::Int(0);',
            '    while i.as_f64().unwrap_or(f64::NAN) < 2.0 {',
            '        let mut part: Value = get_value(&parts, &i);',
            '        if let Value::Int(n) = &mut i { *n += 1; }',
            '    }',
            '    return Value::Null;',
            '}',
        ].join('\n'),
        want: ['let mut parts: Vec<Value> =', 'parts.get(i.as_i64().unwrap() as usize).cloned().unwrap_or(Value::Null)'],
        gone: ['get_value('],
    },
    {
        name: 'seq: unpinned dynamic key stays a helper call',
        src: [
            'pub fn demo(&mut self, mut key: Value) -> Value {',
            '    let mut parts: Value = split(&raw, &Value::Str("_".into()));',
            '    return get_value(&parts, &key);',
            '}',
        ].join('\n'),
        want: ['let mut parts: Value =', 'get_value(&parts, &key)'],
        gone: ['Vec<Value>'],
    },
    {
        name: 'seq: a Value sink keeps the box',
        src: [
            'pub fn demo(&mut self) -> Value {',
            '    let mut data: Value = self.safe_list_k(response.clone(), "data", &[Value::from(vec![])]);',
            '    let mut first: Value = get_value(&data, &Value::Int(0));',
            '    return self.parse_trades(data, &[]);',
            '}',
        ].join('\n'),
        want: ['let mut data: Value =', 'get_value(&data, &Value::Int(0))'],
        gone: [],
    },
    {
        name: 'dict: fresh literal with a literal key',
        src: [
            'pub fn demo(&mut self) -> Value {',
            '    let mut request: Value = Value::Map({',
            '        let mut m = indexmap::IndexMap::new();',
            '        m.insert("amount".to_string(), amount);',
            '        m',
            '    });',
            '    let mut amount2: Value = get_value(&request, &Value::Str("amount".into()));',
            '    return amount2;',
            '}',
        ].join('\n'),
        want: ['let mut request: Value =', 'request.as_map().unwrap().get("amount").cloned().unwrap_or(Value::Null)'],
        gone: ['get_value('],
    },
    {
        name: 'dict: a routed key stays a helper call',
        src: [
            'pub fn demo(&mut self) -> Value {',
            '    let mut book: Value = Value::Map({',
            '        let mut m = indexmap::IndexMap::new();',
            '        m.insert("bids".to_string(), bids);',
            '        m',
            '    });',
            '    return get_value(&book, &Value::Str("cache".into()));',
            '}',
        ].join('\n'),
        want: ['get_value(&book, &Value::Str("cache".into()))'],
        gone: [],
    },
    {
        name: 'dict: a computed insert key makes the key set dynamic',
        src: [
            'pub fn demo(&mut self, mut key: Value) -> Value {',
            '    let mut request: Value = Value::Map({',
            '        let mut m = indexmap::IndexMap::new();',
            '        m.insert(crate::runtime::stringify_param(&key), amount);',
            '        m',
            '    });',
            '    return get_value(&request, &Value::Str("amount".into()));',
            '}',
        ].join('\n'),
        want: ['get_value(&request, &Value::Str("amount".into()))'],
        gone: [],
    },
    {
        name: 'seq: a reassigned local keeps the box',
        src: [
            'pub fn demo(&mut self) -> Value {',
            '    let mut rows: Value = Value::from(vec![Value::Int(1)]);',
            '    rows = self.parse_rows();',
            '    return get_value(&rows, &Value::Int(0));',
            '}',
        ].join('\n'),
        want: ['let mut rows: Value =', 'get_value(&rows, &Value::Int(0))'],
        gone: [],
    },
    {
        name: 'seq: an already typed receiver goes native as is',
        src: [
            'pub fn demo(&mut self, mut rows: &[Value]) -> Value {',
            '    return get_value(&rows, &Value::Int(2));',
            '}',
        ].join('\n'),
        want: ['rows.get(2).cloned().unwrap_or(Value::Null)'],
        gone: ['get_value('],
    },
];

export function rustNativeGetValueSelfTest(): number {
    let failures = 0;
    for (const c of CASES) {
        const out = nativeGetValue(c.src);
        const misses: string[] = [];
        for (const w of c.want) if (!out.includes(w)) misses.push('missing: ' + w);
        for (const g of c.gone) if (out.includes(g)) misses.push('not replaced: ' + g);
        if (misses.length === 0) {
            console.log('ok   ' + c.name);
        } else {
            failures++;
            console.log('FAIL ' + c.name);
            for (const m of misses) console.log('       ' + m);
            console.log('       ---- output ----\n' + out.split('\n').map((l) => '       ' + l).join('\n'));
        }
    }
    console.log(failures === 0 ? 'self-test: all cases pass' : 'self-test: ' + failures + ' failing');
    return failures;
}

// ---- native insert ----
/**
 * Native `insert` for `add_element_to_object` / `get_value_mut` chains on a receiver proven tag-free: the helpers
 * only do extra work on a dict carrying a runtime `__` tag, so on any other receiver they are exactly `insert`/`entry`.
 */

const CALL = 'add_element_to_object(';

// Hand-written `Exchange` fields the runtime never tags.
const TAGFREE_FIELDS = new Set([
    'balance', 'orderbooks', 'trades', 'tickers', 'bidsasks', 'ohlcvs', 'clients', 'transactions',
    'headers', 'currencies', 'has', 'tokenBucket', 'options', 'markets', 'urls', 'positions',
    'fees', 'exceptions', 'markets_by_id', 'currencies_by_id',
]);

// Fields whose *entries* may themselves be books / caches / subscriptions, so a
// nested write into an entry has to keep the helper's tag hooks.
const NEST_FIELDS = new Set([
    'options', 'urls', 'fees', 'exceptions', 'markets', 'currencies', 'headers', 'has',
    'tokenBucket', 'markets_by_id', 'currencies_by_id',
]);

// A function that reads any of these can hold a tagged value in a local.
const TAG_ACCESS = [
    'self.orderbooks', 'self.balance', 'self.ohlcvs', 'self.tickers', 'self.trades',
    'self.bidsasks', 'self.positions', 'self.clients', 'self.transactions',
    '"subscriptions"', '"futures"', '"cache"', '.hashmap',
    'self.order_book(', 'self.order_book_side(',
];

// Base builders that return a freshly built plain dict.
const BUILDERS = new Set(['account', 'safe_ledger_entry', 'deposit_withdraw_fee']);

// Copy-on-write of a proven tag-free source keeps the result tag-free.
const EXTENDERS = new Set(['extend', 'omit', 'keysort']);

// Parser methods whose return value is a fresh plain dict; the trait shims for
// these forward to a per-exchange `*Core` impl, so the body is not always in the
// calling file.
const PARSERS = new Set([
    'parse_order', 'parse_ws_order', 'parse_trade', 'parse_ws_trade', 'parse_ticker',
    'parse_ws_ticker', 'parse_position', 'parse_ws_position', 'parse_balance', 'parse_market',
    'parse_currency', 'parse_transaction', 'parse_ledger_entry', 'parse_deposit_withdraw_fee',
    'parse_account', 'parse_funding_rate', 'parse_open_interest', 'parse_liquidation',
    'parse_borrow_rate', 'parse_income',
]);

const LITERAL_KEY = /^&Value::Str\(("(?:[^"\\]|\\.)*")\.(?:into|to_string)\(\)\)$/;
const PLACE_KEY = /^&([A-Za-z_][A-Za-z0-9_]*)$/;
const INSERT_CHAIN_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface Region { start: number, end: number }

function isWordChar (c: string): boolean {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_';
}

/** Split on top-level commas, honouring strings and bracket nesting. */
function splitArgs (text: string): string[] | undefined {
    const out: string[] = [];
    let depth = 0, inStr = false, esc = false, cur = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inStr) {
            if (esc) esc = false;
            else if (c === '\\') esc = true;
            else if (c === '"') inStr = false;
            continue;
        }
        if (c === '"') { inStr = true; continue; }
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
        else if (c === ',' && depth === 0) { out.push(text.slice(cur, i)); cur = i + 1; }
    }
    out.push(text.slice(cur));
    return out.length > 0 ? out : undefined;
}

/** Index just past the closing `)` of the call whose `(` is at `open`. */
function closeParenAt (content: string, open: number): number {
    let depth = 0, inStr = false, esc = false;
    for (let i = open; i < content.length; i++) {
        const c = content[i];
        if (inStr) {
            if (esc) esc = false;
            else if (c === '\\') esc = true;
            else if (c === '"') inStr = false;
            continue;
        }
        if (c === '"') { inStr = true; continue; }
        if (c === '(') depth++;
        else if (c === ')') {
            depth--;
            if (depth === 0) return i + 1;
        }
    }
    return -1;
}

/** Function bodies, sliced from one `fn` header line to the next. */
function fnRegions (content: string): Region[] {
    const headers: number[] = [];
    const rx = /^[ \t]*(?:pub )?(?:async )?fn [A-Za-z0-9_]+/gm;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(content)) !== null) headers.push(m.index);
    const out: Region[] = [];
    for (let i = 0; i < headers.length; i++) {
        out.push({ start: headers[i], end: i + 1 < headers.length ? headers[i + 1] : content.length });
    }
    return out;
}

function regionAt (regions: Region[], pos: number): Region | undefined {
    let lo = 0, hi = regions.length - 1, hit: Region | undefined;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (regions[mid].start <= pos) { hit = regions[mid]; lo = mid + 1; } else hi = mid - 1;
    }
    return hit && pos < hit.end ? hit : undefined;
}

/** First argument of the call spelled at `text`, or undefined when truncated. */
function firstArg (text: string): string | undefined {
    const open = text.indexOf('(');
    if (open < 0) return undefined;
    let depth = 0, inStr = false, esc = false;
    for (let i = open; i < text.length; i++) {
        const c = text[i];
        if (inStr) {
            if (esc) esc = false;
            else if (c === '\\') esc = true;
            else if (c === '"') inStr = false;
            continue;
        }
        if (c === '"') { inStr = true; continue; }
        if (c === '(') depth++;
        else if (c === ')') { depth--; if (depth === 0) return text.slice(open + 1, i); }
        else if (c === ',' && depth === 1) return text.slice(open + 1, i);
    }
    return undefined;
}

class Proof {
    content: string;
    regions: Region[];
    calls = new Map<number, boolean>();
    locals = new Map<string, boolean>();

    constructor (content: string, regions: Region[]) {
        this.content = content;
        this.regions = regions;
    }

    /** A local whose every binding is a fresh tag-free literal. */
    localTagFree (name: string, body: string, region: Region, depth = 0): boolean {
        if (depth > 2) return false;
        const key = region.start + ':' + name;
        if (depth === 0) {
            const cached = this.locals.get(key);
            if (cached !== undefined) return cached;
        }
        const verdict = this.localTagFreeUncached(name, body, region, depth);
        if (depth === 0) this.locals.set(key, verdict);
        return verdict;
    }

    private localTagFreeUncached (name: string, body: string, region: Region, depth: number): boolean {
        if (body.includes('"__')) return false;
        const decl = new RegExp('^[ \\t]*let mut ' + name + '[ \\t]*:[ \\t]*Value\\b(.*)$', 'gm');
        const bare = new RegExp('^[ \\t]*let mut ' + name + '[ \\t]*=(.*)$', 'gm');
        const bound = new RegExp('(^|[^.\\w])' + name + '[ \\t]*=(?!=)(.*)$', 'gm');
        const sources: string[] = [];
        let sawBind = false;
        let m: RegExpExecArray | null;
        while ((m = bare.exec(body)) !== null) {
            sawBind = true;
            sources.push(m[1]);
        }
        while ((m = decl.exec(body)) !== null) {
            sawBind = true;
            const rest = m[1].trim();
            if (rest.length > 0) {
                if (rest[0] !== '=') return false;
                sources.push(rest.slice(1));
            }
        }
        if (!sawBind) return false;
        while ((m = bound.exec(body)) !== null) sources.push(m[2]);
        for (const src of sources) {
            if (!this.srcTagFree(src, body, region, depth)) return false;
        }
        return true;
    }

    /** A value expression that can only be a fresh plain dict. */
    srcTagFree (src: string, body: string, region: Region, depth = 0): boolean {
        const t = src.trim();
        if (depth > 2) return false;
        if (t.startsWith('Value::Map(')) return true;
        if (t.startsWith('Value::Null')) return true;
        const callee = t.match(/^self\.([A-Za-z_][A-Za-z0-9_]*)[ \t]*\(/);
        if (callee === null) return false;
        const name = callee[1];
        if (BUILDERS.has(name) || PARSERS.has(name)) return true;
        if (EXTENDERS.has(name)) {
            const arg = firstArg(t);
            if (arg === undefined) return false;
            const head = arg.trim();
            if (INSERT_CHAIN_IDENT.test(head)) return this.localTagFree(head, body, region, depth + 1);
            return this.srcTagFree(head, body, region, depth + 1);
        }
        return this.calleePlain(name, region);
    }

    /** Same-file method whose only `return` is a proven tag-free local. */
    calleePlain (name: string, caller: Region): boolean {
        const key = caller.start;
        const cache = this.calls.get(key * 100000 + (name.charCodeAt(0) || 0));
        if (cache !== undefined) return cache;
        let verdict = false;
        for (const r of this.regions) {
            const body = this.content.slice(r.start, r.end);
            const header = body.slice(0, body.indexOf('\n') < 0 ? body.length : body.indexOf('\n'));
            if (!new RegExp('fn ' + name + '\\s*\\(').test(header)) continue;
            if (body.includes('"__')) continue;
            const ret = body.match(/^[ \t]*return ([A-Za-z_][A-Za-z0-9_]*);/m);
            if (ret !== null) {
                if (this.localTagFree(ret[1], body, r)) { verdict = true; break; }
                continue;
            }
            if (new RegExp('\\b[A-Za-z0-9_]+Core::' + name + '\\(').test(body)) { verdict = true; break; }
        }
        this.calls.set(key * 100000 + (name.charCodeAt(0) || 0), verdict);
        return verdict;
    }
}

/** Arguments of `text` when it is exactly one `<name>(...)` call. */
function insertChainCallArgs (text: string, name: string): string[] | undefined {
    if (!text.startsWith(name + '(')) return undefined;
    const after = closeParenAt(text, name.length);
    if (after !== text.length) return undefined;
    return splitArgs(text.slice(name.length + 1, after - 1));
}

function keyConv (arg: string, intermediate: boolean): string | undefined {
    const lit = arg.trim().match(LITERAL_KEY);
    if (lit !== null) return lit[1] + '.to_string()';
    if (intermediate) return undefined;
    const place = arg.trim().match(PLACE_KEY);
    if (place !== null) return 'crate::runtime::stringify_param(&' + place[1] + ')';
    return undefined;
}

/**
 * Rewrite `x[k] = v` / nested `x[a][b] = v` writes on a proven tag-free
 * receiver into the native `insert` the helper performs on one.
 */
export function nativeInserts (content: string): string {
    if (!content.includes(CALL)) return content;
    const regions = fnRegions(content);
    const proof = new Proof(content, regions);
    const edits: { start: number, end: number, text: string }[] = [];
    let i = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const at = content.indexOf(CALL, i);
        if (at < 0) break;
        i = at + 1;
        if (at > 0 && isWordChar(content[at - 1])) continue;
        const open = at + CALL.length - 1;
        const after = closeParenAt(content, open);
        if (after < 0) break;
        const args = splitArgs(content.slice(open + 1, after - 1));
        if (args === undefined || args.length !== 3) continue;
        const region = regionAt(regions, at);
        if (region === undefined) continue;
        const body = content.slice(region.start, region.end);
        // Receiver: `&mut X` possibly wrapped in `get_value_mut` chains.
        const chain: string[] = [];
        let cur = args[0].trim();
        let ok = true;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const outer = insertChainCallArgs(cur, 'get_value_mut');
            if (outer === undefined || outer.length !== 2) break;
            const inner = outer[0].trim();
            if (!inner.startsWith('&mut ')) break;
            chain.push(outer[1].trim());
            cur = inner.slice(5).trim();
        }
        let base: string;
        let place: string;
        if (cur.startsWith('&mut ')) { base = cur.slice(5).trim(); place = '&mut ' + base; }
        else if (cur.startsWith('unsafe {')) {
            const coerce = cur.match(/^unsafe \{ (crate::runtime::coerce_value_to_mut\(&self\.[A-Za-z_][A-Za-z0-9_]*\)) \}$/);
            if (coerce === null) continue;
            place = cur;
            base = coerce[1].replace('coerce_value_to_mut(&self.', 'self.').replace(/\)$/, '');
        }
        else if (/^(?:self\.)?[A-Za-z_][A-Za-z0-9_]*$/.test(cur)) { base = cur; place = '&mut ' + cur; }
        else continue;
        const field = base.match(/^self\.([A-Za-z_][A-Za-z0-9_]*)$/);
        const local = base.match(/^([A-Za-z_][A-Za-z0-9_]*)$/);
        if (field !== null) {
            const name = field[1];
            if (!TAGFREE_FIELDS.has(name)) continue;
            if (chain.length > 0 && !NEST_FIELDS.has(name)) continue;
        }
        else if (local !== null) {
            if (!proof.localTagFree(local[1], body, region)) continue;
            // A nested write reaches a value the function may have taken off a
            // tagged cache / book / subscription snapshot.
            if (chain.length > 0 && TAG_ACCESS.some(t => body.includes(t))) continue;
        }
        else continue;
        const keys: string[] = [];
        for (const k of chain.reverse()) {
            const conv = keyConv(k, true);
            if (conv === undefined) { ok = false; break; }
            keys.push(conv);
        }
        if (!ok) continue;
        const last = keyConv(args[1], false);
        if (last === undefined) continue;
        const value = args[2].trim();
        // A write holds a `&mut`/`&self` borrow of the receiver: evaluate a
        // value that reads it into a temp first, exactly like the printer does.
        const receiverName = field !== null ? field[1] : (local !== null ? local[1] : '');
        const readsReceiver = field !== null
            ? /\bself\b/.test(value)
            : new RegExp('\\b' + receiverName + '\\b').test(value);
        if (keys.length > 9) continue;
        // Letter-only bindings keep the shape the sibling passes recognise as a
        // mutation statement (`if let Value::Dict(__<letters>) = `).
        const tag = (i: number) => '__rd' + 'abcdefghij'[i];
        let insert = 'std::sync::Arc::make_mut(' + tag(keys.length) + ').insert(' + last + ', ' + value + ');';
        for (let d = keys.length - 1; d >= 0; d--) {
            insert = 'if let Value::Dict(' + tag(d + 1) + ') = std::sync::Arc::make_mut(' + tag(d) + ').entry(' + keys[d] + ').or_insert(Value::Null) { ' + insert + ' }';
        }
        let native = 'if let Value::Dict(' + tag(0) + ') = ' + place + ' { ' + insert + ' }';
        if (readsReceiver) native = '{ let __rdt = ' + value + '; ' + native.replace(', ' + value + ');', ', __rdt);') + ' }';
        // Keep generated lines within the 400-column budget: skip a site whose native form would
        // introduce a long line that the helper call did not have.
        const lineStart = content.lastIndexOf('\n', at) + 1;
        let lineEnd = content.indexOf('\n', after);
        if (lineEnd < 0) lineEnd = content.length;
        const before = content.slice(lineStart, lineEnd);
        let suffix = content.slice(after, lineEnd);
        if (suffix.startsWith(';')) suffix = suffix.slice(1);
        const merged = content.slice(lineStart, at) + native + suffix;
        if (before.length <= 400 && merged.length > 400) continue;
        edits.push({ start: at, end: after, text: native });
    }
    if (edits.length === 0) return content;
    let out = '';
    let pos = 0;
    for (const e of edits) {
        out += content.slice(pos, e.start) + e.text;
        let p = e.end;
        while (p < content.length && (content[p] === ' ' || content[p] === '\t')) p++;
        if (p < content.length && content[p] === ';') p++;
        pos = p;
    }
    out += content.slice(pos);
    return out;
}

// ---- native container ops ----
// Native rust ops for `in_op` / `object_keys` / `object_values` / `get_array_length` on a receiver the
// emitted text proves a container. A site whose receiver is not proven keeps the helper call exactly as printed.

type ContainerOpKind = 'map' | 'arr' | 'str';

interface ContainerOpProof {
    kind: ContainerOpKind;
    // No book / cache / side marker can be stored here.
    markerFree: boolean;
    // No live-subscription tag key can be stored here, so the plain key list
    // equals `object_keys` / `object_values` (which drop the two ws tag keys).
    untagged: boolean;
}

interface ContainerOpFacts {
    // Container shape and marker safety, when every write pins one.
    proof?: ContainerOpProof;
    // `Value::len` answers what `get_array_length` answers: every write is a
    // JSON read or a plain container, and nothing here can hold a side marker.
    lenSafe: boolean;
}

const CONTAINER_OP_SITE_RX = /(?<![A-Za-z0-9_:.])(in_op|object_keys|object_values|get_array_length)\(/g;
const CONTAINER_OP_LITERAL_KEY = /^&Value::Str\(("(?:[^"\\]|\\.)*")\.(?:to_string|into)\(\)\)$/;
const CONTAINER_OP_IDENT_ARG = /^&([a-z_][A-Za-z0-9_]*)$/;
// `client.subscriptions` / `client.futures`: the ws registry always serves
// these two fields as a `Value::Map` (`subscriptions_value` / `futures_value`),
// and only the subscriptions snapshot carries the two tag keys.
const CONTAINER_OP_CLIENT_STATE = /^&get_value\(&(client), &Value::Str\("(subscriptions|futures)"\.(?:to_string|into)\(\)\)\)$/;
// A side marker is the only `Value` whose length differs from `Value::len`.
const CONTAINER_OP_SIDE_WORD = /asks|bids|[Ss]ide|[Bb]ook|entries|__sideKind/;
// Sources that yield a plain JSON tree or a plain container.
const CONTAINER_OP_JSON_SOURCE = /^(?:crate::value::)?(?:get_value|get_value_k)\(|^self\.(?:safe_\w+|parse_\w+|fetch\w*|to_array|array_concat|extend|omit)\(|^get_arg\(|^split\(|^Value::(?:Map|List|Array|Str|from)\(/;
// Reads that cannot change the stored container shape.
const CONTAINER_OP_READS = new Set([ 'clone', 'len', 'is_empty', 'as_map', 'as_array', 'as_str', 'as_i64',
    'as_f64', 'as_bool', 'is_truthy', 'is_null', 'is_str', 'is_map', 'is_array', 'to_string', 'to_json' ]);
// `&mut x` sinks that keep the shape (dict insert / list push / dict delete).
const CONTAINER_OP_SHAPE_WRITES = /(?:(?<![A-Za-z0-9_:.])(?:add_element_to_object|set_value|append_to_array|remove)\(|(?:^|[^A-Za-z0-9_:.])if let (?:Value::(?:Dict|Arr)\(__[a-z]+\)|\(Value::(?:Dict|Arr)\(__[a-z]+\), ?(?:&mut )?[a-z_][A-Za-z0-9_]*\)) = )$/;

// Blank out string literals and comments, preserving every offset.
function containerOpMask (content: string): string {
    const out = content.split ('');
    let i = 0;
    while (i < content.length) {
        const c = content[i];
        if (c === '/' && content[i + 1] === '/') {
            while (i < content.length && content[i] !== '\n') out[i++] = ' ';
            continue;
        }
        if (c === '"') {
            out[i++] = ' ';
            while (i < content.length && content[i] !== '"') {
                if (content[i] === '\\') out[i++] = ' ';
                out[i++] = ' ';
            }
            if (i < content.length) out[i++] = ' ';
            continue;
        }
        i++;
    }
    return out.join ('');
}

// Index of the bracket closing the one at `open`, or -1.
function containerOpClose (content: string, open: number): number {
    const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    const close = pairs[content[open]];
    if (close === undefined) return -1;
    let depth = 0;
    let i = open;
    while (i < content.length) {
        const c = content[i];
        if (c === '"') {
            i++;
            while (i < content.length && content[i] !== '"') {
                if (content[i] === '\\') i++;
                i++;
            }
            i++;
            continue;
        }
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') {
            depth--;
            if (depth === 0) return c === close ? i : -1;
        }
        i++;
    }
    return -1;
}

function containerOpSplit (inner: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let cur = '';
    let i = 0;
    while (i < inner.length) {
        const c = inner[i];
        if (c === '"') {
            const start = i;
            i++;
            while (i < inner.length && inner[i] !== '"') {
                if (inner[i] === '\\') i++;
                i++;
            }
            i++;
            cur += inner.slice (start, i);
            continue;
        }
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
        if (c === ',' && depth === 0) {
            parts.push (cur);
            cur = '';
        } else {
            cur += c;
        }
        i++;
    }
    parts.push (cur);
    return parts;
}

// End offset of the statement starting at `i` (the `;` at depth 0), or -1.
function containerOpStmtEnd (content: string, i: number): number {
    let depth = 0;
    while (i < content.length) {
        const c = content[i];
        if (c === '"') {
            i++;
            while (i < content.length && content[i] !== '"') {
                if (content[i] === '\\') i++;
                i++;
            }
            i++;
            continue;
        }
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') {
            depth--;
            if (depth < 0) return -1;
        } else if (c === ';' && depth === 0) {
            return i;
        }
        i++;
    }
    return -1;
}

function containerOpParens (e: string): string {
    let t = e.trim ();
    while (t.startsWith ('(') && containerOpClose (t, 0) === t.length - 1) t = t.slice (1, -1).trim ();
    return t;
}

// True when `e` is exactly one call to `name(` … `)`.
function containerOpIsCall (e: string, name: string): boolean {
    if (!e.startsWith (name + '(')) return false;
    return containerOpClose (e, name.length) === e.length - 1;
}

class ContainerOpProver {
    private content: string;
    private masked: string;
    private headers: number[] = [ 0 ];
    private memo = new Map<string, ContainerOpFacts | undefined> ();
    private pending = new Set<string> ();

    constructor (content: string) {
        this.content = content;
        this.masked = containerOpMask (content);
        for (const m of this.masked.matchAll (/\n[ \t]*(?:pub(?:\([a-z]+\))? )?(?:async )?fn /g)) {
            this.headers.push ((m.index as number) + 1);
        }
        this.headers.push (content.length);
    }

    // Enclosing fn region containing `pos`.
    region (pos: number): number {
        let lo = 0;
        for (let h = 0; h + 1 < this.headers.length; h++) if (this.headers[h] <= pos) lo = h;
        return lo;
    }

    facts (name: string, pos: number): ContainerOpFacts | undefined {
        if (!/^[a-z_][A-Za-z0-9_]*$/.test (name)) return undefined;
        const lo = this.region (pos);
        const key = `${lo}:${name}`;
        if (this.memo.has (key)) return this.memo.get (key);
        // Alias cycles (`x = y.clone()` / `y = x.clone()`) must not recurse.
        if (this.pending.has (key)) return undefined;
        this.pending.add (key);
        const result = this.prove (name, this.headers[lo], this.headers[lo + 1], new Set ());
        this.pending.delete (key);
        this.memo.set (key, result);
        return result;
    }

    private prove (name: string, from: number, to: number, seen: Set<string>): ContainerOpFacts | undefined {
        const region = this.masked.slice (from, to);
        const real = this.content.slice (from, to);
        const header = real.slice (0, Math.max (0, real.indexOf ('{')));
        const isParam = new RegExp (`[^A-Za-z0-9_]${name}\\s*:`).test (header);
        const rebind = new RegExp (`(?<!\\|)\\|(?!\\|)[^|\\n]*\\b${name}\\b[^|\\n]*(?<!\\|)\\|(?!\\|)`
            + `|\\bfor [^\\n]*\\b${name}\\b[^\\n]* in |\\blet \\([^)]*\\b${name}\\b|\\b${name}\\s*@|\\b${name}\\s*[-+*/%|&^]=`);
        if (rebind.test (region) || new RegExp (`\\*\\s*${name}\\b\\s*=(?!=)`).test (region)) return undefined;
        let writes = 0;
        let proof: ContainerOpProof | undefined;
        // One unpinned write clears the shape for good: no later write restores it.
        let shapeUnknown = false;
        let lenSafe = !CONTAINER_OP_SIDE_WORD.test (name);
        const writesRe = new RegExp (`(?<![A-Za-z0-9_.*])(let (?:mut )?)?${name}\\b(\\s*:\\s*([A-Za-z_][A-Za-z0-9_<>,:& ]*?))?\\s*=(?!=)`, 'g');
        for (const m of region.matchAll (writesRe)) {
            const typed = m[3] === undefined ? 'Value' : m[3].replace (/\s+/g, '');
            // A native container declaration is not what this pass proves.
            if (typed !== 'Value') return undefined;
            const rhsStart = (m.index as number) + m[0].length;
            const end = containerOpStmtEnd (real, rhsStart);
            if (end < 0) return undefined;
            const raw = containerOpParens (real.slice (rhsStart, end));
            const write = this.source (raw, from + (m.index as number), seen);
            writes++;
            if (write === undefined) {
                // A JSON read has no pinned shape but never carries a marker.
                lenSafe = lenSafe && CONTAINER_OP_JSON_SOURCE.test (raw) && !CONTAINER_OP_SIDE_WORD.test (raw);
                shapeUnknown = true;
                continue;
            }
            if (shapeUnknown) {
                lenSafe = lenSafe && write.markerFree && !CONTAINER_OP_SIDE_WORD.test (raw);
                continue;
            }
            if (proof === undefined) proof = { ...write };
            else if (proof.kind !== write.kind) shapeUnknown = true;
            else {
                proof.markerFree = proof.markerFree && write.markerFree;
                proof.untagged = proof.untagged && write.untagged;
            }
            lenSafe = lenSafe && write.markerFree && !CONTAINER_OP_SIDE_WORD.test (raw);
        }
        if (writes === 0) return undefined;
        for (const m of region.matchAll (new RegExp (`&mut ${name}\\b`, 'g'))) {
            const before = region.slice (Math.max (0, (m.index as number) - 96), m.index as number);
            if (!CONTAINER_OP_SHAPE_WRITES.test (before)) return undefined;
        }
        for (const m of region.matchAll (new RegExp (`(?<![A-Za-z0-9_.])${name}\\.([A-Za-z_][A-Za-z0-9_]*)`, 'g'))) {
            if (!CONTAINER_OP_READS.has (m[1])) return undefined;
        }
        // A parameter has no declaration to prove: only the length rule can fire.
        if (isParam) return lenSafe ? { lenSafe } : undefined;
        return shapeUnknown ? { lenSafe } : { proof, lenSafe };
    }

    // Shape and marker safety of one right-hand side.
    private source (raw: string, absPos: number, seen: Set<string>): ContainerOpProof | undefined {
        const e = containerOpParens (raw);
        if (e === '') return undefined;
        const lit = (kind: ContainerOpKind, untagged = true): ContainerOpProof => ({ kind, markerFree: true, untagged });
        // A ws subscriptions snapshot carries the two tag keys; anything read
        // through the client may be one, so it is never a plain key source.
        const tagged = e.includes ('subscriptions') || e.includes ('client');
        if (containerOpIsCall (e, 'Value::Map')) return lit ('map', !tagged && !e.includes ('__ws_sub'));
        if (containerOpIsCall (e, 'Value::List') || containerOpIsCall (e, 'Value::Array') || containerOpIsCall (e, 'Value::from')) {
            return e.includes ('vec![') ? lit ('arr') : undefined;
        }
        if (containerOpIsCall (e, 'Value::Str')) return lit ('str');
        // Base readers with a fixed container result.
        const readers: Array<[RegExp, ContainerOpKind]> = [ [ /^self\.safe_dict(?:_k|2|_k2)?\(/, 'map' ], [ /^self\.safe_list(?:_k|2|_k2)?\(/, 'arr' ],
            [ /^self\.(?:parse_ids|to_array|array_concat)\(/, 'arr' ], [ /^split\(/, 'arr' ] ];
        for (const [ rx, kind ] of readers) {
            if (rx.test (e) && containerOpClose (e, e.indexOf ('(')) === e.length - 1) return lit (kind, !tagged);
        }
        // `extend` / `omit` keep the first operand's shape and safety.
        const merge = /^self\.(?:extend|omit)\(/.exec (e);
        if (merge !== null && containerOpClose (e, merge[0].length - 1) === e.length - 1) {
            const args = containerOpSplit (e.slice (merge[0].length, -1));
            const first = args.length > 0 ? this.source (args[0], absPos, seen) : undefined;
            if (first === undefined) return undefined;
            return { kind: first.kind, markerFree: first.markerFree, untagged: first.untagged && !tagged };
        }
        // A local alias of another proven local.
        const alias = /^([a-z_][A-Za-z0-9_]*)\.clone\(\)$/.exec (e);
        if (alias !== null) {
            if (seen.has (alias[1])) return undefined;
            seen.add (alias[1]);
            return this.facts (alias[1], absPos)?.proof;
        }
        return undefined;
    }
}

function containerOpKeyText (key: string): string | undefined {
    const lit = CONTAINER_OP_LITERAL_KEY.exec (key);
    if (lit !== null) return lit[1];
    const ident = CONTAINER_OP_IDENT_ARG.exec (key);
    if (ident !== null) return ident[1];
    return undefined;
}

export function nativeContainerOps (content: string): string {
    if (!/\b(?:in_op|object_keys|object_values|get_array_length)\(&/.test (content)) return content;
    const prover = new ContainerOpProver (content);
    for (let round = 0; round < 6; round++) {
        const masked = containerOpMask (content);
        const rewrites: Array<{ start: number, end: number, text: string }> = [];
        for (const m of masked.matchAll (CONTAINER_OP_SITE_RX)) {
            const start = m.index as number;
            const name = m[1];
            if (/\bfn\s+$/.test (masked.slice (Math.max (0, start - 8), start))) continue;
            if (rewrites.some (r => start >= r.start && start < r.end)) continue;
            const open = start + name.length;
            const close = containerOpClose (content, open);
            if (close < 0) continue;
            const args = containerOpSplit (content.slice (open + 1, close)).map (s => s.trim ());
            // A proven local, or the ws client field the registry types itself.
            let expr: string | undefined;
            let kind: ContainerOpKind | undefined;
            let untagged = false;
            let lenSafe = false;
            const recv = CONTAINER_OP_IDENT_ARG.exec (args[0] ?? '');
            const state = CONTAINER_OP_CLIENT_STATE.exec (args[0] ?? '');
            if (recv !== null) {
                const facts = prover.facts (recv[1], start);
                if (facts === undefined) continue;
                expr = recv[1];
                kind = facts.proof?.kind;
                untagged = facts.proof?.untagged === true;
                lenSafe = facts.lenSafe;
            } else if (state !== null) {
                expr = (args[0] ?? '').trim ().slice (1);
                kind = 'map';
                untagged = state[2] === 'futures';
                lenSafe = true;
            } else {
                continue;
            }
            let text: string | undefined;
            if (name === 'get_array_length' && args.length === 1) {
                if (lenSafe) text = `Value::Int(${expr}.len() as i64)`;
            } else if (name === 'in_op' && args.length === 2 && kind === 'map') {
                // The printer's own membership form for a dict-shaped receiver.
                const key = containerOpKeyText (args[1]);
                if (key !== undefined) {
                    text = key.startsWith ('"')
                        ? `matches!(&${expr}, Value::Dict(__d) if __d.contains_key(${key}))`
                        : `matches!((&${expr}, &${key}), (Value::Dict(__d), Value::Str(__k)) if __d.contains_key(__k.as_ref()))`;
                }
            } else if ((name === 'object_keys' || name === 'object_values') && args.length === 1
                && kind === 'map' && untagged) {
                const body = name === 'object_keys'
                    ? '__m.keys().map(|__k| Value::Str(__k.clone().into())).collect()'
                    : '__m.values().cloned().collect()';
                text = `Value::Array(${expr}.as_map().map(|__m| ${body}).unwrap_or_default())`;
            }
            if (text === undefined) continue;
            rewrites.push ({ start, end: close + 1, text });
        }
        if (rewrites.length === 0) break;
        let out = '';
        let at = 0;
        for (const r of rewrites) {
            if (r.start < at) continue;
            out += content.slice (at, r.start) + r.text;
            at = r.end;
        }
        content = out + content.slice (at);
    }
    return content;
}

// Self-test cases: each must stay unchanged on the base generator and rewrite here.
export function nativeContainerOpsSelfTest (): string[] {
    const problems: string[] = [];
    const check = (name: string, input: string, expected: string) => {
        // A case whose input already equals the native text proves nothing.
        if (input === expected) problems.push (`${name}: expectation is the input`);
        if (expected === undefined) problems.push (`${name}: no expectation`);
        const got = nativeContainerOps (input);
        if (got !== expected) problems.push (`${name}: ${JSON.stringify (got)} != ${JSON.stringify (expected)}`);
    };
    const fn = (body: string) => `    pub fn probe(&self) -> Value {\n${body}\n    }\n`;
    // A plain dict local: membership, key list and length go native.
    check ('dict local', fn ('        let mut m: Value = Value::Map({\n            let mut x = indexmap::IndexMap::new();\n            x\n        });\n        if (in_op(&m, &Value::Str("k".to_string()))) {\n            let ks: Value = object_keys(&m);\n            let n: Value = get_array_length(&m);\n        }'),
        fn ('        let mut m: Value = Value::Map({\n            let mut x = indexmap::IndexMap::new();\n            x\n        });\n        if (matches!(&m, Value::Dict(__d) if __d.contains_key("k"))) {\n            let ks: Value = Value::Array(m.as_map().map(|__m| __m.keys().map(|__k| Value::Str(__k.clone().into())).collect()).unwrap_or_default());\n            let n: Value = Value::Int(m.len() as i64);\n        }'));
    // A subscriptions snapshot keeps the key helper: the tag keys must be filtered.
    const tagged = fn ('        let mut subs: Value = self.safe_dict_k(client.clone(), "subscriptions", &[]);\n        let ks: Value = object_keys(&subs);\n        let n: Value = get_array_length(&subs);');
    check ('tagged keys', tagged, tagged.replace ('get_array_length(&subs)', 'Value::Int(subs.len() as i64)'));
    // A receiver written from an API read has no pinned shape, but its length is native.
    const unknown = fn ('        let mut r: Value = get_value(&self.options, &Value::Str("x".to_string()));\n        let n: Value = get_array_length(&r);');
    check ('api read length', unknown, unknown.replace ('get_array_length(&r)', 'Value::Int(r.len() as i64)'));
    // The ws registry serves both client fields as a map; only subscriptions is tagged.
    const stateIn = fn ('        if (in_op(&get_value(&client, &Value::Str("subscriptions".to_string())), &hash)) {\n            let ks: Value = object_keys(&get_value(&client, &Value::Str("futures".to_string())));\n            let sub: Value = object_keys(&get_value(&client, &Value::Str("subscriptions".to_string())));\n        }');
    check ('client state', stateIn, fn ('        if (matches!((&get_value(&client, &Value::Str("subscriptions".to_string())), &hash), (Value::Dict(__d), Value::Str(__k)) if __d.contains_key(__k.as_ref()))) {\n            let ks: Value = Value::Array(get_value(&client, &Value::Str("futures".to_string())).as_map().map(|__m| __m.keys().map(|__k| Value::Str(__k.clone().into())).collect()).unwrap_or_default());\n            let sub: Value = object_keys(&get_value(&client, &Value::Str("subscriptions".to_string())));\n        }'));
    // A parameter has no declaration to prove: the helper call stays.
    const param = fn ('        if (in_op(&params, &Value::Str("k".to_string()))) {\n            let n: Value = object_keys(&params);\n        }');
    if (nativeContainerOps (param) !== param) problems.push ('param: helper not kept');
    // A side marker keeps the helper: the store holds its entries, not the dict.
    const side = fn ('        let mut storedAsks: Value = self.safe_value_k(book.clone(), "asks", &[]);\n        let n: Value = get_array_length(&storedAsks);');
    if (nativeContainerOps (side) !== side) problems.push ('side marker: helper not kept');
    return problems;
}

// ---- native bool scalars ----
// `is_true` / `is_equal` on a `Value` local whose every write is `Bool` (or `Null`) reads `x.as_bool() == Some(true)`;
// two such operands compare `as_bool()`s. Runs after the base bool-local passes; everything unproven keeps the helper.

const BOOL_FNS = new Set(['safe_bool', 'safe_bool_k', 'safe_bool_2', 'get_arg_bool']);
const INT_FNS = new Set(['safe_integer', 'safe_integer_k', 'safe_integer_2', 'safe_int', 'safe_timestamp']);
const STR_FNS = new Set(['safe_string', 'safe_string_k', 'safe_string_2', 'safe_string_lower', 'safe_string_upper', 'safe_string_lower_k', 'safe_string_upper_k']);
const FLOAT_FNS = new Set(['safe_float', 'safe_float_k', 'safe_number', 'safe_number_k', 'safe_number_2']);

type Variant = 'bool' | 'int' | 'float' | 'str' | 'null'
type VariantSet = Set<Variant>

interface FnRegion { start: number, end: number, header: string }

/** Blank out string literals and line comments, preserving every offset. */
function mask (content: string): string {
    const out = content.split('');
    let i = 0;
    while (i < out.length) {
        if (out[i] === '"') {
            let j = i + 1;
            while (j < out.length && out[j] !== '"') {
                if (out[j] === '\\') j++;
                j++;
            }
            for (let k = i + 1; k < j && k < out.length; k++) out[k] = ' ';
            i = j + 1;
            continue;
        }
        if (out[i] === '/' && out[i + 1] === '/') {
            let j = i;
            while (j < out.length && out[j] !== '\n') { out[j] = ' '; j++; }
            i = j;
            continue;
        }
        i++;
    }
    return out.join('');
}

function closeParen (masked: string, open: number): number {
    let depth = 0;
    for (let i = open; i < masked.length; i++) {
        const c = masked[i];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

function splitTopLevel (src: string, sep: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let cur = '';
    let inStr = false;
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (inStr) {
            cur += c;
            if (c === '\\') { cur += src[i + 1] ?? ''; i++; continue; }
            if (c === '"') inStr = false;
            continue;
        }
        if (c === '"') { inStr = true; cur += c; continue; }
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
        if (c === sep && depth === 0) { parts.push(cur); cur = ''; continue; }
        cur += c;
    }
    parts.push(cur);
    return parts.map((p) => p.trim());
}

function stripOuter (src: string): string {
    let s = src.trim();
    while (s.startsWith('(') && closeParen(s, 0) === s.length - 1) s = s.slice(1, -1).trim();
    return s;
}

/** Text from the start of the statement holding `pos` up to `pos`. */
function statementBefore (masked: string, pos: number): string {
    let depth = 0;
    for (let i = pos; i > 0; i--) {
        const c = masked[i - 1];
        if (c === ')' || c === ']') depth++;
        else if (c === '(' || c === '[') { if (depth > 0) depth--; }
        else if (depth === 0 && (c === ';' || c === '{' || c === '}' || c === '\n')) return masked.slice(i, pos);
    }
    return masked.slice(0, pos);
}

function fnRegionOf (masked: string, pos: number): FnRegion {
    const heads: number[] = [0];
    for (const m of masked.matchAll(/\n[ \t]*(?:pub )?(?:async )?fn /g)) heads.push((m.index as number) + 1);
    heads.push(masked.length);
    let lo = 0;
    for (let h = 0; h + 1 < heads.length; h++) if (heads[h] <= pos) lo = h;
    const body = masked.slice(heads[lo], heads[lo + 1]);
    const brace = body.indexOf('{');
    return { start: heads[lo], end: heads[lo + 1], header: brace < 0 ? body : body.slice(0, brace) };
}

function rhsAfter (masked: string, from: number): string {
    let depth = 0;
    for (let i = from; i < masked.length; i++) {
        const c = masked[i];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
        else if (c === ';' && depth === 0) return masked.slice(from, i).trim();
    }
    return '';
}

/** Drop the balanced expression ending `s` (an operand of `&&` / `||`). */
function stripTrailingOperand (s: string): string {
    let depth = 0;
    for (let i = s.length - 1; i >= 0; i--) {
        const c = s[i];
        if (c === ')' || c === ']' || c === '}') depth++;
        else if (c === '(' || c === '[' || c === '{') {
            if (depth === 0) return s.slice(0, i);
            depth--;
            if (depth === 0 && !/[A-Za-z0-9_.)\]]/.test(s[i - 1] ?? '')) return s.slice(0, i);
        } else if (depth === 0) {
            if ((c === '&' && s[i - 1] === '&') || (c === '|' && s[i - 1] === '|')) return s.slice(0, i - 1);
            if (c === ',' || c === ';' || c === '=') return s.slice(0, i + 1);
            if (/[A-Za-z0-9_.)]/.test(c)) {
                let k = i;
                while (k >= 0 && /[A-Za-z0-9_.]/.test(s[k])) k--;
                return k < 0 ? s : s.slice(0, k + 1);
            }
        }
    }
    return '';
}

/** True when a `bool` is legal at `start` (condition, bool decl, Value::Bool box). */
function boolSlotAt (masked: string, start: number): boolean {
    let prefix = statementBefore(masked, start);
    for (let hop = 0; hop < 60; hop++) {
        prefix = prefix.replace(/[\s!]+$/, '');
        if (/(?:^|[^\w])(?:if|while|for|assert|assert_eq)$/.test(prefix)) return true;
        if (/Value::Bool\($/.test(prefix)) return true;
        if (/(?:&&|\|\|)$/.test(prefix)) { prefix = stripTrailingOperand(prefix.slice(0, -2)); continue; }
        if (/[^=!<>]=$/.test(prefix)) return /:\s*bool\s*=?$/.test(prefix.slice(0, -1));
        if (/\($/.test(prefix)) { prefix = prefix.slice(0, -1); continue; }
        return false;
    }
    return false;
}

const UNION: Variant[] = ['bool', 'null'];

/**
 * Runtime variants a write can produce, or undefined when not provable.
 * `safe_bool*` is admitted only when its default cannot be a non-bool value.
 */
function variantOf (expr: string, masked: string, region: FnRegion, depth: number): VariantSet | undefined {
    const e = stripOuter(expr);
    const lit = /^Value::(Bool|Int|Float|Str)\(/.exec(e);
    if (lit !== null && closeParen(e, 'Value::'.length + lit[1].length) === e.length - 1) {
        return new Set<Variant>([lit[1].toLowerCase() as Variant]);
    }
    if (e === 'Value::Null' || e === 'crate::Value::Null') return new Set<Variant>(['null']);
    const call = /^self\.([a-z_][a-z0-9_]*)\(/.exec(e);
    if (call !== null && closeParen(e, 'self.'.length + call[1].length) === e.length - 1) {
        const name = call[1];
        if (BOOL_FNS.has(name)) return safeBoolVariants(e, masked, region, depth);
        if (INT_FNS.has(name)) return new Set<Variant>(['int', 'null']);
        if (STR_FNS.has(name)) return new Set<Variant>(['str', 'null']);
        if (FLOAT_FNS.has(name)) return new Set<Variant>(['float', 'int', 'null']);
        return undefined;
    }
    if (/^\(?if /.test(e) && e.includes('} else {')) {
        const at = e.indexOf('} else {');
        const a = variantOf(e.slice(e.indexOf('{') + 1, at), masked, region, depth);
        const b = variantOf(e.slice(at + '} else {'.length, e.lastIndexOf('}')), masked, region, depth);
        if (a !== undefined && b !== undefined) return new Set<Variant>([...a, ...b]);
    }
    return undefined;
}

/** `safe_bool*(obj, key, &[])` is `Bool` or `Null`; a proven bool default is `Bool`. */
function safeBoolVariants (call: string, masked: string, region: FnRegion, depth: number): VariantSet | undefined {
    const open = call.indexOf('(');
    const args = splitTopLevel(call.slice(open + 1, closeParen(call, open)), ',');
    const list = /^&\[(.*)\]$/.exec(args[args.length - 1] ?? '');
    if (list === null) return undefined;
    const items = list[1].trim();
    if (items === '') return new Set<Variant>(UNION);
    return boolDefault(items, masked, region, depth);
}

function boolDefault (expr: string, masked: string, region: FnRegion, depth: number): VariantSet | undefined {
    const e = stripOuter(expr);
    if (/^Value::Bool\(/.test(e) || e === 'Value::Null') return new Set<Variant>(UNION);
    const name = /^([A-Za-z_][A-Za-z0-9_]*)(?:\.clone\(\))?$/.exec(e);
    if (name === null) return undefined;
    const proof = proveLocal(masked, name[1], region, depth + 1);
    if (proof.variants === undefined) return undefined;
    return [...proof.variants].every((v) => v === 'bool' || v === 'null') ? new Set<Variant>(UNION) : undefined;
}

interface LocalProof { kind: 'variant' | 'none', variants?: VariantSet }

/** Variant proof for every write of `name` inside one fn region. */
function proveLocal (masked: string, name: string, region: FnRegion, depth: number): LocalProof {
    if (depth > 3) return { kind: 'none' };
    const body = masked.slice(region.start, region.end);
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const shadow = new RegExp(`(?<!\\|)\\|(?!\\|)[^|\\n]*\\b${esc}\\b[^|\\n]*(?<!\\|)\\|(?!\\|)|\\bfor [^\\n]*\\b${esc}\\b[^\\n]* in |\\blet \\([^)]*\\b${esc}\\b`);
    if (shadow.test(body)) return { kind: 'none' };
    const types = new Set<string>();
    const param = new RegExp(`\\b(?:mut )?${esc}\\s*:\\s*([A-Za-z_][A-Za-z0-9_<>]*)`).exec(region.header);
    if (param !== null) types.add(param[1]);
    const writes: string[] = [];
    const spans: Array<[number, number]> = [];
    const letRe = new RegExp(`\\blet (?:mut )?${esc}\\b\\s*(?::\\s*([A-Za-z_][A-Za-z0-9_<>]*))?\\s*=`, 'g');
    for (const m of body.matchAll(letRe)) {
        const at = m.index as number;
        const rhs = rhsAfter(masked, region.start + at + m[0].length);
        spans.push([at, at + m[0].length + rhs.length]);
        if (m[1] !== undefined) types.add(m[1]);
        writes.push(rhs);
    }
    const assignRe = new RegExp(`(?<![A-Za-z0-9_.])${esc}\\s*=(?!=)`, 'g');
    for (const m of body.matchAll(assignRe)) {
        const at = m.index as number;
        if (spans.some(([s, e]) => at >= s && at < e)) continue;
        writes.push(rhsAfter(masked, region.start + at + m[0].length));
        types.add('?');
    }
    const only = [...types];
    if (writes.length === 0 || only.some((t) => t !== 'Value' && t !== '?')) return { kind: 'none' };
    let acc: VariantSet | undefined = undefined;
    for (const w of writes) {
        const v = variantOf(w, masked, region, depth);
        if (v === undefined) return { kind: 'none' };
        acc = acc === undefined ? v : new Set<Variant>([...acc].filter((x) => v.has(x)));
        if (acc.size === 0) return { kind: 'none' };
    }
    return acc === undefined ? { kind: 'none' } : { kind: 'variant', variants: acc };
}

const isBoolOnly = (v: VariantSet): boolean => [...v].every((x) => x === 'bool' || x === 'null');

/** `!is_true(&X)` flips the comparison instead of wrapping it. */
function pushEdit (edits: Array<{ start: number, end: number, text: string }>, masked: string, start: number, close: number, text: string): void {
    let k = start - 1;
    while (k >= 0 && (masked[k] === ' ' || masked[k] === '\t')) k--;
    if (k >= 0 && masked[k] === '!' && masked[k - 1] !== '=') {
        edits.push({ start: k, end: close + 1, text: text.replace(' == ', ' != ') });
        return;
    }
    edits.push({ start, end: close + 1, text });
}

export function nativeBoolScalars (content: string): string {
    if (!content.includes('is_true(&') && !content.includes('is_equal(&')) return content;
    const masked = mask(content);
    const edits: Array<{ start: number, end: number, text: string }> = [];
    for (const m of masked.matchAll(/(?<![A-Za-z0-9_:.])(is_true|is_equal)\(&/g)) {
        const start = m.index as number;
        const open = start + m[1].length;
        const close = closeParen(masked, open);
        if (close < 0) continue;
        if (!boolSlotAt(masked, start)) continue;
        const args = splitTopLevel(content.slice(open + 1, close), ',');
        const region = fnRegionOf(masked, start);
        const proofOf = (e: string): VariantSet | undefined => {
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(e)) return undefined;
            return proveLocal(masked, e, region, 0).variants;
        };
        if (m[1] === 'is_true') {
            if (args.length !== 1) continue;
            const operand = stripOuter(args[0].replace(/^&/, ''));
            const variants = proofOf(operand);
            if (variants === undefined || !isBoolOnly(variants)) continue;
            pushEdit(edits, masked, start, close, `${operand}.as_bool() == Some(true)`);
            continue;
        }
        if (args.length !== 2) continue;
        const a = stripOuter(args[0].replace(/^&/, ''));
        const b = stripOuter(args[1].replace(/^&/, ''));
        const lit = (e: string): boolean => e === 'Value::Null' || /^Value::Bool\((?:true|false)\)$/.test(e);
        if (lit(a) && lit(b)) continue;
        const va = lit(a) ? new Set<Variant>(UNION) : proofOf(a);
        const vb = lit(b) ? new Set<Variant>(UNION) : proofOf(b);
        if (va === undefined || vb === undefined || !isBoolOnly(va) || !isBoolOnly(vb)) continue;
        const asOption = (e: string): string => {
            const box = /^Value::Bool\((true|false)\)$/.exec(e);
            if (box !== null) return `Some(${box[1]})`;
            return e === 'Value::Null' ? 'None' : `${e}.as_bool()`;
        };
        pushEdit(edits, masked, start, close, `${asOption(a)} == ${asOption(b)}`);
    }
    if (edits.length === 0) return content;
    let out = '';
    let at = 0;
    for (const e of edits) {
        if (e.start < at) continue;
        out += content.slice(at, e.start) + e.text;
        at = e.end;
    }
    return out + content.slice(at);
}

const BOOL_SCALAR_CASES: Array<[string, string, string]> = [
    ['box-only local', 'let mut flag: Value = Value::Bool(false);\n        if is_true(&flag) {', 'if flag.as_bool() == Some(true) {'],
    ['ternary writes', 'let mut flag: Value = Value::Bool(false);\n        flag = (if c { Value::Bool(true) } else { Value::Bool(false) });\n        if is_true(&flag) {', 'if flag.as_bool() == Some(true) {'],
    ['safe_bool empty default', 'let mut flag: Value = self.safe_bool_k(o, "k", &[]);\n        if is_true(&flag) {', 'if flag.as_bool() == Some(true) {'],
    ['safe_bool proven default', 'let mut pre: Value = Value::Bool(a != Value::Null);\n        let mut flag: Value = self.safe_bool_k(o, "k", &[pre.clone()]);\n        if is_true(&flag) {', 'if flag.as_bool() == Some(true) {'],
    ['negated', 'let mut flag: Value = self.safe_bool_k(o, "k", &[]);\n        if !is_true(&flag) {', 'if flag.as_bool() != Some(true) {'],
    ['is_equal pair', 'let mut a: Value = Value::Bool(true);\n        let mut b: Value = self.safe_bool_k(o, "k", &[]);\n        if is_equal(&a, &b) {', 'if a.as_bool() == b.as_bool() {'],
    ['value slot keeps helper', 'let mut flag: Value = self.safe_bool_k(o, "k", &[]);\n        m.insert("k".into(), is_true(&flag));', 'is_true(&flag)'],
    ['mixed write keeps helper', 'let mut flag: Value = Value::Bool(false);\n        flag = get_arg(o, 0, Value::Null);\n        if is_true(&flag) {', 'is_true(&flag)'],
    ['any default keeps helper', 'let mut flag: Value = self.safe_bool_k(o, "k", &[other]);\n        if is_true(&flag) {', 'is_true(&flag)'],
];

/** Each case: the native text must appear, and the helper must be gone unless the case keeps it. */
export function nativeBoolScalarsSelfTest (): string[] {
    const bad: string[] = [];
    for (const [name, body, want] of BOOL_SCALAR_CASES) {
        const src = `    pub fn f(&mut self) -> Value {\n        ${body} return Value::Null; }\n    Value::Null\n}\n`;
        const out = nativeBoolScalars(src);
        if (!out.includes(want)) bad.push(`${name}: missing ${JSON.stringify(want)}`);
        const keep = want.startsWith('is_true') || want.startsWith('is_equal');
        if (keep && out !== src) bad.push(`${name}: must stay unchanged`);
        if (!keep && (out.includes('is_true(&') || out.includes('is_equal(&'))) bad.push(`${name}: helper left`);
    }
    return bad;
}

// ---- Arr-only vec push ----
// `append_to_array(&mut x, v)` becomes a guarded native `Vec` push when x can only be `Value::Arr`/`Value::Null`:
// the helper's other arm (`try_book_cache_push`) needs a `Dict`, so the two are identical. Unproven sites keep the helper.

const VEC_PUSH_HELPER = 'append_to_array';
const VEC_PUSH_MAX_LINE = 400; // the generated tree's long-line budget
const VEC_PUSH_CALL_RX = new RegExp ('(?<![\\w.:])' + VEC_PUSH_HELPER + '\\(', 'g');
// Declarations that can only produce `Value::Arr` or `Value::Null`.
const VEC_PUSH_ARR_INIT = [
    /^Value::from\(vec!\[/,
    /^Value::from\(Vec::new\(\)\)$/,
    /^Value::Null$/,
    /^\(match [\s\S]*Some\(__v\) if matches!\(__v, Value::Arr\(_\)\) => __v, _ => Value::from\(vec!\[/,
];

// Blank strings and comments; same length as the input, so indices stay valid.
function vecPushMaskText (src: string): string {
    const out: string[] = [];
    let i = 0;
    const n = src.length;
    while (i < n) {
        const c = src[i];
        if (c === '/' && src[i + 1] === '/') {
            while (i < n && src[i] !== '\n') { out.push (' '); i++; }
            continue;
        }
        if (c === '/' && src[i + 1] === '*') {
            out.push ('  '); i += 2;
            while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out.push (src[i] === '\n' ? '\n' : ' '); i++; }
            if (i < n) { out.push ('  '); i += 2; }
            continue;
        }
        if (c === '"') {
            out.push (' '); i++;
            while (i < n && src[i] !== '"') {
                if (src[i] === '\\') { out.push ('  '); i += 2; continue; }
                out.push (src[i] === '\n' ? '\n' : ' '); i++;
            }
            if (i < n) { out.push (' '); i++; }
            continue;
        }
        out.push (c); i++;
    }
    return out.join ('');
}

// [open, close] brace spans of every `fn` body.
function vecPushFnRegions (masked: string): Array<[number, number]> {
    const regions: Array<[number, number]> = [];
    const head = /\bfn\s+[A-Za-z0-9_]*\s*[(<]/g;
    let m: RegExpExecArray | null;
    while ((m = head.exec (masked)) !== null) {
        let i = m.index + m[0].length - 1;
        let depth = 0;
        let open = -1;
        while (i < masked.length) {
            const c = masked[i];
            if (c === '(' || c === '[' || c === '<') depth++;
            else if (c === ')' || c === ']' || c === '>') depth--;
            else if (c === '{') { if (depth <= 0) { open = i; break; } depth++; }
            else if (c === ';' && depth <= 0) break;
            i++;
        }
        if (open < 0) continue;
        let close = -1;
        let d = 0;
        for (let j = open; j < masked.length; j++) {
            if (masked[j] === '{') d++;
            else if (masked[j] === '}') { d--; if (d === 0) { close = j; break; } }
        }
        if (close > open) regions.push ([open, close]);
    }
    return regions;
}

// Index of the `)` matching the `(` at `open`, or -1.
function vecPushCloseParen (src: string, open: number): number {
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        const c = src[i];
        if (c === '(') depth++;
        else if (c === ')') { depth--; if (depth === 0) return i; }
    }
    return -1;
}

// Index of the `;` ending the expression that starts at `from` (depth 0), or -1.
function vecPushExprEnd (masked: string, from: number): number {
    let depth = 0;
    for (let i = from; i < masked.length; i++) {
        const c = masked[i];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
        else if (c === ';' && depth <= 0) return i;
    }
    return -1;
}

function vecPushIsArrInit (init: string): boolean {
    const t = init.trim ();
    return VEC_PUSH_ARR_INIT.some ((rx) => rx.test (t));
}

// `s` closes its own opening bracket and never dips below it.
function vecPushBalanced (s: string): boolean {
    let d = 0;
    for (const c of s) {
        if (c === '(' || c === '[' || c === '{') d++;
        else if (c === ')' || c === ']' || c === '}') { d--; if (d < 0) return false; }
    }
    return d === 0;
}

// `y = x.clone();` as the only statement of `if matches!(&x, Value::Arr(_)) { ... }`:
// the guard makes the copy an array.
function vecPushGuardClone (masked: string, rhs: string, stmtStart: number, rhsEnd: number): boolean {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\.clone\(\)$/.exec (rhs.trim ());
    if (m === null) return false;
    const open = masked.lastIndexOf ('{', stmtStart);
    if (open < 0 || masked.slice (open + 1, stmtStart).trim () !== '' || !/^\s*\}/.test (masked.slice (rhsEnd + 1))) return false;
    const ifStart = masked.lastIndexOf ('if', open);
    if (ifStart < 0 || /[\w.]/.test (masked[ifStart - 1] ?? '')) return false;
    let cond = masked.slice (ifStart + 2, open).trim ();
    while (cond.startsWith ('(') && cond.endsWith (')') && vecPushBalanced (cond.slice (1, -1))) cond = cond.slice (1, -1).trim ();
    const cm = /^matches!\(\s*&\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*Value::Arr\(_\)\s*\)$/.exec (cond);
    return cm !== null && cm[1] === m[1];
}

export function arrOnlyVecPush (content: string): string {
    if (!content.includes (VEC_PUSH_HELPER + '(')) return content;
    const masked = vecPushMaskText (content);
    const regions = vecPushFnRegions (masked);
    const jobs: Array<{ start: number, end: number, text: string }> = [];
    const rx = new RegExp (VEC_PUSH_CALL_RX.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = rx.exec (masked)) !== null) {
        const start = m.index;
        const lineStart = masked.lastIndexOf ('\n', start) + 1;
        if (/^\s*(?:pub\s+)?fn /.test (masked.slice (lineStart, start))) continue; // definition
        const region = regions.find ((r) => r[0] < start && start < r[1]);
        if (region === undefined) continue;
        const argStart = start + VEC_PUSH_HELPER.length + 1;
        const recv = /^&mut\s+([A-Za-z_][A-Za-z0-9_]*)\s*,/.exec (content.slice (argStart, argStart + 120));
        if (recv === null) continue;
        const name = recv[1];
        const nameRx = new RegExp ('(?<![\\w.])' + name + '(?![\\w])');
        // a parameter receiver is not a local this pass can prove
        const headerStart = masked.lastIndexOf ('fn ', region[0]);
        if (new RegExp ('(?<![\\w])' + name + '\\s*:').test (masked.slice (headerStart, region[0]))) continue;
        // every declaration of the name in this body must be `Value` initialised from an Arr source
        const declRx = new RegExp ('let (?:mut )?' + name + '\\s*:\\s*([^=;]+?)\\s*=(?!=)', 'g');
        const decls: Array<{ start: number, initStart: number, initEnd: number }> = [];
        let d: RegExpExecArray | null;
        const head = masked.slice (0, start);
        while ((d = declRx.exec (head)) !== null) {
            if (d.index <= region[0]) continue;
            if (d[1].trim () !== 'Value') { decls.length = 0; break; }
            const initStart = d.index + d[0].length;
            const initEnd = vecPushExprEnd (masked, initStart);
            if (initEnd < 0) { decls.length = 0; break; }
            decls.push ({ start: d.index, initStart, initEnd });
        }
        if (decls.length === 0) continue;
        if (!decls.every ((x) => vecPushIsArrInit (content.slice (x.initStart, x.initEnd)))) continue;
        // every other use is a read, one of our pushes, or a write of an Arr source
        const useRx = new RegExp (nameRx.source, 'g');
        const body = masked.slice (region[0], region[1]);
        let u: RegExpExecArray | null;
        let ok = true;
        while ((u = useRx.exec (body)) !== null) {
            const s = region[0] + u.index;
            const e = s + name.length;
            if (decls.some ((x) => s >= x.start && s < x.initEnd)) continue;
            const before = masked.slice (Math.max (0, s - 40), s);
            const after = masked.slice (e, e + 80);
            if (/&mut\s*$/.test (before)) {
                if (!(new RegExp (VEC_PUSH_HELPER + '\\(\\s*&mut\\s*$').test (before) && /^\s*,/.test (after))) { ok = false; break; }
                continue;
            }
            const assign = /^\s*=(?!=)/.exec (after);
            if (assign !== null) {
                const rhsStart = e + assign[0].length;
                const rhsEnd = vecPushExprEnd (masked, rhsStart);
                if (rhsEnd < 0) { ok = false; break; }
                let aStart = masked.lastIndexOf (';', s);
                aStart = Math.max (aStart, masked.lastIndexOf ('{', s), masked.lastIndexOf ('}', s)) + 1;
                const init = content.slice (rhsStart, rhsEnd);
                if (!vecPushIsArrInit (init) && !vecPushGuardClone (masked, init, aStart, rhsEnd)) { ok = false; break; }
            }
        }
        if (!ok) continue;
        // the pushed value is evaluated while the array is mutably borrowed
        const callEnd = vecPushCloseParen (masked, argStart - 1);
        if (callEnd < 0) continue;
        const valueStart = argStart + recv[0].length;
        const value = content.slice (valueStart, callEnd);
        if (nameRx.test (value)) continue;
        // whole statement only
        let stmtStart = masked.lastIndexOf (';', start);
        stmtStart = Math.max (stmtStart, masked.lastIndexOf ('{', start), masked.lastIndexOf ('}', start)) + 1;
        if (masked.slice (stmtStart, start).trim () !== '') continue;
        if (!/^\)\s*;/.test (masked.slice (callEnd, callEnd + 4))) continue;
        const text = `if let Value::Arr(__a) = &mut ${name} { std::sync::Arc::make_mut(__a).push(${value.trim ()}); }`;
        // keep the tree's 400-char line budget: a site that only fits as a helper call stays one
        const lStart = content.lastIndexOf ('\n', start) + 1;
        const lEnd = content.indexOf ('\n', callEnd) < 0 ? content.length : content.indexOf ('\n', callEnd);
        const lenNow = lEnd - lStart;
        if (lenNow <= VEC_PUSH_MAX_LINE && lenNow - (callEnd + 1 - start) + text.length > VEC_PUSH_MAX_LINE) continue;
        jobs.push ({ start, end: callEnd + 1, text });
    }
    if (jobs.length === 0) return content;
    let out = content;
    for (let i = jobs.length - 1; i >= 0; i--) {
        const j = jobs[i];
        out = out.slice (0, j.start) + j.text + out.slice (j.end);
    }
    return out;
}

// ---- self-test ----
const VEC_PUSH_FILE_HEAD = `// PLEASE DO NOT EDIT THIS FILE, IT IS GENERATED AND WILL BE OVERWRITTEN:
// https://github.com/ccxt/ccxt/blob/master/CONTRIBUTING.md#how-to-contribute-code

`;

export function arrOnlyVecPushSelfTest (): string[] {
    const problems: string[] = [];
    const ok = (c: boolean, what: string) => { if (!c) { problems.push ('arr only vec push self: ' + what); } };
    const run = (body: string, header = '    pub fn k(&mut self, other: Value) -> Value {') => arrOnlyVecPush (VEC_PUSH_FILE_HEAD + header + '\n' + body + '\n    }\n');
    const push = (n: string, v: string) => `        ${VEC_PUSH_HELPER}(&mut ${n}, ${v});`;
    const native = (n: string, v: string) => `if let Value::Arr(__a) = &mut ${n} { std::sync::Arc::make_mut(__a).push(${v}); }`;

    // 1. `Value::from(vec![])` local -> native push
    const empty = run (`        let mut hashes: Value = Value::from(vec![]);\n        if is_true(&flag) {\n` + push ('hashes', 'Value::Str("a".into())') + `\n        }`);
    ok (empty.includes (native ('hashes', 'Value::Str("a".into())')), 'empty-array local goes native: ' + empty);
    ok (!empty.includes (VEC_PUSH_HELPER + '(&mut hashes'), 'helper call gone: ' + empty);

    // 2. `Value::Null` local -> native push, and a non-Arr init keeps the helper
    const nul = run (`        let mut rows: Value = Value::Null;\n` + push ('rows', 'data.clone()'));
    ok (nul.includes (native ('rows', 'data.clone()')), 'null local goes native: ' + nul);
    const mapInit = run (`        let mut rows: Value = get_value(&self.markets, &symbol);\n` + push ('rows', 'data.clone()'));
    ok (mapInit.includes (VEC_PUSH_HELPER + '(&mut rows, data.clone());'), 'non-Arr init keeps the helper: ' + mapInit);

    // 3. a later write of a non-Arr source keeps the helper
    const rewrite = run (`        let mut rows: Value = Value::from(vec![]);\n        rows = response.clone();\n` + push ('rows', 'data.clone()'));
    ok (rewrite.includes (VEC_PUSH_HELPER + '(&mut rows, data.clone());'), 'non-Arr rewrite keeps the helper: ' + rewrite);
    const guarded = run (`        let mut rows: Value = Value::from(vec![]);\n        if (matches!(&data, Value::Arr(_))) {\n            rows = data.clone();\n        }  else {\n` + push ('rows', 'data') + `\n        }`);
    ok (guarded.includes (native ('rows', 'data')), 'matches!-guarded clone write keeps the proof: ' + guarded);
    const unguarded = run (`        let mut rows: Value = Value::from(vec![]);\n        if (is_true(&flag)) {\n            rows = data.clone();\n        }\n` + push ('rows', 'data.clone()'));
    ok (unguarded.includes (VEC_PUSH_HELPER + '(&mut rows, data.clone());'), 'unguarded clone write keeps the helper: ' + unguarded);
    const rewriteArr = run (`        let mut rows: Value = Value::from(vec![]);\n        rows = Value::Null;\n` + push ('rows', 'data.clone()'));
    ok (rewriteArr.includes (native ('rows', 'data.clone()')), 'Arr rewrite keeps the proof: ' + rewriteArr);

    // 4. parameter receiver and `&mut` escape keep the helper
    const param = run (push ('other', 'data.clone()'));
    ok (param.includes (VEC_PUSH_HELPER + '(&mut other, data.clone());'), 'parameter receiver keeps the helper: ' + param);
    const escape = run (`        let mut rows: Value = Value::from(vec![]);\n        set_value(&mut rows, &Value::Str("k".into()), Value::Int(1));\n` + push ('rows', 'data.clone()'));
    ok (escape.includes (VEC_PUSH_HELPER + '(&mut rows, data.clone());'), 'escaped &mut keeps the helper: ' + escape);

    // 5. a pushed value that reads the receiver keeps the helper
    const selfRef = run (`        let mut rows: Value = Value::from(vec![]);\n` + push ('rows', 'get_value(&rows, &Value::Int(0))'));
    ok (selfRef.includes (VEC_PUSH_HELPER + '(&mut rows,'), 'value reading the receiver keeps the helper: ' + selfRef);

    // 6. non-Value local type, path-qualified call and the definition itself are untouched
    const vecLocal = run (`        let mut rows: Vec<Value> = Vec::new();\n` + push ('rows', 'data.clone()'));
    ok (vecLocal.includes (VEC_PUSH_HELPER + '(&mut rows, data.clone());'), 'typed Vec local keeps the helper: ' + vecLocal);
    const qualified = run (`        crate::runtime::` + push ('hashes', 'data.clone()'));
    ok (qualified.includes (VEC_PUSH_HELPER + '(&mut hashes, data.clone());'), 'path-qualified call untouched: ' + qualified);
    const def = arrOnlyVecPush (VEC_PUSH_FILE_HEAD + 'pub fn append_to_array(arr: &mut Value, v: Value) {\n    if let Value::Arr(a) = arr { std::sync::Arc::make_mut(a).push(v); }\n}\n');
    ok (def.includes ('pub fn append_to_array(arr: &mut Value, v: Value) {'), 'definition untouched: ' + def);

    // 7. a doc comment naming the helper and a dict-literal push stay as they are
    const comment = arrOnlyVecPush (VEC_PUSH_FILE_HEAD + '    // append_to_array(&mut hashes, v); obsolete\n    pub fn k(&mut self) -> Value {\n        let mut hashes: Value = Value::from(vec![]);\n' + push ('hashes', 'Value::Int(1)') + '\n    }\n');
    ok (comment.includes (native ('hashes', 'Value::Int(1)')) && comment.includes ('// append_to_array(&mut hashes, v); obsolete'), 'comment untouched: ' + comment);

    // 8. a rewrite that would push the line past 400 chars keeps the helper
    const longVal = 'Value::Str(format!("{}", ' + 'self.safe_string_k(market.clone(), "id", &[])'.repeat (10) + '))';
    const longLine = arrOnlyVecPush (`        let mut hashes: Value = Value::from(vec![]);\n` + push ('hashes', longVal));
    ok (longLine.split ('\n').some ((l) => l.length > 400), 'long-value fixture is over 400 chars');
    ok (longLine.includes (VEC_PUSH_HELPER + '(&mut hashes,'), 'over-budget line keeps the helper: ' + longLine.length);

    // 9. idempotent
    ok (arrOnlyVecPush (empty) === empty, 'idempotent');
    return problems;
}

// ---- typed locals ----
// `let mut X: Value = <init>;` holds the native payload when the initializer pins the variant, every later use in
// the fn prints natively and every by-value slot re-boxes explicitly. An unprovable site keeps the `Value` local.


type Rw = { start: number, end: number, text: string, g?: number };

const STR_LIT = String.raw`"(?:[^"\\]|\\.)*"`;

/** Blank string literals and line comments, same length as the input. */
function typedLocalsMaskText(src: string): string {
    let out = '';
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (c === '/' && src[i + 1] === '/') {
            while (i < src.length && src[i] !== '\n') { out += ' '; i++; }
            continue;
        }
        if (c === '"') {
            out += ' ';
            i++;
            while (i < src.length && src[i] !== '"') {
                if (src[i] === '\n') { out += '\n'; i++; continue; }
                if (src[i] === '\\') { out += '  '; i += 2; continue; }
                out += ' ';
                i++;
            }
            if (i < src.length) { out += ' '; i++; }
            continue;
        }
        out += c;
        i++;
    }
    return out;
}

/** Index just past the `)` matching the `(` at `open`, or -1. */
function typedLocalsCloseParen(masked: string, open: number): number {
    let depth = 0;
    for (let k = open; k < masked.length; k++) {
        const c = masked[k];
        if (c === '(') depth++;
        else if (c === ')') { depth--; if (depth === 0) return k + 1; }
    }
    return -1;
}

/** Index just past the delimiter closing the one at `open`, or -1. */
function closeAt(src: string, open: number): number {
    const openCh = src[open];
    const closeCh = openCh === '(' ? ')' : openCh === '[' ? ']' : '}';
    let depth = 0;
    for (let k = open; k < src.length; k++) {
        const c = src[k];
        if (c === openCh) depth++;
        else if (c === closeCh) { depth--; if (depth === 0) return k + 1; }
    }
    return -1;
}

/** Index just past the `}` matching the `{` at `open`, or -1. */
function closeBrace(masked: string, open: number): number {
    let depth = 0;
    for (let k = open; k < masked.length; k++) {
        const c = masked[k];
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return k + 1; }
    }
    return -1;
}

/** End (index of `;`) of the statement starting at `from`, depth 0. */
function stmtEnd(masked: string, from: number): number {
    let depth = 0;
    for (let k = from; k < masked.length; k++) {
        const c = masked[k];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') { depth--; if (depth < 0) return -1; }
        else if (c === ';' && depth === 0) return k;
    }
    return -1;
}

/** Split top-level commas; undefined when the delimiters are unbalanced. */
function typedLocalsSplitArgs(masked: string, from: number, to: number): string[] | undefined {
    const args: string[] = [];
    let depth = 0;
    let start = from;
    for (let k = from; k < to; k++) {
        const c = masked[k];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
        else if (c === ',' && depth === 0) { args.push(masked.slice(start, k)); start = k + 1; }
    }
    args.push(masked.slice(start, to));
    return args;
}

/** Innermost unclosed delimiter at each index, plus its opening index. */
function openerMap(masked: string): { kind: Uint8Array, at: Int32Array } {
    const kind = new Uint8Array(masked.length);
    const at = new Int32Array(masked.length).fill(-1);
    const stack: Array<{ kind: number, at: number }> = [];
    for (let i = 0; i < masked.length; i++) {
        const c = masked[i];
        if (c === '(') stack.push({ kind: 1, at: i });
        else if (c === '[') stack.push({ kind: masked[i - 1] === '&' ? 3 : 2, at: i });
        else if (c === '{') stack.push({ kind: 4, at: i });
        else if (c === ')' || c === ']' || c === '}') { if (stack.length > 0) stack.pop(); }
        const top = stack[stack.length - 1];
        kind[i] = top === undefined ? 0 : top.kind;
        at[i] = top === undefined ? -1 : top.at;
    }
    return { kind, at };
}

const KEYWORDS = new Set(['if', 'while', 'match', 'return', 'for', 'in', 'else', 'loop', 'not']);

/** True when the identifier at `s` is a whole by-value expression slot. */
function valueSlot(masked: string, content: string, s: number, name: string, open: { kind: Uint8Array, at: Int32Array }): number {
    const kind = open.kind[s];
    if (kind !== 1 && kind !== 2 && kind !== 3) return 0;
    if (kind === 1) {
        const head = masked.slice(Math.max(0, open.at[s] - 40), open.at[s]);
        const word = /([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(head);
        if (word === null || KEYWORDS.has(word[1])) return 0;
        // `Value::Str(..)` and friends are handled by `classify`.
        const ctor = /Value::([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(head);
        if (ctor !== null) return 0;
    }
    let k = s - 1;
    while (k >= 0 && /\s/.test(masked[k])) k--;
    if (masked[k] === '&' || masked[k] === '.' || masked[k] === '!') return 0;
    if (/\bmut\s+$/.test(masked.slice(Math.max(0, s - 8), s))) return 0;
    const after = content.slice(s + name.length);
    const m = /^(?:\.clone\(\))?\s*[,)\];]/.exec(after);
    if (m === null) return 0;
    return after.startsWith('.clone()') ? 2 : 1;
}

const FN_HEADER = /(?:^|\n)[ \t]*(?:pub(?:\([a-z]+\))? )?(?:async )?fn /g;

function typedLocalsFnRegions(masked: string): number[] {
    const heads: number[] = [0];
    for (const m of masked.matchAll(FN_HEADER)) heads.push((m.index as number) + 1);
    return heads;
}

type Shape = 'String' | 'Int' | 'Float' | 'Bool' | 'Vec' | 'Map';

const RUST_TYPE: Record<Shape, string> = {
    'String': 'String',
    'Int': 'i64',
    'Float': 'f64',
    'Bool': 'bool',
    'Vec': 'Vec<Value>',
    'Map': 'indexmap::IndexMap<String, Value>',
};

/** Box a native local back into a `Value` slot. */
function boxed(shape: Shape, expr: string): string {
    switch (shape) {
    case 'String': return `Value::str(${expr})`;
    case 'Int': return `Value::Int(${expr})`;
    case 'Float': return `Value::Float(${expr})`;
    case 'Bool': return `Value::Bool(${expr})`;
    case 'Vec': return `Value::Array(${expr})`;
    case 'Map': return `Value::Map(${expr})`;
    }
}

/** Initializer shape, or undefined when the variant is not pinned. */
function initShape(init: string): { shape: Shape, inner: string, wrapperEnd: number } | undefined {
    const pinned = (head: string, shape: Shape): { shape: Shape, inner: string, wrapperEnd: number } | undefined => {
        if (!init.startsWith(head)) return undefined;
        const open = head.length - 1;
        const close = closeAt(init, open);
        if (close < 0) return undefined;
        const inner = init.slice(open + 1, close - 1);
        if (inner.trim() === '' || inner.trim().startsWith('Value::')) return undefined;
        return { shape, inner, wrapperEnd: close };
    };
    for (const [head, shape] of [
        ['Value::Str(', 'String'],
        ['Value::Int(', 'Int'],
        ['Value::Float(', 'Float'],
        ['Value::Bool(', 'Bool'],
        ['Value::Map(', 'Map'],
    ] as Array<[string, Shape]>) {
        const hit = pinned(head, shape);
        if (hit !== undefined) return hit;
    }
    // `Value::Array(vec![..])` and friends hold the payload inside the `vec![]`.
    for (const head of ['Value::Array(', 'Value::List(', 'Value::from(']) {
        if (!init.startsWith(head)) continue;
        const close = closeAt(init, head.length - 1);
        if (close < 0) return undefined;
        const inner = init.slice(head.length, close - 1);
        if (!inner.startsWith('vec![') || closeAt(inner, 4) !== inner.length) return undefined;
        return { shape: 'Vec', inner, wrapperEnd: close };
    }
    if (init.startsWith('vec![')) {
        const close = closeAt(init, 4);
        if (close !== init.length) return undefined;
        return { shape: 'Vec', inner: init.slice(5, close - 1), wrapperEnd: close };
    }
    return undefined;
}

/** True when `x` is only ever read (never rebound or mutated elsewhere). */
function rebound(region: string, name: string): boolean {
    const n = name;
    const rx = new RegExp(
        `\\blet\\s+(?:mut\\s+)?${n}\\b|\\bfor\\s+(?:mut\\s+)?${n}\\b`
        + `|\\|\\s*(?:mut\\s+)?${n}\\s*[:|,]|\\blet\\s*\\([^)]*\\b${n}\\b`
        + `|\\b${n}\\s*@|\\b${n}\\b[^;\\n]*=>`);
    return rx.test(region);
}

type Ctx = {
    name: string,
    useStart: number,
    before: string,
    after: string,
};

/** Classify one use: rewrites for the use, or null when it cannot be proven. */
function classify(shape: Shape, ctx: Ctx, masked: string, content: string, where: { kind: Uint8Array, at: Int32Array }): Rw[] | null {
    const { name, useStart: s, before, after } = ctx;
    const open = where;
    const nameEnd = s + name.length;
    const boxStr = `&Value::Str\\(\\s*(${STR_LIT})\\s*(?:\\.into\\(\\)|\\.to_string\\(\\))?\\s*\\)`;
    const boxInt = `&Value::Int\\(\\s*(-?\\d+)\\s*\\)`;
    const boxFlt = `&Value::Float\\(\\s*(-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\s*\\)`;
    const boxNum = shape === 'Int' ? boxInt : boxFlt;
    const numeric = shape === 'Int' || shape === 'Float';

    const eqOp = (op: string, lit: string, len: number, prefix: string): Rw[] => {
        const start = s - prefix.length;
        return [{ start, end: nameEnd + len, text: `(${name} ${op} ${lit})` }];
    };

    // `is_equal(&X, &Value::<lit>)` and the ordered compares are native on the payload.
    if (shape === 'String' && before.endsWith('is_equal(&')) {
        const m = new RegExp(`^,\\s*${boxStr}\\)`).exec(after);
        if (m !== null) return eqOp('==', m[1], m[0].length, 'is_equal(&');
    }
    if (numeric && before.endsWith('is_equal(&')) {
        const m = new RegExp(`^,\\s*${boxNum}\\)`).exec(after);
        if (m !== null) return eqOp('==', m[1], m[0].length, 'is_equal(&');
    }
    if (numeric) {
        const cmp: Array<[string, string]> = [
            ['is_less_than(&', '<'],
            ['is_greater_than(&', '>'],
            ['is_less_than_or_equal(&', '<='],
            ['is_greater_than_or_equal(&', '>='],
        ];
        for (const [prefix, op] of cmp) {
            if (!before.endsWith(prefix)) continue;
            const m = new RegExp(`^,\\s*${boxNum}\\)`).exec(after);
            if (m !== null) return eqOp(op, m[1], m[0].length, prefix);
        }
    }
    // `to_string_val(&X)` is the identity on a `String` local.
    if (shape === 'String' && before.endsWith('to_string_val(&') && after.startsWith(')')) {
        return [{ start: s - 'to_string_val(&'.length, end: nameEnd + 1, text: `${name}.clone()` }];
    }
    // `ends_with` / `starts_with` on a literal are `str` methods.
    if (shape === 'String') {
        for (const [prefix, method] of [['ends_with(&', 'ends_with'], ['starts_with(&', 'starts_with']] as Array<[string, string]>) {
            if (!before.endsWith(prefix)) continue;
            const m = new RegExp(`^,\\s*${boxStr}\\)`).exec(after);
            if (m !== null) {
                const start = s - prefix.length;
                return [{ start, end: nameEnd + m[0].length, text: `${name}.${method}(${m[1]})` }];
            }
        }
    }
    // `is_true(&X)` — `is_true` is generic over `IsTruthy`.
    if (shape === 'Bool' && before.endsWith('is_true(&') && after.startsWith(')')) {
        return [{ start: s - 'is_true(&'.length, end: nameEnd + 1, text: name }];
    }
    // `X.as_bool() == Some(<lit>)` on a `bool` local.
    if (shape === 'Bool') {
        const m = /^\.as_bool\(\)\s*(==|!=)\s*Some\((true|false)\)/.exec(after);
        if (m !== null) {
            const eq = m[1] === '==';
            const positive = m[2] === 'true';
            return [{ start: s, end: nameEnd + m[0].length, text: (eq === positive) ? name : `!${name}` }];
        }
    }
    // `get_array_length(&X)` on a plain `Vec<Value>` is its `len()`.
    if (shape === 'Vec' && before.endsWith('get_array_length(&') && after.startsWith(')')) {
        return [{ start: s - 'get_array_length(&'.length, end: nameEnd + 1, text: `Value::Int(${name}.len() as i64)` }];
    }
    // `append_to_array(&mut X, V)` -> `X.push(V)`.
    if (shape === 'Vec' && before.endsWith('append_to_array(&mut ') && after.startsWith(',')) {
        const open = s - '(&mut '.length;
        const close = typedLocalsCloseParen(masked, open);
        if (close > 0) {
            const args = typedLocalsSplitArgs(masked, open + 1, close - 1);
            if (args !== undefined && args.length === 2) {
                const val = content.slice(open + 1 + args[0].length + 1, close - 1).trim();
                return [{ start: open - 'append_to_array'.length, end: close, text: `${name}.push(${val})` }];
            }
        }
    }
    // The Arr-only push marker `if let Value::Arr(__a) = &mut X { ..push(v) }`.
    if (shape === 'Vec' && before.endsWith('= &mut ')) {
        const varM = /if let Value::Arr\((\w+)\) = &mut $/.exec(before);
        if (varM !== null) {
            const stmtStart = s - varM[0].length;
            const brace = masked.indexOf('{', nameEnd);
            const close = brace < 0 ? -1 : closeBrace(masked, brace);
            const head = `std::sync::Arc::make_mut(${varM[1]}).push(`;
            if (close > 0) {
                const rel = masked.slice(brace + 1, close - 1).indexOf(head);
                if (rel >= 0) {
                    const pushOpen = brace + 1 + rel + head.length - 1;
                    const pushClose = typedLocalsCloseParen(masked, pushOpen);
                    if (pushClose > 0) {
                        const val = content.slice(pushOpen + 1, pushClose - 1).trim();
                        return [{ start: stmtStart, end: close, text: `${name}.push(${val});` }];
                    }
                }
            }
        }
    }
    // Map reads/writes on a literal dict: no marker routing can trigger here.
    if (shape === 'Map' && before.endsWith('get_value(&')) {
        const m = new RegExp(`^,\\s*${boxStr}\\)`).exec(after);
        if (m !== null) {
            const start = s - 'get_value(&'.length;
            return [{ start, end: nameEnd + m[0].length, text: `${name}.get(${m[1]}).cloned().unwrap_or(Value::Null)` }];
        }
    }
    if (shape === 'Map' && before.endsWith('in_op(&')) {
        const m = new RegExp(`^,\\s*${boxStr}\\)`).exec(after);
        if (m !== null) {
            const start = s - 'in_op(&'.length;
            return [{ start, end: nameEnd + m[0].length, text: `${name}.contains_key(${m[1]})` }];
        }
    }
    if (shape === 'Map' && before.endsWith('add_element_to_object(&mut ')) {
        const m = new RegExp(`^,\\s*${boxStr}\\s*,`).exec(after);
        if (m !== null) {
            const open = s - '(&mut '.length;
            const close = typedLocalsCloseParen(masked, open);
            if (close > 0) {
                const args = typedLocalsSplitArgs(masked, open + 1, close - 1);
                if (args !== undefined && args.length === 3) {
                    const val = content.slice(open + 1 + args[0].length + 1 + args[1].length + 1, close - 1).trim();
                    return [{ start: open - 'add_element_to_object'.length, end: close, text: `${name}.insert(${m[1]}.to_string(), ${val})` }];
                }
            }
        }
    }
    // The printed dict index write `if let Value::Dict(__d) = &mut X { Arc::make_mut(__d).insert(k, v); }`
    // on a fresh-literal map local is `X.insert(k, v);` (the block holds only that one insert).
    if (shape === 'Map' && before.endsWith('= &mut ')) {
        const varM = /if let Value::Dict\((\w+)\) = &mut $/.exec(before);
        if (varM !== null && /^\s*\{/.test(after)) {
            const stmtStart = s - varM[0].length;
            const brace = nameEnd + after.indexOf('{');
            const close = closeBrace(masked, brace);
            const head = `std::sync::Arc::make_mut(${varM[1]}).insert(`;
            if (close > 0) {
                const body = content.slice(brace + 1, close - 1).trim();
                if (body.startsWith(head)) {
                    const pushOpen = brace + 1 + content.slice(brace + 1).indexOf(head) + head.length - 1;
                    const pushClose = typedLocalsCloseParen(masked, pushOpen);
                    if (pushClose > 0 && content.slice(pushClose, close - 1).trim() === ';') {
                        const val = content.slice(pushOpen + 1, pushClose - 1).trim();
                        return [{ start: stmtStart, end: close, text: `${name}.insert(${val});` }];
                    }
                }
            }
        }
    }
    // `matches!(&X, Value::Bool(<lit>))` on a proven bool is the value itself.
    if (shape === 'Bool' && open.kind[s] === 1 && /matches!$/.test(masked.slice(Math.max(0, open.at[s] - 12), open.at[s]))) {
        const m = /^,\s*Value::Bool\(\s*(true|false)\s*\)\)/.exec(after);
        const start = s - 'matches!(&'.length;
        if (m !== null) {
            const positive = m[1] === 'true';
            return [{ start, end: nameEnd + m[0].length, text: positive ? name : `!${name}` }];
        }
    }
    // The native box (`Value::str(x)`) already takes the payload.
    if (shape === 'String' && before.endsWith('Value::str(') && (after.startsWith(')') || after.startsWith('.clone())') || after.startsWith('.to_string())'))) return [];
    // `X.as_str() == Some("lit")` compares the payload's `str`.
    if (shape === 'String' && after.startsWith('.as_str()')) {
        const m = /^\.as_str\(\)\s*(==|!=)\s*Some\(\s*("(?:[^"\\]|\\.)*")\s*\)/.exec(after);
        if (m !== null) return [{ start: s, end: nameEnd + m[0].length, text: `(${name} ${m[1]} ${m[2]})` }];
        const rev = /^\.as_str\(\)\s*(==|!=)\s*Some\(\s*("(?:[^"\\]|\\.)*")\s*\.to_string\(\)\s*\)/.exec(after);
        if (rev !== null) return [{ start: s, end: nameEnd + rev[0].length, text: `(${name} ${rev[1]} ${rev[2]})` }];
    }
    // Numeric reads: `as_f64()` on a proven Int/Float is the payload cast.
    if (numeric && after.startsWith('.as_f64()')) {
        const plain = shape === 'Float' ? name : `(${name} as f64)`;
        const nan = /^\.as_f64\(\)\.unwrap_or\(f64::NAN\)/.exec(after);
        if (nan !== null) return [{ start: s, end: nameEnd + nan[0].length, text: plain }];
        const some = /^\.as_f64\(\)\s*(==|!=)\s*Some\(\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*\)/.exec(after);
        if (some !== null) return [{ start: s, end: nameEnd + some[0].length, text: `(${plain} ${some[1]} ${some[2]})` }];
    }
    // A Display-only macro slot (`format!("{}{}", a, X)`) prints the payload itself.
    if ((shape === 'String' || numeric || shape === 'Bool') && open.kind[s] === 1) {
        const macroOpen = open.at[s];
        const macroHead = /([A-Za-z_][A-Za-z0-9_]*)!$/.exec(masked.slice(Math.max(0, macroOpen - 40), macroOpen));
        const pre = masked.slice(Math.max(0, s - 12), s);
        const tail = after.startsWith('.clone()') ? '.clone()' : after.startsWith('.to_string()') ? '.to_string()' : '';
        const rest = after.slice(tail.length);
        const closes = rest.startsWith(')') || rest.startsWith(',');
        if (macroHead !== undefined && /[(,]\s*$/.test(pre) && closes) {
            const close = typedLocalsCloseParen(masked, macroOpen);
            if (close > 0) {
                const args = typedLocalsSplitArgs(masked, macroOpen + 1, close - 1);
                const raw = content.slice(macroOpen + 1, close - 1);
                const tpl = args === undefined ? undefined : /^\s*"((?:[^"\\]|\\.)*)"\s*$/.exec(raw.slice(0, args[0].length));
                const holes = tpl === null || tpl === undefined ? [] : (tpl[1].match(/\{[^}]*\}/g) ?? []);
                if (args !== undefined && args.length > 1 && holes.length === args.length - 1 && holes.every(h => h === '{}')) return [];
            }
        }
    }
    // The literal on the left of a compare (`is_equal(&Value::Int(3), &X)`) gives the same predicate.
    {
        const tail = after.startsWith('.clone()') && after.slice('.clone()'.length).startsWith(')') ? '.clone()' : after.startsWith(')') ? '' : null;
        if (tail !== null) {
            const wide = content.slice(Math.max(0, s - 160), s);
            const lit = shape === 'String'
                ? /is_equal\(&Value::Str\(\s*("(?:[^"\\]|\\.)*")\s*(?:\.into\(\)|\.to_string\(\))?\s*\)\s*,\s*&$/.exec(wide)
                : shape === 'Bool'
                    ? /is_equal\(&Value::Bool\(\s*(true|false)\s*\)\s*,\s*&$/.exec(wide)
                    : numeric
                        ? /(is_equal|is_less_than|is_greater_than|is_less_than_or_equal|is_greater_than_or_equal)\(&\s*Value::(?:Int|Float)\(\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*\)\s*,\s*&$/.exec(wide)
                        : null;
            if (lit !== null) {
                const ops: Record<string, string> = {
                    'is_equal': '==', 'is_less_than': '<', 'is_greater_than': '>',
                    'is_less_than_or_equal': '<=', 'is_greater_than_or_equal': '>=',
                };
                const op = shape === 'String' || shape === 'Bool' ? '==' : ops[lit[1]];
                const value = shape === 'String' || shape === 'Bool' ? lit[1] : lit[2];
                const start = s - lit[0].length;
                return [{ start, end: nameEnd + tail.length + 1, text: `(${value} ${op} ${name}${tail})` }];
            }
        }
    }
    // `to_string_val(&X)` on a proven scalar is its own `to_string`.
    if ((shape === 'Int' || shape === 'Float' || shape === 'Bool') && before.endsWith('to_string_val(&') && after.startsWith(')')) {
        return [{ start: s - 'to_string_val(&'.length, end: nameEnd + 1, text: `Value::str(${name}.to_string())` }];
    }
    // Re-boxing into a `Value` slot: the constructor takes the native payload.
    if (before.endsWith('Value::Str(') && shape === 'String') {
        if (after.startsWith(')') || after.startsWith('.clone())')) {
            return [{ start: s - 'Value::Str'.length, end: s - 1, text: 'Value::str' }];
        }
    }
    // Already-native reads/writes and payload constructors.
    const nativeMethod = /^\.(?:len|is_empty|push|insert|contains_key|get|keys|values|iter|first|last)\(/.exec(after);
    if (nativeMethod !== null && (shape === 'Vec' || shape === 'Map')) return [];
    if (shape === 'Int' && /^\.as_i64\(\)/.test(after)) return null;
    if (before.endsWith('Value::Int(') && shape === 'Int' && after.startsWith(')')) return [];
    if (before.endsWith('Value::Float(') && shape === 'Float' && after.startsWith(')')) return [];
    if (before.endsWith('Value::Bool(') && shape === 'Bool' && after.startsWith(')')) return [];
    if ((before.endsWith('Value::Array(') || before.endsWith('Value::List(')) && shape === 'Vec' && after.startsWith(')')) return [];
    if (before.endsWith('Value::Map(') && shape === 'Map' && after.startsWith(')')) return [];
    if (before.endsWith('Value::from(') && after.startsWith(')')) return [];
    return null;
}

/** Source text of the header that owns the block opening at `open`. */
function blockHeader(masked: string, from: number, open: number): string {
    let i = open - 1;
    let depth = 0;
    while (i >= from) {
        const c = masked[i];
        if (c === ')' || c === ']' || c === '}') depth++;
        else if (c === '(' || c === '[' || c === '{') {
            if (depth === 0) break;
            depth--;
        } else if (c === ';' && depth === 0) break;
        i--;
    }
    return masked.slice(i + 1, open);
}

/** True when `pos` sits inside a loop body or a closure (re-runnable). */
function inRepeatedBlock(masked: string, from: number, pos: number, declAt = -1): boolean {
    const stack: number[] = [];
    for (let k = from; k < pos; k++) {
        const c = masked[k];
        if (c === '{') stack.push(k);
        else if (c === '}' && stack.length > 0) stack.pop();
    }
    for (const open of stack) {
        // A block that already encloses the declaration re-creates the local on every pass.
        if (open < declAt) continue;
        const head = blockHeader(masked, from, open);
        if (/\b(for|while|loop)\b/.test(head)) return true;
        if (/\|[^|]*\|/.test(head)) return true;
        if (/\bmove\s*$/.test(head)) return true;
    }
    return false;
}

/** True when the use is a whole-statement `X = <init>;` re-assignment. */
function assignRewrite(shape: Shape, name: string, s: number, after: string, content: string, masked: string): Rw[] | null {
    const m = /^\s*=\s*/.exec(after);
    if (m === null) return null;
    const rhsStart = s + name.length + m[0].length;
    const end = stmtEnd(masked, rhsStart);
    if (end < 0) return null;
    const rhs = content.slice(rhsStart, end).trim();
    // `X = self.array_concat(X[.clone()], B);` on a native `Vec<Value>` local extends it in place.
    // `concat_arrays` yields an empty array unless both sides are `Arr`, so a non-array B clears X.
    if (shape === 'Vec' && rhs.startsWith('self.array_concat(')) {
        const prev = /[^\s]/.exec(content.slice(0, s).split('').reverse().join(''));
        if (prev === null || ![';', '{', '}'].includes(prev[0])) return null;
        const open = 'self.array_concat'.length;
        if (typedLocalsCloseParen(rhs, open) !== rhs.length) return null;
        const args = typedLocalsSplitArgs(rhs, open + 1, rhs.length - 1);
        if (args === undefined || args.length !== 2) return null;
        const first = args[0].trim();
        const second = args[1].trim();
        if (first !== name && first !== `${name}.clone()`) return null;
        if (new RegExp(`(?<![A-Za-z0-9_.])${name}(?![A-Za-z0-9_])`).test(second)) return null;
        return [{ start: s, end, text: `match &${second} { Value::Arr(__b) => ${name}.extend(__b.iter().cloned()), _ => ${name}.clear() }` }];
    }
    const heads: Record<Shape, string[]> = {
        'String': ['Value::Str('],
        'Int': ['Value::Int('],
        'Float': ['Value::Float('],
        'Bool': ['Value::Bool('],
        'Vec': ['Value::Array(vec![', 'Value::List(vec![', 'Value::from(vec![', 'vec!['],
        'Map': ['Value::Map('],
    };
    const head = heads[shape].find(h => rhs.startsWith(h));
    if (head === undefined) return null;
    const close = typedLocalsCloseParen(rhs, head.length - 1);
    if (close < 0 || close !== rhs.length) return null;
    const inner = rhs.slice(head.length, close - 1);
    if (inner.trim() === '' || inner.trim().startsWith('Value::')) return null;
    return [{ start: rhsStart, end, text: inner }];
}

export type TypedLocalReject = { shape: Shape, name: string, line: number, text: string };

/** Blocking uses from the last run (diagnostics only). */
export let typedLocalRejects: TypedLocalReject[] = [];

/** Type the `Value` locals whose initializer pins the variant and whose every use is native. */
export function rustTypedLocals(content: string): string {
    typedLocalRejects = [];
    if (!content.includes(': Value = ')) return content;
    const masked = typedLocalsMaskText(content);
    const openers = openerMap(masked);
    const anyOpen = openers.kind;
    const atOpen = openers;
    const heads = typedLocalsFnRegions(masked);
    const rewrites: Rw[] = [];
    let group = 0;
    const declRe = /^([ \t]*)let (?:mut )?([a-zA-Z_][a-zA-Z0-9_]*): Value = /gm;
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(content)) !== null) {
        const name = m[2];
        const declStart = m.index;
        const initStart = declStart + m[0].length;
        const end = stmtEnd(masked, initStart);
        if (end < 0) continue;
        const rawInit = content.slice(initStart, end);
        const lead = rawInit.length - rawInit.trimStart().length;
        const init = rawInit.trim();
        const parsed = initShape(init);
        if (parsed === undefined) { continue; }
        const { shape } = parsed;
        // The wrapper has to span the whole initializer.
        if (parsed.wrapperEnd !== init.length) { continue; }
        if (shape === 'Float' && /^-?\d+$/.test(parsed.inner)) continue;
        let lo = 0;
        for (let h = 0; h < heads.length; h++) if (heads[h] <= declStart) lo = h;
        const regionStart = heads[lo];
        let regionEnd = lo + 1 < heads.length ? heads[lo + 1] : content.length;
        if (shape === 'Map') {
            // A map local is only visible to the end of its own block: a later sibling block may
            // declare the same name again without shadowing this one.
            let depth = 0;
            for (let k = end; k < regionEnd; k++) {
                const c = masked[k];
                if (c === '{') depth++;
                else if (c === '}') { if (depth === 0) { regionEnd = k; break; } depth--; }
            }
        }
        const region = masked.slice(end, regionEnd);
        if (rebound(region, name)) continue;
        const useRe = new RegExp(`(?<![A-Za-z0-9_.])${name}(?![A-Za-z0-9_])`, 'g');
        const uses: Rw[] = [];
        const boxes: Array<{ pos: number, tail: number, move: boolean }> = [];
        let ok = true;
        let gained = 0;
        let lastUse = -1;
        let skipUntil = -1;
        let u: RegExpExecArray | null;
        while ((u = useRe.exec(region)) !== null) {
            const s = end + u.index;
            const before = content.slice(Math.max(regionStart, s - 60), s);
            const after = content.slice(s + name.length, s + name.length + 90);
            if (s < skipUntil) continue; // inside an assignment rewritten as a whole
            lastUse = s;
            // A by-value expression slot is `Value` by construction; re-box there.
            const slot = valueSlot(masked, content, s, name, atOpen);
            if (slot > 0) {
                const dotClone = after.startsWith('.clone()') ? '.clone()'.length : 0;
                boxes.push({ pos: s, tail: dotClone, move: slot === 1 });
                continue;
            }
            const ctx: Ctx = { name, useStart: s, before, after };
            const rw = classify(shape, ctx, masked, content, atOpen);
            if (rw !== null && rw.length > 0) gained++;
            if (rw === null) {
                const asg = assignRewrite(shape, name, s, after, content, masked);
                if (asg === null) {
                    ok = false;
                    const ls = content.lastIndexOf('\n', s) + 1;
                    const le = content.indexOf('\n', s);
                    typedLocalRejects.push({ shape, name, line: content.slice(0, s).split('\n').length, text: content.slice(ls, le < 0 ? content.length : le).trim() });
                    break;
                }
                uses.push(...asg);
                for (const a of asg) skipUntil = Math.max(skipUntil, a.end);
                continue;
            }
            uses.push(...rw);
        }
        if (!ok) continue;
        // Re-boxing alone is churn: require one use the native type shortens.
        if (gained === 0) continue;
        // A move needs the final, non re-runnable use; a by-value source cannot gain a clone.
        for (const b of boxes) {
            const canMove = b.pos === lastUse && !inRepeatedBlock(masked, regionStart, b.pos, shape === 'Map' ? declStart : -1);
            // A `Value` clone of a Dict/Arr is a refcount bump; deep-copying the
            // native container instead would cost more, so those keep `Value`.
            const collection = shape === 'Vec' || shape === 'Map';
            if (!canMove && (b.tail === 0 || collection)) { ok = false; break; }
            const expr = canMove ? name : `${name}.clone()`;
            uses.push({ start: b.pos, end: b.pos + name.length + b.tail, text: boxed(shape, expr) });
        }
        if (!ok) continue;
        // A statement-level rewrite would clobber a nested one: keep the base.
        for (const a of uses) {
            for (const b of uses) {
                if (a !== b && a.start <= b.start && b.end < a.end) { ok = false; break; }
            }
            if (!ok) break;
        }
        if (!ok) continue;
        // Never push a line that was under the 400-char report threshold over it.
        const growth = new Map<number, number>();
        const lineOf = (pos: number): number => content.lastIndexOf('\n', pos) + 1;
        for (const rw of uses) {
            const lineStart = lineOf(rw.start);
            if (lineOf(rw.end) !== lineStart) continue;
            const lineEnd = content.indexOf('\n', lineStart);
            const len = (lineEnd < 0 ? content.length : lineEnd) - lineStart;
            const next = (growth.get(lineStart) ?? 0) + rw.text.length - (rw.end - rw.start);
            growth.set(lineStart, next);
            if (len + next > 400 && len <= 400) { ok = false; break; }
        }
        if (!ok) continue;
        const typeAt = declStart + m[0].indexOf(': Value') + 2;
        const exprAt = initStart + lead;
        const g = group++;
        rewrites.push({ start: typeAt, end: typeAt + 5, text: RUST_TYPE[shape], g });
        rewrites.push({ start: exprAt, end: exprAt + parsed.wrapperEnd, text: parsed.inner, g });
        for (const u of uses) rewrites.push({ ...u, g });
    }
    if (rewrites.length === 0) return content;
    // Two locals can overlap (one nested in the other's rewritten call): drop
    // both groups rather than splice a half-rewritten expression.
    const sorted = [...rewrites].sort((a, b) => a.start - b.start || a.end - b.end);
    const dirty = new Set<number>();
    const active: Rw[] = [];
    for (const r of sorted) {
        for (let i = active.length - 1; i >= 0; i--) if (active[i].end <= r.start) active.splice(i, 1);
        for (const a of active) {
            if (a.g !== r.g) { dirty.add(a.g as number); dirty.add(r.g as number); }
        }
        active.push(r);
    }
    rewrites.sort((a, b) => a.start - b.start || a.end - b.end);
    let out = '';
    let last = 0;
    for (const r of rewrites) {
        if (dirty.has(r.g as number)) continue;
        if (r.start < last) continue;
        out += content.slice(last, r.start) + r.text;
        last = r.end;
    }
    out += content.slice(last);
    return out;
}

/** One case per rule; each one fails on the base generator (no such pass). */
export function rustTypedLocalsSelfTest(): string[] {
    const cases: any[] = [
        [
            'string-equal-and-move-box',
            'fn f() {\n    let mut s: Value = Value::Str(format!("a{}", b));\n    if is_equal(&s, &Value::Str("ab".into())) {\n        self.watch(&[s.clone()]);\n    }\n}\n',
            'fn f() {\n    let mut s: String = format!("a{}", b);\n    if (s == "ab") {\n        self.watch(&[Value::str(s)]);\n    }\n}\n',
        ],
        [
            'string-arg-clone-box',
            'fn f() {\n    let mut s: Value = Value::Str("ab".into());\n    let first: Value = self.use_it(s.clone());\n    if is_equal(&s, &Value::Str("ab".into())) {\n        return;\n    }\n}\n',
            'fn f() {\n    let mut s: String = "ab".into();\n    let first: Value = self.use_it(Value::str(s.clone()));\n    if (s == "ab") {\n        return;\n    }\n}\n',
        ],
        [
            'int-compare',
            'fn f() {\n    let mut n: Value = Value::Int(2);\n    if is_less_than(&n, &Value::Int(3)) {\n        n = Value::Int(4);\n    }\n}\n',
            'fn f() {\n    let mut n: i64 = 2;\n    if (n < 3) {\n        n = 4;\n    }\n}\n',
        ],
        [
            'bool-truthy',
            'fn f() {\n    let mut b: Value = Value::Bool(false);\n    if is_true(&b) {\n        b = Value::Bool(true);\n    }\n}\n',
            'fn f() {\n    let mut b: bool = false;\n    if b {\n        b = true;\n    }\n}\n',
        ],
        [
            'vec-len-and-push',
            'fn f() {\n    let mut xs: Value = Value::from(vec![]);\n    if let Value::Arr(__a_1) = &mut xs { std::sync::Arc::make_mut(__a_1).push(one()); }\n    append_to_array(&mut xs, two());\n    let n: Value = get_array_length(&xs);\n}\n',
            'fn f() {\n    let mut xs: Vec<Value> = vec![];\n    xs.push(one());\n    xs.push(two());\n    let n: Value = Value::Int(xs.len() as i64);\n}\n',
        ],
        [
            'map-reads-and-writes',
            'fn f() {\n    let mut d: Value = Value::Map({\n        let mut m = indexmap::IndexMap::new();\n        m\n    });\n    add_element_to_object(&mut d, &Value::Str("k".into()), v);\n    if in_op(&d, &Value::Str("k".into())) {\n        let x: Value = get_value(&d, &Value::Str("k".into()));\n    }\n}\n',
            'fn f() {\n    let mut d: indexmap::IndexMap<String, Value> = {\n        let mut m = indexmap::IndexMap::new();\n        m\n    };\n    d.insert("k".to_string(), v);\n    if d.contains_key("k") {\n        let x: Value = d.get("k").cloned().unwrap_or(Value::Null);\n    }\n}\n',
        ],
        [
            'map-index-write-then-extend',
            'fn f() {\n    if c {\n        let mut u: Value = Value::Map({\n            let mut m = indexmap::IndexMap::new();\n            m\n        });\n        if let Value::Dict(__d) = &mut u { std::sync::Arc::make_mut(__d).insert("k".into(), v); }\n        a = self.extend(a.clone(), &[u]);\n    } else {\n        let mut u: Value = Value::Map({\n            let mut m = indexmap::IndexMap::new();\n            m\n        });\n    }\n}\n',
            'fn f() {\n    if c {\n        let mut u: indexmap::IndexMap<String, Value> = {\n            let mut m = indexmap::IndexMap::new();\n            m\n        };\n        u.insert("k".into(), v);\n        a = self.extend(a.clone(), &[Value::Map(u)]);\n    } else {\n        let mut u: Value = Value::Map({\n            let mut m = indexmap::IndexMap::new();\n            m\n        });\n    }\n}\n',
        ],
        [
            'unproven-use-keeps-value',
            'fn f() {\n    let mut s: Value = Value::Str("a".into());\n    self.sign(s.clone());\n}\n',
            'fn f() {\n    let mut s: Value = Value::Str("a".into());\n    self.sign(s.clone());\n}\n',
            [
                "fmt-arg-slot",
                "fn f() {\n    let mut s: Value = Value::Str(\"ab\".into());\n    let t: Value = Value::str(format!(\"x{}\", s));\n    if is_equal(&s, &Value::Str(\"ab\".into())) {\n        return;\n    }\n}\n",
                "fn f() {\n    let mut s: String = \"ab\".into();\n    let t: Value = Value::str(format!(\"x{}\", s));\n    if (s == \"ab\") {\n        return;\n    }\n}\n",
            ],
            [
                "nonmut-let",
                "fn f() {\n    let s: Value = Value::Str(\"ab\".into());\n    let t: Value = Value::str(format!(\"x{}\", s));\n    if is_equal(&s, &Value::Str(\"ab\".into())) {\n        return;\n    }\n}\n",
                "fn f() {\n    let s: String = \"ab\".into();\n    let t: Value = Value::str(format!(\"x{}\", s));\n    if (s == \"ab\") {\n        return;\n    }\n}\n",
            ],
            [
                "rev-lit-compare",
                "fn f() {\n    let mut n: Value = Value::Int(2);\n    if is_less_than(&Value::Int(3), &n) {\n        n = Value::Int(4);\n    }\n}\n",
                "fn f() {\n    let mut n: i64 = 2;\n    if (3 < n) {\n        n = 4;\n    }\n}\n",
            ],
            [
                "tostr-int",
                "fn f() {\n    let mut n: Value = Value::Int(5);\n    let s: Value = to_string_val(&n);\n}\n",
                "fn f() {\n    let mut n: i64 = 5;\n    let s: Value = Value::str(n.to_string());\n}\n",
            ],
            [
                "bool-matches",
                "fn f() {\n    let mut b: Value = Value::Bool(true);\n    if matches!(&b, Value::Bool(true)) {\n        b = Value::Bool(false);\n    }\n}\n",
                "fn f() {\n    let mut b: bool = true;\n    if b {\n        b = false;\n    }\n}\n",
            ],
            [
                "value-str-rebox",
                "fn f() {\n    let mut s: Value = Value::Str(\"ab\".into());\n    m.insert(\"k\".to_string(), Value::str(s.clone()));\n    if is_equal(&s, &Value::Str(\"ab\".into())) {\n        return;\n    }\n}\n",
                "fn f() {\n    let mut s: String = \"ab\".into();\n    m.insert(\"k\".to_string(), Value::str(s.clone()));\n    if (s == \"ab\") {\n        return;\n    }\n}\n",
            ],
            [
                "as-str-compare",
                "fn f() {\n    let mut s: Value = Value::Str(\"ab\".into());\n    if s.as_str() == Some(\"ab\") {\n        s = Value::Str(\"cd\".into());\n    }\n}\n",
                "fn f() {\n    let mut s: String = \"ab\".into();\n    if (s == \"ab\") {\n        s = \"cd\".into();\n    }\n}\n",
            ],
            [
                "as-f64-compare",
                "fn f() {\n    let mut n: Value = Value::Int(5);\n    if n.as_f64().unwrap_or(f64::NAN) < (3i64) as f64 {\n        n = Value::Int(4);\n    }\n}\n",
                "fn f() {\n    let mut n: i64 = 5;\n    if (n as f64) < (3i64) as f64 {\n        n = 4;\n    }\n}\n",
            ],
        ],
    ];
    const fails: string[] = [];
    for (const [label, src, want] of cases) {
        const got = rustTypedLocals(src);
        if (got !== want) fails.push(`${label}: got\n${got}\nwant\n${want}`);
    }
    return fails;
}

// ---- callee-shape container ops ----
// A local bound to a generated method's return carries the callee's proven container shape (every return builds
// one fresh, marker-free `dict`/`arr`), so its helper reads/writes print native. Signatures stay `-> Value`.


type CalleeShape = 'dict' | 'arr';

// Keys `get_value` routes through a book/cache store, and the keys that tag a
// container as a live book/cache handle. A proven-fresh container holds none.
const CALLEE_SHAPE_ROUTED = new Set(['cache', 'hashmap', 'subscriptions', 'futures', 'timestamp', 'datetime', 'nonce', 'symbol', 'checksum']);
const CALLEE_SHAPE_MARKER = ['__book_id', '__cache_id', '__cacheKind', '__sideKind', '__live_id'];

const CALLEE_SHAPE_BASE_FILE = 'rust/ccxt-common/src/exchange_generated.rs';
let baseCalleeShapes: Map<string, CalleeShape> | undefined = undefined;

/** Blank string literals and line comments, same length as the input. */
function calleeShapeMask(src: string): string {
    let out = '';
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (c === '/' && src[i + 1] === '/') {
            while (i < src.length && src[i] !== '\n') { out += ' '; i++; }
            continue;
        }
        if (c === '"') {
            out += ' ';
            i++;
            while (i < src.length && src[i] !== '"') {
                if (src[i] === '\n') { out += '\n'; i++; continue; }
                if (src[i] === '\\') { out += '  '; i += 2; continue; }
                out += ' ';
                i++;
            }
            if (i < src.length) { out += ' '; i++; }
            continue;
        }
        out += c;
        i++;
    }
    return out;
}

/** Index of the delimiter closing the one at `open`, or -1. */
function calleeShapeClose(src: string, open: number): number {
    const openCh = src[open];
    const closeCh = openCh === '(' ? ')' : openCh === '[' ? ']' : openCh === '{' ? '}' : '';
    if (closeCh === '') return -1;
    let depth = 0;
    for (let k = open; k < src.length; k++) {
        const c = src[k];
        if (c === openCh) depth++;
        else if (c === closeCh) {
            depth--;
            if (depth === 0) return k;
        }
    }
    return -1;
}

/** Top-level argument spans of the call whose `(` is at `open`. */
function calleeShapeArgs(masked: string, open: number, close: number): [number, number][] | undefined {
    const spans: [number, number][] = [];
    let depth = 0;
    let start = open + 1;
    for (let k = open + 1; k < close; k++) {
        const c = masked[k];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
        else if (c === ',' && depth === 0) {
            spans.push([start, k]);
            start = k + 1;
        }
    }
    if (masked.slice(start, close).trim() !== '') spans.push([start, close]);
    return spans;
}

/** End index (the `;`) of the statement starting at `from`, or -1. */
function calleeShapeStmtEnd(masked: string, from: number): number {
    let depth = 0;
    for (let k = from; k < masked.length; k++) {
        const c = masked[k];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') {
            depth--;
            if (depth < 0) return -1;
        } else if (c === ';' && depth === 0) return k;
    }
    return -1;
}

/** Depth-0 `return` expressions of a body. */
function calleeShapeReturns(masked: string): string[] {
    const out: string[] = [];
    const rx = /(?<![A-Za-z0-9_])return\b/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(masked)) !== null) {
        const end = calleeShapeStmtEnd(masked, m.index + 6);
        if (end < 0) continue;
        out.push(masked.slice(m.index + 6, end).trim());
    }
    return out;
}

/** The bare tail expression of a body (no trailing `;`), or undefined. */
function calleeShapeTail(body: string): string | undefined {
    const t = body.replace(/\s+$/, '');
    if (t === '' || t.endsWith(';')) return undefined;
    const cut = t.lastIndexOf(';');
    const tail = (cut < 0 ? t : t.slice(cut + 1)).trim();
    if (tail === '' || /^(?:if|match|while|for|loop|\{)/.test(tail)) return undefined;
    return tail;
}

/** True when the bare tail is unreachable: the statement before it returns. */
function calleeShapeTailIsDead(body: string): boolean {
    const cut = body.replace(/\s+$/, '').lastIndexOf(';');
    if (cut < 0) return false;
    let depth = 0;
    let k = cut - 1;
    for (; k >= 0; k--) {
        const c = body[k];
        if (c === ')' || c === ']' || c === '}') depth++;
        else if (c === '(' || c === '[' || c === '{') { depth--; if (depth < 0) break; }
        else if (c === ';' && depth === 0) break;
    }
    return /^\s*return\b/.test(body.slice(k + 1, cut));
}

/** Shape of the container a return expression builds from scratch, if it does. */
function freshCalleeShape(t: string): CalleeShape | undefined {
    const s = t.replace(/^\(+/, '').trim();
    if (/^Value::(?:Map|Dict)\(/.test(s)) {
        const open = s.indexOf('(');
        // A literal payload: `Value::Map({ .. })` / `Value::Map(indexmap::IndexMap::new())`.
        if (/^Value::(?:Map|Dict)\(\s*(?:\{|indexmap::IndexMap::new\(\)|HashMap::new\(\))/.test(s)) return 'dict';
        void open;
        return undefined;
    }
    if (/^Value::(?:Array|List)\(\s*(?:vec!\[|std::sync::Arc::new\(\s*vec!\[)/.test(s)) return 'arr';
    if (/^Value::from\(\s*(?:std::sync::Arc::new\(\s*)?vec!\[/.test(s)) return 'arr';
    return undefined;
}

/** The single declaration of a local in a region, with its initializer text. */
function calleeShapeDecl(region: string, name: string): { init: string } | undefined {
    const rx = new RegExp('\\blet (?:mut )?' + name + '\\s*(?::\\s*[^=;]+)?=\\s*', 'g');
    let hit: RegExpExecArray | null = null;
    let count = 0;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(region)) !== null) { hit = m; count++; }
    if (count !== 1 || hit === null) return undefined;
    return { init: region.slice(hit.index + hit[0].length, hit.index + hit[0].length + 400) };
}

/** Arity-independent shape table for `pub fn NAME(...) -> Value` methods. */
function methodCalleeShapes(content: string, masked: string, loose = false): Map<string, CalleeShape> {
    const shapes = new Map<string, CalleeShape>();
    const hdr = loose ? /\n {4}(?:pub )?fn (\w+)\s*\(/g : /\n {4}pub fn (\w+)\s*\(/g;
    let hm: RegExpExecArray | null;
    while ((hm = hdr.exec(masked)) !== null) {
        const lineEnd = masked.indexOf('\n', hm.index + 1);
        const line = masked.slice(hm.index, lineEnd < 0 ? masked.length : lineEnd);
        if (!/->\s*(?:crate::)?Value\b/.test(line)) continue;
        const open = masked.indexOf('(', hm.index);
        const close = calleeShapeClose(masked, open);
        if (close < 0) continue;
        const braceOpen = masked.indexOf('{', close);
        if (braceOpen < 0) continue;
        if (!/^(?:->\s*(?:crate::)?Value)?$/.test(masked.slice(close + 1, braceOpen).trim())) continue;
        const braceClose = calleeShapeClose(masked, braceOpen);
        if (braceClose < 0) continue;
        const body = masked.slice(braceOpen + 1, braceClose);
        const exprs = calleeShapeReturns(body);
        if (exprs.length === 0) continue;
        // A body that ends in a bare tail expression can also fall through to it.
        const tail = calleeShapeTail(body);
        if (tail !== undefined && !calleeShapeTailIsDead(body)) {
            exprs.push(tail);
        }
        const kinds = new Set<CalleeShape | 'other'>();
        for (const e of exprs) {
            // A base default starts with a virtual-dispatch arm that returns the
            // override's own value; no override in this file means it never fires.
            if (loose && /^__\w+$/.test(e)) continue;
            kinds.add(freshCalleeShape(e) ?? 'other');
        }
        if (kinds.size !== 1) continue;
        const only = [...kinds][0];
        if (only === 'other') continue;
        shapes.set(hm[1], only);
    }
    return shapes;
}

/** Base-tier shape table, read from the generated base (cached). */
function baseCalleeShapeTable(): Map<string, CalleeShape> {
    if (baseCalleeShapes !== undefined) return baseCalleeShapes;
    baseCalleeShapes = new Map<string, CalleeShape>();
    try {
        const src = fs.readFileSync(CALLEE_SHAPE_BASE_FILE, 'utf8');
        baseCalleeShapes = methodCalleeShapes(src, calleeShapeMask(src), true);
    } catch (e: any) {
        if (e === undefined || e.code !== 'ENOENT') throw e;
    }
    return baseCalleeShapes;
}

const CALLEE_SHAPE_PASSTHROUGH = new Set(['extend', 'omit', 'keysort', 'clone_value']);

class CalleeShapeProver {
    private region: string;
    private masked: string;
    private own: Map<string, CalleeShape>;
    private base: Map<string, CalleeShape>;
    private visiting = new Set<string>();

    constructor(region: string, maskedRegion: string, own: Map<string, CalleeShape>, base: Map<string, CalleeShape>) {
        this.region = region;
        this.masked = maskedRegion;
        this.own = own;
        this.base = base;
    }

    /** Shape of the local `name` in this region, or undefined when unproven. */
    shape(name: string): CalleeShape | undefined {
        if (this.visiting.has(name)) return undefined;
        this.visiting.add(name);
        const out = this.prove(name);
        this.visiting.delete(name);
        return out;
    }

    private prove(name: string): CalleeShape | undefined {
        const decl = calleeShapeDecl(this.masked, name);
        if (decl === undefined) return undefined;
        return this.shapeOfInit(decl.init);
    }

    private shapeOfInit(init: string): CalleeShape | undefined {
        const fresh = freshCalleeShape(init);
        if (fresh !== undefined) return fresh;
        const call = /^self\.(\w+)\s*\(/.exec(init);
        if (call === null) return undefined;
        const callee = call[1];
        const own = this.own.get(callee);
        if (own !== undefined) return own;
        const base = this.base.get(callee);
        if (base !== undefined) return base;
        if (CALLEE_SHAPE_PASSTHROUGH.has(callee)) {
            // A copy of its first argument keeps that argument's container shape.
            const open = init.indexOf('(');
            const close = calleeShapeClose(init, open);
            if (close < 0) return undefined;
            const args = calleeShapeArgs(init, open, close);
            if (args === undefined || args.length === 0) return undefined;
            const first = init.slice(args[0][0], args[0][1]).trim();
            if (!/^[a-z_][A-Za-z0-9_]*$/.test(first)) return undefined;
            return this.shape(first);
        }
        return undefined;
    }
}

/** Literal string key of an argument (`&Value::Str("k".into())`), else undefined. */
function calleeShapeLiteralKey(arg: string | undefined): string | undefined {
    if (arg === undefined) return undefined;
    const m = /^&\s*Value::Str\(\s*("(?:[^"\\]|\\.)*")\s*(?:\.into\(\)|\.to_string\(\))?\s*\)$/.exec(arg.trim());
    return m === null ? undefined : m[1].slice(1, -1);
}

/** True when a `&mut name` receiver is only used by the writes this pass keeps. */
function calleeShapePlainReceiver(region: string, name: string): boolean {
    const rx = new RegExp('&mut ' + name + '(?![A-Za-z0-9_])', 'g');
    let m: RegExpExecArray | null;
    while ((m = rx.exec(region)) !== null) {
        const before = region.slice(Math.max(0, m.index - 40), m.index);
        if (/(?:add_element_to_object|get_value_mut|set_value)\($/.test(before)) continue;
        if (/if let Value::(?:Dict|Arr|Map)\(\s*__\w+\s*\)\s*=\s*$/.test(before)) continue;
        return false;
    }
    return true;
}

/** True when the local is never reassigned to another expression. */
function calleeShapeSingleWrite(region: string, name: string): boolean {
    const rx = new RegExp('(?<![A-Za-z0-9_.])' + name + '\\s*=\\s*(?!=)', 'g');
    let m: RegExpExecArray | null;
    while ((m = rx.exec(region)) !== null) {
        const before = region.slice(Math.max(0, m.index - 5), m.index);
        if (/\blet $/.test(before) || /\blet mut $/.test(region.slice(Math.max(0, m.index - 8), m.index))) continue;
        return false;
    }
    return true;
}

export interface CalleeShapeStats { sites: number }

/** Rewrite helper calls on a proven callee-shaped local to the native op. */
export function calleeShapeContainerOps(content: string, stats?: CalleeShapeStats): string {
    if (content.indexOf('add_element_to_object(') < 0 && content.indexOf('get_value(&') < 0
        && content.indexOf('in_op(') < 0 && content.indexOf('object_keys(') < 0
        && content.indexOf('object_values(') < 0 && content.indexOf('get_array_length(') < 0) return content;
    const masked = calleeShapeMask(content);
    const own = methodCalleeShapes(content, masked);
    const base = baseCalleeShapeTable();
    const heads: number[] = [];
    const hdr = /^[ \t]*(?:pub(?:\([a-z]+\))? )?(?:async )?fn /gm;
    let hm: RegExpExecArray | null;
    while ((hm = hdr.exec(masked)) !== null) heads.push(hm.index);
    heads.push(content.length);

    type Edit = { start: number, end: number, text: string };
    const edits: Edit[] = [];
    const FAM = /(?<![A-Za-z0-9_:.])(add_element_to_object|get_value|in_op|object_keys|object_values|get_array_length)\(/g;

    for (let h = 0; h + 1 < heads.length; h++) {
        const from = heads[h];
        const to = heads[h + 1];
        const maskedRegion = masked.slice(from, to);
        const prover = new CalleeShapeProver(content.slice(from, to), maskedRegion, own, base);
        FAM.lastIndex = 0;
        let fm: RegExpExecArray | null;
        while ((fm = FAM.exec(maskedRegion)) !== null) {
            const name = fm[1];
            const open = fm.index + fm[0].length - 1;
            const close = calleeShapeClose(maskedRegion, open);
            if (close < 0) continue;
            const spans = calleeShapeArgs(maskedRegion, open, close);
            if (spans === undefined) continue;
            let recv: string | undefined;
            let keyArg: string | undefined;
            let valueStart = -1;
            if (name === 'add_element_to_object') {
                if (spans.length !== 3) continue;
                const first = maskedRegion.slice(spans[0][0], spans[0][1]).trim();
                const head = /^&mut\s+([a-z_][A-Za-z0-9_]*)$/.exec(first);
                if (head === null) continue;
                recv = head[1];
                keyArg = content.slice(from + spans[1][0], from + spans[1][1]);
                valueStart = spans[2][0];
            } else if (name === 'get_array_length' || name === 'object_keys' || name === 'object_values') {
                if (spans.length !== 1) continue;
                const head = /^&\s*([a-z_][A-Za-z0-9_]*)$/.exec(maskedRegion.slice(spans[0][0], spans[0][1]).trim());
                if (head === null) continue;
                recv = head[1];
            } else {
                if (spans.length !== 2) continue;
                const head = /^&\s*([a-z_][A-Za-z0-9_]*)$/.exec(maskedRegion.slice(spans[0][0], spans[0][1]).trim());
                if (head === null) continue;
                recv = head[1];
                keyArg = content.slice(from + spans[1][0], from + spans[1][1]);
            }
            const shape = prover.shape(recv);
            if (shape === undefined) continue;
            if (name === 'get_array_length') {
                if (shape !== 'arr') continue;
                if (!calleeShapeSingleWrite(maskedRegion, recv)) continue;
                edits.push({ start: from + fm.index, end: from + close + 1, text: `Value::Int(${recv}.len() as i64)` });
                continue;
            }
            if (shape !== 'dict') continue;
            if (!calleeShapePlainReceiver(maskedRegion, recv) || !calleeShapeSingleWrite(maskedRegion, recv)) continue;
            if (name === 'add_element_to_object') {
                const key = calleeShapeLiteralKey(keyArg);
                if (key === undefined || CALLEE_SHAPE_MARKER.indexOf(key) >= 0) continue;
                const valueEnd = spans[2][1];
                const value = content.slice(from + valueStart, from + valueEnd).trim();
                // Absorb the statement's `;` so the block never trails it.
                const stmtEnd = maskedRegion[close + 1] === ';' ? close + 2 : close + 1;
                edits.push({
                    start: from + fm.index,
                    end: from + stmtEnd,
                    text: `if let Value::Dict(__r03d) = &mut ${recv} { std::sync::Arc::make_mut(__r03d).insert("${key}".into(), ${value}); }`,
                });
                continue;
            }
            const key = calleeShapeLiteralKey(keyArg);
            if (key === undefined || CALLEE_SHAPE_ROUTED.has(key) || CALLEE_SHAPE_MARKER.indexOf(key) >= 0) continue;
            if (name === 'get_value') {
                edits.push({
                    start: from + fm.index,
                    end: from + close + 1,
                    text: `${recv}.as_map().unwrap().get("${key}").cloned().unwrap_or(Value::Null)`,
                });
            } else if (name === 'in_op') {
                if (!calleeShapeBoolPosition(maskedRegion, fm.index)) continue;
                edits.push({
                    start: from + fm.index,
                    end: from + close + 1,
                    text: `matches!(&${recv}, Value::Dict(__r03k) if __r03k.contains_key("${key}"))`,
                });
            } else {
                const body = name === 'object_keys'
                    ? '__m.keys().map(|__k| Value::Str(__k.clone().into())).collect()'
                    : '__m.values().cloned().collect()';
                edits.push({
                    start: from + fm.index,
                    end: from + close + 1,
                    text: `Value::Array(${recv}.as_map().map(|__m| ${body}).unwrap_or_default())`,
                });
            }
        }
    }
    if (edits.length === 0) return content;
    // Outermost first, so a nested rewrite never shifts an outer span.
    edits.sort((a, b) => a.start - b.start || b.end - a.end);
    let out = '';
    let at = 0;
    let count = 0;
    for (const e of edits) {
        if (e.start < at) continue;
        out += content.slice(at, e.start) + e.text;
        at = e.end;
        count++;
    }
    out += content.slice(at);
    if (stats !== undefined) stats.sites += count;
    return out;
}

/** True when the call at `pos` sits in a Rust bool position (if/while head). */
function calleeShapeBoolPosition(masked: string, pos: number): boolean {
    const lineStart = masked.lastIndexOf('\n', pos) + 1;
    const pre = masked.slice(lineStart, pos).trim();
    const headed = /^(?:\}\s*else\s+)?(?:if|while)$/.test(pre);
    const wrapped = /is_true\(&$/.test(pre);
    return headed || wrapped;
}

/** Self-test: the rule fires on a proven callee and leaves an unproven one alone. */
export function calleeShapeContainerOpsSelfTest(): string[] {
    const problems: string[] = [];
    const dictFn = (body: string) => "\n    pub fn parse_thing(&self, mut x: Value) -> Value {\n" + body + "\n    Value::Null\n}\n";
    const wrapper = (call: string) => "\n    pub fn use_it(&self, mut data: Value) -> Value {\n        let mut parsed: Value = " + call + ";\n        add_element_to_object(&mut parsed, &Value::Str(\"nonce\".into()), self.safe_integer_k(data, \"u\", &[]));\n        let mut n: Value = get_value(&parsed, &Value::Str(\"bids\"));\n        return parsed;\n    }\n";
    const src = dictFn('        return Value::Map({\n    let mut m = indexmap::IndexMap::new();\n        m.insert("symbol".to_string(), x);\n    m\n});') + wrapper('self.parse_thing(data.clone())');
    const out = calleeShapeContainerOps(src);
    if (out.indexOf('add_element_to_object(') >= 0) problems.push('proven dict insert not native\n' + out);
    if (out.indexOf('get_value(&') >= 0) problems.push('proven dict read not native\n' + out);
    if (out.indexOf('std::sync::Arc::make_mut(__r03d).insert("nonce".into()') < 0) problems.push('insert text differs\n' + out);
    if (out.indexOf('parsed.as_map().unwrap().get("bids")') < 0) problems.push('read text differs\n' + out);
    // Re-boxed return: the local keeps the `Value` slot, so `return parsed;` stays.
    if (out.indexOf('return parsed;') < 0) problems.push('return slot must stay boxed\n' + out);
    // Idempotent: nothing left to rewrite on a second run.
    if (calleeShapeContainerOps(out) !== out) problems.push('not idempotent\n' + out);
    // A callee that can return Null keeps every site as printed.
    const loose = dictFn('        if (x.as_bool() == Some(true)) {\n            return Value::Map({\n    let mut m = indexmap::IndexMap::new();\n    m\n});\n        }\n        return Value::Null;') + wrapper('self.parse_thing(data.clone())');
    const kept = calleeShapeContainerOps(loose);
    if (kept.indexOf('add_element_to_object(&mut parsed') < 0) problems.push('unproven callee was rewritten\n' + kept);
    // A routed key keeps the helper (the runtime store lookup is not `.get`).
    const routed = dictFn('        return Value::Map({\n    let mut m = indexmap::IndexMap::new();\n        m.insert("symbol".to_string(), x);\n    m\n});')
        + `    pub fn use_it(&self, mut data: Value) -> Value {\n        let mut parsed: Value = self.parse_thing(data.clone());\n        let mut n: Value = get_value(&parsed, &Value::Str("timestamp"));\n        return parsed;\n    }\n`;
    const keptRead = calleeShapeContainerOps(routed);
    if (keptRead.indexOf('get_value(&parsed, &Value::Str("timestamp"))') < 0) problems.push('routed key rewritten\n' + keptRead);
    return problems;
}

// ---- bool-proven callee is_true ----
// When every return of every same-file declaration of a `-> Value` method is `Value::Bool`, a bool `safe_bool*`, a
// proven bool local or `Value::Null`, `is_true(&call)` reduces to `.as_bool() == Some(true)`. Runs after nativeBoolScalars.

interface BoolCalleeRegion { start: number, end: number, name: string, ret: string, body: string }

/** Blank out string literals and comments, preserving every offset. */
function boolCalleeMask (text: string): string {
    const out = text.split('');
    const n = out.length;
    let i = 0;
    while (i < n) {
        const c = out[i];
        if (c === '"') {
            let j = i + 1;
            while (j < n && out[j] !== '"') {
                if (out[j] === '\\') j += 1;
                j += 1;
            }
            for (let k = i + 1; k < j && k < n; k++) out[k] = ' ';
            i = j + 1;
            continue;
        }
        if (c === '/' && out[i + 1] === '/') {
            let j = i;
            while (j < n && out[j] !== '\n') { out[j] = ' '; j += 1; }
            i = j;
            continue;
        }
        i += 1;
    }
    return out.join('');
}

function boolCalleeClose (masked: string, open: number): number {
    let depth = 0;
    for (let i = open; i < masked.length; i++) {
        const c = masked[i];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

function boolCalleeStrip (src: string): string {
    let s = src.trim();
    while (s.startsWith('(') && boolCalleeClose(s, 0) === s.length - 1) s = s.slice(1, -1).trim();
    return s;
}

const BOOL_CALLEE_FN = /\n[ \t]*(?:pub )?(?:async )?fn (\w+)/g;

function boolCalleeRegions (masked: string): BoolCalleeRegion[] {
    const heads: number[] = [0];
    for (const m of masked.matchAll(BOOL_CALLEE_FN)) heads.push((m.index as number) + 1);
    heads.push(masked.length);
    const out: BoolCalleeRegion[] = [];
    for (let h = 0; h + 1 < heads.length; h++) {
        const seg = masked.slice(heads[h], heads[h + 1]);
        const head = /^[ \t]*(?:pub )?(?:async )?fn (\w+)\s*(?:<[^>]*>)?\s*\(/.exec(seg);
        if (head === null) continue;
        const open = seg.indexOf('(', head[0].length - 1);
        const close = boolCalleeClose(seg, open);
        if (close < 0) continue;
        const brace = seg.indexOf('{', close);
        out.push({ start: heads[h], end: heads[h + 1], name: head[1], ret: brace < 0 ? '' : seg.slice(close + 1, brace), body: brace < 0 ? '' : seg.slice(brace) });
    }
    return out;
}

/** Value expressions a `return`/tail can hand back, `undefined` when not a `Value` fn. */
function boolCalleeRetExprs (region: BoolCalleeRegion): string[] | undefined {
    if (!/^\s*->\s*(?:crate::)?Value\s*$/.test(region.ret.replace(/\s+/g, ' '))) return undefined;
    const body = region.body;
    const rets: string[] = [];
    for (const m of body.matchAll(/\breturn\b/g)) {
        const at = (m.index as number) + m[0].length;
        let depth = 0;
        let j = at;
        for (; j < body.length; j++) {
            const c = body[j];
            if (c === '(' || c === '[' || c === '{') depth++;
            else if (c === ')' || c === ']' || c === '}') {
                if (depth === 0) break;
                depth--;
            } else if (c === ';' && depth === 0) break;
        }
        rets.push(body.slice(at, j));
    }
    // Tail expression: the last `;`-free statement before the fn's closing brace.
    const close = body.lastIndexOf('}');
    const tailEnd = body.slice(0, close).replace(/\s+$/, '');
    const semi = tailEnd.lastIndexOf(';');
    const braceOpen = tailEnd.lastIndexOf('{');
    if (semi > braceOpen || (semi < 0 && braceOpen < 0)) {
        const tail = tailEnd.slice(semi + 1).trim();
        if (tail !== '' && !tail.startsWith('}')) rets.push(tail);
    }
    if (rets.length === 0) return undefined;
    return rets;
}

function boolCalleeSafeBoolDefault (call: string): boolean | undefined {
    const open = call.indexOf('(');
    const close = boolCalleeClose(call, open);
    if (close < 0) return undefined;
    const inner = call.slice(open + 1, close);
    const listAt = inner.lastIndexOf('&[');
    if (listAt < 0) return undefined;
    const list = boolCalleeStrip(inner.slice(listAt));
    if (!list.startsWith('&[') || !list.endsWith(']')) return undefined;
    const items = list.slice(2, -1).trim();
    if (items === '') return true;
    const one = boolCalleeStrip(items);
    if (/^Value::Bool\((?:true|false)\)$/.test(one)) return true;
    if (one === 'Value::Null') return true;
    return undefined;
}

// Hand-written (non-generated) helpers whose every return is `Value::Bool`:
// exchange_stubs.rs `in_array`/`is_json_encoded_object`, precise.rs `stringEq|Gt|Ge|Lt|Le|Equals`
// (`vbool` and the early `any_null` arm both build `Value::Bool`).
const BOOL_CALLEE_BASE = /^(?:in_array|is_json_encoded_object)$/;
const BOOL_CALLEE_PRECISE = /^string(?:Eq|Gt|Ge|Lt|Le|Equals)$/;

type BoolCalleeVariants = Set<'bool' | 'int' | 'float' | 'str' | 'null'>

const BOOL_CALLEE_BOOLISH = (v: BoolCalleeVariants): boolean => [...v].every((x) => x === 'bool' || x === 'null');

/**
 * Variants an expression can evaluate to, or undefined when unproven.
 * `self.<fn>` resolves through the same file's declarations (depth-limited).
 */
function boolCalleeVariant (expr: string, masked: string, byName: Map<string, BoolCalleeRegion[]>, region: BoolCalleeRegion, depth: number, visiting: Set<string>): BoolCalleeVariants | undefined {
    if (depth > 6) return undefined;
    let e = boolCalleeStrip(expr);
    while (e.endsWith('.clone()')) e = boolCalleeStrip(e.slice(0, -'.clone()'.length));
    while (e.endsWith('.await')) e = e.slice(0, -'.await'.length).trim();
    const lit = /^Value::(Bool|Int|Float|Str)\(/.exec(e);
    if (lit !== null && boolCalleeClose(e, 'Value::'.length + lit[1].length) === e.length - 1) {
        return new Set<any>([lit[1].toLowerCase()]);
    }
    if (e === 'Value::Null' || e === 'crate::Value::Null') return new Set<any>(['null']);
    if (/^\(?if .+\)?$/.test(e) && e.includes('} else {')) {
        const at = e.indexOf('} else {');
        const a = boolCalleeVariant(e.slice(e.indexOf('{') + 1, at), masked, byName, region, depth, visiting);
        const b = boolCalleeVariant(e.slice(at + '} else {'.length, e.lastIndexOf('}')), masked, byName, region, depth, visiting);
        if (a !== undefined && b !== undefined) return new Set<any>([...a, ...b]);
        return undefined;
    }
    const precise = /^crate::precise::Precise::(\w+)\((?:(?!\()[^()]|\((?!\()(?:[^()]|\([^()]*\))*\))*\)$/.exec(e);
    if (precise !== null && /^string(?:Eq|Gt|Ge|Lt|Le|Equals)$/.test(precise[1])) return new Set<any>(['bool']);
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(e)) {
        const writes = boolCalleeWrites(masked, e, region);
        if (writes === undefined) return undefined;
        let acc: BoolCalleeVariants | undefined = undefined;
        for (const w of writes) {
            const v = boolCalleeVariant(w, masked, byName, region, depth + 1, visiting);
            if (v === undefined) return undefined;
            acc = acc === undefined ? v : new Set<any>([...acc].filter((x) => v.has(x)));
        }
        return acc;
    }
    const call = /^self\.([a-z_][a-z0-9_]*)\s*\(/.exec(e);
    if (call !== null && boolCalleeClose(e, 'self.'.length + call[1].length) === e.length - 1) {
        if (BOOL_CALLEE_BASE.test(call[1])) return new Set<any>(['bool']);
        if (/^safe_bool(_2|_k)?$/.test(call[1])) {
            return boolCalleeSafeBoolDefault(e) === true ? new Set<any>(['bool', 'null']) : undefined;
        }
        return boolCalleeReturnVariant(call[1], masked, byName, depth + 1, visiting);
    }
    return undefined;
}

/** Union of every return expression of every same-file declaration of `name`. */
function boolCalleeReturnVariant (name: string, masked: string, byName: Map<string, BoolCalleeRegion[]>, depth: number, visiting: Set<string>): BoolCalleeVariants | undefined {
    if (visiting.has(name) || depth > 6) return undefined;
    const decls = byName.get(name);
    if (decls === undefined || decls.length === 0) return undefined;
    const next = new Set(visiting);
    next.add(name);
    let acc: BoolCalleeVariants | undefined = undefined;
    for (const decl of decls) {
        const rets = boolCalleeRetExprs(decl);
        if (rets === undefined) return undefined;
        for (const r of rets) {
            const v = boolCalleeVariant(r, masked, byName, decl, depth + 1, next);
            if (v === undefined) return undefined;
            acc = acc === undefined ? v : new Set<any>([...acc, ...v]);
        }
    }
    return acc;
}

/** Every right-hand side written to local `ident` inside `region`, or undefined when it can be rebound. */
function boolCalleeWrites (masked: string, ident: string, region: BoolCalleeRegion): string[] | undefined {
    const esc = ident.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const body = masked.slice(region.start, region.end);
    const shadow = new RegExp(`\\|(?!\\|)[^|\\n]*\\b${esc}\\b[^|\\n]*\\|(?!\\|)|\\bfor [^\\n]*\\b${esc}\\b[^\\n]* in |\\blet \\([^)]*\\b${esc}\\b`);
    if (shadow.test(body)) return undefined;
    const writes: string[] = [];
    const spans: Array<[number, number]> = [];
    const letRe = new RegExp(`\\blet (?:mut )?${esc}\\b\\s*(?::\\s*([A-Za-z_][A-Za-z0-9_<>]*))?\\s*=`, 'g');
    for (const m of body.matchAll(letRe)) {
        const at = m.index as number;
        if (m[1] !== undefined && m[1] !== 'Value') return undefined;
        let depth = 0;
        let j = at + m[0].length;
        for (; j < body.length; j++) {
            const c = body[j];
            if (c === '(' || c === '[' || c === '{') depth++;
            else if (c === ')' || c === ']' || c === '}') {
                if (depth === 0) break;
                depth--;
            } else if (c === ';' && depth === 0) break;
        }
        writes.push(body.slice(at + m[0].length, j));
        spans.push([at, j]);
    }
    const assignRe = new RegExp(`(?<![A-Za-z0-9_.])${esc}\\s*=(?!=)`, 'g');
    for (const m of body.matchAll(assignRe)) {
        const at = m.index as number;
        if (spans.some(([s, e]) => at >= s && at < e)) continue;
        let depth = 0;
        let j = at + m[0].length;
        for (; j < body.length; j++) {
            const c = body[j];
            if (c === '(' || c === '[' || c === '{') depth++;
            else if (c === ')' || c === ']' || c === '}') {
                if (depth === 0) break;
                depth--;
            } else if (c === ';' && depth === 0) break;
        }
        writes.push(body.slice(at + m[0].length, j));
    }
    if (writes.length === 0) return undefined;
    return writes;
}

/** Text of the statement holding `pos`, up to `pos`. */
function boolCalleeStmtBefore (masked: string, pos: number): string {
    let depth = 0;
    for (let i = pos; i > 0; i--) {
        const c = masked[i - 1];
        if (c === ')' || c === ']') depth++;
        else if (c === '(' || c === '[') { if (depth > 0) depth--; }
        else if (depth === 0 && (c === ';' || c === '{' || c === '}' || c === '\n')) return masked.slice(i, pos);
    }
    return masked.slice(0, pos);
}

/** Drop the balanced operand that ends `s` (an operand of `&&` / `||`). */
function boolCalleeDropOperand (s: string): string {
    let depth = 0;
    for (let i = s.length - 1; i >= 0; i--) {
        const c = s[i];
        if (c === ')' || c === ']' || c === '}') depth++;
        else if (c === '(' || c === '[' || c === '{') {
            if (depth === 0) return s.slice(0, i);
            depth--;
            if (depth === 0 && !/[A-Za-z0-9_.)\]]/.test(s[i - 1] ?? '')) return s.slice(0, i);
        } else if (depth === 0) {
            if ((c === '&' && s[i - 1] === '&') || (c === '|' && s[i - 1] === '|')) return s.slice(0, i - 1);
            if (c === ',' || c === ';' || c === '=') return s.slice(0, i + 1);
            if (/[A-Za-z0-9_.)\]]/.test(c)) {
                let k = i;
                while (k >= 0 && /[A-Za-z0-9_.]/.test(s[k])) k--;
                return k < 0 ? s : s.slice(0, k + 1);
            }
        }
    }
    return '';
}

/** A `bool` is legal where `start` begins: a condition, a bool local, or a Value::Bool box. */
function boolCalleeBoolSlot (masked: string, start: number): boolean {
    let prefix = boolCalleeStmtBefore(masked, start);
    for (let hop = 0; hop < 60; hop++) {
        prefix = prefix.replace(/[\s!]+$/, '');
        if (/(?:^|[^\w])(?:if|while|for|assert)$/.test(prefix)) return true;
        if (/Value::Bool\($/.test(prefix)) return true;
        if (/(?:&&|\|\|)$/.test(prefix)) { prefix = boolCalleeDropOperand(prefix.slice(0, -2)); continue; }
        if (/[^=!<>]=$/.test(prefix)) return /:\s*bool\s*=?$/.test(prefix.slice(0, -1));
        if (/\($/.test(prefix)) { prefix = prefix.slice(0, -1); continue; }
        return false;
    }
    return false;
}

export function nativeBoolCallee (content: string): string {
    if (!content.includes('is_true(&')) return content;
    const masked = boolCalleeMask(content);
    const regions = boolCalleeRegions(masked);
    const byName = new Map<string, BoolCalleeRegion[]>();
    for (const r of regions) {
        const list = byName.get(r.name);
        if (list === undefined) byName.set(r.name, [r]);
        else list.push(r);
    }
    const edits: Array<{ start: number, end: number, text: string }> = [];
    for (const m of masked.matchAll(/(?<![A-Za-z0-9_:.])is_true\(&/g)) {
        const start = m.index as number;
        const open = start + 'is_true'.length;
        const close = boolCalleeClose(masked, open);
        if (close < 0) continue;
        const arg = content.slice(open + 1, close);
        if (arg.includes('\n')) continue;
        const expr = boolCalleeStrip(arg.replace(/^&/, ''));
        if (expr === '') continue;
        const region = regions.find((r) => start >= r.start && start < r.end);
        if (region === undefined) continue;
        if (!boolCalleeBoolSlot(masked, start)) continue;
        const variants = boolCalleeVariant(expr, masked, byName, region, 0, new Set());
        if (variants === undefined || !BOOL_CALLEE_BOOLISH(variants)) continue;
        let k = start - 1;
        while (k >= 0 && (masked[k] === ' ' || masked[k] === '\t')) k--;
        const negated = k >= 0 && masked[k] === '!' && masked[k - 1] !== '=';
        edits.push({ start: negated ? k : start, end: close + 1, text: `${expr}.as_bool() == Some(${negated ? 'false' : 'true'})` });
    }
    if (edits.length === 0) return content;
    let out = '';
    let at = 0;
    for (const e of edits) {
        if (e.start < at) continue;
        out += content.slice(at, e.start) + e.text;
        at = e.end;
    }
    return out + content.slice(at);
}

const BOOL_CALLEE_CASES: Array<[string, string, string]> = [
    ['bool-only callee', 'let mut u: Value = self.is_uta(&[]).await;\nif is_true(&u) {', 'u.as_bool() == Some(true)'],
    ['direct bool callee', 'if is_true(&self.is_linear(t.clone(), &[s])) {', 'self.is_linear(t.clone(), &[s]).as_bool() == Some(true)'],
    ['negated callee', 'if !is_true(&self.is_linear(t.clone(), &[])) {', 'self.is_linear(t.clone(), &[]).as_bool() == Some(false)'],
    ['mixed arm callee', 'if is_true(&self.mixed()) {', 'is_true(&self.mixed()'],
    ['unproven local', 'let mut u: Value = get_arg(o, 0, Value::Bool(false));\nif is_true(&u) {', 'is_true(&u'],
    ['option return', 'if is_true(&self.opt()) {', 'is_true(&self.opt()'],
    ['value slot', 'm.insert("k".into(), is_true(&self.is_linear(t.clone(), &[])));', 'is_true(&self.is_linear'],
];

/** Three arg shapes per callee body: every arm Bool, one arm mixed, unknown local. */
function boolCalleeFixture (body: string): string {
    return `    pub fn is_linear(&self, mut t: Value, optional_args: &[Value]) -> Value {\n        if (t == Value::Null) {\n            return Value::Bool(true);\n        }\n        return Value::Bool(false);\n\n    Value::Null\n}\n\n    pub fn opt(&self) -> Option<Value> {
        return Some(Value::Bool(true));
    }

    pub fn mixed(&self) -> Value {\n        return Value::Int(1);\n    }\n\n    pub async fn is_uta(&mut self, optional_args: &[Value]) -> Value {\n        let mut uta: Value = Value::Bool(self.safe_bool_k(self.options.clone(), "uta", &[]).as_bool() == Some(true));\n        return uta;\n\n    Value::Null\n}\n\n    pub fn f(&mut self, mut o: Value) -> Value {\n        ${body}\n        return Value::Null; }\n}\n`;
}

export function nativeBoolCalleeSelfTest (): string[] {
    const bad: string[] = [];
    for (const [name, body, want] of BOOL_CALLEE_CASES) {
        const src = boolCalleeFixture(body);
        const out = nativeBoolCallee(src);
        if (!out.includes(want)) bad.push(`${name}: missing ${JSON.stringify(want)}`);
        const keep = want.startsWith('is_true');
        if (keep && out !== src) bad.push(`${name}: must stay unchanged`);
        if (!keep && out.includes('`') === false && out.includes(want) === false) bad.push(`${name}: not emitted`);
    }
    return bad;
}

// ---- nested field-chain inserts ----
// `add_element_to_object(get_value_mut(<chain>), KEY, VAL)` on the plain `balance`/`ohlcvs`/`options` buckets becomes
// `insert(stringify_param(KEY), VAL)`: the tag hooks never fire there and `stringify_param` is the helper's key coercion.

const FIELDS_ARR = ['balance', 'ohlcvs', 'options'];
const RECV = 'self\\.(?:(?:core|parent)\\.)*(' + FIELDS_ARR.join('|') + ')';
const STR_KEY = '&Value::Str\\("((?:[^"\\\\]|\\\\.)*)"\\.(?:into|to_string)\\(\\)\\)';
const MAX_LINE = 400;

/** Hide comments and string bodies so paren/key scans cannot be fooled. */
function maskSrc(src: string): string {
    const out = src.split('');
    const blank = (from: number, to: number) => {
        for (let i = from; i < to && i < out.length; i++) if (out[i] !== '\n') out[i] = ' ';
    };
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (c === '/' && src[i + 1] === '/') {
            const end = src.indexOf('\n', i);
            const stop = end < 0 ? src.length : end;
            blank(i, stop);
            i = stop;
            continue;
        }
        if (c === '/' && src[i + 1] === '*') {
            const end = src.indexOf('*/', i + 2);
            const stop = end < 0 ? src.length : end + 2;
            blank(i, stop);
            i = stop;
            continue;
        }
        if (c === "'") {
            const m = /^'(?:\\.|[^\\'])'/.exec(src.slice(i, i + 4));
            if (m !== null) { i += m[0].length; continue; }
        }
        if (c === '"') {
            let j = i + 1;
            while (j < src.length) {
                if (src[j] === '\\') { j += 2; continue; }
                if (src[j] === '"') break;
                j++;
            }
            blank(i, Math.min(j + 1, src.length));
            i = j + 1;
            continue;
        }
        i++;
    }
    return out.join('');
}

/** Top-level argument spans of the call whose `(` is at `open`. */
function argSpans(masked: string, open: number): Array<[number, number]> | undefined {
    let depth = 0;
    const spans: Array<[number, number]> = [];
    let start = open + 1;
    for (let j = open; j < masked.length; j++) {
        const c = masked[j];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') {
            depth--;
            if (depth === 0) { spans.push([start, j]); return spans; }
        } else if (c === ',' && depth === 1) {
            spans.push([start, j]);
            start = j + 1;
        }
    }
    return undefined;
}

/** Offset just past the `)` closing the `(` at `open`, or -1. */
function callEnd(masked: string, open: number): number {
    let depth = 0;
    for (let j = open; j < masked.length; j++) {
        const c = masked[j];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') {
            depth--;
            if (depth === 0) return j + 1;
        }
    }
    return -1;
}

/** True when the call is a statement (only whitespace between it and a `;`). */
function fieldChainIsStatement(masked: string, from: number, to: number): boolean {
    let k = to;
    while (k < masked.length && (masked[k] === ' ' || masked[k] === '\t')) k++;
    if (masked[k] !== ';') return false;
    let s = from - 1;
    while (s >= 0 && (masked[s] === ' ' || masked[s] === '\t' || masked[s] === '\n')) s--;
    return s < 0 || '{};'.indexOf(masked[s]) >= 0;
}

/** First top-level argument of the call text starting at `expr`'s `(`. */
function fieldChainFirstArg(expr: string): string {
    const open = expr.indexOf('(');
    if (open < 0) return '';
    let depth = 0;
    for (let j = open; j < expr.length; j++) {
        const c = expr[j];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') {
            depth--;
            if (depth === 0) return expr.slice(open + 1, j).trim();
        } else if (c === ',' && depth === 1) {
            return expr.slice(open + 1, j).trim();
        }
    }
    return '';
}

/** The whitelisted field a receiver chain is rooted at, or '' when unproven. */
function chainField(recv: string): string {
    const direct = new RegExp('^&mut\\s+' + RECV + '$').exec(recv);
    if (direct !== null) return direct[1];
    let expr = recv;
    for (let hop = 0; hop < 8; hop++) {
        if (!expr.startsWith('get_value_mut(')) return '';
        const a = fieldChainFirstArg(expr);
        const mutRoot = new RegExp('^&mut\\s+' + RECV + '$').exec(a);
        if (mutRoot !== null) return mutRoot[1];
        const coerced = new RegExp('^unsafe\\s*\\{\\s*crate::runtime::coerce_value_to_mut\\(&' + RECV + '\\)\\s*\\}$').exec(a);
        if (coerced !== null) return coerced[1];
        if (!a.startsWith('get_value_mut(')) return '';
        expr = a;
    }
    return '';
}

const FN_HEAD = /(?:^|\n)[ \t]*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+[A-Za-z_][A-Za-z0-9_]*/g;

/** The `fn` body span holding offset `at`. */
function fnSpan(src: string, at: number): [number, number] {
    FN_HEAD.lastIndex = 0;
    let start = 0;
    let m: RegExpExecArray | null;
    while ((m = FN_HEAD.exec(src)) !== null) {
        if (m.index > at) return [start, m.index];
        start = m.index;
    }
    return [start, src.length];
}

/** How a `&ident` key may be lowered, or '' when the local's type is unproven. */
function identKeyArg(body: string, ident: string, header: string): string {
    const asStr = new RegExp('\\blet\\s+(?:mut\\s+)?' + ident + '\\s*:\\s*String\\s*=');
    const asVal = new RegExp('\\blet\\s+(?:mut\\s+)?' + ident + '\\s*:\\s*Value\\s*=');
    if (asStr.test(body)) return ident + '.clone()';
    if (asVal.test(body)) return 'crate::runtime::stringify_param(&' + ident + ')';
    const paramVal = new RegExp('(?:^|[(,]\\s*)(?:mut\\s+)?' + ident + '\\s*:\\s*Value\\b');
    const paramStr = new RegExp('(?:^|[(,]\\s*)(?:mut\\s+)?' + ident + '\\s*:\\s*String\\b');
    if (paramStr.test(header)) return ident + '.clone()';
    if (paramVal.test(header)) return 'crate::runtime::stringify_param(&' + ident + ')';
    return '';
}

interface FieldChainRw { start: number, end: number, text: string }

function runPass(content: string): string {
    if (!content.includes('add_element_to_object(')) return content;
    const masked = maskSrc(content);
    const callRe = /(?<![A-Za-z0-9_:.])(add_element_to_object)\(/g;
    const rws: FieldChainRw[] = [];
    let m: RegExpExecArray | null;
    while ((m = callRe.exec(masked)) !== null) {
        const open = m.index + m[1].length;
        const spans = argSpans(masked, open);
        if (spans === undefined || spans.length !== 3) continue;
        const end = callEnd(masked, open);
        if (end < 0) continue;
        if (!fieldChainIsStatement(masked, m.index, end)) continue;
        const raw = spans.map(sp => content.slice(sp[0], sp[1]).trim());
        if (chainField(raw[0]) === '') continue;
        const value = raw[2];
        if (/\bself\b/.test(value)) continue;
        let keyArg = '';
        const lit = new RegExp('^' + STR_KEY + '$').exec(raw[1]);
        if (lit !== null) {
            keyArg = '"' + lit[1] + '".to_string()';
        } else {
            const ident = /^&([A-Za-z_][A-Za-z0-9_]*)$/.exec(raw[1]);
            if (ident === null) continue;
            const [fnStart, fnEnd] = fnSpan(masked, m.index);
            const headerEnd = masked.indexOf('\n', fnStart + 1);
            const header = masked.slice(fnStart, headerEnd < 0 ? fnEnd : headerEnd);
            keyArg = identKeyArg(masked.slice(fnStart, m.index), ident[1], header);
            if (keyArg === '') continue;
        }
        const text = 'if let Value::Dict(__r05d) = ' + raw[0]
            + ' { std::sync::Arc::make_mut(__r05d).insert(' + keyArg + ', ' + value + '); }';
        const lineStart = content.lastIndexOf('\n', m.index) + 1;
        const lineEndIdx = content.indexOf('\n', end);
        const lineLen = (lineEndIdx < 0 ? content.length : lineEndIdx) - lineStart;
        if (lineLen > MAX_LINE || lineLen - (end - m.index) + text.length > MAX_LINE) continue;
        let stop = end;
        while (stop < content.length && (content[stop] === ' ' || content[stop] === '\t')) stop++;
        if (content[stop] !== ';') continue;
        rws.push({ start: m.index, end: stop + 1, text });
    }
    if (rws.length === 0) return content;
    rws.sort((a, b) => a.start - b.start);
    let out = '';
    let at = 0;
    for (const r of rws) {
        if (r.start < at) continue;
        out += content.slice(at, r.start) + r.text;
        at = r.end;
    }
    return out + content.slice(at);
}

export function fieldChainInserts(content: string): string {
    // Deeper chains (`a[k1][k2][k3]`) resolve one hop per round.
    let out = content;
    for (let i = 0; i < 4; i++) {
        const next = runPass(out);
        if (next === out) break;
        out = next;
    }
    return out;
}

// ---- marker-free vec push ----
// `append_to_array(&mut x, v)` on a receiver that can never be a book-cache handle dict has no live arm but the push,
// so it prints the guarded native `Vec` push. Every write of x must be a marker-free source; unproven sites keep the helper.

const helperName = 'append_to_array';
const lineBudget = 400;

// Client / exchange fields whose values are plain data, never book-cache handles.
const plainFields = new Set ([
    'orders', 'positions', 'tickers', 'trades', 'ohlcvs', 'bidsasks', 'clients', 'balance',
    'options', 'markets', 'markets_by_id', 'currencies', 'events', 'outcomes', 'outcomes_by_id',
    'events_by_slug', 'symbols', 'free', 'used', 'total',
]);
// Variant-preserving `&mut` calls: none of them can turn a value into a book-cache handle.
const keeperCalls = [ 'add_element_to_object', 'set_value', 'remove' ];
// Literal constructors that cannot carry a book-cache handle.
const literalPrefixes = [ 'Value::Null', 'Value::Int(', 'Value::Float(', 'Value::Bool(', 'Value::Str(', 'Value::Map({', 'Value::Array(' ];

// Blank strings and comments; same length as the input, so indices stay valid.
function markerFreePushMaskText (src: string): string {
    const out: string[] = [];
    let i = 0;
    const n = src.length;
    while (i < n) {
        const c = src[i];
        if (c === '/' && src[i + 1] === '/') {
            while (i < n && src[i] !== '\n') { out.push (' '); i++; }
            continue;
        }
        if (c === '/' && src[i + 1] === '*') {
            out.push ('  '); i += 2;
            while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out.push (src[i] === '\n' ? '\n' : ' '); i++; }
            if (i < n) { out.push ('  '); i += 2; }
            continue;
        }
        if (c === '"') {
            out.push (' '); i++;
            while (i < n && src[i] !== '"') {
                if (src[i] === '\\') { out.push ('  '); i += 2; continue; }
                out.push (src[i] === '\n' ? '\n' : ' '); i++;
            }
            if (i < n) { out.push (' '); i++; }
            continue;
        }
        out.push (c); i++;
    }
    return out.join ('');
}

// [open, close] brace spans of every `fn` body.
function markerFreePushFnRegions (masked: string): Array<[number, number]> {
    const regions: Array<[number, number]> = [];
    const head = /\bfn\s+[A-Za-z0-9_]*\s*[(<]/g;
    let m: RegExpExecArray | null;
    while ((m = head.exec (masked)) !== null) {
        let i = m.index + m[0].length - 1;
        let depth = 0;
        let open = -1;
        while (i < masked.length) {
            const c = masked[i];
            if (c === '(' || c === '[' || c === '<') depth++;
            else if (c === ')' || c === ']' || c === '>') depth--;
            else if (c === '{') { if (depth <= 0) { open = i; break; } depth++; }
            else if (c === ';' && depth <= 0) break;
            i++;
        }
        if (open < 0) continue;
        let close = -1;
        let d = 0;
        for (let j = open; j < masked.length; j++) {
            if (masked[j] === '{') d++;
            else if (masked[j] === '}') { d--; if (d === 0) { close = j; break; } }
        }
        if (close > open) regions.push ([open, close]);
    }
    return regions;
}

// Index of the `)` matching the `(` at `open`, or -1.
function markerFreePushCloseParen (src: string, open: number): number {
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        const c = src[i];
        if (c === '(') depth++;
        else if (c === ')') { depth--; if (depth === 0) return i; }
    }
    return -1;
}

// Index of the `;` ending the expression that starts at `from` (depth 0), or -1.
function exprEnd (masked: string, from: number): number {
    let depth = 0;
    for (let i = from; i < masked.length; i++) {
        const c = masked[i];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
        else if (c === ';' && depth <= 0) return i;
    }
    return -1;
}

export function rustVecPushInline (content: string): string {
    if (!content.includes (helperName + '(')) return content;
    const masked = markerFreePushMaskText (content);
    const regions = markerFreePushFnRegions (masked);
    const callRx = new RegExp ('(?<![\\w.:])' + helperName + '\\(', 'g');
    const jobs: Array<{ start: number, end: number, text: string }> = [];
    const memo = new Map<string, Map<string, boolean>> ();

    const factsOf = (region: [number, number]): Map<string, boolean> => {
        const key = region[0] + ':' + region[1];
        let hit = memo.get (key);
        if (hit === undefined) { hit = new Map<string, boolean> (); memo.set (key, hit); }
        return hit;
    };
    const isPlainField = (expr: string): boolean => {
        const f = /^self\.([A-Za-z_][A-Za-z0-9_]*)\b/.exec (expr.trim ());
        return f !== null && plainFields.has (f[1]);
    };
    // Root local of a `.as_map()` / `.as_array()` chain, else null.
    const chainRoot = (expr: string): string | null => {
        const m = /^([A-Za-z_][A-Za-z0-9_]*)\.(?:as_map|as_array)\(\)/.exec (expr.trim ());
        return m === null ? null : m[1];
    };

    // `expr` is a source that can only yield a value that is not a book-cache handle.
    const sourceFree = (expr: string, region: [number, number], seen: Set<string>): boolean => {
        const t = expr.trim ();
        if (literalPrefixes.some ((p) => t.startsWith (p))) return true;
        if (/^Value::from\(vec!\[/.test (t) || /^Value::from\(Vec::new\(\)\)$/.test (t)) return true;
        if (t.startsWith ('self.safe_list')) return true;
        // `x.as_str().map(..)`: a string or `Value::Null`
        if (/^[A-Za-z_][A-Za-z0-9_]*\.as_str\(\)\.map\(/.test (t)) return true;
        // the closure-free printer form of the same: `(if let Some(__s) = x.as_str() { Value::Str(..) } else { Value::Null })`
        if (/^\(if let Some\(__s\) = [A-Za-z_][A-Za-z0-9_.]*\.(?:as_str|as_deref)\(\) \{ Value::Str\(.*\) \} else \{ Value::Null \}\)$/.test (t)) return true;
        // a plain data field, or a read rooted at one
        if (isPlainField (t)) return true;
        const safeValue = /^self\.safe_value(?:_k)?\(\(?(?:if let \(Some\(__m\), Some\(__k\)\) = \()?self\.([A-Za-z_][A-Za-z0-9_]*)/.exec (t);
        if (safeValue !== null && plainFields.has (safeValue[1])) return true;
        // dict-field read through a variant match on a plain local
        const matchRead = /^match\s*&\s*([A-Za-z_][A-Za-z0-9_]*)\s*\{\s*Value::Dict\(__m\d+\)\s*=>\s*__m\d+\.get\("/.exec (t);
        if (matchRead !== null) return localFree (matchRead[1], region, seen);
        // `get_value(&recv, key)` / `get_value_k(&recv, "k")`
        const read = /^(?:crate::value::)?(?:get_value_k|get_value)\(/.exec (t);
        if (read !== null) {
            const open = read[0].length - 1;
            const close = markerFreePushCloseParen (t, open);
            if (close < 0) return false;
            const args = t.slice (open + 1, close);
            const comma = args.indexOf (',');
            if (comma < 0) return false;
            const recv = args.slice (0, comma).trim ().replace (/^&\s*/, '');
            if (isPlainField (recv)) return true;
            const root = chainRoot (recv);
            if (root !== null) return localFree (root, region, seen);
            if (/^[A-Za-z_][A-Za-z0-9_]*$/.test (recv)) return localFree (recv, region, seen);
            return false;
        }
        // the closure-free dict read the printer emits: `(if let (Some(__m), Some(__k)) = (R.as_map(), K.as_str()) { .. })`
        const freeRead = /^\(if let \(Some\(__m\), Some\(__k\)\) = \(([A-Za-z_][A-Za-z0-9_.]*)\.as_map\(\), /.exec (t);
        if (freeRead !== null) {
            if (isPlainField (freeRead[1])) return true;
            return /^[A-Za-z_][A-Za-z0-9_]*$/.test (freeRead[1]) && localFree (freeRead[1], region, seen);
        }
        const clone = /^([A-Za-z_][A-Za-z0-9_]*)\.clone\(\)$/.exec (t);
        if (clone !== null) return localFree (clone[1], region, seen);
        const root = chainRoot (t);
        if (root !== null) return localFree (root, region, seen);
        return false;
    };

    // Every declaration and every later write of `name` in this body is a marker-free source.
    const localFree = (name: string, region: [number, number], seen: Set<string>): boolean => {
        const facts = factsOf (region);
        const known = facts.get (name);
        if (known !== undefined) return known;
        if (seen.has (name)) return false;
        const body = masked.slice (region[0], region[1]);
        const declRx = new RegExp ('let (?:mut )?' + name + '\\s*:\\s*([^=;]+?)\\s*=(?!=)', 'g');
        const spans: Array<[number, number]> = [];
        let d: RegExpExecArray | null;
        while ((d = declRx.exec (body)) !== null) {
            if (d[1].trim () !== 'Value') { facts.set (name, false); return false; }
            const rhsStart = region[0] + d.index + d[0].length;
            const rhsEnd = exprEnd (masked, rhsStart);
            if (rhsEnd < 0) { facts.set (name, false); return false; }
            spans.push ([d.index, rhsEnd - region[0]]);
        }
        if (spans.length === 0) { facts.set (name, false); return false; }
        seen.add (name);
        let ok = true;
        for (const [d0, d1] of spans) {
            const rhsStart = region[0] + d0 + body.slice (d0).indexOf ('=') + 1;
            if (!sourceFree (content.slice (rhsStart, region[0] + d1), region, seen)) { ok = false; break; }
        }
        if (ok) {
            const wrx = new RegExp ('(?<![\\w.])' + name + '\\s*=(?!=)', 'g');
            let w: RegExpExecArray | null;
            while ((w = wrx.exec (body)) !== null) {
                if (spans.some (([d0, d1]) => w!.index >= d0 + body.slice (d0).indexOf ('=') && w!.index < d1)) continue;
                const rhsStart = region[0] + w.index + w[0].length;
                const rhsEnd = exprEnd (masked, rhsStart);
                if (rhsEnd < 0 || !sourceFree (content.slice (rhsStart, rhsEnd), region, seen)) { ok = false; break; }
            }
        }
        seen.delete (name);
        facts.set (name, ok);
        return ok;
    };

    let m: RegExpExecArray | null;
    while ((m = callRx.exec (masked)) !== null) {
        const start = m.index;
        const lineStart = masked.lastIndexOf ('\n', start) + 1;
        if (/^\s*(?:pub\s+)?fn /.test (masked.slice (lineStart, start))) continue; // definition
        const region = regions.find ((r) => r[0] < start && start < r[1]);
        if (region === undefined) continue;
        const argStart = start + helperName.length + 1;
        const recv = /^&mut\s+([A-Za-z_][A-Za-z0-9_]*)\s*,/.exec (content.slice (argStart, argStart + 160));
        if (recv === null) continue;
        const name = recv[1];
        const nameRx = new RegExp ('(?<![\\w.])' + name + '(?![\\w])');
        // a parameter receiver is not a local this pass can prove
        const headerStart = masked.lastIndexOf ('fn ', region[0]);
        if (new RegExp ('(?<![\\w])' + name + '\\s*:').test (masked.slice (headerStart, region[0]))) continue;
        if (!localFree (name, region, new Set<string> ())) continue;
        // every `&mut name` must be one of our pushes or a variant-preserving call
        const body = masked.slice (region[0], region[1]);
        const mutRx = new RegExp ('&mut\\s+' + name + '(?![\\w])', 'g');
        let ok = true;
        let mu: RegExpExecArray | null;
        while ((mu = mutRx.exec (body)) !== null) {
            const at = region[0] + mu.index;
            const before = masked.slice (Math.max (0, at - 60), at);
            const after = masked.slice (at + mu[0].length, at + mu[0].length + 8);
            const pushRecv = new RegExp (helperName + '\\(\\s*$').test (before) && /^\s*,/.test (after);
            const keeper = keeperCalls.some ((c) => new RegExp ('(?<![\\w.])' + c + '\\(\\s*$').test (before)) && /^\s*,/.test (after);
            if (!pushRecv && !keeper) { ok = false; break; }
        }
        if (!ok) continue;
        const callEnd = markerFreePushCloseParen (masked, argStart - 1);
        if (callEnd < 0) continue;
        const valueStart = argStart + recv[0].length;
        const value = content.slice (valueStart, callEnd);
        if (nameRx.test (value)) continue;
        // whole statement only
        let stmtStart = masked.lastIndexOf (';', start);
        stmtStart = Math.max (stmtStart, masked.lastIndexOf ('{', start), masked.lastIndexOf ('}', start)) + 1;
        if (masked.slice (stmtStart, start).trim () !== '') continue;
        if (!/^\)\s*;/.test (masked.slice (callEnd, callEnd + 4))) continue;
        const text = `if let Value::Arr(__a) = &mut ${name} { std::sync::Arc::make_mut(__a).push(${value.trim ()}); }`;
        // keep the tree's 400-char line budget: a site that only fits as a helper call stays one
        const lStart = content.lastIndexOf ('\n', start) + 1;
        const lEnd = content.indexOf ('\n', callEnd) < 0 ? content.length : content.indexOf ('\n', callEnd);
        const lenNow = lEnd - lStart;
        if (lenNow <= lineBudget && lenNow - (callEnd + 1 - start) + text.length > lineBudget) continue;
        jobs.push ({ start, end: callEnd + 1, text });
    }
    if (jobs.length === 0) return content;
    let out = content;
    for (let i = jobs.length - 1; i >= 0; i--) {
        const j = jobs[i];
        out = out.slice (0, j.start) + j.text + out.slice (j.end);
    }
    return out;
}

// ---- self-test ----
const fileHead = `// PLEASE DO NOT EDIT THIS FILE, IT IS GENERATED AND WILL BE OVERWRITTEN:
// https://github.com/ccxt/ccxt/blob/master/CONTRIBUTING.md#how-to-contribute-code

`;

export function rustVecPushInlineSelfTest (): string[] {
    const problems: string[] = [];
    const ok = (c: boolean, what: string) => { if (!c) { problems.push ('rust vec push inline self: ' + what); } };
    const run = (body: string, header = '    pub fn k(&mut self, other: Value) -> Value {') => rustVecPushInline (fileHead + header + '\n' + body + '\n    }\n');
    const push = (n: string, v: string) => `        append_to_array(&mut ${n}, ${v});`;
    const native = (n: string, v: string) => `if let Value::Arr(__a) = &mut ${n} { std::sync::Arc::make_mut(__a).push(${v}); }`;

    // 1. alias local read out of a plain map local: the marker arm cannot fire
    const alias = run (`        let mut byTicker: Value = Value::Map({\n            let mut m = indexmap::IndexMap::new();\n            m\n        });\n        let mut rows: Value = get_value(&byTicker, &ticker);\n` + push ('rows', 'outcome.clone()'));
    ok (alias.includes (native ('rows', 'outcome.clone()')), 'get_value alias local goes native: ' + alias);
    ok (!alias.includes (helperName + '(&mut rows'), 'helper call gone: ' + alias);

    // 2. dict-field read through a variant match on a plain local
    const matchRead = run (`        let mut order: Value = Value::Map({\n            let mut m = indexmap::IndexMap::new();\n            m\n        });\n        let mut rows: Value = match &order { Value::Dict(__m15) => __m15.get("child_orders").cloned().unwrap_or(Value::Null), _ => Value::Null };\n` + push ('rows', 'stopLoss'));
    ok (matchRead.includes (native ('rows', 'stopLoss')), 'match field read goes native: ' + matchRead);

    // 3. the same read from a book-cache-holding field keeps the helper (`self.cache`)
    const cache = run (`        let mut rows: Value = get_value(&self.cache, &ticker);\n` + push ('rows', 'outcome.clone()'));
    ok (cache.includes (helperName + '(&mut rows, outcome.clone());'), 'cache field read keeps the helper: ' + cache);

    // 4. a callee return is not proven, and a later write of one drops the proof
    const callee = run (`        let mut rows: Value = self.parse_rows(data);\n` + push ('rows', 'outcome.clone()'));
    ok (callee.includes (helperName + '(&mut rows, outcome.clone());'), 'callee return keeps the helper: ' + callee);
    const rewrite = run (`        let mut rows: Value = Value::from(vec![]);\n        rows = self.parse_rows(data);\n` + push ('rows', 'outcome.clone()'));
    ok (rewrite.includes (helperName + '(&mut rows, outcome.clone());'), 'unproven write keeps the helper: ' + rewrite);

    // 5. plain data field read, element read out of a plain local array, keeping `&mut` escapes
    const field = run (`        let mut ohlcv: Value = self.safe_value(self.ohlcvs.as_map().and_then(|__m| __m.get("1m")).cloned().unwrap_or(Value::Null), Value::Str("1m".into()), &[Value::from(vec![])]);\n` + push ('ohlcv', 'candle'));
    ok (field.includes (native ('ohlcv', 'candle')), 'plain field read goes native: ' + field);
    const element = run (`        let mut rows: Value = Value::from(vec![]);\n        let mut last: Value = rows.as_array().and_then(|__arr| __arr.get(0)).cloned().unwrap_or(Value::Null);\n` + push ('last', 'candle'));
    ok (element.includes (native ('last', 'candle')), 'element read out of a plain local array goes native: ' + element);
    const keeper = run (`        let mut rows: Value = Value::from(vec![]);\n        set_value(&mut rows, &Value::Str("k".into()), Value::Int(1));\n` + push ('rows', 'candle'));
    ok (keeper.includes (native ('rows', 'candle')), 'variant-preserving &mut keeps the proof: ' + keeper);

    // 6. an escaping `&mut` through an unknown callee, and a value naming the receiver, keep the helper
    const escape = run (`        let mut rows: Value = Value::from(vec![]);\n        self.consume(&mut rows);\n` + push ('rows', 'candle'));
    ok (escape.includes (helperName + '(&mut rows, candle);'), 'escaped &mut keeps the helper: ' + escape);
    const selfRef = run (`        let mut rows: Value = Value::from(vec![]);\n` + push ('rows', 'get_value(&rows, &Value::Int(0))'));
    ok (selfRef.includes (helperName + '(&mut rows,'), 'value reading the receiver keeps the helper: ' + selfRef);
    const param = run (push ('other', 'candle'));
    ok (param.includes (helperName + '(&mut other, candle);'), 'parameter receiver keeps the helper: ' + param);

    // 7. idempotent, and the helper definition itself is untouched
    ok (rustVecPushInline (alias) === alias, 'idempotent');
    const def = rustVecPushInline (fileHead + 'pub fn append_to_array(arr: &mut Value, v: Value) {\n    if let Value::Arr(a) = arr { std::sync::Arc::make_mut(a).push(v); }\n}\n');
    ok (def.includes ('pub fn append_to_array(arr: &mut Value, v: Value) {'), 'definition untouched: ' + def);

    // 8. a rewrite that would push the line past 400 chars keeps the helper
    const longVal = 'Value::Str(format!("{}", ' + 'self.safe_string_k(market.clone(), "id", &[])'.repeat (10) + '))';
    const longLine = rustVecPushInline (`        let mut rows: Value = Value::from(vec![]);\n` + push ('rows', longVal));
    ok (longLine.includes (helperName + '(&mut rows,'), 'over-budget line keeps the helper');
    return problems;
}

// ---- string natives ----
// String helpers (`to_string_val`, `replace_str`, `split`, `starts_with`, `to_fixed`, `join`, ...) print native on an
// operand whose declared type or pinned variant set proves the helper's matching arm. Unproven sites keep the helper.


type VSet = Set<string>;
type Local = { set?: VSet, ty: string, elems?: string };

const SCALAR: VSet = new Set([ 'str', 'int', 'float', 'bool', 'null' ]);
const NATIVE_TY = new Set([ 'String', 'Vec<String>', 'i64', 'f64', 'bool', 'usize', 'u32', 'isize' ]);

/** Blank string literals and comments, same length as the input. */
function stringNativesMaskText(src: string): string {
    const out = src.split('');
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (c === '/' && src[i + 1] === '/') {
            while (i < src.length && src[i] !== '\n') out[i++] = ' ';
            continue;
        }
        if (c === '/' && src[i + 1] === '*') {
            while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
                if (src[i] !== '\n') out[i] = ' ';
                i++;
            }
            if (i < src.length) { out[i] = ' '; out[i + 1] = ' '; i += 2; }
            continue;
        }
        if (c === '"') {
            out[i++] = ' ';
            while (i < src.length && src[i] !== '"') {
                if (src[i] === '\\') out[i++] = ' ';
                if (i < src.length) { if (src[i] !== '\n') out[i] = ' '; i++; }
            }
            if (i < src.length) out[i++] = ' ';
            continue;
        }
        i++;
    }
    return out.join('');
}

/** Index just past the delimiter matching the one at `open`, or -1. */
function stringNativesCloseParen(masked: string, open: number): number {
    const openCh = masked[open];
    const closeCh = openCh === '(' ? ')' : openCh === '[' ? ']' : '}';
    let depth = 0;
    for (let k = open; k < masked.length; k++) {
        const c = masked[k];
        if (c === openCh) depth++;
        else if (c === closeCh) { depth--; if (depth === 0) return k + 1; }
    }
    return -1;
}

/** Split top-level commas in `[from, to)`; undefined when the text is unbalanced. */
function stringNativesSplitArgs(masked: string, from: number, to: number): string[] | undefined {
    const args: string[] = [];
    let depth = 0;
    let start = from;
    for (let k = from; k < to; k++) {
        const c = masked[k];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
        else if (c === ',' && depth === 0) { args.push(masked.slice(start, k)); start = k + 1; }
    }
    args.push(masked.slice(start, to));
    return args;
}

/** Index of the `;` closing the statement at `from`, or -1. */
function stringNativesStmtEnd(masked: string, from: number): number {
    let depth = 0;
    for (let k = from; k < masked.length; k++) {
        const c = masked[k];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') { depth--; if (depth < 0) return -1; }
        else if (c === ';' && depth === 0) return k;
    }
    return -1;
}

const STRING_NATIVES_FN_HEAD = /(?:^|\n)[ \t]*(?:pub(?:\([a-z]+\))? )?(?:async )?fn /g;

/** `[start, end)` of the fn body holding `pos`. */
function fnBounds(masked: string, pos: number): [number, number] {
    let start = 0;
    for (const m of masked.matchAll(STRING_NATIVES_FN_HEAD)) {
        const at = m.index as number;
        if (at <= pos) start = at + 1; else return [start, at + 1];
    }
    return [ start, masked.length ];
}

/** `&Value::Str("lit".into())` -> `"lit"`, else undefined. */
function strBox(arg: string): string | undefined {
    const m = /^&\s*Value::Str\(\s*("(?:[^"\\]|\\.)*")\s*(?:\.into\(\)|\.to_string\(\))?\s*\)$/.exec(arg.trim());
    return m === null ? undefined : m[1];
}

/** `&Value::Int(-?n)` -> the digits, else undefined. */
function intBox(arg: string): string | undefined {
    const m = /^&\s*Value::Int\(\s*(-?\d+)\s*\)$/.exec(arg.trim());
    return m === null ? undefined : m[1];
}

/** `'str'` when every element the expression can hold is a `Value::Str`, else undefined. */
function elemKind(expr: string, locals: Map<string, Local>, depth = 0): string | undefined {
    const e = expr.trim().replace(/;$/, '').trim();
    const vec = /^(?:Value::(?:Array|List|from)|vec!)\(?(vec!)?\[/.exec(e) ?? /^vec!\[/.exec(e);
    if (vec !== null) {
        const open = e.indexOf('[');
        const close = stringNativesCloseParen(e, open);
        if (close < 0 || !/^\)*$/.test(e.slice(close))) return undefined;
        const items = stringNativesSplitArgs(e, open + 1, close - 1);
        if (items === undefined) return undefined;
        for (const it of items) {
            if (it.trim() === '') continue;
            if (!/^\s*Value::Str\(/.test(it)) return undefined;
        }
        return 'str';
    }
    const arr = /^Value::(?:Array|List)\(/.exec(e);
    if (arr !== null) {
        const open = arr[0].length - 1;
        const close = stringNativesCloseParen(e, open);
        if (close !== e.length) return undefined;
        const inner = e.slice(open + 1, close - 1);
        // The printer's `split` idiom maps every part through `Value::Str` — as a `|__p|` closure or,
        // since the ast closure pass, as the `From` fn item on the split parts.
        if (/\.map\(\|__p\| Value::Str\(|\.split\([^()]*\)\.map\(Value::from\)/.test(inner)) return 'str';
        return undefined;
    }
    if (/^(?:crate::runtime::)?split\(/.test(e)) return 'str';
    const slice = /^(?:self\.)?array_slice\(\s*&?([A-Za-z_]\w*)/.exec(e);
    if (slice !== null && depth === 0) {
        const src = locals.get(slice[1]);
        return src === undefined ? undefined : src.elems;
    }
    return undefined;
}

/** Variant set a single write expression can leave in a `Value`, or undefined. */
function inferSet(expr: string, locals: Map<string, Local>): VSet | undefined {
    const e = expr.trim().replace(/;$/, '').trim();
    for (const [ head, variant ] of [ [ 'Value::Str(', 'str' ], [ 'Value::Int(', 'int' ], [ 'Value::Float(', 'float' ], [ 'Value::Bool(', 'bool' ] ]) {
        if (e.startsWith(head)) return new Set([ variant ]);
    }
    if (e === 'Value::Null') return new Set([ 'null' ]);
    const copy = /^([A-Za-z_]\w*)(?:\.clone\(\))?$/.exec(e);
    if (copy !== null) {
        const src = locals.get(copy[1]);
        if (src === undefined) return undefined;
        if (src.ty === 'Value') return src.set === undefined ? undefined : new Set(src.set);
        if (src.ty === 'String') return new Set([ 'str' ]);
    }
    // The family helpers return a `Value::Str` / `Value::Array` of Str on every path.
    const own = /^(?:crate::runtime::)?(to_string_val|replace_str|replace_all_str|join|pad_end|to_fixed)\(/.exec(e);
    if (own !== null) return own[1] === 'pad_end' ? new Set([ 'str', 'null' ]) : new Set([ 'str' ]);
    if (/^(?:crate::runtime::)?split\(/.test(e)) return new Set([ 'arr' ]);
    const call = /^(?:crate::value::)?(?:self\.)?(safe_string(?:_k|_2|_lower|_upper|_lower_k|_upper_k)?|safe_bool(?:_k|_2)?|safe_integer(?:_k|_2)?|safe_int|safe_timestamp|safe_float(?:_k)?|safe_number(?:_k|_2)?|parse_int|parse_float|parse_to_int|number_to_string|decimal_to_precision|sum)\(/.exec(e);
    if (call !== null) {
        const name = call[1];
        const open = call[0].length - 1;
        if (stringNativesCloseParen(e, open) !== e.length) return undefined;
        if (name === 'decimal_to_precision') return new Set([ 'str' ]);
        if (name === 'number_to_string') return new Set([ 'str', 'null' ]);
        if (name === 'sum') return new Set([ 'int', 'float', 'str', 'null' ]);
        let own = 'str';
        if (name.startsWith('safe_bool')) own = 'bool';
        else if (name.startsWith('safe_float') || name.startsWith('safe_number') || name === 'parse_float') own = 'float';
        else if (!name.startsWith('safe_string') && name !== 'parse_to_int') own = 'int';
        const out: VSet = new Set([ own ]);
        // `safe_*` fall back to their default: a literal box pins it, `&[]` leaves Null.
        if (name.startsWith('safe')) {
            const args = stringNativesSplitArgs(e, open + 1, e.length - 1);
            if (args === undefined) return undefined;
            const last = args[args.length - 1].trim();
            if (last === '&[]') out.add('null');
            else {
                const inner = /^&\[(.*)\]$/.exec(last);
                if (inner === null) return undefined;
                const lit = strBox(`&${inner[1]}`);
                const num = intBox(`&${inner[1]}`);
                if (lit !== undefined) out.add('str');
                else if (num !== undefined) out.add('int');
                else return undefined;
            }
        } else {
            out.add('null');
        }
        return out;
    }
    if (/^(?:Value::(?:Array|List)\(|Value::from\(vec!\[|vec!\[)/.test(e)) return new Set([ 'arr' ]);
    const slice = /^(?:crate::value::)?(?:self\.)?(?:array_slice|array_concat)\(\s*&?([A-Za-z_]\w*)/.exec(e);
    if (slice !== null) {
        const src = locals.get(slice[1]);
        return src === undefined || src.set === undefined ? undefined : new Set(src.set);
    }
    // The printer's inline `parse_float` / `parse_int`: every arm yields a number or Null.
    if (/^\(match &\w+ \{ Value::Str\(__parse_s\) => __parse_s\.trim\(\)\.parse::<f64>\(\)\.map\(Value::Float\)/.test(e)) return new Set([ 'float', 'null' ]);
    if (/^\(match &\w+ \{ Value::Str\(__parse_s\) => __parse_s\.trim\(\)\.parse::<i64>\(\)\.map\(Value::Int\)/.test(e)) return new Set([ 'int', 'null' ]);
    // The printer's inline arithmetic: every arm is an Int/Float/Null.
    if (/^\(match \(&\(/.test(e)) return new Set([ 'int', 'float', 'null' ]);
    return undefined;
}

/** Locals of one fn: declared native type, or the variant set every write of a `Value` local pins. */
function valueSets(region: string, maskedRegion: string, sig: string): Map<string, Local> {
    const locals = new Map<string, Local>();
    const declRe = /let\s+(?:mut\s+)?([A-Za-z_]\w*)\s*:\s*([^=;]+?)\s*=/g;
    const decls: Array<{ name: string, ty: string, at: number, init: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(maskedRegion)) !== null) {
        const rel = new RegExp(`\\b${m[1]}\\b`).exec(m[0]);
        decls.push({ name: m[1], ty: m[2].replace(/\s+/g, ''), at: m.index + (rel === null ? 0 : rel.index), init: m.index + m[0].length });
    }
    const multi = new Map<string, number>();
    for (const d of decls) multi.set(d.name, (multi.get(d.name) ?? 0) + 1);
    // Typed parameters declare their own type; only those need a set.
    for (const p of sig.matchAll(/\(\s*(?:&?\s*(?:mut\s+)?([A-Za-z_]\w*)\s*:\s*([^,)]+)|&[A-Za-z_]\w*)|,\s*(?:mut\s+)?([A-Za-z_]\w*)\s*:\s*([^,)]+)/g)) {
        const name = p[1] ?? p[3];
        const ty = (p[2] ?? p[4] ?? '').replace(/\s+/g, '');
        if (name !== undefined && NATIVE_TY.has(ty)) locals.set(name, { ty });
    }
    for (const d of decls) {
        if (multi.get(d.name) !== 1) continue;
        locals.set(d.name, { ty: d.ty });
        if (d.ty !== 'Value') continue;
        // A parameter, loop binding or closure arg of the same name could shadow the local.
        const bind = new RegExp(`(?:[(,|]\\s*(?:mut\\s+)?${d.name}\\s*:|\\bfor\\s+(?:mut\\s+)?${d.name}\\b)`);
        if (bind.test(sig)) continue;
        const set: VSet = new Set();
        let ok = true;
        let elems: string | undefined = 'str';
        const word = new RegExp(`(?<![A-Za-z0-9_.])${d.name}(?![A-Za-z0-9_])`, 'g');
        for (let k = 0; k < maskedRegion.length; k++) {
            word.lastIndex = k;
            const hit = word.exec(maskedRegion);
            if (hit === null) break;
            const s = hit.index;
            k = s;
            if (/&\s*mut\s*$/.test(maskedRegion.slice(Math.max(0, s - 12), s))) { ok = false; break; }
            const tail = maskedRegion.slice(s + d.name.length);
            const rhs = /^\s*=(?!=)/.exec(tail);
            if (s === d.at) {
                const end = stringNativesStmtEnd(maskedRegion, d.init);
                const ex = end < 0 ? '' : region.slice(d.init, end);
                const got = end < 0 ? undefined : inferSet(ex, locals);
                if (got === undefined) { ok = false; break; }
                got.forEach(v => set.add(v));
                if (elemKind(ex, locals) !== 'str') elems = undefined;
                k = end < 0 ? s + d.name.length : end;
                continue;
            }
            if (rhs !== null) {
                const from = s + d.name.length + rhs[0].length;
                const end = stringNativesStmtEnd(maskedRegion, from);
                const ex = end < 0 ? '' : region.slice(from, end);
                const got = end < 0 ? undefined : inferSet(ex, locals);
                if (got === undefined) { ok = false; break; }
                got.forEach(v => set.add(v));
                if (elemKind(ex, locals) !== 'str') elems = undefined;
                k = end < 0 ? from : end;
                continue;
            }
        }
        if (ok && set.size > 0) locals.set(d.name, { ty: d.ty, set, elems });
    }
    return locals;
}

/** Native replacement for one helper call, or undefined when the operand is unproven. */
function rewrite(name: string, args: string[], locals: Map<string, Local>): string | undefined {
    const arg0 = (args[0] ?? '').trim();
    const recv = /^&\s*([A-Za-z_]\w*)$/.exec(arg0);
    const x = recv === null ? undefined : recv[1];
    const local = x === undefined ? undefined : locals.get(x);
    const set = local?.set;
    const ty = local?.ty;
    const provenScalar = set !== undefined && set.size > 0 && [ ...set ].every(v => SCALAR.has(v));
    const strTyped = ty === 'String';
    const strProven = strTyped || (set !== undefined && set.size === 1 && set.has('str'));
    const scalarProven = strTyped || provenScalar;
    const numProven = ty === 'i64' || ty === 'f64' || (set !== undefined && set.size > 0 && [ ...set ].every(v => v === 'int' || v === 'float' || v === 'null'));
    if (x === undefined) {
        // An inline scalar expression (`self.sum(..)`, the arithmetic match) needs no local.
        if (name !== 'to_string_val') return undefined;
        const held = arg0.replace(/^&/, '').replace(/;$/, '').trim();
        const got = inferSet(held, locals);
        if (got === undefined || [ ...got ].some(v => !SCALAR.has(v))) return undefined;
        return `Value::str(${held}.to_string())`;
    }
    switch (name) {
    case 'to_string_val': {
        if (args.length !== 1) return undefined;
        if (strProven) return `Value::str(${x}.clone())`;
        if (scalarProven) return `Value::str(${x}.to_string())`;
        return undefined;
    }
    case 'replace_str':
    case 'replace_all_str': {
        if (!strProven || args.length !== 3) return undefined;
        const a = strBox(args[1]);
        const b = strBox(args[2]);
        if (a === undefined || b === undefined) return undefined;
        const holder = strTyped ? x : `${x}.as_str().unwrap_or_default()`;
        return `Value::str(${holder}.replace(${a}, ${b}))`;
    }
    case 'split': {
        if (!strProven || args.length !== 2) return undefined;
        const d = strBox(args[1]);
        if (d === undefined) return undefined;
        const holder = strTyped ? x : `${x}.as_str().unwrap_or_default()`;
        return `Value::Array(${holder}.split(${d}).map(Value::str).collect())`;
    }
    case 'starts_with':
    case 'ends_with': {
        if (!strProven || args.length !== 2) return undefined;
        const s = strBox(args[1]);
        if (s === undefined) return undefined;
        const holder = strTyped ? x : `${x}.as_str().unwrap_or_default()`;
        return `${holder}.${name}(${s})`;
    }
    case 'to_fixed': {
        if (!numProven || args.length !== 2) return undefined;
        const d = intBox(args[1]);
        if (d === undefined) return undefined;
        const n = ty === 'f64' ? x : ty === 'i64' ? `(${x} as f64)` : `${x}.as_f64().unwrap_or(0.0)`;
        return `Value::str(format!("{:.*}", ${d}, ${n}))`;
    }
    case 'join': {
        if (args.length !== 2) return undefined;
        const s = strBox(args[1]);
        if (s === undefined) return undefined;
        if (ty === 'Vec<String>') return `Value::str(${x}.join(${s}))`;
        // Every element is a `Value::Str`, so the helper's stringify_simple is the identity.
        if (local?.elems === 'str' && set !== undefined && set.size === 1 && set.has('arr')) {
            return `Value::str(${x}.as_array().cloned().unwrap_or_default().iter().filter_map(Value::as_str).collect::<Vec<_>>().join(${s}))`;
        }
        return undefined;
    }
    default: return undefined;
    }
}

/** Rewrite the family where the operand type is proven; leave every other site as printed. */
export function rustStringNatives(content: string): string {
    if (!/to_string_val\(|replace_str\(|replace_all_str\(|split\(|join\(|starts_with\(|ends_with\(|to_fixed\(/.test(content)) return content;
    const masked = stringNativesMaskText(content);
    const rx = /(?<![A-Za-z0-9_:.])(to_string_val|replace_str|replace_all_str|split|join|starts_with|ends_with|to_fixed)\(/g;
    const hits: Array<{ start: number, end: number, name: string }> = [];
    for (const m of masked.matchAll(rx)) {
        const start = m.index as number;
        if (/\bfn\s+$/.test(masked.slice(Math.max(0, start - 8), start))) continue;
        const open = start + m[1].length;
        const close = stringNativesCloseParen(masked, open);
        if (close < 0) continue;
        hits.push({ start, end: close, name: m[1] });
    }
    if (hits.length === 0) return content;
    const rewrites: Array<{ start: number, end: number, text: string }> = [];
    const cache = new Map<number, Map<string, Local>>();
    for (const h of hits) {
        const [ lo, hi ] = fnBounds(masked, h.start);
        let locals = cache.get(lo);
        if (locals === undefined) {
            const region = content.slice(lo, hi);
            const head = content.slice(lo, hi).indexOf('{');
            const sig = head < 0 ? '' : region.slice(0, head);
            locals = valueSets(region, masked.slice(lo, hi), sig);
            cache.set(lo, locals);
        }
        const args = stringNativesSplitArgs(content, h.start + h.name.length + 1, h.end - 1);
        if (args === undefined) continue;
        const text = rewrite(h.name, args, locals);
        if (text === undefined) continue;
        // Never push a line that was under the 400-char report threshold over it.
        const lineStart = content.lastIndexOf('\n', h.start) + 1;
        const lineEnd = content.indexOf('\n', h.end);
        const len = (lineEnd < 0 ? content.length : lineEnd) - lineStart;
        if (len <= 400 && len - (h.end - h.start) + text.length > 400) continue;
        rewrites.push({ start: h.start, end: h.end, text });
    }
    if (rewrites.length === 0) return content;
    rewrites.sort((a, b) => a.start - b.start);
    let out = '';
    let at = 0;
    for (const r of rewrites) {
        if (r.start < at) continue;
        out += content.slice(at, r.start) + r.text;
        at = r.end;
    }
    return out + content.slice(at);
}

/** One case per rule; each fails on the base generator (no such pass). */
export function rustStringNativesSelfTest(): string[] {
    const cases: Array<[string, string, string]> = [
        [
            'to-string-scalar-local',
            'fn f(&self) -> Value {\n    let mut e: Value = self.sum(&[a, b]);\n    let mut s: Value = to_string_val(&e);\n    s\n}\n',
            'fn f(&self) -> Value {\n    let mut e: Value = self.sum(&[a, b]);\n    let mut s: Value = Value::str(e.to_string());\n    s\n}\n',
        ],
        [
            'to-string-inline-sum',
            'fn f(&self) -> Value {\n    self.log(to_string_val(&self.sum(&[a, b])));\n}\n',
            'fn f(&self) -> Value {\n    self.log(Value::str(self.sum(&[a, b]).to_string()));\n}\n',
        ],
        [
            'replace-on-str-local',
            'fn f(&self) -> Value {\n    let mut s: Value = self.decimal_to_precision(n, r, p, &[]);\n    s = replace_str(&s, &Value::Str(".".into()), &Value::Str("".into()));\n    s\n}\n',
            'fn f(&self) -> Value {\n    let mut s: Value = self.decimal_to_precision(n, r, p, &[]);\n    s = Value::str(s.as_str().unwrap_or_default().replace(".", ""));\n    s\n}\n',
        ],
        [
            'split-on-str-param',
            'fn f(&self, mut s: String) -> Value {\n    let mut parts: Value = split(&s, &Value::Str("_".into()));\n    parts\n}\n',
            'fn f(&self, mut s: String) -> Value {\n    let mut parts: Value = Value::Array(s.split("_").map(Value::str).collect());\n    parts\n}\n',
        ],
        [
            'join-on-string-vec',
            'fn f(&self, mut xs: Vec<String>) -> Value {\n    join(&xs, &Value::Str(",".into()))\n}\n',
            'fn f(&self, mut xs: Vec<String>) -> Value {\n    Value::str(xs.join(","))\n}\n',
        ],
        [
            'affix-on-str-local',
            'fn f(&self) -> Value {\n    let mut s: Value = self.safe_string_k(raw, "k", &[Value::Str("".into())]);\n    ends_with(&s, &Value::Str("USDT".into()))\n}\n',
            'fn f(&self) -> Value {\n    let mut s: Value = self.safe_string_k(raw, "k", &[Value::Str("".into())]);\n    s.as_str().unwrap_or_default().ends_with("USDT")\n}\n',
        ],
        [
            'to-fixed-on-float-local',
            'fn f(&self, mut d: f64) -> Value {\n    to_fixed(&d, &Value::Int(8))\n}\n',
            'fn f(&self, mut d: f64) -> Value {\n    Value::str(format!("{:.*}", 8, d))\n}\n',
        ],
        [
            'join-on-str-array-local',
            'fn f(&self) -> Value {\n    let mut parts: Value = Value::from(vec![]);\n    parts = Value::Array(s.as_str().map(|__s| __s.split("-").map(|__p| Value::Str(__p.to_string().into())).collect()).unwrap_or_default());\n    join(&parts, &Value::Str("-".into()))\n}\n',
            'fn f(&self) -> Value {\n    let mut parts: Value = Value::from(vec![]);\n    parts = Value::Array(s.as_str().map(|__s| __s.split("-").map(|__p| Value::Str(__p.to_string().into())).collect()).unwrap_or_default());\n    Value::str(parts.as_array().cloned().unwrap_or_default().iter().filter_map(Value::as_str).collect::<Vec<_>>().join("-"))\n}\n',
        ],
        [
            'join-on-str-array-local-from-split',
            'fn f(&self) -> Value {\n    let mut parts: Value = Value::from(vec![]);\n    parts = Value::Array(s.as_str().map(|__s| __s.split("-").map(Value::from).collect()).unwrap_or_default());\n    join(&parts, &Value::Str("-".into()))\n}\n',
            'fn f(&self) -> Value {\n    let mut parts: Value = Value::from(vec![]);\n    parts = Value::Array(s.as_str().map(|__s| __s.split("-").map(Value::from).collect()).unwrap_or_default());\n    Value::str(parts.as_array().cloned().unwrap_or_default().iter().filter_map(Value::as_str).collect::<Vec<_>>().join("-"))\n}\n',
        ],
        [
            'unproven-join-keeps-helper',
            'fn f(&self, mut xs: Value) -> Value {\n    join(&xs, &Value::Str(",".into()))\n}\n',
            'fn f(&self, mut xs: Value) -> Value {\n    join(&xs, &Value::Str(",".into()))\n}\n',
        ],
        [
            'unproven-keeps-helper',
            'fn f(&self, mut x: Value) -> Value {\n    to_string_val(&x)\n}\n',
            'fn f(&self, mut x: Value) -> Value {\n    to_string_val(&x)\n}\n',
        ],
        [
            'mutated-local-keeps-helper',
            'fn f(&self) -> Value {\n    let mut s: Value = self.safe_string_k(raw, "k", &[Value::Str("".into())]);\n    s = get_value(&raw, &Value::Str("x".into()));\n    to_string_val(&s)\n}\n',
            'fn f(&self) -> Value {\n    let mut s: Value = self.safe_string_k(raw, "k", &[Value::Str("".into())]);\n    s = get_value(&raw, &Value::Str("x".into()));\n    to_string_val(&s)\n}\n',
        ],
    ];
    const fails: string[] = [];
    for (const [ label, src, want ] of cases) {
        const got = rustStringNatives(src);
        if (got !== want) fails.push(`${label}: got\n${got}\nwant\n${want}`);
    }
    return fails;
}

// ---- plain-dict state containers ----
// `options`/`markets`/`balance` are single-owner untagged dicts, so `get_value_mut(&mut self.<f>, "lit")` prints the
// map's own `entry(k).or_insert(Null)`. Only literal string keys: a `Value` key may hit the helper's wildcard arm.

const FIELDS = ['options', 'markets', 'balance', 'ohlcvs'];
const PLAIN_DICT_RECV = 'self\\.(?:(?:core|parent)\\.)*(' + FIELDS.join('|') + ')';
const PLAIN_DICT_STR_KEY = /^&Value::Str\("((?:[^"\\]|\\.)*)"\.(?:into|to_string)\(\)\)$/;
const ROOT = new RegExp('^&mut\\s+' + PLAIN_DICT_RECV + '$');
const COERCED = new RegExp('^unsafe\\s*\\{\\s*crate::runtime::coerce_value_to_mut\\(&' + PLAIN_DICT_RECV + '\\)\\s*\\}$');
const PLAIN_DICT_MAX_LINE = 400;

/** Hide comments and string bodies so brace/paren scans cannot be fooled. */
function plainDictMaskSrc(src: string): string {
    const out = src.split('');
    const blank = (from: number, to: number) => {
        for (let i = from; i < to && i < out.length; i++) if (out[i] !== '\n') out[i] = ' ';
    };
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (c === '/' && src[i + 1] === '/') {
            const end = src.indexOf('\n', i);
            const stop = end < 0 ? src.length : end;
            blank(i, stop);
            i = stop;
            continue;
        }
        if (c === '/' && src[i + 1] === '*') {
            const end = src.indexOf('*/', i + 2);
            const stop = end < 0 ? src.length : end + 2;
            blank(i, stop);
            i = stop;
            continue;
        }
        if (c === "'") {
            const m = /^'(?:\\.|[^\\'])'/.exec(src.slice(i, i + 4));
            if (m !== null) { i += m[0].length; continue; }
        }
        if (c === '"') {
            let j = i + 1;
            while (j < src.length) {
                if (src[j] === '\\') { j += 2; continue; }
                if (src[j] === '"') break;
                j++;
            }
            blank(i, Math.min(j + 1, src.length));
            i = j + 1;
            continue;
        }
        i++;
    }
    return out.join('');
}

/** Top-level argument spans of the call whose `(` is at `open`. */
function plainDictArgSpans(masked: string, open: number): Array<[number, number]> | undefined {
    let depth = 0;
    const spans: Array<[number, number]> = [];
    let start = open + 1;
    for (let j = open; j < masked.length; j++) {
        const c = masked[j];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') {
            depth--;
            if (depth === 0) { spans.push([start, j]); return spans; }
        } else if (c === ',' && depth === 1) {
            spans.push([start, j]);
            start = j + 1;
        }
    }
    return undefined;
}

/** Offset of the `)` closing the `(` at `open`, or -1. */
function closeOf(masked: string, open: number): number {
    let depth = 0;
    for (let j = open; j < masked.length; j++) {
        const c = masked[j];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') {
            depth--;
            if (depth === 0) return j;
        }
    }
    return -1;
}

interface Hop { recv: string, key: string, literal: string | undefined, close: number }
interface Chain { hops: Hop[], root: string }

/** One `get_value_mut(<recv>, <key>)` call starting at `at`. */
function hopAt(content: string, masked: string, at: number): Hop | undefined {
    if (!/^get_value_mut\(/.test(masked.slice(at, at + 14))) return undefined;
    const open = at + 'get_value_mut'.length;
    const spans = plainDictArgSpans(masked, open);
    if (spans === undefined || spans.length !== 2) return undefined;
    const close = closeOf(masked, open);
    if (close < 0) return undefined;
    const key = content.slice(spans[1][0], spans[1][1]).trim();
    const lit = PLAIN_DICT_STR_KEY.exec(key);
    return {
        recv: content.slice(spans[0][0], spans[0][1]).trim(),
        key,
        literal: lit === null ? undefined : lit[1],
        close,
    };
}

/** The chain at `at`: hops outermost first, plus the innermost receiver. */
function chainAt(content: string, masked: string, at: number): Chain | undefined {
    const hops: Hop[] = [];
    let cur = at;
    for (let n = 0; n < 8; n++) {
        const h = hopAt(content, masked, cur);
        if (h === undefined) return undefined;
        hops.push(h);
        const lead = h.recv.length - h.recv.replace(/^\s+/, '').length;
        if (!/^get_value_mut\(/.test(h.recv)) return { hops, root: h.recv };
        cur = content.indexOf(h.recv, cur) + lead;
    }
    return undefined;
}

interface PlainDictRw { start: number, end: number, text: string }

/** `&ident` key whose binding in the enclosing fn is a proven `Value` (local or param). */
function valueIdentKey(masked: string, at: number, key: string): string {
    const id = /^&([A-Za-z_][A-Za-z0-9_]*)$/.exec(key);
    if (id === null) return '';
    const fnHead = /(?:^|\n)[ \t]*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+[A-Za-z_][A-Za-z0-9_]*/g;
    let start = 0;
    let m: RegExpExecArray | null;
    while ((m = fnHead.exec(masked)) !== null) {
        if (m.index > at) break;
        start = m.index;
    }
    const nl = masked.indexOf('\n', start + 1);
    const header = masked.slice(start, nl < 0 ? at : nl);
    const ident = id[1];
    const local = new RegExp('\\blet\\s+(?:mut\\s+)?' + ident + '\\s*:\\s*Value\\s*=');
    const other = new RegExp('\\blet\\s+(?:mut\\s+)?' + ident + '\\b(?!\\s*:\\s*Value\\s*=)');
    const param = new RegExp('(?:^|[(,]\\s*)(?:mut\\s+)?' + ident + '\\s*:\\s*Value\\b');
    const body = masked.slice(start, at);
    if (other.test(body)) return '';
    if (local.test(body) || param.test(header)) return 'crate::runtime::stringify_param(&' + ident + ')';
    return '';
}

function plainDictRunPass(content: string): string {
    if (!content.includes('get_value_mut(')) return content;
    const masked = plainDictMaskSrc(content);
    const headRe = /if let Value::Dict\(\s*(\w+)\s*\)\s*=\s*get_value_mut\(/g;
    const rws: PlainDictRw[] = [];
    let m: RegExpExecArray | null;
    while ((m = headRe.exec(masked)) !== null) {
        const bind = m[1];
        const at = m.index + m[0].length - 'get_value_mut('.length;
        const chain = chainAt(content, masked, at);
        if (chain === undefined) continue;
        if (!ROOT.test(chain.root) && !COERCED.test(chain.root)) continue;
        const outer = chain.hops[0];
        const allLiteral = chain.hops.every(h => h.literal !== undefined);
        // One `get_value_mut(&mut self.<plain field>, &<Value ident>)` hop: stringify_param is the
        // helper's own key lowering for the dict arm, so the entry form is the same write.
        const identKey = (!allLiteral && chain.hops.length === 1) ? valueIdentKey(masked, m.index, outer.key) : '';
        if (!allLiteral && outer.literal === undefined && identKey === '') continue;

        const end = chain.hops[0].close + 1;
        const braceOpen = masked.indexOf('{', end);
        if (braceOpen < 0) continue;
        if (masked.slice(end, braceOpen).trim() !== '') continue;
        let depth = 0;
        let braceClose = -1;
        for (let j = braceOpen; j < masked.length; j++) {
            const c = masked[j];
            if (c === '{') depth++;
            else if (c === '}') {
                depth--;
                if (depth === 0) { braceClose = j; break; }
            }
        }
        if (braceClose < 0) continue;

        const body = content.slice(braceOpen + 1, braceClose);
        if (body.includes('__bf03')) continue;

        const lineStart = content.lastIndexOf('\n', m.index) + 1;
        const pad = /^[ \t]*/.exec(content.slice(lineStart, m.index)) as RegExpExecArray;
        const level = (n: number) => pad[0] + '    '.repeat(n + 1);
        // Innermost key first: `keys[i]` is hop i counted from the container.
        const keys = identKey !== ''
            ? [identKey]
            : (allLiteral
                ? chain.hops.map(h => '"' + (h.literal as string) + '".to_string()').reverse()
                : ['"' + (outer.literal as string) + '".to_string()']);
        const head = (allLiteral || identKey !== '') ? chain.root : outer.recv;
        const lines: string[] = ['if let Value::Dict(__bf03d0) = ' + head + ' {'];
        const parts: string[] = ['if let Value::Dict(__bf03d0) = ' + head + ' {'];
        const bodyText = body.replace(/\s+$/, '');
        let tooLong = false;
        for (let i = 0; i < keys.length; i++) {
            const last = i === keys.length - 1;
            const entry = 'let __bf03e' + (i + 1)
                + ' = std::sync::Arc::make_mut(__bf03d' + i + ').entry(' + keys[i] + ')'
                + '.or_insert(Value::Null);';
            const test = last
                ? 'if let Value::Dict(' + bind + ') = __bf03e' + (i + 1) + ' {'
                : 'if let Value::Dict(__bf03d' + (i + 1) + ') = __bf03e' + (i + 1) + ' {';
            if (level(i).length + entry.length > PLAIN_DICT_MAX_LINE) { tooLong = true; break; }
            lines.push(level(i) + entry);
            lines.push(level(i) + test);
            parts.push(entry + ' ' + test);
        }
        if (tooLong) continue;
        const closers: string[] = [];
        for (let k = keys.length; k >= 0; k--) closers.push(pad[0] + '    '.repeat(k) + '}');
        const inline = new Array(keys.length + 1).fill('}').join(' ');
        // Keep the whole statement on one line when it fits, like the passes it
        // replaces: this is generated code and it is diffed, not read.
        const compact = parts.join(' ') + ' ' + bodyText.trim() + ' ' + inline;
        const multi = lines.join('\n') + bodyText + '\n' + closers.join('\n');
        const text = (bodyText.indexOf('\n') < 0 && pad[0].length + compact.length <= PLAIN_DICT_MAX_LINE) ? compact : multi;
        rws.push({ start: m.index, end: braceClose + 1, text });
        headRe.lastIndex = braceClose + 1;
    }
    if (rws.length === 0) return content;
    rws.sort((a, b) => a.start - b.start);
    let out = '';
    let at = 0;
    for (const r of rws) {
        if (r.start < at) continue;
        out += content.slice(at, r.start) + r.text;
        at = r.end;
    }
    return out + content.slice(at);
}

export function plainDictChains(content: string): string {
    return plainDictRunPass(content);
}

// ---- ws ClientHandle views ----
// In a venue method taking `client: Value`, a read of a handle field becomes a clone of the typed `ClientHandle`
// field, which stores exactly what `get_value` returns. A key the method writes through keeps the helper method-wide.

const CLIENT_HANDLE_KEYS = ['subscriptions', 'futures', 'rejections', 'url'];
const CLIENT_HANDLE_MAX_LINE = 400; // the generated tree's long-line budget
const CLIENT_HANDLE_TYPE = 'crate::pro::ws_client::ClientHandle';

/** Blank out comments and string bodies, keeping every index in place. */
export function clientHandleMask(src: string): string {
    let out = '';
    let i = 0;
    const n = src.length;
    while (i < n) {
        const c = src[i];
        if (c === '/' && src[i + 1] === '/') {
            while (i < n && src[i] !== '\n') { out += ' '; i++; }
            continue;
        }
        // Block comment (the generated files carry JS doc comments verbatim).
        if (c === '/' && src[i + 1] === '*') {
            out += '  ';
            i += 2;
            while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
                out += src[i] === '\n' ? '\n' : ' ';
                i++;
            }
            if (i < n) { out += '  '; i += 2; }
            continue;
        }
        if (c === '"') {
            out += '"';
            i++;
            while (i < n && src[i] !== '"') {
                if (src[i] === '\\') { out += '  '; i += 2; continue; }
                out += src[i] === '\n' ? '\n' : ' ';
                i++;
            }
            if (i < n) { out += '"'; i++; }
            continue;
        }
        out += c;
        i++;
    }
    return out;
}

/** `[start, end)` of every top-level `pub fn` body plus its header text. */
export function clientHandleFnBodies(masked: string): Array<{ fnStart: number, open: number, close: number, header: string }> {
    const out: Array<{ fnStart: number, open: number, close: number, header: string }> = [];
    const rx = /\bpub\s+(?:async\s+)?fn\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(masked)) !== null) {
        const open = masked.indexOf('{', m.index);
        if (open < 0) break;
        // A `;` between the signature and the `{` means this is a trait decl.
        if (masked.slice(m.index, open).includes(';')) continue;
        let depth = 1;
        let j = open + 1;
        while (j < masked.length && depth > 0) {
            const c = masked[j];
            if (c === '"') {
                j++;
                while (j < masked.length && masked[j] !== '"') { j += masked[j] === '\\' ? 2 : 1; }
            } else if (c === '{') depth++;
            else if (c === '}') depth--;
            if (depth === 0) break;
            j++;
        }
        if (depth !== 0) break;
        out.push({ fnStart: m.index, open, close: j, header: masked.slice(m.index, open) });
        rx.lastIndex = j;
    }
    return out;
}

/** Brace depth of `masked` at `idx` (0 = fn-body top level). */
function clientHandleDepthAt(masked: string, idx: number): number {
    let d = 0;
    for (let i = 0; i < idx; i++) {
        if (masked[i] === '{') d++;
        else if (masked[i] === '}') d--;
    }
    return d;
}

/** Index just past the `;` that ends the statement starting at `from`, or -1. */
function clientHandleStatementEnd(masked: string, from: number): number {
    let paren = 0, bracket = 0, brace = 0;
    for (let i = from; i < masked.length; i++) {
        const c = masked[i];
        if (c === '(') paren++;
        else if (c === ')') paren--;
        else if (c === '[') bracket++;
        else if (c === ']') bracket--;
        else if (c === '{') brace++;
        else if (c === '}') brace--;
        else if (c === ';' && paren === 0 && bracket === 0 && brace === 0) return i + 1;
    }
    return -1;
}

/**
 * `let mut client: Value = self.client(...)` at fn-body top level: the index
 * just past its `;`. Two declarations in one body, one nested in a block, or a
 * body that rebinds `client` later all leave the method a plain `Value`.
 */
function clientHandleLocalDecl(bodyMask: string): { start: number, end: number } | null {
    const rx = /let\s+mut\s+client\s*:\s*Value\s*=/g;
    let m: RegExpExecArray | null;
    let found: { start: number, end: number } | null = null;
    while ((m = rx.exec(bodyMask)) !== null) {
        if (found !== null) return null;
        if (clientHandleDepthAt(bodyMask, m.index) !== 0) return null;
        const end = clientHandleStatementEnd(bodyMask, m.index);
        if (end < 0) return null;
        found = { start: m.index, end };
    }
    return found;
}

export function clientHandleViewsMasked(content: string): string {
    if (!content.includes('&client')) return content;
    const masked = clientHandleMask(content);
    const bodies = clientHandleFnBodies(masked);
    // Edits are applied right-to-left so earlier indices stay valid.
    const edits: Array<{ at: number, del: number, text: string }> = [];
    for (const b of bodies) {
        const bodyText = content.slice(b.open + 1, b.close);
        const bodyMask = masked.slice(b.open + 1, b.close);
        let scopeStart = 0;   // first index in the body the handle is in scope at
        let insertAt = b.open + 1;
        if (/\bclient\s*:\s*Value\b/.test(b.header)) {
            // A reassigned or re-let `client` no longer names the param the handle was built from.
            if (/(?<![\w.])client\s*=[^=]/.test(bodyMask)) continue;
            if (/\blet\s+(?:mut\s+)?client\b/.test(bodyMask)) continue;
        } else {
            // `let mut client: Value = self.client(...)` — the venue builds a
            // handle for its own subscription; bind the view right after it.
            const decl = clientHandleLocalDecl(bodyMask);
            if (decl === null) continue;
            scopeStart = decl.end;
            insertAt = b.open + 1 + decl.end;
            if (/(?<![\w.])client\s*=[^=]/.test(bodyMask.slice(decl.end))) continue;
        }
        let needsMut = false;
        const perKey: Array<{ at: number, del: number, text: string }> = [];
        for (const key of CLIENT_HANDLE_KEYS) {
            // Pipeline text carries the allocating literal spelling
            // (`Value::Str("k".to_string())`); the borrow form is restored only
            // at write time, so both spellings must match here.
            const rx = new RegExp('get_value\\(\\s*&client\\s*,\\s*&Value::Str\\("' + key + '"\\.(?:into|to_string)\\(\\)\\)\\s*\\)', 'g');
            const reads: RegExpExecArray[] = [];
            const writes: RegExpExecArray[] = [];
            let m: RegExpExecArray | null;
            while ((m = rx.exec(bodyText)) !== null) {
                if (m.index < scopeStart) continue;
                const before = bodyMask.slice(Math.max(0, m.index - 12), m.index);
                (/(?<![\w.])&mut\s*$/.test(before) ? writes : reads).push(m);
            }
            if (reads.length === 0 && writes.length === 0) continue;
            // A read after the first write would see the field's mutation where
            // the helper saw a fresh snapshot: keep those (and only those) calls.
            const firstWrite = writes.length > 0 ? writes[0].index : Number.MAX_SAFE_INTEGER;
            for (const h of reads) {
                if (h.index >= firstWrite) continue;
                if (bodyMask[h.index] === ' ') continue; // inside a comment
                perKey.push({ at: b.open + 1 + h.index, del: h[0].length, text: '__ch.' + key + '.clone()' });
            }
            for (const h of writes) {
                if (bodyMask[h.index] === ' ') continue;
                needsMut = true;
                perKey.push({ at: b.open + 1 + h.index, del: h[0].length, text: '__ch.' + key });
            }
        }
        if (perKey.length === 0) continue;
        edits.push(...perKey);
        const firstNl = bodyText.indexOf('\n');
        const indent = insertAt === b.open + 1
            ? (firstNl < 0
                ? '        '
                : (bodyText.slice(firstNl + 1).match(/^[ ]*/) ?? '        ')[0] || '        ')
            : (bodyText.slice(bodyText.lastIndexOf('\n', insertAt - b.open - 2) + 1).match(/^[ ]*/) ?? [''])[0];
        edits.push({
            at: insertAt,
            del: 0,
            text: '\n' + indent + 'let ' + (needsMut ? 'mut ' : '') + '__ch = ' + CLIENT_HANDLE_TYPE + '::from_value(client.clone());',
        });
    }
    if (edits.length === 0) return content;
    edits.sort((x, y) => y.at - x.at);
    let out = content;
    for (const e of edits) out = out.slice(0, e.at) + e.text + out.slice(e.at + e.del);
    return out;
}

/**
 * Same rewrite, driven by line structure instead of a masked character walk.
 * A method starts on a `pub fn …(` line that sits directly inside an `impl`
 * block, and ends where the brace depth returns to that level; brace counting
 * skips comment and string spans per line.
 */
export function clientHandleViews(content: string): string {
    if (!content.includes('&client')) return content;
    const lines = content.split('\n');
    const braces = clientHandleBraceDeltas(content).split('\n');
    const out: string[] = [];
    let depth = 0;
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const startsMethod = depth === 1 && /^\s*pub\s+(?:async\s+)?fn\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(line);
        if (!startsMethod) {
            out.push(line);
            depth += clientHandleDeltaAt(braces, i);
            i++;
            continue;
        }
        let j = i;
        let level = depth;
        while (j < lines.length) {
            level += clientHandleDeltaAt(braces, j);
            if (j > i && level <= depth) break;
            j++;
        }
        if (j >= lines.length) { out.push(line); depth += clientHandleDeltaAt(braces, i); i++; continue; }
        out.push(...clientHandleBlock(lines.slice(i, j + 1)));
        for (let k = i; k <= j; k++) depth += clientHandleDeltaAt(braces, k);
        i = j + 1;
    }
    return clientHandleTypedReads(clientHandleSubsWrites(out.join('\n')));
}

const CLIENT_HANDLE_SUBS_WRITES: Array<[RegExp, string]> = [
    [/(?<![\w:.])remove\(&mut __ch\.subscriptions,\s*/g, '__ch.remove_subscription('],
    [/(?<![\w:.])add_element_to_object\(&mut __ch\.subscriptions,\s*/g, '__ch.add_subscription('],
];

/**
 * `remove(&mut __ch.subscriptions, k)` / `add_element_to_object(&mut __ch.subscriptions, k, v)`
 * become `__ch.remove_subscription(k)` / `__ch.add_subscription(k, v)`: ClientHandle owns the
 * `subscriptions` snapshot and the write that persists to the live client, so the venue code
 * names the operation instead of dispatching a dynamic helper on a Value.
 */
function clientHandleSubsWrites(content: string): string {
    if (!content.includes('&mut __ch.subscriptions')) return content;
    let text = content;
    for (const [rx, repl] of CLIENT_HANDLE_SUBS_WRITES) {
        // Mask comments/strings so only real code is rewritten; indices line up 1:1.
        const masked = clientHandleMask(text);
        const hits: Array<{ at: number, len: number }> = [];
        rx.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = rx.exec(masked)) !== null) hits.push({ at: m.index, len: m[0].length });
        for (let n = hits.length - 1; n >= 0; n--) {
            text = text.slice(0, hits[n].at) + repl + text.slice(hits[n].at + hits[n].len);
        }
    }
    return text;
}

const CLIENT_HANDLE_NAMES: { [k: string]: string } = { subscriptions: 'subscription', futures: 'future' };

/**
 * Remaining reads of the handle snapshots name a typed ClientHandle method:
 * key test -> `has_subscription(k)` / `has_future(k)`, `get_value(.., k)` ->
 * `get_subscription(k)` / `get_future(k)`, `object_keys(..)` -> `subscription_keys()` /
 * `future_keys()`. The methods read the same snapshot value the helpers did.
 */
function clientHandleTypedReads(content: string): string {
    if (!content.includes('__ch.')) return content;
    return content
        .replace(/matches!\(\(&__ch\.(subscriptions|futures)\.clone\(\), (&[^\n]+?)\), \(Value::Dict\(__d\), Value::Str\(__k\)\) if __d\.contains_key\(__k\.as_ref\(\)\)\)/g,
            (_m, k, key) => '__ch.has_' + CLIENT_HANDLE_NAMES[k] + '(' + key + ')')
        .replace(/(?<![\w:.])get_value\(&__ch\.(subscriptions|futures)\.clone\(\), (&[A-Za-z_][A-Za-z0-9_]*)\)/g,
            (_m, k, key) => '__ch.get_' + CLIENT_HANDLE_NAMES[k] + '(' + key + ')')
        .replace(/(?<![\w:.])object_keys\(&__ch\.(subscriptions|futures)\.clone\(\)\)\.as_array\(\)\.cloned\(\)\.unwrap_or_default\(\)/g,
            (_m, k) => '__ch.' + CLIENT_HANDLE_NAMES[k] + '_keys()');
}

/** The masked text (comments, strings, char literals blanked) for structure. */
function clientHandleBraceDeltas(content: string): string {
    return clientHandleMask(content);
}

/** Brace delta of one line of the masked text. */
function clientHandleDeltaAt(maskedLines: string[], idx: number): number {
    const line = maskedLines[idx] ?? '';
    let d = 0;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '{') d++;
        else if (c === '}') d--;
    }
    return d;
}

const CLIENT_HANDLE_LET = /^ {8}let mut client: Value = /;
const CLIENT_HANDLE_LET_NESTED = /^ {9,}let mut client: Value = /;
const CLIENT_HANDLE_REASSIGN = /^\s*client\s*=[^=]/;
const CLIENT_HANDLE_COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;

/** One method block (header + body + closing `    }`). */
function clientHandleBlock(block: string[]): string[] {
    const header = block[0];
    const fromParam = /\bclient\s*:\s*Value\b/.test(header);
    let anchor: number;      // binding line goes right after this index
    let bodyStart: number;   // first body line the handle is in scope for
    if (fromParam) {
        if (/\blet\s+(?:mut\s+)?client\b/.test(block.join('\n'))) return block;
        anchor = 0;
        bodyStart = 1;
    } else {
        const decls: number[] = [];
        for (let k = 1; k < block.length; k++) if (CLIENT_HANDLE_LET.test(block[k])) decls.push(k);
        if (decls.length === 0) {
            // A single-statement declaration nested in a block (`authenticate`'s
            // flight client): `client` is scoped to that block, and so is the
            // binding placed right after it, with every read after the decl.
            for (let k = 1; k < block.length; k++) if (CLIENT_HANDLE_LET_NESTED.test(block[k])) decls.push(k);
            const nestedAt: number = decls.length;
            if (nestedAt === 1 && !block[decls[0]].trimEnd().endsWith(';')) return block;
        }
        if (decls.length !== 1) return block; // none, or two handles in one method
        anchor = decls[0];
        bodyStart = anchor + 1;
    }
    for (let k = bodyStart; k < block.length; k++) if (CLIENT_HANDLE_REASSIGN.test(block[k])) return block;

    // Occurrence map per key, then one order-aware decision per key.
    const rewritten = new Map<number, string[]>();
    let needsMut = false;
    let touched = false;
    for (const key of CLIENT_HANDLE_KEYS) {
        // Pipeline text carries the allocating literal spelling
        // (`Value::Str("k".to_string())`); the borrow form is restored only at
        // write time, so both spellings must match here.
        const rx = new RegExp('get_value\\(\\s*&client\\s*,\\s*&Value::Str\\("' + key + '"\\.(?:into|to_string)\\(\\)\\)\\s*\\)', 'g');
        const reads: Array<{ line: number, col: number, len: number }> = [];
        const writes: Array<{ line: number, col: number, len: number }> = [];
        for (let k = bodyStart; k < block.length; k++) {
            const text = block[k];
            if (CLIENT_HANDLE_COMMENT_LINE.test(text)) continue;
            rx.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = rx.exec(text)) !== null) {
                const before = text.slice(Math.max(0, m.index - 8), m.index);
                (/(?<![\w.])&mut\s*$/.test(before) ? writes : reads).push({ line: k, col: m.index, len: m[0].length });
            }
        }
        if (reads.length === 0 && writes.length === 0) continue;
        // A read after the first write would observe the field's mutation where
        // the helper read a fresh snapshot: those stay helper calls.
        const firstWriteLine = writes.length > 0 ? writes[0].line : Number.MAX_SAFE_INTEGER;
        for (const r of reads) {
            if (r.line >= firstWriteLine) continue;
            if (!rewritten.has(r.line)) rewritten.set(r.line, []);
            rewritten.get(r.line)!.push(...clientHandleSpan(r.col, r.len, '__ch.' + key + '.clone()'));
            touched = true;
        }
        for (const w of writes) {
            if (!rewritten.has(w.line)) rewritten.set(w.line, []);
            rewritten.get(w.line)!.push(...clientHandleSpan(w.col, w.len, '__ch.' + key));
            needsMut = true;
            touched = true;
        }
    }
    if (!touched) return block;
    const bindIndent = fromParam ? '        ' : block[anchor].match(/^ */)![0];
    const binding = bindIndent + 'let ' + (needsMut ? 'mut ' : '') + '__ch = ' + CLIENT_HANDLE_TYPE + '::from_value(client.clone());';
    const result: string[] = [];
    for (let k = 0; k < block.length; k++) {
        const spans = rewritten.get(k);
        result.push(spans === undefined ? block[k] : clientHandleApply(block[k], spans));
        if (k === anchor) result.push(binding);
    }
    return result;
}

/** A replacement span encoded as `col:length:text`, kept sortable per line. */
function clientHandleSpan(col: number, len: number, text: string): string[] {
    return [col + ':' + len + ':' + text];
}

/** Apply `col:length:text` spans (rightmost first) to one line. */
function clientHandleApply(line: string, spans: string[]): string {
    const parsed = spans.map((s) => {
        const first = s.indexOf(':');
        const second = s.indexOf(':', first + 1);
        return { col: Number(s.slice(0, first)), len: Number(s.slice(first + 1, second)), text: s.slice(second + 1) };
    }).sort((a, b) => b.col - a.col);
    let out = line;
    for (const p of parsed) out = out.slice(0, p.col) + p.text + out.slice(p.col + p.len);
    return out;
}

export function clientHandleSelfTest(): string[] {
    const problems: string[] = [];
    const ok = (c: boolean, what: string) => { if (!c) problems.push('client handle self test: ' + what); };
    const head = '// PLEASE DO NOT EDIT THIS FILE\n';
    const wrap = (body: string, params = '&mut self, mut client: Value, mut message: Value') =>
        head + 'impl X {\n    pub fn handle_message(' + params + ') {\n' + body + '\n    }\n}\n';
    const read = (k: string) => `        let mut v: Value = get_value(&client, &Value::Str("${k}".into()));`;

    // 1. read on subscriptions goes through the handle
    const one = clientHandleViews(wrap(read('subscriptions')));
    ok(one.includes('let __ch = ' + CLIENT_HANDLE_TYPE + '::from_value(client.clone());'), 'binds the handle: ' + one);
    ok(one.includes('__ch.subscriptions.clone()'), 'field read: ' + one);
    ok(!one.includes('get_value(&client'), 'helper call gone: ' + one);

    // 2. a read *after* a write of the same key keeps the helper (the field is
    //    mutated by then); a read before the write is safe to type
    const write = clientHandleViews(wrap('        remove(&mut get_value(&client, &Value::Str("subscriptions".into())), &hash);\n' + read('subscriptions')));
    ok(write.includes('__ch.remove_subscription(&hash);'), 'write goes native: ' + write);
    ok(write.includes('let mut v: Value = get_value(&client, &Value::Str("subscriptions".into()));'), 'same-key read after the write kept: ' + write);
    const readFirst = clientHandleViews(wrap(read('subscriptions') + '\n        remove(&mut get_value(&client, &Value::Str("subscriptions".into())), &hash);'));
    ok(readFirst.includes('__ch.subscriptions.clone()'), 'earlier read typed: ' + readFirst);
    ok(readFirst.includes('__ch.remove_subscription(&hash);'), 'later write typed: ' + readFirst);

    // 3. writes on one key do not stop reads of another; a write-only key goes native
    const split = clientHandleViews(wrap('        remove(&mut get_value(&client, &Value::Str("futures".into())), &hash);\n' + read('subscriptions')));
    ok(split.includes('__ch.subscriptions.clone()'), 'other key still typed: ' + split);
    ok(split.includes('remove(&mut __ch.futures, &hash);'), 'write-only key typed: ' + split);
    ok(split.includes('let mut __ch = '), 'write site binds __ch mut: ' + split);
    ok(!split.includes('get_value(&client'), 'no client helper left: ' + split);

    // 4. no client param -> untouched
    const noParam = wrap(read('subscriptions'), '&mut self, mut message: Value');
    ok(clientHandleViews(noParam) === noParam, 'no client param untouched');

    // 5. other receivers, nested keys and comments are untouched
    const other = wrap('        let mut v: Value = get_value(&self.options, &Value::Str("subscriptions".into()));');
    ok(clientHandleViews(other) === other, 'other receiver untouched');
    const comment = wrap('        // get_value(&client, &Value::Str("subscriptions".into())) is the old read\n        let mut v: Value = Value::Null;');
    ok(clientHandleViews(comment) === comment, 'comment untouched');

    // 6. a reassigned `client` keeps every site a helper call
    const reassigned = wrap(read('subscriptions') + '\n        client = Value::Null;');
    ok(clientHandleViews(reassigned) === reassigned, 'reassigned client untouched');

    // 6b. `client` built by the venue (`self.client(url)`) is a handle too
    const localBody = '        let mut client: Value = self.client(&[url.clone()]);\n' + read('subscriptions');
    const local = clientHandleViews(wrap(localBody, '&mut self, mut url: Value'));
    ok(local.includes('self.client(&[url.clone()]);\n        let __ch = ' + CLIENT_HANDLE_TYPE), 'binding follows the local decl: ' + local);
    ok(local.includes('__ch.subscriptions.clone()'), 'local client typed: ' + local);
    ok(local.indexOf('let __ch') > local.indexOf('self.client('), 'binding is after the decl: ' + local);
    // ... but a declaration nested in a block, or a second one, is left alone
    const nestedBody = '        if (is_true(&flag)) {\n            let mut client: Value = self.client(&[url.clone()]);\n' + read('subscriptions') + '\n        }';
    const nested = clientHandleViews(wrap(nestedBody, '&mut self, mut url: Value'));
    ok(nested.includes('self.client(&[url.clone()]);\n            let __ch = ' + CLIENT_HANDLE_TYPE), 'nested decl typed at its own indent: ' + nested);
    const twoDecls = '        let mut client: Value = self.client(&[url.clone()]);\n        let mut client: Value = self.client(&[other.clone()]);\n' + read('subscriptions');
    const two = clientHandleViews(wrap(twoDecls, '&mut self, mut url: Value'));
    ok(two === wrap(twoDecls, '&mut self, mut url: Value'), 'two decls untouched');

    // 6c. a lone declaration nested in a block binds at the decl's indent
    const nestedOne = '        if (is_true(&flag)) {\n            let mut client: Value = self.client(&[url.clone()]);\n' + read('futures').replace('        let', '            let') + '\n        }';
    const nestedOut = clientHandleViews(wrap(nestedOne, '&mut self, mut url: Value'));
    ok(nestedOut.includes('self.client(&[url.clone()]);\n            let __ch = ' + CLIENT_HANDLE_TYPE), 'nested binding follows the decl: ' + nestedOut);
    ok(nestedOut.includes('__ch.futures.clone()'), 'nested read typed: ' + nestedOut);

    // 7. url / futures / rejections are handle fields too
    for (const k of ['url', 'futures', 'rejections']) {
        const got = clientHandleViews(wrap(read(k)));
        ok(got.includes('__ch.' + k + '.clone()'), k + ' typed: ' + got);
    }

    // 8. idempotent
    const twice = clientHandleViews(one);
    ok(twice === one, 'idempotent');
    ok(!twice.includes('let __ch = let __ch'), 'single binding');

    // 9. a read-only ws method that only mentions `client` stays as it is
    const bare = wrap('        let mut v: Value = client.clone();');
    ok(clientHandleViews(bare) === bare, 'no handle site untouched');
    ok(clientHandleViews('').length === 0, 'empty stays empty');
    ok(!clientHandleViews(wrap(read('subscriptions'))).includes('let mut __ch'), 'binding need not be mut: ' + one);

    // 10. the pipeline text carries the allocating literal spelling
    //     (`Value::Str("k".to_string())`); it must rewrite the same way.
    const alloc = wrap('        let mut v: Value = get_value(&client, &Value::Str("subscriptions".to_string()));');
    const allocOut = clientHandleViews(alloc);
    ok(allocOut.includes('__ch.subscriptions.clone()'), 'allocating spelling typed: ' + allocOut);
    ok(!allocOut.includes('get_value(&client'), 'allocating spelling helper gone: ' + allocOut);

    // 11. subscriptions writes name the handle operation
    const sw = clientHandleViews(wrap('        remove(&mut get_value(&client, &Value::Str("subscriptions".into())), &hash);\n        add_element_to_object(&mut get_value(&client, &Value::Str("subscriptions".into())), &hash, Value::Map({ let mut m = HashMap::new(); m.insert("a".to_string(), Value::Int(1)); m }));'));
    ok(sw.includes('__ch.remove_subscription(&hash);'), 'remove names the handle op: ' + sw);
    ok(sw.includes('__ch.add_subscription(&hash, Value::Map({'), 'add names the handle op: ' + sw);
    ok(!sw.includes('add_element_to_object(') && !sw.includes(' remove('), 'helpers gone: ' + sw);
    ok(sw.includes('let mut __ch = '), 'handle bound mut: ' + sw);
    ok(clientHandleViews(sw) === sw, 'writes idempotent');
    const futW = clientHandleViews(wrap('        remove(&mut get_value(&client, &Value::Str("futures".into())), &hash);'));
    ok(futW.includes('remove(&mut __ch.futures, &hash);'), 'other keys keep the helper: ' + futW);

    // 12. typed key tests, element reads and key lists
    const tr = clientHandleViews(wrap('        if (matches!((&get_value(&client, &Value::Str("subscriptions".into())), &hash), (Value::Dict(__d), Value::Str(__k)) if __d.contains_key(__k.as_ref()))) {}\n        let mut f: Value = get_value(&get_value(&client, &Value::Str("futures".into())), &hash);\n        let mut ks: Vec<Value> = object_keys(&get_value(&client, &Value::Str("subscriptions".into()))).as_array().cloned().unwrap_or_default();'));
    ok(tr.includes('if (__ch.has_subscription(&hash)) {}'), 'has_subscription: ' + tr);
    ok(tr.includes('__ch.get_future(&hash)'), 'get_future: ' + tr);
    ok(tr.includes('= __ch.subscription_keys();'), 'subscription_keys: ' + tr);
    ok(!tr.includes('.clone()), &') && !tr.includes('object_keys('), 'helpers gone: ' + tr);
    ok(clientHandleViews(tr) === tr, 'typed reads idempotent');

    return problems;
}

// ---- native-map param dispatch ----
// Dynamic dispatch for a method whose parameter prints as a native map: the dispatcher receives `Value`s, so it
// hands the method an owned map copy built from the argument; every other parameter keeps its shape.

const MAP_PARAM_RE = /:\s*&mut\s+indexmap::IndexMap<String, Value>/;

/** `'map'` for a printed native-map parameter, undefined for any other shape. */
export function mapParamKind(printedParam: string): 'map' | undefined {
    return MAP_PARAM_RE.test(printedParam) ? 'map' : undefined;
}

/** Dispatch argument for a native-map parameter (position `index` in `args`). The temp is built on the arm's
 *  own line so a generated dispatch arm stays within the 400-char line budget. */
export function mapParamDispatchArg(index: number): string {
    return `&mut { let mut __m = args.get(${index}).cloned().unwrap_or_default().as_map().cloned().unwrap_or_default();\n                    __m }`;
}

/** Split a printed parameter list on top-level commas: a generic argument list
 *  (`IndexMap<String, Value>`) carries its own. */
export function mapParamSplitArgs(argList: string): string[] {
    return mapParamSplitTopLevel(argList);
}

function mapParamSplitTopLevel(argList: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let current = '';
    for (const char of argList) {
        if (char === '<' || char === '(' || char === '[') {
            depth++;
        } else if (char === '>' || char === ')' || char === ']') {
            depth--;
        }
        if (char === ',' && depth === 0) {
            out.push(current);
            current = '';
            continue;
        }
        current += char;
    }
    out.push(current);
    return out;
}


const REF_MAP_PARAM_RE = /([A-Za-z_][A-Za-z0-9_]*)\s*:\s*&mut\s+indexmap::IndexMap<String, Value>/g;

/** Names a file prints as `&mut IndexMap` parameters. Copying one is the only
 *  way to box it, so a dead-clone pass must not turn that copy into a move. */
export function refMapParamNames(content: string): Set<string> {
    const names = new Set<string>();
    REF_MAP_PARAM_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = REF_MAP_PARAM_RE.exec(content)) !== null) {
        names.add(m[1]);
    }
    return names;
}

// Self-test cases for the dispatch helpers only (no transpile).
const MAP_PARAM_CASES: Array<{ name: string, got: () => any, want: any }> = [
    { name: 'split keeps a generic argument list whole', got: () => mapParamSplitTopLevel('&self, a: Value, p: &mut indexmap::IndexMap<String, Value>, optional_args: &[Value]'), want: ['&self', ' a: Value', ' p: &mut indexmap::IndexMap<String, Value>', ' optional_args: &[Value]'] },
    { name: 'split handles a plain list', got: () => mapParamSplitTopLevel('&self, a: Value, b: bool'), want: ['&self', ' a: Value', ' b: bool'] },
    { name: 'a map parameter is classified', got: () => mapParamKind('p: &mut indexmap::IndexMap<String, Value>'), want: 'map' },
    { name: 'a Value parameter is not', got: () => mapParamKind('p: Value'), want: undefined },
    { name: 'a file\'s map-parameter names are collected', got: () => Array.from(refMapParamNames('fn f(&self, a: Value, p: &mut indexmap::IndexMap<String, Value>) {}').values()), want: ['p'] },
    { name: 'the dispatch argument builds an owned map', got: () => mapParamDispatchArg(4), want: '&mut { let mut __m = args.get(4).cloned().unwrap_or_default().as_map().cloned().unwrap_or_default();\n                    __m }' },
];

export function mapParamDispatchSelfTest(): number {
    let failures = 0;
    for (const c of MAP_PARAM_CASES) {
        const got = c.got();
        const same = JSON.stringify(got) === JSON.stringify(c.want);
        console.log((same ? 'ok   ' : 'FAIL ') + c.name);
        if (!same) {
            failures++;
            console.log('       got:  ' + JSON.stringify(got));
            console.log('       want: ' + JSON.stringify(c.want));
        }
    }
    console.log(failures === 0 ? 'self-test: all cases pass' : 'self-test: ' + failures + ' failing');
    return failures;
}

// ---- narrow str locals ----
// `safe_string*` locals narrowed to a native `String` / `Option<String>`.
// Text passes over the final Rust; neither touches `this`.

/**
 * `let X: Value = self.safe_string*(obj, key, &[default])` whose every later use is its own
 * slot of a `format!` becomes a native `String` through the family's `_opt` twin, which has
 * the same lookup and default rules. Any other use, a `{:?}` sink or a non-`Str` default
 * keeps `Value`.
 */
export function narrowStrSinkLocals(content: string): string {
    // Boxed family -> its `Option<String>` twin on the same `Exchange` impl.
    const OPT: { [k: string]: string } = {
        safe_string: 'safe_string_opt',
        safe_string_k: 'safe_string_k_opt',
        safe_string_lower_k: 'safe_string_lower_k_opt',
        safe_string_upper_k: 'safe_string_upper_k_opt',
    };
    const declRe = /^([ \t]*)let (mut )?([a-zA-Z_][a-zA-Z0-9_]*): Value = self\.(safe_string[a-z_0-9]*)\(/gm;
    const strKeyRe = /^"(?:[^"\\]|\\.)*"$/;
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

    const masked = maskText(content);
    const rewrites: Array<{ start: number, end: number, text: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(masked)) !== null) {
        const fam = m[4];
        const opt = OPT[fam];
        if (opt === undefined) continue;
        const name = m[3];
        const callOpen = m.index + m[0].length - 1;
        const callClose = closeParen(masked, callOpen);
        if (callClose < 0) continue;
        const tail = /^\s*;/.exec(masked.slice(callClose, callClose + 3));
        if (tail === null) continue;
        const stmtEnd = callClose + tail[0].length;
        const base = callOpen + 1;
        const spans = argSpans(masked.slice(base, callClose - 1));
        if (spans.length !== 3) continue;
        const obj = content.slice(base + spans[0][0], base + spans[0][1]).trim();
        const keyRaw = content.slice(base + spans[1][0], base + spans[1][1]).trim();
        const defRaw = content.slice(base + spans[2][0], base + spans[2][1]).trim();
        if (obj.length === 0 || keyRaw.length === 0) continue;
        // The `_k` twins take `&str`, the `safe_string` twin a `Value` key: both pass verbatim.
        if (fam.endsWith('_k') && !strKeyRe.test(keyRaw)) continue;
        // A non-`Str` default would print its `Value`, not the `String` accessor's text.
        if (defRaw !== '&[]' && !/^&\[\s*Value::Str\(/.test(defRaw)) continue;
        const end = braceEnd(masked, stmtEnd);
        const body = masked.slice(stmtEnd, end);
        // A second binding of the name makes the use scan ambiguous.
        if (new RegExp(`\\b(?:let|for|fn)\\s+(?:mut\\s+)?${name}\\b`).test(body)) continue;
        if (new RegExp(`\\|[^|\\n]*\\b${name}\\b[^|\\n]*\\|`).test(body)) continue;
        const fRe = /format!\(/g;
        const fSpans: Array<[number, number, boolean]> = [];
        let f: RegExpExecArray | null;
        while ((f = fRe.exec(body)) !== null) {
            const close = closeParen(body, f.index + f[0].length - 1);
            if (close < 0) continue;
            const lit = /^"(?:[^"\\]|\\.)*"/.exec(body.slice(f.index + f[0].length, close));
            fSpans.push([f.index, close, lit !== null && /:\?/.test(lit[0])]);
        }
        const useRe = new RegExp(`(?<![A-Za-z0-9_.])${name}(?![A-Za-z0-9_])`, 'g');
        let ok = true; let uses = 0;
        let u: RegExpExecArray | null;
        while ((u = useRe.exec(body)) !== null) {
            const at = u.index;
            const cand = fSpans.filter(([s, e]) => at > s && at < e);
            if (cand.length === 0) { ok = false; break; }
            const hit = cand.reduce((a, b) => (b[0] > a[0] ? b : a));
            if (hit[2]) { ok = false; break; }
            // The use must BE a `format!` argument slot, not a block inside one.
            const inner = hit[0] + 'format!('.length;
            const slot = argSpans(body.slice(inner, hit[1] - 1))
                .filter(([a, b]) => inner + a <= at && at + name.length <= inner + b);
            if (slot.length === 0) { ok = false; break; }
            if (body.slice(inner + slot[0][0], inner + slot[0][1]).replace(/\s+/g, '') !== name) { ok = false; break; }
            uses++;
        }
        if (!ok || uses === 0) continue;
        const indent = m[1];
        const text = `${indent}let ${name}: String = self.${opt}(${obj}, ${keyRaw}, ${defRaw}).unwrap_or_default();`;
        if (indent.length + text.length > 400 && stmtEnd - m.index <= 400) continue;
        rewrites.push({ start: m.index, end: stmtEnd, text });
    }
    if (rewrites.length === 0) return content;
    rewrites.sort((a, b) => a.start - b.start);
    let out = ''; let last = 0;
    for (const r of rewrites) {
        if (r.start < last) continue; // overlapping — should not happen; keep the first
        out += content.slice(last, r.start) + r.text;
        last = r.end;
    }
    out += content.slice(last);
    return out;
}

/**
 * `let X: Value = self.safe_string*(obj, key, &[])` whose uses are all null tests,
 * `as_str()` compares, `stringify_param` calls or plain `Value` operands becomes
 * `Option<String>` through the `_opt` twin (same lookup and default rules, `None` where
 * the boxed helper yields `Null`). Null tests print `is_none()`/`is_some()`, compares
 * `as_deref()`, `get_value(&X, &Value::Int(0)).as_str() == Some("c")` the `starts_with("c")`
 * of the same first character, `stringify_param(&X)` the text it prints, and a `Value`
 * operand re-boxes through
 * `Value::from`, which builds the `Value::Str` the helper returned. Any other use, a
 * `&mut`, an assignment or a closure keeps `Value`.
 */
export function narrowStrNullLocals(content: string): string {
    const OPT: { [k: string]: string } = {
        safe_string: 'safe_string_opt',
        safe_string_k: 'safe_string_k_opt',
        safe_string_lower_k: 'safe_string_lower_k_opt',
        safe_string_upper_k: 'safe_string_upper_k_opt',
    };
    const declRe = /^([ \t]*)let (mut )?([a-zA-Z_][a-zA-Z0-9_]*): Value = self\.(safe_string[a-z_0-9]*)\(/gm;
    const strKeyRe = /^"(?:[^"\\]|\\.)*"$/;
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

    const masked = maskText(content);
    const grown = new Map<number, number>();
    const groups: Array<{ decl: { start: number, end: number, text: string }, edits: Array<{ start: number, end: number, text: string }> }> = [];
    const rewrites: Array<{ start: number, end: number, text: string }> = [];
    // Candidate declarations: boxed `self.safe_string*` calls and the inlined reads of a
    // `__pro_message` shadow (a `match` over `.get(key)` with the same coercion arms).
    type Cand = { index: number, stmtEnd: number, name: string, declText: string, intOnly?: boolean };
    const cands: Cand[] = [];
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(masked)) !== null) {
        const opt = OPT[m[4]];
        if (opt === undefined) continue;
        const callOpen = m.index + m[0].length - 1;
        const callClose = closeParen(masked, callOpen);
        if (callClose < 0) continue;
        const tail = /^\s*;/.exec(masked.slice(callClose, callClose + 3));
        if (tail === null) continue;
        const base = callOpen + 1;
        const spans = argSpans(masked.slice(base, callClose - 1));
        if (spans.length !== 3) continue;
        const obj = content.slice(base + spans[0][0], base + spans[0][1]).trim();
        const keyRaw = content.slice(base + spans[1][0], base + spans[1][1]).trim();
        const defRaw = content.slice(base + spans[2][0], base + spans[2][1]).trim();
        if (obj.length === 0 || keyRaw.length === 0) continue;
        if (m[4].endsWith('_k') && !strKeyRe.test(keyRaw)) continue;
        // Only a `Null` default maps to `None`.
        if (defRaw !== '&[]') continue;
        cands.push({
            index: m.index, stmtEnd: callClose + tail[0].length, name: m[3],
            declText: `${m[1]}let ${m[2] ?? ''}${m[3]}: Option<String> = self.${opt}(${obj}, ${keyRaw}, ${defRaw});`,
        });
    }
    const inlineRe = new RegExp('^([ \\t]*)let (mut )?([a-zA-Z_][a-zA-Z0-9_]*): Value = \\(match __pro_message\\.get\\(("(?:[^"\\\\]|\\\\.)*")\\)\\.cloned\\(\\) \\{ '
        + 'Some\\(Value::Str\\(__s\\)\\) if !__s\\.is_empty\\(\\) => Value::Str\\(__s\\), '
        + 'Some\\(Value::Int\\(__n\\)\\) => Value::Str\\(__n\\.to_string\\(\\)\\.into\\(\\)\\), '
        + 'Some\\(Value::Float\\(__f\\)\\) => Value::Str\\(__f\\.to_string\\(\\)\\.into\\(\\)\\), '
        + '_ => Value::Null \\}\\);', 'gm');
    while ((m = inlineRe.exec(content)) !== null) {
        cands.push({
            index: m.index, stmtEnd: m.index + m[0].length, name: m[3],
            declText: `${m[1]}let ${m[2] ?? ''}${m[3]}: Option<String> = match __pro_message.get(${m[4]}).cloned() { `
                + 'Some(Value::Str(__s)) if !__s.is_empty() => Some(__s.to_string()), '
                + 'Some(Value::Int(__n)) => Some(__n.to_string()), '
                + 'Some(Value::Float(__f)) => Some(__f.to_string()), _ => None };',
        });
    }
    // The `safe_integer` twin narrows to `Option<i64>` and only for null tests.
    const intRe = new RegExp('^([ \\t]*)let (mut )?([a-zA-Z_][a-zA-Z0-9_]*): Value = \\(match __pro_message\\.get\\(("(?:[^"\\\\]|\\\\.)*")\\)\\.cloned\\(\\) \\{ '
        + 'Some\\(Value::Int\\(__n\\)\\) => Value::Int\\(__n\\), Some\\(Value::Float\\(__f\\)\\) => Value::Int\\(__f as i64\\), '
        + 'Some\\(Value::Str\\(__s\\)\\) if !__s\\.is_empty\\(\\) => match __s\\.parse::<i64>\\(\\) \\{ Ok\\(__n\\) => Value::Int\\(__n\\), '
        + 'Err\\(_\\) => match __s\\.parse::<f64>\\(\\) \\{ Ok\\(__f\\) if __f\\.is_finite\\(\\) => Value::Int\\(__f as i64\\), _ => Value::Null \\} \\}, '
        + '_ => Value::Null \\}\\);', 'gm');
    while ((m = intRe.exec(content)) !== null) {
        cands.push({
            index: m.index, stmtEnd: m.index + m[0].length, name: m[3], intOnly: true,
            declText: `${m[1]}let ${m[2] ?? ''}${m[3]}: Option<i64> = match __pro_message.get(${m[4]}).cloned() { `
                + 'Some(Value::Int(__n)) => Some(__n), Some(Value::Float(__f)) => Some(__f as i64), '
                + 'Some(Value::Str(__s)) if !__s.is_empty() => match __s.parse::<i64>() { Ok(__n) => Some(__n), '
                + 'Err(_) => match __s.parse::<f64>() { Ok(__f) if __f.is_finite() => Some(__f as i64), _ => None } }, _ => None };',
        });
    }
    cands.sort((a, b) => a.index - b.index);
    for (const cand of cands) {
        const name = cand.name;
        const stmtEnd = cand.stmtEnd;
        const end = braceEnd(masked, stmtEnd);
        const body = masked.slice(stmtEnd, end);
        if (new RegExp(`\\b(?:let|for|fn)\\s+(?:mut\\s+)?${name}\\b`).test(body)) continue;
        if (new RegExp(`\\|[^|\\n]*\\b${name}\\b[^|\\n]*\\|`).test(body)) continue;
        const useRe = new RegExp(`(?<![A-Za-z0-9_.:])${name}(?![A-Za-z0-9_])`, 'g');
        const edits: Array<{ start: number, end: number, text: string }> = [];
        let ok = true; let u: RegExpExecArray | null;
        while ((u = useRe.exec(body)) !== null) {
            const at = u.index; const abs = stmtEnd + at; const after = body.slice(at + name.length);
            const before = body.slice(0, at);
            let g: RegExpExecArray | null;
            if (cand.intOnly === true && !/^\s*(==|!=)\s*Value::Null\b/.test(after)) { ok = false; break; }
            if ((g = /^\s*(==|!=)\s*Value::Null\b/.exec(after)) !== null && !/[&*]\s*$/.test(before)) {
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: `${name}.${g[1] === '==' ? 'is_none' : 'is_some'}()` });
            } else if ((g = /^\.as_str\(\)/.exec(after)) !== null) {
                // `Option<String>::as_deref()` is the same `Option<&str>` the boxed `as_str()` gave.
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: `${name}.as_deref()` });
            } else if (/get_value\(&$/.test(before)
                && (g = /^, &Value::Int\(0\)\)\.as_str\(\) (==|!=) Some\("/.exec(after)) !== null) {
                // First character probe; the char sits in the unmasked text at the same offsets.
                const chPos = abs + name.length + g[0].length;
                const ch = /^([^"\\])"\)/.exec(content.slice(chPos, chPos + 3));
                if (ch === null) { ok = false; break; }
                const probe = `${name}.as_deref().unwrap_or("").starts_with("${ch[1]}")`;
                edits.push({ start: abs - 'get_value(&'.length, end: chPos + ch[0].length, text: g[1] === '==' ? probe : `!${probe}` });
            } else if (/crate::runtime::stringify_param\(&$/.test(before) && /^\)/.test(after)) {
                // The helper prints `null` for `Null` and the text for `Str`: both are `Option<String>` states.
                const from = abs - 'crate::runtime::stringify_param(&'.length;
                edits.push({ start: from, end: abs + name.length + 1, text: `${name}.as_deref().unwrap_or("null").to_string()` });
            // eslint-disable-next-line no-useless-escape
            } else if (/(?:[(,\[]\s*&?|(?<![=!<>])=\s)$/.test(before) && !/&\s*mut\s*$/.test(before)
                && (g = /^(\.clone\(\))?(?=\s*[,)\];])/.exec(after)) !== null && !/==\s*$/.test(before)) {
                // The conversion consumes the `Option`: only the last use, outside any loop, may move it.
                const lastUse = !new RegExp(`(?<![A-Za-z0-9_.:])${name}(?![A-Za-z0-9_])`).test(after.slice(g[0].length));
                const inLoop = /\b(?:loop|while|for)\b/.test(body);
                const move = lastUse && !inLoop && !/&\s*$/.test(before);
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: `${name}${move ? '' : '.clone()'}.map(Value::from).unwrap_or(Value::Null)` });
            } else { ok = false; break; }
        }
        if (!ok || edits.length === 0) continue;
        // A longer line must not newly cross 400 chars, counting growth from earlier locals.
        const declText = cand.declText;
        const all = [{ start: cand.index, end: stmtEnd, text: declText }, ...edits];
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
        groups.push({ decl: { start: cand.index, end: stmtEnd, text: declText }, edits });
    }
    // A use that sits inside another narrowed local's initializer would be lost when that
    // statement is reprinted from its original text: leave the used local boxed.
    for (let again = true; again;) {
        again = false;
        for (let a = 0; a < groups.length; a++) {
            const hit = groups.some((b, bi) => bi !== a
                && groups[a].edits.some(e => e.start >= b.decl.start && e.start < b.decl.end));
            if (hit) { groups.splice(a, 1); again = true; break; }
        }
    }
    for (const gr of groups) { rewrites.push(gr.decl); for (const e of gr.edits) rewrites.push(e); }
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

// ---- sign api str local ----
// Rust: `let mut apiName: Value = api.get(0)...` whose every later use is `apiName.as_str() == Some("lit")` is a
// native Option<String>, exactly what the safe_string form was typed as before the element read.
export function rustSignApiStr (content: string): string {
    // an unbound `api` / `section` read: the bounds-checked nth of the list view, no closure
    content = content.replace (/\b(api|section)\.as_array\(\)\.and_then\(\|__arr\| __arr\.get\((\d+)\)\)/g, '$1.as_array().into_iter().flatten().nth($2)');
    if (content.indexOf ('.get(') < 0) { return content; }
    const lines = content.split ('\n');
    const decl = /^(\s*)let mut (\w+): Value = (?:api|section)\.get\((\d+)\)\.cloned\(\)\.unwrap_or\(Value::Null\);$/;
    const fnHead = /^ {4}(?:pub )?(?:async )?fn /;
    for (let i = 0; i < lines.length; i++) {
        const m = decl.exec (lines[i]);
        if (m === null) { continue; }
        let end = i + 1;
        while ((end < lines.length) && !fnHead.test (lines[end])) { end++; }
        const name = new RegExp ('(?<![\\w.])' + m[2] + '(?![\\w])', 'g');
        const use = new RegExp ('(?<![\\w.])' + m[2] + '\\.as_str\\(\\) (==|!=) Some\\("', 'g');
        let uses = 0;
        let others = 0;
        for (let j = i + 1; j < end; j++) {
            const masked = lines[j].replace (/"(?:[^"\\]|\\.)*"/g, '""');
            uses += (lines[j].match (use) ?? []).length;
            others += (masked.match (name) ?? []).length;
        }
        if ((uses === 0) || (uses !== others)) { continue; }
        lines[i] = m[1] + 'let mut ' + m[2] + ': Option<String> = ' + ((m[0].indexOf ('section') >= 0 ? 'section' : 'api')) + '.get(' + m[3] + ').and_then(Value::as_str).map(str::to_owned);';
        for (let j = i + 1; j < end; j++) {
            lines[j] = lines[j].replace (use, (all, op) => m[2] + '.as_deref() ' + op + ' Some("');
        }
    }
    return lines.join ('\n');
}

// ---- bool_k local -> Option<bool> ----
/**
 * `let mut X: Value = self.safe_bool_k(obj, "k", &[..])` (or `safe_bool`) whose every later use is a native-able bool
 * read becomes `Option<bool>` (default `&[]`) or `bool` (literal default). Any other use or a closure keeps `Value`.
 */
export function rustBoolKLocalOptionBool(content: string): string {
    const declRe = /^([ \t]*)let (mut )?([a-zA-Z_][a-zA-Z0-9_]*): Value = self\.(safe_bool_k|safe_bool)\(/gm;
    const strKeyRe = /^"(?:[^"\\]|\\.)*"$/;
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

    const masked = maskText(content);
    const grown = new Map<number, number>();
    const rewrites: Array<{ start: number, end: number, text: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(masked)) !== null) {
        const callee = m[4];
        const name = m[3];
        const callOpen = m.index + m[0].length - 1;
        const callClose = closeParen(masked, callOpen);
        if (callClose < 0) continue;
        const tail = /^\s*;/.exec(masked.slice(callClose, callClose + 3));
        if (tail === null) continue;
        const stmtEnd = callClose + tail[0].length;
        const base = callOpen + 1;
        const spans = argSpans(masked.slice(base, callClose - 1));
        if (spans.length !== 3) continue;
        const obj = content.slice(base + spans[0][0], base + spans[0][1]).trim();
        const keyRaw = content.slice(base + spans[1][0], base + spans[1][1]).trim();
        const defRaw = content.slice(base + spans[2][0], base + spans[2][1]).trim();
        if (obj.length === 0 || keyRaw.length === 0) continue;
        if (callee === 'safe_bool_k' && !strKeyRe.test(keyRaw)) continue;
        let dflt: boolean | null;
        const dm = /^&\[Value::Bool\((true|false)\)\]$/.exec(defRaw);
        if (defRaw === '&[]') dflt = null;
        else if (dm !== null) dflt = dm[1] === 'true';
        else continue;
        const isOpt = dflt === null;
        const end = braceEnd(masked, stmtEnd);
        const body = masked.slice(stmtEnd, end);
        if (new RegExp(`\\b(?:let|for|fn)\\s+(?:mut\\s+)?${name}\\b`).test(body)) continue;
        if (new RegExp(`\\|[^|\\n]*\\b${name}\\b[^|\\n]*\\|`).test(body)) continue;
        const useRe = new RegExp(`(?<![A-Za-z0-9_.:])${name}(?![A-Za-z0-9_])`, 'g');
        const edits: Array<{ start: number, end: number, text: string }> = [];
        const cmp = (eq: boolean, b: boolean): string => {
            // `X == Some(b)` / `X != Some(b)` on Option<bool>; plain or negated `X` on bool.
            if (isOpt) return `${name} ${eq ? '==' : '!='} Some(${b})`;
            return (eq === b) ? name : `!${name}`;
        };
        let ok = true; let u: RegExpExecArray | null;
        while ((u = useRe.exec(body)) !== null) {
            const at = u.index; const abs = stmtEnd + at; const after = body.slice(at + name.length);
            const before = body.slice(0, at);
            let g: RegExpExecArray | null;
            if ((g = /^\.as_bool\(\) (==|!=) Some\((true|false)\)/.exec(after)) !== null && !/[&*]\s*$/.test(before)) {
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: cmp(g[1] === '==', g[2] === 'true') });
            } else if ((g = /^\.is_truthy\(\)/.exec(after)) !== null && !/[&*]\s*$/.test(before)) {
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: isOpt ? `${name} == Some(true)` : name });
            } else if ((g = /^\s*(==|!=)\s*Value::Bool\((true|false)\)/.exec(after)) !== null && !/[&*]\s*$/.test(before)) {
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: cmp(g[1] === '==', g[2] === 'true') });
            } else if (isOpt && (g = /^\s*(==|!=)\s*Value::Null\b/.exec(after)) !== null && !/[&*]\s*$/.test(before)) {
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: `${name}.${g[1] === '==' ? 'is_none' : 'is_some'}()` });
            } else if ((g = /^\s*=\s*Value::Bool\((true|false)\);/.exec(after)) !== null && /(?:^|[;{}\s])\s*$/.test(before)) {
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: `${name} = ${isOpt ? `Some(${g[1]})` : g[1]};` });
            } else if (!isOpt && /is_true\(&$/.test(before) && /^\)/.test(after)) {
                continue; // `IsTruthy for &bool` is the identity
            } else if (/\.insert\(\s*"[^"]*"(?:\.to_string\(\)|\.into\(\))?,\s*$/.test(before.slice(-80).replace(/\n/g, ' '))
                && (g = /^(\.clone\(\))?\)/.exec(after)) !== null) {
                // `Value::Bool` / `Option<bool>` are `Copy`: the boxed value is rebuilt at the sink.
                edits.push({ start: abs, end: abs + name.length + g[0].length - 1, text: isOpt ? `${name}.map(Value::Bool).unwrap_or(Value::Null)` : `Value::Bool(${name})` });
            } else { ok = false; break; }
        }
        if (!ok || edits.length === 0) continue;
        const optName = callee === 'safe_bool_k' ? 'safe_bool_k_opt' : 'safe_bool_opt';
        const typeStart = m.index + m[1].length + 'let '.length + (m[2] ?? '').length + name.length;
        const declEdits = [
            { start: typeStart, end: callOpen, text: `: ${isOpt ? 'Option<bool>' : 'bool'} = self.${optName}` },
        ];
        if (!isOpt) declEdits.push({ start: callClose, end: callClose, text: `.unwrap_or(${dflt})` });
        const all = [...declEdits, ...edits];
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
        for (const e of all) rewrites.push(e);
    }
    if (rewrites.length === 0) return content;
    rewrites.sort((a, b) => a.start - b.start || a.end - b.end);
    let out = ''; let last = 0;
    for (const r of rewrites) {
        if (r.start < last) continue;
        out += content.slice(last, r.start) + r.text;
        last = r.end;
    }
    out += content.slice(last);
    return out;
}

// ---- reassigned str local -> Option<String> ----
// `safe_string*` locals that are later reassigned, narrowed to `Option<String>`.
// Text pass over the final Rust; complements narrowStrNullLocals, which skips any assigned name.

/**
 * `let mut X: Value = self.safe_string*(obj, key, &[])` that is assigned again, where every
 * assignment is `X = self.safe_string*(..)` (same family, becomes its `_opt` twin),
 * `X = Value::Str("lit".into())` (becomes `Some("lit".to_string())`) or `X = Value::Null`
 * (becomes `None`), and every other use is a null test, an `as_str()` compare or a `Value`
 * operand (re-boxed with `Value::from`). Any other use keeps `Value`.
 */
export function strLocalReassign(content: string): string {
    const OPT: { [k: string]: string } = {
        safe_string: 'safe_string_opt',
        safe_string_k: 'safe_string_k_opt',
        safe_string_lower_k: 'safe_string_lower_k_opt',
        safe_string_upper_k: 'safe_string_upper_k_opt',
    };
    const declRe = /^([ \t]*)let mut ([a-zA-Z_][a-zA-Z0-9_]*): Value = self\.(safe_string[a-z_0-9]*)\(/gm;
    const strKeyRe = /^"(?:[^"\\]|\\.)*"$/;
    const strLitRe = /^Value::Str\(("(?:[^"\\]|\\.)*")\.into\(\)\)$/;
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
    const stmtEndAt = (src: string, from: number): number => {
        let depth = 0;
        for (let k = from; k < src.length; k++) {
            const c = src[k];
            if (c === '(' || c === '[' || c === '{') depth++;
            else if (c === ')' || c === ']' || c === '}') { depth--; if (depth < 0) return -1; }
            else if (c === ';' && depth === 0) return k;
        }
        return -1;
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
    type Edit = { start: number, end: number, text: string };

    const masked = maskText(content);
    const grown = new Map<number, number>();
    const groups: Array<{ decl: Edit, edits: Edit[] }> = [];
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(masked)) !== null) {
        const fam = m[3];
        const opt = OPT[fam];
        if (opt === undefined) continue;
        const name = m[2];
        const callOpen = m.index + m[0].length - 1;
        const callClose = closeParen(masked, callOpen);
        if (callClose < 0) continue;
        const tail = /^\s*;/.exec(masked.slice(callClose, callClose + 3));
        if (tail === null) continue;
        const stmtEnd = callClose + tail[0].length;
        // A call whose twin gives the same value: only an empty or empty-string default.
        const callEdit = (famName: string, open: number, close: number): Edit | null => {
            const twin = OPT[famName];
            if (twin === undefined) return null;
            const base = open + 1;
            const spans = argSpans(masked.slice(base, close - 1));
            if (spans.length !== 3) return null;
            const keyRaw = content.slice(base + spans[1][0], base + spans[1][1]).trim();
            if (famName.endsWith('_k') && !strKeyRe.test(keyRaw)) return null;
            if (keyRaw.length === 0) return null;
            const defRaw = content.slice(base + spans[2][0], base + spans[2][1]).trim();
            const defMasked = masked.slice(base + spans[2][0], base + spans[2][1]).trim();
            if (!(defMasked === '&[]'
                || /^&\[Value::Str\("\s*"\.into\(\)\)\]$/.test(defMasked))) return null;
            if (defRaw.length === 0) return null;
            const nameAt = open - famName.length;
            return { start: nameAt, end: open, text: twin };
        };
        const declEdit = callEdit(fam, callOpen, callClose);
        if (declEdit === null) continue;
        const end = braceEnd(masked, stmtEnd);
        const body = masked.slice(stmtEnd, end);
        if (new RegExp(`\\b(?:let|for|fn)\\s+(?:mut\\s+)?${name}\\b`).test(body)) continue;
        if (new RegExp(`\\|[^|\\n]*\\b${name}\\b[^|\\n]*\\|`).test(body)) continue;
        const useRe = new RegExp(`(?<![A-Za-z0-9_.:])${name}(?![A-Za-z0-9_])`, 'g');
        const edits: Edit[] = [declEdit];
        let assigned = 0; let ok = true; let u: RegExpExecArray | null;
        while ((u = useRe.exec(body)) !== null) {
            const at = u.index; const abs = stmtEnd + at; const after = body.slice(at + name.length);
            const before = body.slice(0, at);
            let g: RegExpExecArray | null;
            if ((g = /^\s*=(?!=)\s*/.exec(after)) !== null && /(?:^|[;{}])\s*$/.test(before)) {
                // Assignment: only the three forms that map to `Option<String>`.
                const rhsStart = abs + name.length + g[0].length;
                const rhsEnd = stmtEndAt(masked, rhsStart);
                if (rhsEnd < 0) { ok = false; break; }
                const rhsMasked = masked.slice(rhsStart, rhsEnd).trim();
                const rhsRaw = content.slice(rhsStart, rhsEnd).trim();
                let lit: RegExpExecArray | null; let call: RegExpExecArray | null;
                if (rhsMasked === 'Value::Null') {
                    edits.push({ start: rhsStart, end: rhsStart + 'Value::Null'.length, text: 'None' });
                } else if ((lit = strLitRe.exec(rhsRaw)) !== null) {
                    edits.push({ start: rhsStart, end: rhsStart + rhsRaw.length, text: `Some(${lit[1]}.to_string())` });
                } else if ((call = /^self\.(safe_string[a-z_0-9]*)\(/.exec(rhsMasked)) !== null) {
                    const open = rhsStart + call[0].length - 1;
                    const close = closeParen(masked, open);
                    if (close < 0 || masked.slice(close, rhsEnd).trim() !== '') { ok = false; break; }
                    const ce = callEdit(call[1], open, close);
                    if (ce === null) { ok = false; break; }
                    edits.push(ce);
                } else { ok = false; break; }
                assigned++;
                useRe.lastIndex = rhsStart - stmtEnd; // inner uses of the name in the RHS are rewritten below
                continue;
            }
            if ((g = /^\s*(==|!=)\s*Value::Null\b/.exec(after)) !== null && !/[&*]\s*$/.test(before)) {
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: `${name}.${g[1] === '==' ? 'is_none' : 'is_some'}()` });
            } else if ((g = /^\.as_str\(\)/.exec(after)) !== null) {
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: `${name}.as_deref()` });
            // eslint-disable-next-line no-useless-escape
            } else if (/(?:[(,\[]\s*&?|(?<![=!<>])=\s)$/.test(before) && !/&\s*mut\s*$/.test(before)
                && (g = /^(\.clone\(\))?(?=\s*[,)\];])/.exec(after)) !== null && !/==\s*$/.test(before)) {
                // The conversion consumes the `Option`: only the last use, outside any loop, may move it.
                const lastUse = !new RegExp(`(?<![A-Za-z0-9_.:])${name}(?![A-Za-z0-9_])`).test(after.slice(g[0].length));
                const inLoop = /\b(?:loop|while|for)\b/.test(body);
                const move = lastUse && !inLoop && !/&\s*$/.test(before);
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: `${name}${move ? '' : '.clone()'}.map(Value::from).unwrap_or(Value::Null)` });
            } else { ok = false; break; }
        }
        if (!ok || assigned === 0) continue;
        const declText = `${m[1]}let mut ${name}: Option<String> = `;
        const all: Edit[] = [{ start: m.index, end: m.index + m[0].length - `self.${fam}(`.length, text: declText }, ...edits];
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
        groups.push({ decl: { start: m.index, end: stmtEnd, text: '' }, edits: all });
    }
    // A use inside another narrowed local's declaration or edit region is left boxed.
    for (let again = true; again;) {
        again = false;
        for (let a = 0; a < groups.length && !again; a++) {
            for (let b = 0; b < groups.length; b++) {
                if (a === b) continue;
                const bEdits = groups[b].edits;
                const bs = groups[b].decl.start; const be = groups[b].decl.end;
                // Uses of `a` that sit within b's declaration statement would be reprinted from original text.
                if (groups[a].edits.some(e => e.start >= bs && e.start < be && e.start !== bs)
                    && bEdits.length > 0) { groups.splice(a, 1); again = true; break; }
            }
        }
    }
    const rewrites: Edit[] = [];
    for (const gr of groups) for (const e of gr.edits) rewrites.push(e);
    if (rewrites.length === 0) return content;
    rewrites.sort((a, b) => a.start - b.start);
    let out = ''; let last = 0;
    for (const r of rewrites) {
        if (r.start < last) continue;
        out += content.slice(last, r.start) + r.text;
        last = r.end;
    }
    out += content.slice(last);
    return out;
}

// ---- bool2 local -> Option<bool> ----
/**
 * `let mut X: Value = self.safe_bool2(obj, k1, k2, &[..])` whose every later use is a native-able bool read becomes
 * `Option<bool>` / `bool` (same uses as the bool_k pass); a non-literal default, shadowing or closure keeps `Value`.
 */
export function rustBool2LocalOptionBool(content: string): string {
    const declRe = /^([ \t]*)let (mut )?([a-zA-Z_][a-zA-Z0-9_]*): Value = self\.(safe_bool2)\(/gm;
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

    const masked = maskText(content);
    const grown = new Map<number, number>();
    const rewrites: Array<{ start: number, end: number, text: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(masked)) !== null) {
        const name = m[3];
        const callOpen = m.index + m[0].length - 1;
        const callClose = closeParen(masked, callOpen);
        if (callClose < 0) continue;
        const tail = /^\s*;/.exec(masked.slice(callClose, callClose + 3));
        if (tail === null) continue;
        const stmtEnd = callClose + tail[0].length;
        const base = callOpen + 1;
        const spans = argSpans(masked.slice(base, callClose - 1));
        if (spans.length !== 4) continue;
        const obj = content.slice(base + spans[0][0], base + spans[0][1]).trim();
        const key1 = content.slice(base + spans[1][0], base + spans[1][1]).trim();
        const key2 = content.slice(base + spans[2][0], base + spans[2][1]).trim();
        const defRaw = content.slice(base + spans[3][0], base + spans[3][1]).trim();
        if (obj.length === 0 || key1.length === 0 || key2.length === 0) continue;
        let dflt: boolean | null;
        const dm = /^&\[Value::Bool\((true|false)\)\]$/.exec(defRaw);
        if (defRaw === '&[]') dflt = null;
        else if (dm !== null) dflt = dm[1] === 'true';
        else continue;
        const isOpt = dflt === null;
        const end = braceEnd(masked, stmtEnd);
        const body = masked.slice(stmtEnd, end);
        if (new RegExp(`\\b(?:let|for|fn)\\s+(?:mut\\s+)?${name}\\b`).test(body)) continue;
        if (new RegExp(`\\|[^|\\n]*\\b${name}\\b[^|\\n]*\\|`).test(body)) continue;
        const useRe = new RegExp(`(?<![A-Za-z0-9_.:])${name}(?![A-Za-z0-9_])`, 'g');
        const edits: Array<{ start: number, end: number, text: string }> = [];
        const cmp = (eq: boolean, b: boolean): string => {
            // `X == Some(b)` / `X != Some(b)` on Option<bool>; plain or negated `X` on bool.
            if (isOpt) return `${name} ${eq ? '==' : '!='} Some(${b})`;
            return (eq === b) ? name : `!${name}`;
        };
        let ok = true; let u: RegExpExecArray | null;
        while ((u = useRe.exec(body)) !== null) {
            const at = u.index; const abs = stmtEnd + at; const after = body.slice(at + name.length);
            const before = body.slice(0, at);
            let g: RegExpExecArray | null;
            if ((g = /^\.as_bool\(\) (==|!=) Some\((true|false)\)/.exec(after)) !== null && !/[&*]\s*$/.test(before)) {
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: cmp(g[1] === '==', g[2] === 'true') });
            } else if ((g = /^\.is_truthy\(\)/.exec(after)) !== null && !/[&*]\s*$/.test(before)) {
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: isOpt ? `${name} == Some(true)` : name });
            } else if ((g = /^\s*(==|!=)\s*Value::Bool\((true|false)\)/.exec(after)) !== null && !/[&*]\s*$/.test(before)) {
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: cmp(g[1] === '==', g[2] === 'true') });
            } else if (isOpt && (g = /^\s*(==|!=)\s*Value::Null\b/.exec(after)) !== null && !/[&*]\s*$/.test(before)) {
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: `${name}.${g[1] === '==' ? 'is_none' : 'is_some'}()` });
            } else if ((g = /^\s*=\s*Value::Bool\((true|false)\);/.exec(after)) !== null && /(?:^|[;{}\s])\s*$/.test(before)) {
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: `${name} = ${isOpt ? `Some(${g[1]})` : g[1]};` });
            } else if (!isOpt && /is_true\(&$/.test(before) && /^\)/.test(after)) {
                continue; // `IsTruthy for &bool` is the identity
            } else if (/\.insert\(\s*"[^"]*"(?:\.to_string\(\)|\.into\(\))?,\s*$/.test(before.slice(-80).replace(/\n/g, ' '))
                && (g = /^(\.clone\(\))?\)/.exec(after)) !== null) {
                // `Value::Bool` / `Option<bool>` are `Copy`: the boxed value is rebuilt at the sink.
                edits.push({ start: abs, end: abs + name.length + g[0].length - 1, text: isOpt ? `${name}.map(Value::Bool).unwrap_or(Value::Null)` : `Value::Bool(${name})` });
            } else { ok = false; break; }
        }
        if (!ok || edits.length === 0) continue;
        const optName = 'safe_bool2_opt';
        const typeStart = m.index + m[1].length + 'let '.length + (m[2] ?? '').length + name.length;
        const declEdits = [
            { start: typeStart, end: callOpen, text: `: ${isOpt ? 'Option<bool>' : 'bool'} = self.${optName}` },
        ];
        if (!isOpt) declEdits.push({ start: callClose, end: callClose, text: `.unwrap_or(${dflt})` });
        const all = [...declEdits, ...edits];
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
        for (const e of all) rewrites.push(e);
    }
    if (rewrites.length === 0) return content;
    rewrites.sort((a, b) => a.start - b.start || a.end - b.end);
    let out = ''; let last = 0;
    for (const r of rewrites) {
        if (r.start < last) continue;
        out += content.slice(last, r.start) + r.text;
        last = r.end;
    }
    out += content.slice(last);
    return out;
}

// ---- bool_n local -> Option<bool> ----
/**
 * `let mut X: Value = self.safe_bool_n(obj, Value::from(vec![..]), &[..])` whose every later use is a native-able bool
 * read becomes `Option<bool>` / `bool` (same uses as the bool_k pass). Any other use or a closure keeps `Value`.
 */
export function rustBoolNLocalOptionBool(content: string): string {
    const declRe = /^([ \t]*)let (mut )?([a-zA-Z_][a-zA-Z0-9_]*): Value = self\.(safe_bool_n)\(/gm;
    const keyListRe = /^Value::from\(vec!\[Value::Str\("(?:[^"\\]|\\.)*"\.(?:into|to_string)\(\)\)(?:, Value::Str\("(?:[^"\\]|\\.)*"\.(?:into|to_string)\(\)\))*\]\)$/;
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

    const masked = maskText(content);
    const grown = new Map<number, number>();
    const rewrites: Array<{ start: number, end: number, text: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(masked)) !== null) {
        const name = m[3];
        const callOpen = m.index + m[0].length - 1;
        const callClose = closeParen(masked, callOpen);
        if (callClose < 0) continue;
        const tail = /^\s*;/.exec(masked.slice(callClose, callClose + 3));
        if (tail === null) continue;
        const stmtEnd = callClose + tail[0].length;
        const base = callOpen + 1;
        const spans = argSpans(masked.slice(base, callClose - 1));
        if (spans.length !== 3) continue;
        const obj = content.slice(base + spans[0][0], base + spans[0][1]).trim();
        const keyRaw = content.slice(base + spans[1][0], base + spans[1][1]).trim();
        const defRaw = content.slice(base + spans[2][0], base + spans[2][1]).trim();
        if (obj.length === 0 || keyRaw.length === 0) continue;
        if (!keyListRe.test(keyRaw)) continue;
        let dflt: boolean | null;
        const dm = /^&\[Value::Bool\((true|false)\)\]$/.exec(defRaw);
        if (defRaw === '&[]') dflt = null;
        else if (dm !== null) dflt = dm[1] === 'true';
        else continue;
        const isOpt = dflt === null;
        const end = braceEnd(masked, stmtEnd);
        const body = masked.slice(stmtEnd, end);
        if (new RegExp(`\\b(?:let|for|fn)\\s+(?:mut\\s+)?${name}\\b`).test(body)) continue;
        if (new RegExp(`\\|[^|\\n]*\\b${name}\\b[^|\\n]*\\|`).test(body)) continue;
        const useRe = new RegExp(`(?<![A-Za-z0-9_.:])${name}(?![A-Za-z0-9_])`, 'g');
        const edits: Array<{ start: number, end: number, text: string }> = [];
        const cmp = (eq: boolean, b: boolean): string => {
            // `X == Some(b)` / `X != Some(b)` on Option<bool>; plain or negated `X` on bool.
            if (isOpt) return `${name} ${eq ? '==' : '!='} Some(${b})`;
            return (eq === b) ? name : `!${name}`;
        };
        let ok = true; let u: RegExpExecArray | null;
        while ((u = useRe.exec(body)) !== null) {
            const at = u.index; const abs = stmtEnd + at; const after = body.slice(at + name.length);
            const before = body.slice(0, at);
            let g: RegExpExecArray | null;
            if ((g = /^\.as_bool\(\) (==|!=) Some\((true|false)\)/.exec(after)) !== null && !/[&*]\s*$/.test(before)) {
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: cmp(g[1] === '==', g[2] === 'true') });
            } else if ((g = /^\.is_truthy\(\)/.exec(after)) !== null && !/[&*]\s*$/.test(before)) {
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: isOpt ? `${name} == Some(true)` : name });
            } else if ((g = /^\s*(==|!=)\s*Value::Bool\((true|false)\)/.exec(after)) !== null && !/[&*]\s*$/.test(before)) {
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: cmp(g[1] === '==', g[2] === 'true') });
            } else if (isOpt && (g = /^\s*(==|!=)\s*Value::Null\b/.exec(after)) !== null && !/[&*]\s*$/.test(before)) {
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: `${name}.${g[1] === '==' ? 'is_none' : 'is_some'}()` });
            } else if ((g = /^\s*=\s*Value::Bool\((true|false)\);/.exec(after)) !== null && /(?:^|[;{}\s])\s*$/.test(before)) {
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: `${name} = ${isOpt ? `Some(${g[1]})` : g[1]};` });
            } else if (!isOpt && /is_true\(&$/.test(before) && /^\)/.test(after)) {
                continue; // `IsTruthy for &bool` is the identity
            } else if (/\.insert\(\s*"[^"]*"(?:\.to_string\(\)|\.into\(\))?,\s*$/.test(before.slice(-80).replace(/\n/g, ' '))
                && (g = /^(\.clone\(\))?\)/.exec(after)) !== null) {
                // `Value::Bool` / `Option<bool>` are `Copy`: the boxed value is rebuilt at the sink.
                edits.push({ start: abs, end: abs + name.length + g[0].length - 1, text: isOpt ? `${name}.map(Value::Bool).unwrap_or(Value::Null)` : `Value::Bool(${name})` });
            } else { ok = false; break; }
        }
        if (!ok || edits.length === 0) continue;
        const optName = 'safe_bool_n_opt';
        const typeStart = m.index + m[1].length + 'let '.length + (m[2] ?? '').length + name.length;
        const declEdits = [
            { start: typeStart, end: callOpen, text: `: ${isOpt ? 'Option<bool>' : 'bool'} = self.${optName}` },
        ];
        if (!isOpt) declEdits.push({ start: callClose, end: callClose, text: `.unwrap_or(${dflt})` });
        const all = [...declEdits, ...edits];
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
        for (const e of all) rewrites.push(e);
    }
    if (rewrites.length === 0) return content;
    rewrites.sort((a, b) => a.start - b.start || a.end - b.end);
    let out = ''; let last = 0;
    for (const r of rewrites) {
        if (r.start < last) continue;
        out += content.slice(last, r.start) + r.text;
        last = r.end;
    }
    out += content.slice(last);
    return out;
}

// ---- integer2 / integer_n local -> Option<i64> ----
// `safe_integer2` / `safe_integer_n` locals become `Option<i64>` via `*_opt` readers.
// Pure text pass over the final Rust; relies on `From<Option<i64>> for Value` and the stubs twins.

/**
 * `let [mut] X: Value = self.safe_integer2|safe_integer_n(.., &[] | &[Value::Null])` becomes
 * `Option<i64>` (`safe_integer2_opt` / `safe_integer_n_opt`) when every later use of `X` is one of:
 *   `X.clone()` -> `Value::from(X)`           `self.iso8601(X)` / `m.insert("k".to_string(), X);` sinks
 *   `X != / == Value::Null` -> `is_some()` / `is_none()`
 *   `X.as_f64() == / != Some(<n>[.0])` -> `X == / != Some(<n>)`
 *   `X = Value::Null | Value::Int(n) | self.safe_integer*(..);` -> `None` / `Some(n)` / `.as_i64()`
 * Any other use, or a second binding of the name, keeps `Value`.
 */
export function rustInt2IntNLocalOptionI64(content: string): string {
    const declRe = /^([ \t]*)let (mut )?([a-zA-Z_][a-zA-Z0-9_]*): Value = self\.safe_integer(2|_n)\(/gm;
    const closeOf = (src: string, open: number): number => {
        let depth = 0; let inStr = false; let esc = false; let inLine = false;
        for (let k = open; k < src.length; k++) {
            const c = src[k];
            if (inLine) { if (c === '\n') inLine = false; continue; }
            if (inStr) {
                if (esc) esc = false;
                else if (c === '\\') esc = true;
                else if (c === '"') inStr = false;
                continue;
            }
            if (c === '"') { inStr = true; continue; }
            if (c === '/' && src[k + 1] === '/') { inLine = true; continue; }
            if (c === '(') depth++;
            else if (c === ')') { depth--; if (depth === 0) return k + 1; }
        }
        return -1;
    };
    // Same length; string bodies, line and block comments blanked (quotes kept).
    const mask = (src: string): string => {
        let out = ''; let i = 0;
        const blank = (s: string) => s.replace(/[^\n]/g, ' ');
        while (i < src.length) {
            const c = src[i];
            if (c === '/' && src[i + 1] === '/') {
                while (i < src.length && src[i] !== '\n') { out += ' '; i++; }
                continue;
            }
            if (c === '/' && src[i + 1] === '*') {
                const e = src.indexOf('*/', i + 2);
                const stop = e < 0 ? src.length : e + 2;
                out += blank(src.slice(i, stop)); i = stop;
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
    // End of the block holding the declaration (first unmatched `}`).
    const scopeEnd = (masked: string, from: number): number => {
        let depth = 0;
        for (let k = from; k < masked.length; k++) {
            if (masked[k] === '{') depth++;
            else if (masked[k] === '}') { depth--; if (depth < 0) return k; }
        }
        return masked.length;
    };
    const splitArgs = (src: string): string[] => {
        const out: string[] = []; let cur = ''; let depth = 0; let inStr = false; let esc = false;
        for (const c of src) {
            if (inStr) {
                cur += c;
                if (esc) esc = false;
                else if (c === '\\') esc = true;
                else if (c === '"') inStr = false;
                continue;
            }
            if (c === '"') { inStr = true; cur += c; continue; }
            if (c === '(' || c === '[' || c === '{') depth++;
            else if (c === ')' || c === ']' || c === '}') depth--;
            if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
            cur += c;
        }
        out.push(cur);
        return out;
    };

    const maskedAll = mask(content);
    type Rw = { start: number, end: number, text: string };
    const rewrites: Rw[] = [];
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(content)) !== null) {
        const name = m[3];
        const isTwo = m[4] === '2';
        const callOpen = m.index + m[0].length - 1;
        const callClose = closeOf(content, callOpen);
        if (callClose < 0) continue;
        const tail = /^\s*;/.exec(content.slice(callClose, callClose + 3));
        if (tail === null) continue;
        const stmtEnd = callClose + tail[0].length;
        const args = splitArgs(content.slice(callOpen + 1, callClose - 1));
        if (args.length !== (isTwo ? 4 : 3)) continue;
        if (!/^&\[\s*(?:Value::Null)?\s*\]$/.test(args[args.length - 1].trim())) continue;
        const end = scopeEnd(maskedAll, stmtEnd);
        const masked = maskedAll.slice(stmtEnd, end);
        if (new RegExp(`\\b(?:let|for|fn)\\s+(?:mut\\s+)?${name}\\b`).test(masked)) continue;
        if (new RegExp(`\\blet\\b[^=;\\n]*\\b${name}\\b`).test(masked)) continue;
        if (new RegExp(`\\|[^|\\n]*\\b${name}\\b[^|\\n]*\\|`).test(masked)) continue;
        const useRe = new RegExp(`(?<![A-Za-z0-9_.])${name}(?![A-Za-z0-9_])`, 'g');
        const uses: Rw[] = [];
        let ok = true; let u: RegExpExecArray | null;
        while ((u = useRe.exec(masked)) !== null) {
            const s = u.index; const e = s + name.length;
            const after = masked.slice(e);
            const before = masked.slice(0, s);
            const abs = (x: number) => stmtEnd + x;
            let g: RegExpExecArray | null;
            if (after.startsWith('.clone()')) {
                uses.push({ start: abs(s), end: abs(e + 8), text: `Value::from(${name})` });
                useRe.lastIndex = e + 8;
            } else if ((g = /^\s*(!=|==)\s*Value::Null\b/.exec(after)) !== null) {
                uses.push({ start: abs(s), end: abs(e + g[0].length), text: `${name}.${g[1] === '!=' ? 'is_some' : 'is_none'}()` });
                useRe.lastIndex = e + g[0].length;
            } else if ((g = /^\.as_f64\(\)\s*(==|!=)\s*Some\((-?\d+)(?:\.0)?\)/.exec(after)) !== null) {
                uses.push({ start: abs(s), end: abs(e + g[0].length), text: `${name} ${g[1]} Some(${g[2]})` });
                useRe.lastIndex = e + g[0].length;
            } else if (/self\.iso8601\($/.test(before) && after.startsWith(')')) {
                uses.push({ start: abs(s), end: abs(e), text: `Value::from(${name})` });
            } else if (/\bm\.insert\("[^"\n]*"\.to_string\(\),\s*$/.test(before) && after.startsWith(');')) {
                uses.push({ start: abs(s), end: abs(e), text: `Value::from(${name})` });
            } else if (/(?:^|[;{}])\s*$/.test(before) && (g = /^\s*=(?!=)\s*/.exec(after)) !== null) {
                const rhsAt = stmtEnd + e + g[0].length;
                const rhs = /^(Value::Null|Value::Int\((-?\d+)\))\s*;/.exec(content.slice(rhsAt, rhsAt + 40));
                if (rhs !== null) {
                    uses.push({ start: rhsAt, end: rhsAt + rhs[1].length, text: rhs[2] === undefined ? 'None' : `Some(${rhs[2]})` });
                } else {
                    const call = /^self\.safe_integer(?:_k|2|_n)?\(/.exec(content.slice(rhsAt, rhsAt + 30));
                    if (call === null) { ok = false; break; }
                    const o = rhsAt + call[0].length - 1;
                    const c = closeOf(content, o);
                    if (c < 0 || !/^\s*;/.test(content.slice(c, c + 3))) { ok = false; break; }
                    const a = splitArgs(content.slice(o + 1, c - 1));
                    const want = call[0].endsWith('2(') ? 4 : 3;
                    if (a.length !== want || !/^&\[\s*(?:Value::Null|Value::Int\(-?\d+\))?\s*\]$/.test(a[a.length - 1].trim())) { ok = false; break; }
                    uses.push({ start: c, end: c, text: '.as_i64()' });
                }
                useRe.lastIndex = e;
            } else {
                ok = false; break;
            }
        }
        if (!ok) continue;
        rewrites.push({ start: m.index, end: callOpen, text: content.slice(m.index, callOpen).replace(': Value =', ': Option<i64> =') + '_opt' });
        for (const use of uses) rewrites.push(use);
    }
    if (rewrites.length === 0) return content;
    rewrites.sort((a, b) => a.start - b.start || a.end - b.end);
    let out = ''; let last = 0;
    for (const r of rewrites) {
        if (r.start < last) continue;
        out += content.slice(last, r.start) + r.text;
        last = r.end;
    }
    return out + content.slice(last);
}

// ---- integer local with null sinks -> Option<i64> ----
// `safe_integer*` locals that narrowOptionalSafeLocals skips become `Option<i64>`.
// Pure text pass over the final Rust; relies on the runtime `From<Option<i64>> for Value`.

/**
 * `let mut X: Value = self.safe_integer[_k|2](.., &[] | &[Value::Null] | &[Value::Int(n)])` becomes
 * `Option<i64>` (`.as_i64()`: the reader yields `Int` or its default, so the Option is exact) when
 * every later use of `X` in the block is one of:
 *   `X.clone()` -> `Value::from(X)`           `self.iso8601(X)` / `m.insert("k".to_string(), X);` sinks
 *   `X != / == Value::Null` -> `is_some()` / `is_none()`
 *   `X.as_f64() == / != Some(<n>[.0])` -> `X == / != Some(<n>)`
 *   `X = Value::Null | Value::Int(n) | self.safe_integer*(..);` -> `None` / `Some(n)` / `.as_i64()`
 * Any other use, or a second binding of the name, keeps `Value`.
 */
export function rustIntLocalNullSinkOptionI64(content: string): string {
    const declRe = /^([ \t]*)let (mut )?([a-zA-Z_][a-zA-Z0-9_]*): Value = self\.safe_integer(_k|2)?\(/gm;
    const closeOf = (src: string, open: number): number => {
        let depth = 0; let inStr = false; let esc = false; let inLine = false;
        for (let k = open; k < src.length; k++) {
            const c = src[k];
            if (inLine) { if (c === '\n') inLine = false; continue; }
            if (inStr) {
                if (esc) esc = false;
                else if (c === '\\') esc = true;
                else if (c === '"') inStr = false;
                continue;
            }
            if (c === '"') { inStr = true; continue; }
            if (c === '/' && src[k + 1] === '/') { inLine = true; continue; }
            if (c === '(') depth++;
            else if (c === ')') { depth--; if (depth === 0) return k + 1; }
        }
        return -1;
    };
    // Same length; string bodies, line and block comments blanked (quotes kept).
    const mask = (src: string): string => {
        let out = ''; let i = 0;
        const blank = (s: string) => s.replace(/[^\n]/g, ' ');
        while (i < src.length) {
            const c = src[i];
            if (c === '/' && src[i + 1] === '/') {
                while (i < src.length && src[i] !== '\n') { out += ' '; i++; }
                continue;
            }
            if (c === '/' && src[i + 1] === '*') {
                const e = src.indexOf('*/', i + 2);
                const stop = e < 0 ? src.length : e + 2;
                out += blank(src.slice(i, stop)); i = stop;
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
    // End of the block holding the declaration (first unmatched `}`).
    const scopeEnd = (masked: string, from: number): number => {
        let depth = 0;
        for (let k = from; k < masked.length; k++) {
            if (masked[k] === '{') depth++;
            else if (masked[k] === '}') { depth--; if (depth < 0) return k; }
        }
        return masked.length;
    };
    const splitArgs = (src: string): string[] => {
        const out: string[] = []; let cur = ''; let depth = 0; let inStr = false; let esc = false;
        for (const c of src) {
            if (inStr) {
                cur += c;
                if (esc) esc = false;
                else if (c === '\\') esc = true;
                else if (c === '"') inStr = false;
                continue;
            }
            if (c === '"') { inStr = true; cur += c; continue; }
            if (c === '(' || c === '[' || c === '{') depth++;
            else if (c === ')' || c === ']' || c === '}') depth--;
            if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
            cur += c;
        }
        out.push(cur);
        return out;
    };

    const maskedAll = mask(content);
    type Rw = { start: number, end: number, text: string };
    const rewrites: Rw[] = [];
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(content)) !== null) {
        const name = m[3];
        const isTwo = m[4] === '2';
        const callOpen = m.index + m[0].length - 1;
        const callClose = closeOf(content, callOpen);
        if (callClose < 0) continue;
        const tail = /^\s*;/.exec(content.slice(callClose, callClose + 3));
        if (tail === null) continue;
        const stmtEnd = callClose + tail[0].length;
        const args = splitArgs(content.slice(callOpen + 1, callClose - 1));
        if (args.length !== (isTwo ? 4 : 3)) continue;
        if (!/^&\[\s*(?:Value::Null|Value::Int\(-?\d+\))?\s*\]$/.test(args[args.length - 1].trim())) continue;
        const end = scopeEnd(maskedAll, stmtEnd);
        const masked = maskedAll.slice(stmtEnd, end);
        if (new RegExp(`\\b(?:let|for|fn)\\s+(?:mut\\s+)?${name}\\b`).test(masked)) continue;
        if (new RegExp(`\\blet\\b[^=;\\n]*\\b${name}\\b`).test(masked)) continue;
        if (new RegExp(`\\|[^|\\n]*\\b${name}\\b[^|\\n]*\\|`).test(masked)) continue;
        const useRe = new RegExp(`(?<![A-Za-z0-9_.])${name}(?![A-Za-z0-9_])`, 'g');
        const uses: Rw[] = [];
        let ok = true; let u: RegExpExecArray | null;
        while ((u = useRe.exec(masked)) !== null) {
            const s = u.index; const e = s + name.length;
            const after = masked.slice(e);
            const before = masked.slice(0, s);
            const abs = (x: number) => stmtEnd + x;
            let g: RegExpExecArray | null;
            if (after.startsWith('.clone()')) {
                uses.push({ start: abs(s), end: abs(e + 8), text: `Value::from(${name})` });
                useRe.lastIndex = e + 8;
            } else if ((g = /^\s*(!=|==)\s*Value::Null\b/.exec(after)) !== null) {
                uses.push({ start: abs(s), end: abs(e + g[0].length), text: `${name}.${g[1] === '!=' ? 'is_some' : 'is_none'}()` });
                useRe.lastIndex = e + g[0].length;
            } else if ((g = /^\.as_f64\(\)\s*(==|!=)\s*Some\((-?\d+)(?:\.0)?\)/.exec(after)) !== null) {
                uses.push({ start: abs(s), end: abs(e + g[0].length), text: `${name} ${g[1]} Some(${g[2]})` });
                useRe.lastIndex = e + g[0].length;
            } else if (/self\.iso8601\($/.test(before) && after.startsWith(')')) {
                uses.push({ start: abs(s), end: abs(e), text: `Value::from(${name})` });
            } else if (/\bm\.insert\("[^"\n]*"\.to_string\(\),\s*$/.test(before) && after.startsWith(');')) {
                uses.push({ start: abs(s), end: abs(e), text: `Value::from(${name})` });
            } else if (/(?:^|[;{}])\s*$/.test(before) && (g = /^\s*=(?!=)\s*/.exec(after)) !== null) {
                const rhsAt = stmtEnd + e + g[0].length;
                const rhs = /^(Value::Null|Value::Int\((-?\d+)\))\s*;/.exec(content.slice(rhsAt, rhsAt + 40));
                if (rhs !== null) {
                    uses.push({ start: rhsAt, end: rhsAt + rhs[1].length, text: rhs[2] === undefined ? 'None' : `Some(${rhs[2]})` });
                } else {
                    const call = /^self\.safe_integer(?:_k|2)?\(/.exec(content.slice(rhsAt, rhsAt + 30));
                    if (call === null) { ok = false; break; }
                    const o = rhsAt + call[0].length - 1;
                    const c = closeOf(content, o);
                    if (c < 0 || !/^\s*;/.test(content.slice(c, c + 3))) { ok = false; break; }
                    const a = splitArgs(content.slice(o + 1, c - 1));
                    const want = call[0].endsWith('2(') ? 4 : 3;
                    if (a.length !== want || !/^&\[\s*(?:Value::Null|Value::Int\(-?\d+\))?\s*\]$/.test(a[a.length - 1].trim())) { ok = false; break; }
                    uses.push({ start: c, end: c, text: '.as_i64()' });
                }
                useRe.lastIndex = e;
            } else {
                ok = false; break;
            }
        }
        if (!ok) continue;
        rewrites.push({ start: m.index, end: callOpen, text: content.slice(m.index, callOpen).replace(': Value =', ': Option<i64> =') });
        rewrites.push({ start: callClose, end: callClose, text: '.as_i64()' });
        for (const use of uses) rewrites.push(use);
    }
    if (rewrites.length === 0) return content;
    rewrites.sort((a, b) => a.start - b.start || a.end - b.end);
    let out = ''; let last = 0;
    for (const r of rewrites) {
        if (r.start < last) continue;
        out += content.slice(last, r.start) + r.text;
        last = r.end;
    }
    return out + content.slice(last);
}

// ---- number2 local -> Option<f64> ----
// `safe_number2` locals become `Option<f64>` via the runtime `safe_number2_opt`.
// Pure text pass; same accepted uses as narrowOptionalSafeLocals, default none/Null only.

/**
 * `let [mut] X: Value = self.safe_number2(o, k1, k2, &[] | &[Value::Null])` becomes
 * `Option<f64>` when every later use of `X` in the fn is `X != / == Value::Null`
 * (-> `is_some()` / `is_none()`) or `X.as_f64() == / != Some(<n>.0)` (-> `X == / != Some(<n>.0)`).
 * Any other use, or a second binding of the name, keeps `Value`.
 */
export function rustNumber2LocalOptionF64(content: string): string {
    const declRe = /^([ \t]*)let (mut )?([a-zA-Z_][a-zA-Z0-9_]*): Value = self\.safe_number2\(/gm;
    const mask = (src: string): string => {
        let out = ''; let i = 0;
        const blank = (s: string) => s.replace(/[^\n]/g, ' ');
        while (i < src.length) {
            const c = src[i];
            if (c === '/' && src[i + 1] === '/') {
                while (i < src.length && src[i] !== '\n') { out += ' '; i++; }
                continue;
            }
            if (c === '/' && src[i + 1] === '*') {
                const e = src.indexOf('*/', i + 2);
                const stop = e < 0 ? src.length : e + 2;
                out += blank(src.slice(i, stop)); i = stop;
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
    const maskedAll = mask(content);
    const closeOf = (masked: string, open: number): number => {
        let depth = 0;
        for (let k = open; k < masked.length; k++) {
            if (masked[k] === '(') depth++;
            else if (masked[k] === ')') { depth--; if (depth === 0) return k + 1; }
        }
        return -1;
    };
    const scopeEnd = (masked: string, from: number): number => {
        let depth = 0;
        for (let k = from; k < masked.length; k++) {
            if (masked[k] === '{') depth++;
            else if (masked[k] === '}') { depth--; if (depth < 0) return k; }
        }
        return masked.length;
    };
    const splitArgs = (src: string): string[] => {
        const out: string[] = []; let cur = ''; let depth = 0; let inStr = false; let esc = false;
        for (const c of src) {
            if (inStr) {
                cur += c;
                if (esc) esc = false;
                else if (c === '\\') esc = true;
                else if (c === '"') inStr = false;
                continue;
            }
            if (c === '"') { inStr = true; cur += c; continue; }
            if (c === '(' || c === '[' || c === '{') depth++;
            else if (c === ')' || c === ']' || c === '}') depth--;
            if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
            cur += c;
        }
        out.push(cur);
        return out;
    };
    type Rw = { start: number, end: number, text: string };
    const rewrites: Rw[] = [];
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(content)) !== null) {
        const name = m[3];
        const callOpen = m.index + m[0].length - 1;
        const callClose = closeOf(maskedAll, callOpen);
        if (callClose < 0 || !/^\s*;/.test(content.slice(callClose, callClose + 3))) continue;
        const stmtEnd = callClose + /^\s*;/.exec(content.slice(callClose, callClose + 3))![0].length;
        const args = splitArgs(content.slice(callOpen + 1, callClose - 1));
        if (args.length !== 4 || !/^&\[\s*(?:Value::Null)?\s*\]$/.test(args[3].trim())) continue;
        const end = scopeEnd(maskedAll, stmtEnd);
        const masked = maskedAll.slice(stmtEnd, end);
        if (new RegExp(`\\b(?:let|for|fn)\\s+(?:mut\\s+)?${name}\\b`).test(masked)) continue;
        if (new RegExp(`\\blet\\b[^=;\\n]*\\b${name}\\b`).test(masked)) continue;
        if (new RegExp(`\\|[^|\\n]*\\b${name}\\b[^|\\n]*\\|`).test(masked)) continue;
        const useRe = new RegExp(`(?<![A-Za-z0-9_.])${name}(?![A-Za-z0-9_])`, 'g');
        const uses: Rw[] = [];
        let ok = true; let u: RegExpExecArray | null;
        while ((u = useRe.exec(masked)) !== null) {
            const s = u.index; const e = s + name.length;
            const after = masked.slice(e);
            let g: RegExpExecArray | null;
            if ((g = /^\s*(!=|==)\s*Value::Null\b/.exec(after)) !== null) {
                uses.push({ start: stmtEnd + s, end: stmtEnd + e + g[0].length, text: `${name}.${g[1] === '!=' ? 'is_some' : 'is_none'}()` });
            } else if ((g = /^\.as_f64\(\)\s*(==|!=)\s*Some\((-?\d+\.0)\)/.exec(after)) !== null) {
                uses.push({ start: stmtEnd + s, end: stmtEnd + e + g[0].length, text: `${name} ${g[1]} Some(${g[2]})` });
            } else { ok = false; break; }
            useRe.lastIndex = e + g[0].length;
        }
        if (!ok) continue;
        rewrites.push({
            start: m.index,
            end: callOpen,
            text: content.slice(m.index, callOpen).replace(': Value =', ': Option<f64> =').replace('safe_number2', 'safe_number2_opt'),
        });
        for (const use of uses) rewrites.push(use);
    }
    if (rewrites.length === 0) return content;
    rewrites.sort((a, b) => a.start - b.start || a.end - b.end);
    let out = ''; let last = 0;
    for (const r of rewrites) {
        if (r.start < last) continue;
        out += content.slice(last, r.start) + r.text;
        last = r.end;
    }
    return out + content.slice(last);
}

// ---- number2 local with Value sinks -> Option<f64> ----
// `safe_number2` locals whose uses include Value sinks (runtime `From<Option<f64>>`).
// Pure text pass; reuses `safe_number2_opt`; default none/Null only. Every other use keeps `Value`.

/**
 * `let [mut] X: Value = self.safe_number2(o, k1, k2, &[] | &[Value::Null])` becomes `Option<f64>` when each use is
 * `X != / == Value::Null`, `X.as_f64() == / != Some(<n>.0)`, `X.clone()` (-> `Value::from(X)`), or a bare `X`
 * as the last arg of `m.insert("k".to_string(), X);` or `self.price_to_precision(<arg>, X)`.
 */
export function rustNumber2SinkLocalOptionF64R2(content: string): string {
    const declRe = /^([ \t]*)let (mut )?([a-zA-Z_][a-zA-Z0-9_]*): Value = self\.safe_number2\(/gm;
    const mask = (src: string): string => {
        let out = ''; let i = 0;
        const blank = (s: string) => s.replace(/[^\n]/g, ' ');
        while (i < src.length) {
            const c = src[i];
            if (c === '/' && src[i + 1] === '/') {
                while (i < src.length && src[i] !== '\n') { out += ' '; i++; }
                continue;
            }
            if (c === '/' && src[i + 1] === '*') {
                const e = src.indexOf('*/', i + 2);
                const stop = e < 0 ? src.length : e + 2;
                out += blank(src.slice(i, stop)); i = stop;
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
    const maskedAll = mask(content);
    const closeOf = (masked: string, open: number): number => {
        let depth = 0;
        for (let k = open; k < masked.length; k++) {
            if (masked[k] === '(') depth++;
            else if (masked[k] === ')') { depth--; if (depth === 0) return k + 1; }
        }
        return -1;
    };
    const scopeEnd = (masked: string, from: number): number => {
        let depth = 0;
        for (let k = from; k < masked.length; k++) {
            if (masked[k] === '{') depth++;
            else if (masked[k] === '}') { depth--; if (depth < 0) return k; }
        }
        return masked.length;
    };
    const splitArgs = (src: string): string[] => {
        const out: string[] = []; let cur = ''; let depth = 0; let inStr = false; let esc = false;
        for (const c of src) {
            if (inStr) {
                cur += c;
                if (esc) esc = false;
                else if (c === '\\') esc = true;
                else if (c === '"') inStr = false;
                continue;
            }
            if (c === '"') { inStr = true; cur += c; continue; }
            if (c === '(' || c === '[' || c === '{') depth++;
            else if (c === ')' || c === ']' || c === '}') depth--;
            if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
            cur += c;
        }
        out.push(cur);
        return out;
    };
    type Rw = { start: number, end: number, text: string };
    const rewrites: Rw[] = [];
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(content)) !== null) {
        const name = m[3];
        const callOpen = m.index + m[0].length - 1;
        const callClose = closeOf(maskedAll, callOpen);
        if (callClose < 0 || !/^\s*;/.test(content.slice(callClose, callClose + 3))) continue;
        const stmtEnd = callClose + /^\s*;/.exec(content.slice(callClose, callClose + 3))![0].length;
        const args = splitArgs(content.slice(callOpen + 1, callClose - 1));
        if (args.length !== 4 || !/^&\[\s*(?:Value::Null)?\s*\]$/.test(args[3].trim())) continue;
        const end = scopeEnd(maskedAll, stmtEnd);
        const masked = maskedAll.slice(stmtEnd, end);
        if (new RegExp(`\\b(?:let|for|fn)\\s+(?:mut\\s+)?${name}\\b`).test(masked)) continue;
        if (new RegExp(`\\blet\\b[^=;\\n]*\\b${name}\\b`).test(masked)) continue;
        if (new RegExp(`\\|[^|\\n]*\\b${name}\\b[^|\\n]*\\|`).test(masked)) continue;
        const useRe = new RegExp(`(?<![A-Za-z0-9_.])${name}(?![A-Za-z0-9_])`, 'g');
        const uses: Rw[] = [];
        let ok = true; let u: RegExpExecArray | null;
        while ((u = useRe.exec(masked)) !== null) {
            const s = u.index; const e = s + name.length;
            const after = masked.slice(e);
            let g: RegExpExecArray | null;
            if ((g = /^\s*(!=|==)\s*Value::Null\b/.exec(after)) !== null) {
                uses.push({ start: stmtEnd + s, end: stmtEnd + e + g[0].length, text: `${name}.${g[1] === '!=' ? 'is_some' : 'is_none'}()` });
            } else if ((g = /^\.as_f64\(\)\s*(==|!=)\s*Some\((-?\d+\.0)\)/.exec(after)) !== null) {
                uses.push({ start: stmtEnd + s, end: stmtEnd + e + g[0].length, text: `${name} ${g[1]} Some(${g[2]})` });
            } else if (after.startsWith('.clone()')) {
                uses.push({ start: stmtEnd + s, end: stmtEnd + e + 8, text: `Value::from(${name})` });
                useRe.lastIndex = e + 8;
                continue;
            } else if ((/\bm\.insert\("[^"\n]*"\.to_string\(\),\s*$/.test(masked.slice(0, s)) && after.startsWith(');')) ||
                (/self\.price_to_precision\([^;\n]*,\s*$/.test(masked.slice(0, s)) && after.startsWith(')'))) {
                uses.push({ start: stmtEnd + s, end: stmtEnd + e, text: `Value::from(${name})` });
                continue;
            } else { ok = false; break; }
            useRe.lastIndex = e + g[0].length;
        }
        if (!ok) continue;
        rewrites.push({
            start: m.index,
            end: callOpen,
            text: content.slice(m.index, callOpen).replace(': Value =', ': Option<f64> =').replace('safe_number2', 'safe_number2_opt'),
        });
        for (const use of uses) rewrites.push(use);
    }
    if (rewrites.length === 0) return content;
    rewrites.sort((a, b) => a.start - b.start || a.end - b.end);
    let out = ''; let last = 0;
    for (const r of rewrites) {
        if (r.start < last) continue;
        out += content.slice(last, r.start) + r.text;
        last = r.end;
    }
    return out + content.slice(last);
}

// ---- str2 local -> Option<String> ----
// `let [mut] X: Value = self.safe_string2(obj, k1, k2, &[..])` narrowed to `Option<String>` via `safe_string2_opt`.
// Uses and sinks as in narrowStrNullLocals; default `&[]` or a `Value::Str` literal.

export function rustStr2LocalOptionString(content: string): string {
    const opt = 'safe_string2_opt';
    const declRe = /^([ \t]*)let (mut )?([a-zA-Z_][a-zA-Z0-9_]*): Value = self\.(safe_string2)\(/gm;
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

    const masked = maskText(content);
    const grown = new Map<number, number>();
    const groups: Array<{ decl: { start: number, end: number, text: string }, edits: Array<{ start: number, end: number, text: string }> }> = [];
    const rewrites: Array<{ start: number, end: number, text: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(masked)) !== null) {
        const name = m[3];
        const callOpen = m.index + m[0].length - 1;
        const callClose = closeParen(masked, callOpen);
        if (callClose < 0) continue;
        const tail = /^\s*;/.exec(masked.slice(callClose, callClose + 3));
        if (tail === null) continue;
        const stmtEnd = callClose + tail[0].length;
        const base = callOpen + 1;
        const spans = argSpans(masked.slice(base, callClose - 1));
        if (spans.length !== 4) continue;
        const obj = content.slice(base + spans[0][0], base + spans[0][1]).trim();
        const keyRaw = content.slice(base + spans[1][0], base + spans[1][1]).trim() + ', '
            + content.slice(base + spans[2][0], base + spans[2][1]).trim();
        const defRaw = content.slice(base + spans[3][0], base + spans[3][1]).trim();
        if (obj.length === 0 || keyRaw.length === 0) continue;
        // `&[]` yields `None`; a string literal default yields `Some(..)` in both forms.
        if (defRaw !== '&[]' && !/^&\[Value::Str\("(?:[^"\\]|\\.)*"\.into\(\)\)\]$/.test(defRaw)) continue;
        const end = braceEnd(masked, stmtEnd);
        const body = masked.slice(stmtEnd, end);
        if (new RegExp(`\\b(?:let|for|fn)\\s+(?:mut\\s+)?${name}\\b`).test(body)) continue;
        if (new RegExp(`\\|[^|\\n]*\\b${name}\\b[^|\\n]*\\|`).test(body)) continue;
        const useRe = new RegExp(`(?<![A-Za-z0-9_.:])${name}(?![A-Za-z0-9_])`, 'g');
        const edits: Array<{ start: number, end: number, text: string }> = [];
        let ok = true; let u: RegExpExecArray | null;
        while ((u = useRe.exec(body)) !== null) {
            const at = u.index; const abs = stmtEnd + at; const after = body.slice(at + name.length);
            const before = body.slice(0, at);
            let g: RegExpExecArray | null;
            if ((g = /^\s*(==|!=)\s*Value::Null\b/.exec(after)) !== null && !/[&*]\s*$/.test(before)) {
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: `${name}.${g[1] === '==' ? 'is_none' : 'is_some'}()` });
            } else if ((g = /^\.as_str\(\)/.exec(after)) !== null) {
                // `Option<String>::as_deref()` is the same `Option<&str>` the boxed `as_str()` gave.
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: `${name}.as_deref()` });
            } else if (/get_value\(&$/.test(before)
                && (g = /^, &Value::Int\(0\)\)\.as_str\(\) (==|!=) Some\("/.exec(after)) !== null) {
                // First character probe; the char sits in the unmasked text at the same offsets.
                const chPos = abs + name.length + g[0].length;
                const ch = /^([^"\\])"\)/.exec(content.slice(chPos, chPos + 3));
                if (ch === null) { ok = false; break; }
                const probe = `${name}.as_deref().unwrap_or("").starts_with("${ch[1]}")`;
                edits.push({ start: abs - 'get_value(&'.length, end: chPos + ch[0].length, text: g[1] === '==' ? probe : `!${probe}` });
            } else if (/crate::runtime::stringify_param\(&$/.test(before) && /^\)/.test(after)) {
                // The helper prints `null` for `Null` and the text for `Str`: both are `Option<String>` states.
                const from = abs - 'crate::runtime::stringify_param(&'.length;
                edits.push({ start: from, end: abs + name.length + 1, text: `${name}.as_deref().unwrap_or("null").to_string()` });
            // eslint-disable-next-line no-useless-escape
            } else if (/(?:[(,\[]\s*&?|(?<![=!<>])=\s)$/.test(before) && !/&\s*mut\s*$/.test(before)
                && (g = /^(\.clone\(\))?(?=\s*[,)\];])/.exec(after)) !== null && !/==\s*$/.test(before)) {
                // The conversion consumes the `Option`: only the last use, outside any loop, may move it.
                const lastUse = !new RegExp(`(?<![A-Za-z0-9_.:])${name}(?![A-Za-z0-9_])`).test(after.slice(g[0].length));
                const inLoop = /\b(?:loop|while|for)\b/.test(body);
                const move = lastUse && !inLoop && !/&\s*$/.test(before);
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: `${name}${move ? '' : '.clone()'}.map(Value::from).unwrap_or(Value::Null)` });
            } else { ok = false; break; }
        }
        if (!ok || edits.length === 0) continue;
        // A longer line must not newly cross 400 chars, counting growth from earlier locals.
        const declText = `${m[1]}let ${m[2] ?? ''}${name}: Option<String> = self.${opt}(${obj}, ${keyRaw}, ${defRaw});`;
        const all = [{ start: m.index, end: stmtEnd, text: declText }, ...edits];
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
        groups.push({ decl: { start: m.index, end: stmtEnd, text: declText }, edits });
    }
    // A use that sits inside another narrowed local's initializer would be lost when that
    // statement is reprinted from its original text: leave the used local boxed.
    for (let again = true; again;) {
        again = false;
        for (let a = 0; a < groups.length; a++) {
            const hit = groups.some((b, bi) => bi !== a
                && groups[a].edits.some(e => e.start >= b.decl.start && e.start < b.decl.end));
            if (hit) { groups.splice(a, 1); again = true; break; }
        }
    }
    for (const gr of groups) { rewrites.push(gr.decl); for (const e of gr.edits) rewrites.push(e); }
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

// ---- str literal local -> String ----
// `let mut X: Value = Value::Str("lit".into());` locals become a native `String`.
// Pure text pass over the final Rust; the declaration and every later write are literals.

/**
 * A literal-backed local whose every write is `Value::Str("lit".into())` and whose every later
 * use is a `format!` slot, `X.as_str()`, `stringify_param(&X)` or a by-value operand becomes a
 * `String`. A by-value operand re-boxes through `Value::from`, which builds the `Value::Str`
 * the literal was. Any other use (`&X`, `&mut`, a closure, a second binding, a write from
 * another expression) keeps `Value`.
 */
export function rustStrLiteralLocalNativeString(content: string): string {
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
            // eslint-disable-next-line no-useless-escape
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

// ---- str_n local -> Option<String> ----
// `let [mut] X: Value = self.safe_string_n(obj, keys, &[..])` narrowed to `Option<String>` via `safe_string_n_opt`.
// Uses and sinks as in the str2 pass; default `&[]` or a `Value::Str` literal.

export function rustStrNLocalOptionString(content: string): string {
    const opt = 'safe_string_n_opt';
    const declRe = /^([ \t]*)let (mut )?([a-zA-Z_][a-zA-Z0-9_]*): Value = self\.(safe_string_n)\(/gm;
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

    const masked = maskText(content);
    const grown = new Map<number, number>();
    const groups: Array<{ decl: { start: number, end: number, text: string }, edits: Array<{ start: number, end: number, text: string }> }> = [];
    const rewrites: Array<{ start: number, end: number, text: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(masked)) !== null) {
        const name = m[3];
        const callOpen = m.index + m[0].length - 1;
        const callClose = closeParen(masked, callOpen);
        if (callClose < 0) continue;
        const tail = /^\s*;/.exec(masked.slice(callClose, callClose + 3));
        if (tail === null) continue;
        const stmtEnd = callClose + tail[0].length;
        const base = callOpen + 1;
        const spans = argSpans(masked.slice(base, callClose - 1));
        if (spans.length !== 3) continue;
        const obj = content.slice(base + spans[0][0], base + spans[0][1]).trim();
        const keyRaw = content.slice(base + spans[1][0], base + spans[1][1]).trim();
        const defRaw = content.slice(base + spans[2][0], base + spans[2][1]).trim();
        if (obj.length === 0 || !/^Value::from\(vec!\[[^\]]*\]\)$/.test(keyRaw)) continue;
        // `&[]` yields `None`; a string literal default yields `Some(..)` in both forms.
        if (defRaw !== '&[]' && !/^&\[Value::Str\("(?:[^"\\]|\\.)*"\.into\(\)\)\]$/.test(defRaw)) continue;
        const end = braceEnd(masked, stmtEnd);
        const body = masked.slice(stmtEnd, end);
        if (new RegExp(`\\b(?:let|for|fn)\\s+(?:mut\\s+)?${name}\\b`).test(body)) continue;
        if (new RegExp(`\\|[^|\\n]*\\b${name}\\b[^|\\n]*\\|`).test(body)) continue;
        const useRe = new RegExp(`(?<![A-Za-z0-9_.:])${name}(?![A-Za-z0-9_])`, 'g');
        const edits: Array<{ start: number, end: number, text: string }> = [];
        let ok = true; let u: RegExpExecArray | null;
        while ((u = useRe.exec(body)) !== null) {
            const at = u.index; const abs = stmtEnd + at; const after = body.slice(at + name.length);
            const before = body.slice(0, at);
            let g: RegExpExecArray | null;
            if ((g = /^\s*(==|!=)\s*Value::Null\b/.exec(after)) !== null && !/[&*]\s*$/.test(before)) {
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: `${name}.${g[1] === '==' ? 'is_none' : 'is_some'}()` });
            } else if ((g = /^\.as_str\(\)/.exec(after)) !== null) {
                // `Option<String>::as_deref()` is the same `Option<&str>` the boxed `as_str()` gave.
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: `${name}.as_deref()` });
            } else if (/get_value\(&$/.test(before)
                && (g = /^, &Value::Int\(0\)\)\.as_str\(\) (==|!=) Some\("/.exec(after)) !== null) {
                // First character probe; the char sits in the unmasked text at the same offsets.
                const chPos = abs + name.length + g[0].length;
                const ch = /^([^"\\])"\)/.exec(content.slice(chPos, chPos + 3));
                if (ch === null) { ok = false; break; }
                const probe = `${name}.as_deref().unwrap_or("").starts_with("${ch[1]}")`;
                edits.push({ start: abs - 'get_value(&'.length, end: chPos + ch[0].length, text: g[1] === '==' ? probe : `!${probe}` });
            } else if (/crate::runtime::stringify_param\(&$/.test(before) && /^\)/.test(after)) {
                // The helper prints `null` for `Null` and the text for `Str`: both are `Option<String>` states.
                const from = abs - 'crate::runtime::stringify_param(&'.length;
                edits.push({ start: from, end: abs + name.length + 1, text: `${name}.as_deref().unwrap_or("null").to_string()` });
            // eslint-disable-next-line no-useless-escape
            } else if (/(?:[(,\[]\s*&?|(?<![=!<>])=\s)$/.test(before) && !/&\s*mut\s*$/.test(before)
                && (g = /^(\.clone\(\))?(?=\s*[,)\];])/.exec(after)) !== null && !/==\s*$/.test(before)) {
                // The conversion consumes the `Option`: only the last use, outside any loop, may move it.
                const lastUse = !new RegExp(`(?<![A-Za-z0-9_.:])${name}(?![A-Za-z0-9_])`).test(after.slice(g[0].length));
                const inLoop = /\b(?:loop|while|for)\b/.test(body);
                const move = lastUse && !inLoop && !/&\s*$/.test(before);
                edits.push({ start: abs, end: abs + name.length + g[0].length, text: `${name}${move ? '' : '.clone()'}.map(Value::from).unwrap_or(Value::Null)` });
            } else { ok = false; break; }
        }
        if (!ok || edits.length === 0) continue;
        // A longer line must not newly cross 400 chars, counting growth from earlier locals.
        const declText = `${m[1]}let ${m[2] ?? ''}${name}: Option<String> = self.${opt}(${obj}, ${keyRaw}, ${defRaw});`;
        const all = [{ start: m.index, end: stmtEnd, text: declText }, ...edits];
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
        groups.push({ decl: { start: m.index, end: stmtEnd, text: declText }, edits });
    }
    // A use that sits inside another narrowed local's initializer would be lost when that
    // statement is reprinted from its original text: leave the used local boxed.
    for (let again = true; again;) {
        again = false;
        for (let a = 0; a < groups.length; a++) {
            const hit = groups.some((b, bi) => bi !== a
                && groups[a].edits.some(e => e.start >= b.decl.start && e.start < b.decl.end));
            if (hit) { groups.splice(a, 1); again = true; break; }
        }
    }
    for (const gr of groups) { rewrites.push(gr.decl); for (const e of gr.edits) rewrites.push(e); }
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

// ---- index ----
// Rust final-text passes that ccxt's build script runs over the generated Rust after its own post-passes. They are
// pure `string -> string` functions: the build script owns the ORDER (it interleaves them with its own passes).

// ---- rustNativeForms ----
// ── type-keyed native forms ──
// A plain place path (`a`, `self.a.b`): side-effect-free, so it may be read twice or evaluated eagerly.
export const RUST_PLAIN_PLACE = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;

const parserConfig = {
    'ELSEIF_TOKEN': 'else if',
    'OBJECT_OPENING': '{',
    'OBJECT_CLOSING': '}',
    'ARRAY_OPENING_TOKEN': 'Value::from(vec![',
    'ARRAY_CLOSING_TOKEN': '])',
    'PROPERTY_ASSIGNMENT_TOKEN': ':',
    'VAR_TOKEN': 'let mut',
    'METHOD_TOKEN': 'fn',
    'FUNCTION_TOKEN': 'fn',
    'PROPERTY_ASSIGNMENT_OPEN': '',
    'PROPERTY_ASSIGNMENT_CLOSE': '',
    'SUPER_TOKEN': 'super',
    'SUPER_CALL_TOKEN': 'super',
    'FALSY_WRAPPER_OPEN': 'is_true(&',
    'FALSY_WRAPPER_CLOSE': ')',
    'COMPARISON_WRAPPER_OPEN': 'is_equal(&',
    'COMPARISON_WRAPPER_CLOSE': ')',
    'UKNOWN_PROP_WRAPPER_OPEN': '',
    'UNKOWN_PROP_WRAPPER_CLOSE': '',
    'UKNOWN_PROP_ASYNC_WRAPPER_OPEN': '',
    'UNKOWN_PROP_ASYNC_WRAPPER_CLOSE': '',
    'DYNAMIC_CALL_OPEN': '',
    'EQUALS_EQUALS_WRAPPER_OPEN': 'is_equal(&',
    'EQUALS_EQUALS_WRAPPER_CLOSE': ')',
    'DIFFERENT_WRAPPER_OPEN': '!is_equal(&',
    'DIFFERENT_WRAPPER_CLOSE': ')',
    'GREATER_THAN_WRAPPER_OPEN': 'is_greater_than(&',
    'GREATER_THAN_WRAPPER_CLOSE': ')',
    'GREATER_THAN_EQUALS_WRAPPER_OPEN': 'is_greater_than_or_equal(&',
    'GREATER_THAN_EQUALS_WRAPPER_CLOSE': ')',
    'LESS_THAN_WRAPPER_OPEN': 'is_less_than(&',
    'LESS_THAN_WRAPPER_CLOSE': ')',
    'LESS_THAN_EQUALS_WRAPPER_OPEN': 'is_less_than_or_equal(&',
    'LESS_THAN_EQUALS_WRAPPER_CLOSE': ')',
    'PLUS_WRAPPER_OPEN': 'add(&',
    'PLUS_WRAPPER_CLOSE': ')',
    'MINUS_WRAPPER_OPEN': 'subtract(&',
    'MINUS_WRAPPER_CLOSE': ')',
    'ARRAY_LENGTH_WRAPPER_OPEN': 'get_array_length(&',
    'ARRAY_LENGTH_WRAPPER_CLOSE': ')',
    'DIVIDE_WRAPPER_OPEN': 'divide(&',
    'DIVIDE_WRAPPER_CLOSE': ')',
    'MULTIPLY_WRAPPER_OPEN': 'multiply(&',
    'MULTIPLY_WRAPPER_CLOSE': ')',
    'INDEXOF_WRAPPER_OPEN': 'get_index_of(&',
    'INDEXOF_WRAPPER_CLOSE': ')',
    'MOD_WRAPPER_OPEN': 'mod_val(&',
    'MOD_WRAPPER_CLOSE': ')',
    'LINE_TERMINATOR': ';',
    'CONDITION_OPENING': '',
    'CONDITION_CLOSE': '',
    'AWAIT_TOKEN': '',
    'NULL_TOKEN': 'Value::Null',
    'UNDEFINED_TOKEN': 'Value::Null',
    'WHILE_TOKEN': 'while',
    'ELEMENT_ACCESS_WRAPPER_OPEN': 'get_value(&',
    'ELEMENT_ACCESS_WRAPPER_CLOSE': ')',
    'DEFAULT_PARAMETER_TYPE': 'Value',
    'DEFAULT_RETURN_TYPE': 'Value',
    'BLOCK_OPENING_TOKEN': '{',
    'TRUE_KEYWORD': 'Value::Bool(true)',
    'FALSE_KEYWORD': 'Value::Bool(false)',
};

/** Answer of `RustTranspiler.rustDeclaredLocalTypeResolver` for a local whose
 *  value provably holds a `Value::Dict` at every use. */
export type RustDeclaredLocalKind = 'dict';

/** One `let x: Value = <dict-proven initialiser>` declaration. `kind` is only
 *  answered by the resolver when `alwaysDict && stable`. */
export interface RustDeclaredDictLocalEntry {
    kind: RustDeclaredLocalKind;
    name: string;
    /** printed callee of the initialiser: a `safe_dict*` name, or `value_map`. */
    source: string;
    /** the `safe_dict*` `optionalArgs` default is itself Dict-proven, so the
     *  helper returns a Dict on every path (it returns that default when the
     *  key does not hold one). */
    alwaysDict: boolean;
    /** no later write in the enclosing function can change the kind (D2). */
    stable: boolean;
    /** use classification: element-access receiver / kind-preserving mutator / anything else. */
    uses: { elementAccess: number, mutHelper: number, other: number };
    declaration: VariableDeclaration;
    start: number;
}

/** A `Dict`/`List` parameter whose body uses are all printable reads: the
 *  printer re-binds the same name to a borrowed container at fn entry
 *  (`let x = x.as_map().unwrap_or(&__x_empty);`) so every read is native. */
export interface RustParamShadow {
    kind: RustParamShadowKind;
    /** the parameter name; the shadow re-binds it, the `Value` ABI is untouched. */
    name: string;
    declaration: ParameterDeclaration;
}

/** Shadow kinds: `&IndexMap<String, Value>` / `&Vec<Value>` (D-25). */
export type RustParamShadowKind = 'map' | 'list';

/** Vocabulary of the parameter-shadow table (`RustTranspiler.rustParamShadowOf`). */
export const RUST_PARAM_SHADOWS = {
    MAP: 'map' as RustParamShadowKind,
    LIST: 'list' as RustParamShadowKind,
    /** `this.<safe*>` reads inlined natively against a shadowed dict param. */
    SAFE_READS: new Set([
        'safeValue', 'safeString', 'safeInteger', 'safeNumber', 'safeBool',
        'safeDict', 'safeList',
    ]),
};

/** Vocabulary of the declared-Dict locals table (see
 *  `RustTranspiler.rustDeclaredLocalTypeResolver`). */
export const RUST_DECLARED_DICT_LOCALS = {
    /** value the resolver answers for a proven Dict local */
    DICT: 'dict' as RustDeclaredLocalKind,
    /** printed `self.<callee>` -> index of its `optionalArgs` parameter.
     *  `safe_dict*` returns `optional_args[0]` whenever the key holds a non-Dict. */
    SAFE_CALLEES: {
        safe_dict_k: 2,
        safe_dict: 2,
        safe_dict_n: 2,
        safe_dict2: 3,
    } as Record<string, number>,
    /** `&mut` receivers whose writes land inside the container, so a Dict local
     *  stays a Dict (`add_element_to_object` / `append_to_array` no-op on a
     *  non-container, `set_value` / `remove` write a key). */
    KIND_PRESERVING_MUTATORS: new Set([
        'add_element_to_object', 'append_to_array', 'set_value', 'remove',
        'get_value_mut',
    ]),
};

/** `x = ..` / `x += ..` — every token that writes a place. */
function rustIsAssignmentOperator(kind: SyntaxKind): boolean {
    return kind === SyntaxKind.EqualsToken ||
        (kind >= SyntaxKind.PlusEqualsToken && kind <= SyntaxKind.CaretEqualsToken);
}

/** Preorder (forEachChild order) of a scope's descendants, decoded once: `end[i]` is the index past
 *  node i's subtree; `byName` lists identifiers and name-binding declarations per name text. */
interface RustScopeIndex {
    nodes: Node[];
    end: number[];
    byName: Map<string, number[]> | undefined;
}

const RUST_NAME_BINDER_KINDS = new Set<SyntaxKind>([
    SyntaxKind.VariableDeclaration, SyntaxKind.Parameter, SyntaxKind.FunctionDeclaration,
    SyntaxKind.ClassDeclaration, SyntaxKind.PropertyDeclaration, SyntaxKind.FunctionExpression,
    SyntaxKind.ArrowFunction,
]);

const RUST_WALK_SKIP = 1;
const RUST_WALK_STOP = 2;

function rustBuildScopeIndex(scope: Node): RustScopeIndex {
    const nodes: Node[] = [];
    const end: number[] = [];
    const visit = (n: any) => {
        const i = nodes.length;
        nodes.push(n);
        end.push(0);
        n.forEachChild(visit);
        end[i] = nodes.length;
    };
    scope.forEachChild(visit);
    return { nodes, end, byName: undefined };
}

// name text decoding is the costly part, so the name table is built on first use only
function rustScopeNameTable(index: RustScopeIndex): Map<string, number[]> {
    if (index.byName !== undefined) return index.byName;
    const byName = new Map<string, number[]>();
    const add = (name: string, i: number) => {
        const list = byName.get(name);
        if (list === undefined) byName.set(name, [i]);
        else if (list[list.length - 1] !== i) list.push(i);
    };
    const nodes: any[] = index.nodes;
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const kind = n.kind;
        if (RUST_NAME_BINDER_KINDS.has(kind) && n.name?.kind === SyntaxKind.Identifier) add(n.name.text, i);
        if (kind === SyntaxKind.Identifier) add(n.text, i);
    }
    index.byName = byName;
    return byName;
}

export class RustTranspiler extends BaseTranspiler {

    private rustScopeIndexes = new WeakMap<Node, RustScopeIndex>();

    rustScopeIndex(scope: Node): RustScopeIndex {
        let index = this.rustScopeIndexes.get(scope);
        if (index === undefined) {
            index = rustBuildScopeIndex(scope);
            this.rustScopeIndexes.set(scope, index);
        }
        return index;
    }

    /** `scope.forEachChild(visit)` recursion over the cached preorder: `visit` answers
     *  RUST_WALK_SKIP to skip the node's subtree, RUST_WALK_STOP to end the walk. */
    rustWalkScope(scope: Node, visit: (n: any) => number | void): void {
        const { nodes, end } = this.rustScopeIndex(scope);
        for (let i = 0; i < nodes.length;) {
            const r = visit(nodes[i]);
            if (r === RUST_WALK_STOP) return;
            i = r === RUST_WALK_SKIP ? end[i] : i + 1;
        }
    }

    /** Scope nodes that are an identifier or a name-binding declaration spelled `name`, in walk order. */
    rustScopeNameNodes(scope: Node, name: string): Node[] {
        const index = this.rustScopeIndex(scope);
        return (rustScopeNameTable(index).get(name) ?? []).map((i) => index.nodes[i]);
    }

    // node kinds the printer types that the core per-file prefetch leaves to single round trips
    private static readonly RUST_PREFETCH_TYPE_KINDS = new Set<SyntaxKind>([
        SyntaxKind.FalseKeyword, SyntaxKind.TrueKeyword, SyntaxKind.ParenthesizedExpression,
        SyntaxKind.AwaitExpression, SyntaxKind.PrefixUnaryExpression,
        SyntaxKind.BooleanKeyword, SyntaxKind.ObjectKeyword, SyntaxKind.UnionType,
        SyntaxKind.ConditionalExpression, SyntaxKind.AsExpression,
    ]);

    /** One bulk getTypeAtLocation for the class's nodes of those kinds, seeding the checker memo. */
    rustPrefetchClassTypes(node: Node): void {
        const getType: any = this.checkerOrUndefined()?.getTypeAtLocation;
        if (getType?.seed === undefined || getType.original === undefined) return;
        const kinds = RustTranspiler.RUST_PREFETCH_TYPE_KINDS;
        const nodes: Node[] = [];
        for (const n of this.rustScopeIndex(node).nodes) {
            if (kinds.has(n.kind) && !getType.has(n)) nodes.push(n);
        }
        if (nodes.length === 0) return;
        let results: unknown[];
        try {
            results = getType.original(nodes);
        } catch (e) {
            return; // the lazy per-node path answers them
        }
        nodes.forEach((n, i) => getType.seed(n, results[i]));
    }

    binaryExpressionsWrappers;
    methodSignatures: Record<string, { requiredCount: number }>;
    forLoopCounter: number;
    /** The handler `message` parameter a shadow is being printed for (set only
     *  while its method body is printed). */
    rustProHandlerShadowParam: ParameterDeclaration | undefined;

    constructor(config = {}) {
        config['parser'] = Object.assign({}, parserConfig, config['parser'] ?? {});
        super(config);

        this.requiresParameterType = true;
        this.requiresReturnType = false;
        this.asyncTranspiling = true;
        this.supportsFalsyOrTruthyValues = false;
        this.id = "Rust";
        this.className = "undefined";
        this.methodSignatures = {};
        this.forLoopCounter = 0;

        this.initConfig();
        this.applyUserOverrides(config);
    }

    initConfig() {
        this.LeftPropertyAccessReplacements = {};

        this.RightPropertyAccessReplacements = {};

        this.FullPropertyAccessReplacements = {
            'console.log': 'println_val',
            'Math.floor': 'math_floor',
            'Math.ceil': 'math_ceil',
            'Math.round': 'math_round',
        };

        this.CallExpressionReplacements = {};

        this.ReservedKeywordsReplacements = {
            'type': 'type_var',
            'move': 'move_val',
            'ref': 'ref_val',
            'str': 'str_val',
            'use': 'use_val',
            'mod': 'mod_kw',
            'loop': 'loop_val',
            'match': 'match_val',
            'where': 'where_val',
            'final': 'final_val',
            'box': 'box_val',
            'become': 'become_val',
            'priv': 'priv_val',
            'override': 'override_val',
            'unsized': 'unsized_val',
            'async': 'async_val',
            'await': 'await_val',
            'try': 'try_val',
            'abstract': 'abstract_val',
            'dyn': 'dyn_val',
            'fn': 'fn_val',
            'impl': 'impl_val',
            'pub': 'pub_val',
            'self': 'self_val',
            'super': 'super_val',
            'crate': 'crate_val',
        };

        // [fnName, close] — ensureRef adds & to each operand
        this.binaryExpressionsWrappers = {
            [SyntaxKind.EqualsEqualsToken]: ['is_equal(', ')'],
            [SyntaxKind.EqualsEqualsEqualsToken]: ['is_equal(', ')'],
            [SyntaxKind.ExclamationEqualsToken]: ['!is_equal(', ')'],
            [SyntaxKind.ExclamationEqualsEqualsToken]: ['!is_equal(', ')'],
            [SyntaxKind.GreaterThanToken]: ['is_greater_than(', ')'],
            [SyntaxKind.GreaterThanEqualsToken]: ['is_greater_than_or_equal(', ')'],
            [SyntaxKind.LessThanToken]: ['is_less_than(', ')'],
            [SyntaxKind.LessThanEqualsToken]: ['is_less_than_or_equal(', ')'],
            [SyntaxKind.PlusToken]: ['add(', ')'],
            [SyntaxKind.MinusToken]: ['subtract(', ')'],
            [SyntaxKind.AsteriskToken]: ['multiply(', ')'],
            [SyntaxKind.PercentToken]: ['mod_val(', ')'],
            [SyntaxKind.SlashToken]: ['divide(', ')'],
        };
    }

    // Escaped Rust string literal for the given TS literal text — shared by
    // the `Value::Str(..)` form and the `&str` key form below.
    quotedStringLiteral(text: string): string {
        // Preserve real backslashes
        const backslashPlaceholder = "\x00";
        text = text.replaceAll("\\", backslashPlaceholder);
        text = text.replaceAll("\b", "\\b");
        text = text.replaceAll("\f", "\\f");
        text = text.replaceAll("\n", "\\n");
        text = text.replaceAll("\r", "\\r");
        text = text.replaceAll("\t", "\\t");
        text = text.replaceAll(backslashPlaceholder, "\\\\");
        text = text.replaceAll('"', '\\"');
        return `"${text}"`;
    }

    printStringLiteral(node) {
        const text = node.text;
        if (text in this.StringLiteralReplacements) return this.StringLiteralReplacements[text];
        // `.into()` borrows the `&'static str` into the `Cow` payload — no alloc.
        return `Value::Str(${this.quotedStringLiteral(text)}.into())`;
    }

    printNumericLiteral(node) {
        const text = node.text;
        // a decimal point or an exponent makes the literal a float
        if (text.includes('.') || /[eE]/.test(text)) return `Value::Float(${text})`;
        return `Value::Int(${text})`;
    }

    printBooleanLiteral(node) {
        return `Value::Bool(${SyntaxKind.TrueKeyword === node.kind})`;
    }

    printNullKeyword(node, identation) {
        return 'Value::Null';
    }

    // ── native equality emission ────────────────────────────────────────────
    // When the checker proves both operands hold the same primitive payload
    // (string / number / boolean, or one side is a matching literal) the
    // unwrapped payloads are compared with `==`/`!=` instead of is_equal().

    // Operators whose printed form is a bare Rust `bool` (not a Value).
    private static readonly BOOL_PRODUCING_OPERATORS = new Set([
        SyntaxKind.EqualsEqualsToken,
        SyntaxKind.EqualsEqualsEqualsToken,
        SyntaxKind.ExclamationEqualsToken,
        SyntaxKind.ExclamationEqualsEqualsToken,
        SyntaxKind.LessThanToken,
        SyntaxKind.LessThanEqualsToken,
        SyntaxKind.GreaterThanToken,
        SyntaxKind.GreaterThanEqualsToken,
        SyntaxKind.AmpersandAmpersandToken,
        SyntaxKind.BarBarToken,
        SyntaxKind.InstanceOfKeyword,
    ]);

    // Method names whose Rust helper returns a bare `bool` (not a Value).
    private static readonly BOOL_PRODUCING_CALLS = new Set([
        'isInteger',
        'isSafeInteger',
        'some',
        'every',
        'test',
    ]);

    // Receiver locals whose element writes may go native by name. `request`
    // is covered by the request-builder proof; every other receiver keeps the helper.
    private static readonly RUST_NATIVE_INSERT_RECEIVERS = new Set([
        'result',
        'account',
        'params',
        'fee',
    ]);

    // Scalar book fields the shared order-book store keeps instead of the Dict
    // (value.rs `is_book_meta_key` plus the `cache` replacement write).
    private static readonly RUST_ORDERBOOK_META_FIELDS = new Set(['timestamp', 'datetime', 'nonce', 'symbol']);
    private static readonly RUST_ORDERBOOK_READ_FIELDS = new Set(['bids', 'asks', 'timestamp', 'datetime', 'nonce', 'symbol', 'cache']);
    private static readonly RUST_ORDERBOOK_CLASSES = new Set(['OrderBook', 'WsOrderBook', 'CountedOrderBook', 'IndexedOrderBook']);

    private static readonly RUST_BOOK_META_KEYS = new Set([
        'timestamp',
        'datetime',
        'nonce',
        'symbol',
        'checksum',
        'cache',
    ]);

    // `this.<field>` receivers whose Value may be a tagged live handle (order
    // book / cache / ws client / subscriptions snapshot) — these keep the helper
    // so its store write-through stays reachable.
    private static readonly RUST_TAGGED_HANDLE_FIELDS = new Set([
        'cache',
        'client',
        'subscriptions',
        'orderbook',
    ]);

    // Fields the hand-written base keeps as a plain dict: `rust/ccxt-base/src/exchange.rs`
    // initialises each to `Value::Map(HashMap::new())` and never tags it, so an element write
    // is the whole helper even though the TS declaration is `any` (no checker shape to read).
    private static readonly RUST_PLAIN_DICT_FIELDS = new Set([
        'balance',
        'orderbooks',
        'trades',
        'tickers',
        'bidsasks',
        'ohlcvs',
        'clients',
        'transactions',
        'headers',
        'currencies',
        'has',
        'tokenBucket',
    ]);

    // Free helpers whose call prints a bare `bool` — an argument position that
    // expects a `Value` has to box them (ccxt's wrapBoolValueArgs set).
    private static readonly RUST_BOOL_VALUE_HELPERS = [
        'is_equal',
        'is_true',
        'is_greater_than',
        'is_less_than',
        'is_greater_than_or_equal',
        'is_less_than_or_equal',
        'is_array',
        'is_object',
        'in_op',
        'is_number',
        'is_string',
    ];

    // Payload accessor used to compare each primitive kind natively.
    private static readonly PAYLOAD_ACCESSORS = {
        'string': 'as_str',
        'number': 'as_f64',
        'boolean': 'as_bool',
    };

    // Primitive kind the checker proves for `type`; a union keeps the kind only
    // when every non-nullable member is that same primitive.
    primitiveKindOfType(type): string {
        if (type === undefined) return undefined;
        const flags = type.flags;
        if (this.isStringType(flags)) return 'string';
        if (flags === TypeFlags.Number || flags === TypeFlags.NumberLiteral) return 'number';
        if (flags === TypeFlags.Boolean || flags === TypeFlags.BooleanLiteral) return 'boolean';
        if (flags & TypeFlags.Union) {
            let kind = undefined;
            for (const member of typeParts(type) ?? []) {
                if (member.flags & (TypeFlags.Undefined | TypeFlags.Null)) {
                    continue;
                }
                const memberKind = this.primitiveKindOfType(member);
                if (memberKind === undefined || (kind !== undefined && kind !== memberKind)) return undefined;
                kind = memberKind;
            }
            return kind;
        }
        return undefined;
    }

    // Native truthiness of a checker-proved boolean Value: `is_true(&v)` is `v.is_truthy()`
    // (`""`/`0`/`[]`/`{}`/Null are false). When the operand is proven `bool`/`undefined` only,
    // the runtime value is `Value::Bool(..)` or `Value::Null`, so `matches!(v, Value::Bool(true))`.

    /** `true` / `false` / `boolean` (a union of BooleanLiteral members too). */
    isBooleanValueType(type: Type | undefined): boolean {
        if (type === undefined) return false;
        if (type.flags & TypeFlags.Union) {
            const members: Type[] = typeParts(type) ?? [];
            return members.length > 0 && members.every((member) => this.isBooleanValueType(member));
        }
        return (type.flags & (TypeFlags.Boolean | TypeFlags.BooleanLiteral)) !== 0;
    }

    /** `boolean | undefined`: `undefined`/`null` both print `Value::Null` (false
     *  for the helper and for the `matches!` alike), so they may join the union. */
    isBooleanOrUndefinedType(type: Type | undefined): boolean {
        if (type === undefined) return false;
        const members: Type[] = (type.flags & TypeFlags.Union) ? (typeParts(type) ?? []) : [type];
        if (members.length === 0) return false;
        const onlyBooleanOrEmpty = members.every((member) =>
            this.isBooleanValueType(member) ||
            (member.flags & (TypeFlags.Undefined | TypeFlags.Void | TypeFlags.Null)) !== 0);
        return onlyBooleanOrEmpty && members.some((member) => this.isBooleanValueType(member));
    }

    /** Operands this rule handles: `safeBool`/`safeBool2`/`safeBoolN` calls (a
     *  `Value` in the port) and element accesses (printed as `get_value`). */
    isBooleanValueFamilyOperand(node): boolean {
        const inner = this.unwrapParens(node);
        if (inner === undefined) return false;
        if (isElementAccessExpression(inner)) return true;
        if (isCallExpression(inner)) {
            const name = this.callExpressionName(inner);
            return name === 'safeBool' || name === 'safeBool2' || name === 'safeBoolN';
        }
        return false;
    }

    /** Declarations `printVariableDeclarationList` emitted as `let mut x: bool`. */
    private rustBoolDeclaredLocals = new WeakSet<Node>();

    /** A bare identifier whose reads still hold a `Value` box: every declaration
     *  this printer emits as `Value` (param, destructured element, local) minus
     *  the ones the declaration site retypes to a native Rust type. */
    isBooleanValueIdentifier(node): boolean {
        const inner = this.unwrapParens(node);
        if (inner === undefined || !isIdentifier(inner) || !this.isDeclaredValueIdentifier(inner)) return false;
        const declarations = symbolDeclarations((this.getChecker() as any).getSymbolAtLocation(inner));
        return declarations.length > 0 && declarations.every((declaration) =>
            !this.rustDeclarationPrintsNativeBool(declaration));
    }

    /** The declaration site emits `let mut x: bool = …` (see
     *  `getRustBoolLocalInitializer`): its reads are native bools, not `Value`. */
    rustDeclarationPrintsNativeBool(declaration): boolean {
        if (declaration?.kind !== SyntaxKind.VariableDeclaration) return false;
        if (this.rustBoolDeclaredLocals.has(declaration)) return true;
        const initializer = declaration.initializer;
        if (initializer === undefined || declaration.name?.kind !== SyntaxKind.Identifier) return false;
        return this.rustTypeIsBoolean(initializer) &&
            this.rustLocalUsesAcceptBool(declaration, declaration.name.text);
    }

    /** The emitted `matches!` is a bare Rust `bool`: it is only valid where the
     *  whole enclosing boolean expression already sits in a bool slot. A logical
     *  expression stored in a `Value` slot gets its `Value::Bool(..)` box from the
     *  ccxt post-passes, which key on the leading helper token the operand would
     *  no longer provide. */
    isBareBoolEmissionSafe(node): boolean {
        return this.isBooleanPosition(this.rustClimbLogicalWrappers(node));
    }

    /** Outermost ancestor reached through parens, `!` and `&&`/`||`. */
    rustClimbLogicalWrappers(node): any {
        let current: any = node;
        let parent: any = current.parent;
        while (parent !== undefined && (isParenthesizedExpression(parent) ||
            (parent.kind === SyntaxKind.PrefixUnaryExpression && parent.operator === SyntaxKind.ExclamationToken) ||
            (parent.kind === SyntaxKind.BinaryExpression &&
             (parent.operatorToken.kind === SyntaxKind.AmpersandAmpersandToken ||
              parent.operatorToken.kind === SyntaxKind.BarBarToken)))) {
            current = parent;
            parent = parent.parent;
        }
        return current;
    }

    // B-26 extends the proof with the printer's own bool-typed sinks: a narrowed `let x: bool = …`
    // (getRustBoolLocalInitializer) and a logical boxed in `Value::Bool(…)`
    // (printCustomBinaryExpressionIfAny) both demand a `bool`, so their operands may print bare.
    rustConditionBoolSlot(node): boolean {
        if (this.isBareBoolEmissionSafe(node)) return true;
        const current = this.rustClimbLogicalWrappers(node);
        // A logical the printer boxes (`Value::Bool(<logical>)`) for a Value slot.
        const inner = this.unwrapParens(current);
        if (inner !== undefined && inner.kind === SyntaxKind.BinaryExpression &&
            (inner.operatorToken.kind === SyntaxKind.AmpersandAmpersandToken ||
             inner.operatorToken.kind === SyntaxKind.BarBarToken) &&
            (this.hasNativeComparisonOperand(inner.left) || this.hasNativeComparisonOperand(inner.right))) {
            return true;
        }
        // The initializer of a local this printer declares `bool`.
        const declaration: any = current.parent;
        if (declaration === undefined || !isVariableDeclaration(declaration) ||
            declaration.initializer !== current || declaration.name?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        return this.rustNodeIsBoolExpression(declaration.initializer) &&
            this.rustTypeIsBoolean(declaration.initializer) &&
            this.rustLocalUsesAcceptBool(declaration, String(declaration.name.text));
    }

    /** Native truthiness text of the operand, or undefined to keep `is_true`. */
    printNativeTruthiness(node): string | undefined {
        if (!this.isBooleanValueFamilyOperand(node) || !this.printsValueExpression(node) ||
            !this.isBooleanOrUndefinedType(this.typeOfNodeIfAny(node)) || !this.isBareBoolEmissionSafe(node)) {
            return undefined;
        }
        return `matches!(${this.printNode(node, 0)}, Value::Bool(true))`;
    }

    /** Same native truthiness for a bare `Value`-boxed identifier of boolean type. Prints the bool-tuple
     *  truthiness text (`x.as_bool() == Some(true)`) so the typed-locals pass keeps rewriting it byte-identically. */
    printNativeIdentifierTruthiness(node): string | undefined {
        if (!this.isBooleanValueIdentifier(node) || !this.printsValueExpression(node) ||
            !this.isBooleanOrUndefinedType(this.typeOfNodeIfAny(node)) || !this.isBareBoolEmissionSafe(node)) {
            return undefined;
        }
        const text = `${this.printNode(node, 0)}.as_bool() == Some(true)`;
        let current: any = node;
        while (current.parent !== undefined && isParenthesizedExpression(current.parent)) current = current.parent;
        const negated = current.parent?.kind === SyntaxKind.PrefixUnaryExpression &&
            current.parent.operator === SyntaxKind.ExclamationToken;
        return negated ? `(${text})` : text;
    }

    // Kind of a literal operand whose printed Value variant is exactly known.
    literalKindOfNode(node): string {
        if (node === undefined) return undefined;
        switch (node.kind) {
        case SyntaxKind.StringLiteral: return 'string';
        case SyntaxKind.NumericLiteral: return 'number';
        case SyntaxKind.TrueKeyword:
        case SyntaxKind.FalseKeyword: return 'boolean';
        case SyntaxKind.NullKeyword: return 'null';
        case SyntaxKind.Identifier: return node.text === 'undefined' ? 'null' : undefined;
        }
        return undefined;
    }

    // Does printNode() render `node` as a Rust `Value` (and not a bare bool)?
    printsValueExpression(node): boolean {
        if (node === undefined) return false;
        switch (node.kind) {
        case SyntaxKind.ParenthesizedExpression: return this.printsValueExpression(node.expression);
        case SyntaxKind.AwaitExpression: return this.printsValueExpression(node.expression);
        case SyntaxKind.BinaryExpression: return !RustTranspiler.BOOL_PRODUCING_OPERATORS.has(node.operatorToken.kind);
        case SyntaxKind.PrefixUnaryExpression: return node.operator !== SyntaxKind.ExclamationToken;
        case SyntaxKind.CallExpression: return !RustTranspiler.BOOL_PRODUCING_CALLS.has(this.callExpressionName(node));
        case SyntaxKind.Identifier:
        case SyntaxKind.PropertyAccessExpression:
        case SyntaxKind.ElementAccessExpression:
            return !this.isClassInstanceType(this.getChecker().getTypeAtLocation(node));
        case SyntaxKind.StringLiteral:
        case SyntaxKind.NumericLiteral:
        case SyntaxKind.TrueKeyword:
        case SyntaxKind.FalseKeyword:
        case SyntaxKind.NullKeyword:
        case SyntaxKind.ArrayLiteralExpression:
        case SyntaxKind.ObjectLiteralExpression:
        case SyntaxKind.ConditionalExpression:
            return true;
        }
        return false;
    }

    // Class instances are emitted as their Rust struct (not a Value), so they
    // can neither be compared to Value::Null nor unwrapped with as_*().
    callExpressionName(node): string {
        const expression = node.expression;
        if (isIdentifier(expression)) return expression.text as string;
        if (isPropertyAccessExpression(expression)) return expression.name.text as string;
        return '';
    }

    // Does a string (literal text or literal-type value) parse as a number?
    // is_equal() coerces those against numeric/bool operands, a plain string
    // compare does not.
    textCoercesToNumber(text: string): boolean {
        return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text) || /^[+-]?(inf|infinity|nan)$/i.test(text);
    }

    // f64 literal text for a numeric literal; undefined when it is not a Rust
    // decimal/float literal (hex/octal/binary fall back to the helper).
    numericLiteralF64Text(node): string {
        const text = node.text;
        if (text.startsWith('0x') || text.startsWith('0o') || text.startsWith('0b')) return undefined;
        if (text.startsWith('.')) return `0${text}`;
        if (text.includes('.') || text.includes('e') || text.includes('E')) return text;
        return `${text}.0`;
    }

    // The printer's own proof that a plain read prints as a Rust `Value`: `this.<field>` (every
    // declared field is `Value`) or an identifier bound to a local/param (a local is narrowed to
    // `bool` only when every use is a condition sink — never an is_equal argument).
    rustReadPrintsValue(node): boolean {
        if (node === undefined) return false;
        if (node.kind === SyntaxKind.PropertyAccessExpression && node.expression.kind === SyntaxKind.ThisKeyword) return true;
        if (node.kind !== SyntaxKind.Identifier) return false;
        const symbol: any = this.getChecker().getSymbolAtLocation(node);
        const declarations: any[] = symbolDeclarations(symbol);
        if (declarations.length === 0) return false;
        return declarations.every((declaration) => isParameterDeclaration(declaration)
            || (isVariableDeclaration(declaration)
                && declaration.initializer?.kind !== SyntaxKind.NewExpression));
    }

    // Can the checked type only hold a Bool, Null/undefined or a non-numeric
    // string? Then `x.as_bool() == Some(b)` answers exactly what is_equal(x, b)
    // does: its f64 fallback (Str parse / Bool→0|1) can never fire.
    rustBooleanComparableType(type): boolean {
        if (type === undefined) return false;
        if (type.flags & TypeFlags.Union) {
            const members: any[] = typeParts(type) ?? [];
            return members.length > 0 && members.every((member) => this.rustBooleanComparableType(member));
        }
        if (type.flags & (TypeFlags.Boolean | TypeFlags.BooleanLiteral)) return true;
        if (type.flags & (TypeFlags.Undefined | TypeFlags.Null)) return true;
        if (type.flags & TypeFlags.StringLiteral) return !this.textCoercesToNumber(String((type as any).value ?? ''));
        return false;
    }

    // Native `==`/`!=` on the unwrapped payload when the checker proves the
    // Value variants line up; undefined keeps the is_equal() helper.
    printNativeEqualityComparison(left, right, op): string {
        const nativeIntResult = this.rustLengthEquality(left, right, op); if (nativeIntResult !== undefined) return nativeIntResult;
        const r12 = this.rustNativeBoolEquality(left, right, op); if (r12 !== undefined) return r12;
        const r13 = this.printRustProvenStrEquality(left, right, op); if (r13 !== undefined) return r13;
        const r20 = this.boolCallEquality(left, right, op); if (r20 !== undefined) return r20;
        const operator = (op === SyntaxKind.EqualsEqualsToken || op === SyntaxKind.EqualsEqualsEqualsToken) ? '==' : '!=';
        const leftLiteral = this.literalKindOfNode(left);
        const rightLiteral = this.literalKindOfNode(right);
        if (leftLiteral !== undefined && rightLiteral !== undefined) return undefined;
        if (leftLiteral !== undefined || rightLiteral !== undefined) {
            const literal = leftLiteral !== undefined ? left : right;
            const literalKind = leftLiteral ?? rightLiteral;
            const other = leftLiteral !== undefined ? right : left;
            if (!this.printsValueExpression(other) && (literalKind !== 'null' || !this.rustReadPrintsValue(other))) return undefined;
            const otherType = this.getChecker().getTypeAtLocation(other);
            const otherKind = this.primitiveKindOfType(otherType);
            const typedStringLocal = this.rustStringLocalIdentifierIsTyped(other);
            if (literalKind === 'null') {
                // Exact for every runtime value: is_equal(x, null) is true only
                // when x is Null, and the derived PartialEq says the same.
                if (typedStringLocal) return `${this.printNode(other, 0)}.${operator === '==' ? 'is_none' : 'is_some'}()`;
                return `${this.printNode(other, 0)} ${operator} Value::Null`;
            }
            if (literalKind === 'string') {
                if (literal.text in this.StringLiteralReplacements) return undefined;
                if (this.textCoercesToNumber(literal.text) && otherKind !== 'string') return undefined;
                const accessor = typedStringLocal ? 'as_deref' : 'as_str';
                return `${this.printNode(other, 0)}.${accessor}() ${operator} Some(${this.quotedStringLiteral(literal.text)})`;
            }
            if (literalKind === 'number') {
                if (otherKind !== 'number') return undefined;
                const text = this.numericLiteralF64Text(literal);
                if (text === undefined) return undefined;
                return `${this.printNode(other, 0)}.as_f64() ${operator} Some(${text})`;
            }
            if (literalKind === 'boolean') {
                if (otherKind !== 'boolean' && !this.rustBooleanComparableType(otherType)) return undefined;
                const value = literal.kind === SyntaxKind.TrueKeyword ? 'true' : 'false';
                return `${this.printNode(other, 0)}.as_bool() ${operator} Some(${value})`;
            }
            return undefined;
        }
        if (!this.printsValueExpression(left) || !this.printsValueExpression(right)) return undefined;
        const leftKind = this.primitiveKindOfType(this.getChecker().getTypeAtLocation(left));
        const rightKind = this.primitiveKindOfType(this.getChecker().getTypeAtLocation(right));
        if (leftKind === undefined || leftKind !== rightKind) return undefined;
        const accessor = RustTranspiler.PAYLOAD_ACCESSORS[leftKind];
        return `${this.printNode(left, 0)}.${accessor}() ${operator} ${this.printNode(right, 0)}.${accessor}()`;
    }

    // ── checker-typed helper elimination ─────────────────────────────────
    // Each predicate proves a static TS shape for which the native Rust form
    // is exactly what the runtime helper computes; only then is the helper
    // call dropped, anything unproven keeps the helper.

    typeOfNodeIfAny(node: Node): Type | undefined {
        // A transpile without a program/checker (bare snippet) has no types.
        return this.checkerOrUndefined()?.getTypeAtLocation(node);
    }

    // Arrays/tuples/strings: `.length` is exactly what `Value::len()` returns.
    // Other shapes (Dict) keep the helper — ArrayCache / OrderBookSide markers
    // hold their length in the marker dict, which get_array_length unwraps.
    isValueLengthType(type: Type | undefined): boolean {
        if (type === undefined) return false;
        if (type.flags & TypeFlags.Union) {
            const parts: Type[] = typeParts(type) ?? [];
            return parts.length > 0 && parts.every((part) => this.isValueLengthType(part));
        }
        // A `null`/`undefined` member boxes as `Value::Null`, whose `len()` is
        // the same number the helper's fallthrough returns for it.
        return (type.flags & (TypeFlags.Undefined | TypeFlags.Null | TypeFlags.Void)) !== 0
            || this.getChecker().isArrayType(type)
            || this.getChecker().isTupleType(type)
            || this.isStringType(type.flags);
    }

    printArrayLength(node, identation, leftExpr = undefined) {
        const receiver = leftExpr ?? this.printNode(node.expression, 0);
        if (!this.rustIsOrderBookSide(node.expression) && this.isValueLengthType(this.typeOfNodeIfAny(node.expression))) return `Value::Int(${receiver}.len() as i64)`;
        // A read-only list bearer is a `Vec<Value>`; `len()` is the helper's answer.
        if (this.rustReadBearerKind(node.expression) === 'list') return `Value::Int(${receiver}.len() as i64)`;
        if (this.provenListValue(node.expression)) return `${receiver}.as_array().map_or(Value::Int(0), |__a| Value::Int(__a.len() as i64))`;
        return this.arrLength(node, receiver) ?? `get_array_length(&${receiver})`;
    }

    /** `orderbook['bids']` / `orderbook.asks` on an `OrderBook`-typed receiver, or a
     *  local initialised from one. The WS runtime keeps those sides as marker dicts
     *  whose levels live in the side store, so only `get_array_length` / `get_value`
     *  reach them — the checker's array type is not the runtime shape. */
    rustIsOrderBookSide(node: Node, depth = 0): boolean {
        const stripped = this.rustStripWrappers(node);
        if (stripped === undefined || depth > 4) return false;
        if (isIdentifier(stripped)) {
            const declaration = this.rustSingleLocalDeclaration(stripped);
            return declaration !== undefined && isVariableDeclaration(declaration)
                && this.rustIsOrderBookSide(declaration.initializer, depth + 1);
        }
        let receiver: Node | undefined;
        let key: string | undefined;
        if (isElementAccessExpression(stripped) && isStringLiteralLikeNode(stripped.argumentExpression)) {
            receiver = stripped.expression;
            key = stripped.argumentExpression.text;
        } else if (isPropertyAccessExpression(stripped)) {
            receiver = stripped.expression;
            key = String(stripped.name.text);
        }
        if (receiver === undefined || (key !== 'bids' && key !== 'asks')) return false;
        const symbol = (this.typeOfNodeIfAny(receiver) as any)?.getSymbol?.();
        return symbol !== undefined && /^(Indexed|Counted)?OrderBook$/.test(symbol.name);
    }

    // Native string search / slicing: `x.indexOf(y)` and `x.slice(a, b)` on a checker-proven
    // string receiver print native `str` code. The receiver is a `Value`, so the payload is reached
    // via `as_str()`; a `Value::Null` receiver takes the helper's `-1` / `Value::Null` branch.

    /** Literal integer bound of a `slice` call (`3`, `-64`), else undefined. */
    rustSliceLiteralBound(node): number | undefined {
        if (node === undefined) return undefined;
        if (isNumericLiteral(node)) {
            const value = Number(node.text);
            return Number.isSafeInteger(value) ? value : undefined;
        }
        if (isPrefixUnaryExpression(node) && node.operator === SyntaxKind.MinusToken &&
            isNumericLiteral(node.operand)) {
            const value = Number(node.operand.text);
            return Number.isSafeInteger(value) ? -value : undefined;
        }
        return undefined;
    }

    // `slice` clamps like JS: a non-negative bound is capped at the length, a
    // negative one counts from the end and is floored at 0.
    rustSliceClampedIndex(value: number): string {
        return value < 0 ? `(__l - ${-value}).max(0)` : `__l.min(${value})`;
    }

    // `x.indexOf("lit")` on a proven string receiver: `str::find` is exactly
    // the helper's `Value::Str` arm (byte index, `-1` when absent).
    printNativeStringIndexOf(node, receiverText: string): string | undefined {
        if (node === undefined || !isCallExpression(node) ||
            !isPropertyAccessExpression(node.expression) || node.arguments?.length !== 1) {
            return undefined;
        }
        if (this.primitiveKindOfType(this.typeOfNodeIfAny(node.expression.expression)) !== 'string') return undefined;
        const needle = node.arguments[0];
        if (!isStringLiteral(needle) && !isNoSubstitutionTemplateLiteral(needle)) return undefined;
        if (typeof receiverText !== 'string' || receiverText.includes('\n')) return undefined;
        const literal = this.escapeRustStringLiteral(needle.text);
        return `Value::Int(${receiverText}.as_str().and_then(|__s| __s.find("${literal}")).map(|__i| __i as i64).unwrap_or(-1))`;
    }

    // `x.slice(a)` / `x.slice(a, b)` with literal bounds on a proven string
    // receiver: the helper's char-vector clamps are inlined, so the emission
    // returns the same string (and `Value::Null` for a null receiver).
    printNativeStringSlice(node, receiverText: string): string | undefined {
        if (node === undefined || !isCallExpression(node) ||
            !isPropertyAccessExpression(node.expression)) {
            return undefined;
        }
        const args = node.arguments ?? [];
        if (args.length === 0 || args.length > 2) return undefined;
        if (this.primitiveKindOfType(this.typeOfNodeIfAny(node.expression.expression)) !== 'string') return undefined;
        if (typeof receiverText !== 'string' || receiverText.includes('\n')) return undefined;
        const start = this.rustSliceLiteralBound(args[0]);
        if (start === undefined) return undefined;
        let end = '__l';
        if (args[1] !== undefined && args[1].kind !== SyntaxKind.NullKeyword && args[1].kind !== SyntaxKind.UndefinedKeyword) {
            const bound = this.rustSliceLiteralBound(args[1]);
            if (bound === undefined) return undefined;
            end = this.rustSliceClampedIndex(bound);
        }
        const begin = this.rustSliceClampedIndex(start);
        return `${receiverText}.as_str().map(|__s| { let __c: Vec<char> = __s.chars().collect();` +
            ` let __l = __c.len() as i64; let __i = ${begin}; let __j = ${end};` +
            ` if __i <= __j { __c[__i as usize..__j as usize].iter().collect::<String>() } else { String::new() } })` +
            `.map(Value::from).unwrap_or(Value::Null)`;
    }

    // Native value predicates (`Array.isArray` / `typeof … === '…'`): each runtime predicate is a
    // single `matches!` over the `Value` variants, so on a declared `Value` place the call is
    // replaced by that same match — no helper call, operand still read exactly once.

    // `matches!` pattern of the runtime predicate, keyed by the `typeof` word.
    private static readonly RUST_TYPE_PREDICATE_PATTERNS: { [key: string]: string } = {
        'array': 'Value::Arr(_)',
        'string': 'Value::Str(_)',
        'number': 'Value::Int(_) | Value::Float(_)',
        'boolean': 'Value::Bool(_)',
        'object': 'Value::Dict(_)',
    };

    // An identifier bound by a local/param declaration: the printer declares
    // every one of them as `Value`. Imports, classes and function names print
    // as Rust items rather than as values, so they keep the helper.
    isDeclaredValueIdentifier(node): boolean {
        const declarations = symbolDeclarations((this.getChecker() as any).getSymbolAtLocation(node));
        return declarations.length > 0 && declarations.every((d) =>
            isVariableDeclaration(d) || isParameterDeclaration(d) || isBindingElement(d));
    }

    // A declared `Value` place: a local/param identifier, or a field/element
    // access rooted at `this` or at such an identifier. Those are the operands
    // whose printed text the helper already borrows as a `Value`.
    isDeclaredValuePlace(node): boolean {
        const inner = this.unwrapParens(node);
        if (inner !== undefined && isIdentifier(inner)) {
            return this.isDeclaredValueIdentifier(inner);
        }
        if (inner !== undefined && (isPropertyAccessExpression(inner) || isElementAccessExpression(inner))) {
            const root = this.unwrapParens(this.valuePlaceRoot(inner));
            return root !== undefined &&
                (root.kind === SyntaxKind.ThisKeyword || this.isDeclaredValueIdentifier(root));
        }
        return false;
    }

    valuePlaceRoot(node): any {
        let current: any = node;
        while (isPropertyAccessExpression(current) || isElementAccessExpression(current)) {
            current = current.expression;
        }
        return current;
    }

    nativeValuePredicateText(kind: string, operandNode, printedOperand: string): string | undefined {
        const pattern = RustTranspiler.RUST_TYPE_PREDICATE_PATTERNS[kind];
        if (pattern === undefined || operandNode === undefined || printedOperand === undefined ||
            !this.isDeclaredValuePlace(operandNode)) {
            return undefined;
        }
        return `matches!(${this.ensureRef(printedOperand)}, ${pattern})`;
    }

    // Object-typed values are Dicts at runtime, so `key in obj` is a plain
    // key lookup. Arrays keep the helper: `in_op` searches them element-wise.
    // A `Dict`/`Dictionary<T>` receiver is a Reference to its index-signature
    // interface, so the class/lib guards — not the Reference flag — decide it.
    isDictShapedType(type: Type | undefined): boolean {
        if (type === undefined) return false;
        if (type.flags & TypeFlags.Union) {
            // `Market | undefined` style aliases: a nullish member carries no
            // value, so only the value-carrying members have to be dict-shaped.
            // `in_op` and the native insert both answer false / no-op on Null.
            const parts: Type[] = typeParts(type) ?? [];
            const valueParts = parts.filter((part) => !this.rustTypeIsNullish(part));
            return parts.length > valueParts.length && valueParts.length > 0
                && valueParts.every((part) => this.isDictShapedType(part));
        }
        const checker = this.getChecker();
        if (!(type.flags & TypeFlags.Object) || type.getCallSignatures().length !== 0
            || checker.isArrayType(type) || checker.isTupleType(type) || checker.isArrayLikeType(type)) {
            return false;
        }
        return !this.isClassInstanceType(type) && !this.isLibDeclaredType(type);
    }

    // `"key" in obj` → `matches!(&obj, Value::Dict(__d) if __d.contains_key("key"))`
    // In the TS AST `key` is the left operand and `obj` the right one.
    printNativeInOperator(key, obj) {
        if (!isStringLiteral(key) || !this.isDictShapedType(this.typeOfNodeIfAny(obj))) {
            return undefined;
        }
        const keyLiteral = this.rustStringLiteralOf(this.printStringLiteral(key));
        if (keyLiteral === undefined) {
            return undefined;
        }
        const objExpr = this.printNode(obj, 0);
        return `Value::Bool(matches!(&${objExpr}, Value::Dict(__d) if __d.contains_key(${keyLiteral})))`;
    }

    // The Rust string literal behind a printed TS string literal — the boxed
    // shapes the printer emits today (`Value::Str("k".to_string())`,
    // `Value::from("k")`) plus a bare `"k"` once an arg-shape unit drops the box.
    rustStringLiteralOf(printedKey: string): string | undefined {
        const boxed = printedKey.match(/^(?:Value::Str|Value::from)\((.+)\)$/);
        const literal = (boxed ? boxed[1].replace(/\.(?:to_string|into)\(\)$/, '') : printedKey).trim();
        return /^"(?:[^"\\]|\\.)*"$/.test(literal) ? literal : undefined;
    }

    // `X["k"] = v` on a checker-proven plain Dict receiver: mutate the Dict
    // natively. The helper's tag hooks (book meta, ws subscriptions, cache
    // hashmap) only fire on tagged dicts, which a plain object type never is.
    // `book["timestamp"|"datetime"|"nonce"|"symbol"] = v` on a local the checker types as an
    // order-book class: `Value::set_book_meta` (hand-written, value.rs) does the shared-store
    // write (`try_book_meta_write`) and otherwise defers to the same `add_element_to_object`.
    printNativeBookMetaWrite(baseExpr, keyNode, keyText, valueText): string | undefined {
        if (!isIdentifier(baseExpr) || !isStringLiteral(keyNode)) {
            return undefined;
        }
        if (!RustTranspiler.RUST_ORDERBOOK_META_FIELDS.has(keyNode.text)) {
            return undefined;
        }
        if (this.rustDictBearerDeclaration(baseExpr) !== undefined || this.rustMapParamDeclaration(baseExpr) !== undefined) {
            return undefined;
        }
        const type = this.typeOfNodeIfAny(baseExpr);
        const name = type === undefined ? undefined : (this.typeSymbolOf(type) as any)?.name;
        if ((name === undefined || !RustTranspiler.RUST_ORDERBOOK_CLASSES.has(name))
            && !this.rustReadsOrderbooksStore(baseExpr)) {
            return undefined;
        }
        const keyLiteral = keyText.match(/^Value::Str\((.+)\.(?:to_string|into)\(\)\)$/);
        if (keyLiteral === null) {
            return undefined;
        }
        let value = valueText;
        if (this.rustPrintedBoolArg(value)) {
            value = `Value::Bool(${value})`;
        }
        const receiver = baseExpr.text;
        if (new RegExp(`\\b${receiver}\\b`).test(value)) {
            return `{ let __be_tmp = ${value}; ${receiver}.set_book_meta(${keyLiteral[1]}, __be_tmp); }`;
        }
        const trimmed = value.trim();
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed) && trimmed !== 'self'
            && trimmed !== 'true' && trimmed !== 'false') {
            value = `${trimmed}.clone()`;
        }
        return `${receiver}.set_book_meta(${keyLiteral[1]}, ${value})`;
    }

    // `let b = this.safeValue (this.orderbooks, k)`: the checker types it `any`, but it is an
    // order book; `set_book_meta` falls back to the helper on a non-book value.
    rustReadsOrderbooksStore(ident): boolean {
        const declaration: any = this.rustDeclarationOfIdentifier(ident);
        const init: any = declaration !== undefined && isVariableDeclaration(declaration) ? declaration.initializer : undefined;
        if (init === undefined || !isCallExpression(init) || !isPropertyAccessExpression(init.expression)) return false;
        if (init.expression.name.text !== 'safeValue' || init.arguments.length < 2) return false;
        const store: any = init.arguments[0];
        return isPropertyAccessExpression(store) && store.expression.kind === SyntaxKind.ThisKeyword
            && store.name.text === 'orderbooks';
    }

    printNativeDictInsert(baseExpr, keyNode, keyText, valueText): string | undefined {
        const receiver = this.rustNativeInsertReceiver(baseExpr);
        if (receiver === undefined || !this.rustReceiverStaysDict(baseExpr, receiver)) {
            return undefined;
        }
        // A bucket read off `cache.hashmap` / client `subscriptions`/`futures` carries a runtime
        // backref: only the helper writes through to the shared store, so keep it.
        if (!receiver.isField && this.rustLocalInitReadsTaggedContainer(baseExpr)) {
            return undefined;
        }
        const keyArg = this.rustNativeInsertKeyArg(receiver, keyNode, keyText);
        if (keyArg === undefined) {
            return undefined;
        }
        const name = receiver.text;
        const value = this.rustPrintedBoolArg(valueText) ? `Value::Bool(${valueText})` : valueText;
        const insert = (val: string) =>
            `if let Value::Dict(__d) = &mut ${name} { std::sync::Arc::make_mut(__d).insert(${keyArg}, ${val}); }`;
        // Any mention of the receiver in the value operand reads it while the
        // write holds the `&mut` — ccxt's splitAddElementBorrowConflicts pass
        // hoists on the same signal, so mirror it with a temp binding.
        const readsReceiver = receiver.isField ? /\bself\b/.test(value) : new RegExp(`\\b${name}\\b`).test(value);
        if (readsReceiver) {
            return `{ let __be_tmp = ${value}; ${insert('__be_tmp')} }`;
        }
        const trimmed = value.trim();
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed) && trimmed !== 'self'
            && trimmed !== 'true' && trimmed !== 'false') {
            return insert(`${trimmed}.clone()`);
        }
        return insert(value);
    }

    /** The `insert` key argument. A literal becomes `"k".into()`; a proven
     *  string place becomes `crate::runtime::stringify_param(&k)` — the exact
     *  conversion the helper's dict branch applies to a non-string key, and
     *  `k.to_string()` for a string one. */
    rustNativeInsertKeyArg(receiver, keyNode, keyText: string): string | undefined {
        if (isStringLiteral(keyNode)) {
            // A book-meta key can only reach the store through a `__book_id`:
            // provable only for receivers the transpiler itself built as plain
            // maps or the hand-written base never tags (fields).
            if (RustTranspiler.RUST_BOOK_META_KEYS.has(keyNode.text) && !receiver.plain) {
                return undefined;
            }
            const keyLiteral = keyText.match(/^Value::Str\((.+)\.(?:to_string|into)\(\)\)$/);
            return keyLiteral === null ? undefined : `${keyLiteral[1]}.into()`;
        }
        // Dynamic key: a plain place, never one that reads the receiver (the
        // insert holds its `&mut`). Every other key shape keeps the helper.
        const key = keyText.trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
            || (receiver.isField ? key.includes('self') : new RegExp(`\\b${receiver.text}\\b`).test(key))) {
            return undefined;
        }
        return `crate::runtime::stringify_param(&${key})`;
    }

    // `x[k1][k2] = v` on a `Dict` parameter: the `get_value_mut` hops go native (`get_mut`) and the outer write is a
    // native `insert`. A missing/non-dict hop is a no-op either way (JS would throw there); fields stay on their own
    // passes, since a `&self` method would clone the field and lose the write.
    nestedDictWrite(baseExpr, keyNodes: any[], keyTexts: string[], valueText: string, fallbackText: string): string | undefined {
        const receiver = this.rustNativeInsertReceiver(baseExpr);
        if (receiver === undefined || receiver.isField || !this.rustReceiverStaysDict(baseExpr, receiver)) {
            return undefined;
        }
        if (this.rustLocalInitReadsTaggedContainer(baseExpr) || keyTexts.length < 2) {
            return undefined;
        }
        // A `Dict`-annotated parameter only: locals are proven by construction in the native-insert text pass,
        // a param is exactly the receiver that pass cannot read, and the checker's annotation proof covers it.
        const declaration: any = this.rustSingleLocalDeclaration(baseExpr);
        if (declaration === undefined || !isParameterDeclaration(declaration)) {
            return undefined;
        }
        const name = receiver.text;
        const last = keyTexts.length - 1;
        const hops: string[] = [];
        for (let i = 0; i < last; i++) {
            const hop = this.entryKeyArg(receiver, keyNodes[i], keyTexts[i]);
            if (hop === undefined) {
                return undefined;
            }
            hops.push(hop);
        }
        const insertKey = this.rustNativeInsertKeyArg(receiver, keyNodes[last], keyTexts[last]);
        if (insertKey === undefined) {
            return undefined;
        }
        const keyArg = insertKey.endsWith('.into()') ? `${insertKey.slice(0, -'.into()'.length)}.to_string()` : insertKey;
        const value = this.rustPrintedBoolArg(valueText) ? `Value::Bool(${valueText})` : valueText;
        const readsReceiver = new RegExp(`\\b${name}\\b`).test(value);
        // Same shape the native-insert text pass emits, so a site both can prove stays byte-identical;
        // `__rd` letters are the tags its sibling passes read as a mutation statement.
        const guard = (val: string) => {
            let body = `std::sync::Arc::make_mut(__h${last}).insert(${keyArg}, ${val});`;
            for (let i = last - 1; i >= 0; i--) {
                body = `if let Some(Value::Dict(__h${i + 1})) =`
                    + ` std::sync::Arc::make_mut(__h${i}).get_mut(${hops[i]}) { ${body} }`;
            }
            return `if let Value::Dict(__h0) = &mut ${name} { ${body} }`;
        };
        // A hop costs ~70 chars: keep the helper when it is the difference
        // between a 400-char line and a longer one (36 = deepest indent + `;`).
        const fits = (out: string) => !(fallbackText.length + 36 <= 400 && out.length + 36 > 400);
        if (readsReceiver) {
            const out = `{ let __rdt = ${value}; ${guard('__rdt')} }`;
            return fits(out) ? out : undefined;
        }
        const trimmed = value.trim();
        const out = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed) && trimmed !== 'self'
            && trimmed !== 'true' && trimmed !== 'false' ? guard(`${trimmed}.clone()`) : guard(value);
        return fits(out) ? out : undefined;
    }

    /** The `get_mut` key of a nested-dict hop: a borrowed `&str` — the literal itself,
     *  or the stringification the insert's key uses. */
    entryKeyArg(receiver, keyNode, keyText: string): string | undefined {
        if (isStringLiteral(keyNode)) {
            const keyLiteral = keyText.match(/^Value::Str\((.+)\.(?:to_string|into)\(\)\)$/);
            return keyLiteral === null ? undefined : keyLiteral[1];
        }
        const key = keyText.trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || key === 'self' || !this.rustKeyIsProvenString(keyNode)
            || new RegExp(`\\b${receiver.text}\\b`).test(key)) {
            return undefined;
        }
        return this.rustStringLocalIdentifierIsTyped(keyNode)
            ? `${key}.as_str()` : `&crate::runtime::stringify_param(&${key})`;
    }

    // Receivers that may be written natively: any local whose every path builds a plain
    // `Value::Map` (name-independent), or a parameter the checker proves is a plain dict.
    rustNativeInsertReceiver(expr): { text: string, isField: boolean, plain: boolean, nameNode: any } | undefined {
        if (isIdentifier(expr)) {
            const plain = this.rustInsertIdentifierReceiver(expr);
            return plain === undefined ? undefined : { text: expr.text, isField: false, plain, nameNode: expr };
        }
        if (isPropertyAccessExpression(expr) && expr.expression.kind === SyntaxKind.ThisKeyword
            && expr.name?.kind === SyntaxKind.Identifier) {
            return {
                text: `self.${expr.name.text}`, isField: true,
                plain: RustTranspiler.RUST_PLAIN_DICT_FIELDS.has(expr.name.text),
                nameNode: expr.name,
            };
        }
        return undefined;
    }

    /** Element-write receiver proof for a local: a whitelisted name (`plain: false`), a dict-shape proof plus a
     *  plain-`Value::Map` build on every path, or a plain-dict-annotated parameter whose writes keep that shape.
     *  The flag is the by-construction plainness (literal-init locals, handler tuples, plain fields) a book-meta key needs. */
    rustInsertIdentifierReceiver(ident): boolean | undefined {
        const declaration = this.rustSingleLocalDeclaration(ident);
        if (declaration !== undefined && isParameterDeclaration(declaration as any)) {
            // A default value (`params: Dict = {}`) keeps the pre-unit
            // initializer proof — `rustReceiverStaysDict` runs both it and the
            // annotation proof and rejects the site when neither holds.
            if (this.rustParamStaysPlainDict(declaration as ParameterDeclaration)
                || (declaration as ParameterDeclaration).initializer !== undefined) {
                return false;
            }
        } else if (declaration !== undefined && isVariableDeclaration(declaration as any)) {
            if (this.rustInsertReceiverBuildsPlainDict(declaration as VariableDeclaration)) {
                return true;
            }
            // A local the declared-Dict table proves holds a Dict at every use
            // (alwaysDict && stable): the helper's non-dict branches are dead,
            // so only the tag hooks and the insert remain — the key rules of
            if (this.rustDeclaredLocalEntry(ident) !== undefined
                && this.rustDeclaredInitIsTagFree(declaration as VariableDeclaration)) {
                return false;
            }
        }
        if (RustTranspiler.RUST_NATIVE_INSERT_RECEIVERS.has(ident.text)) {
            return false; // rust-13 whitelist: not a construction proof
        }
        return undefined;
    }

    /** A literal initializer must carry no runtime tag key; a call initializer
     *  is the axiom the declared-Dict table itself rests on. */
    rustDeclaredInitIsTagFree(declaration: VariableDeclaration): boolean {
        const init = this.rustStripWrappers(declaration.initializer);
        return init === undefined || !isObjectLiteralExpression(init) || this.rustPlainDictLiteral(init);
    }

    /** Skip `( … )`, `x!` and `x as T` wrappers. */
    rustStripWrappers(node: any): any {
        while (node !== undefined && (isParenthesizedExpression(node) || isNonNullExpression(node) || isAsExpression(node))) {
            node = node.expression;
        }
        return node;
    }

    /** The local's single declaration is initialised from a call that reads
     *  `x.hashmap` / `x.subscriptions` / `x.futures` — element dicts the runtime
     *  tags with a backref so writes reach the shared store, not the COW copy. */
    rustLocalInitReadsTaggedContainer(ident: Identifier): boolean {
        const declaration = this.rustSingleLocalDeclaration(ident);
        if (declaration === undefined || !isVariableDeclaration(declaration)) {
            return false;
        }
        const init = this.rustStripWrappers(declaration.initializer);
        return init !== undefined && isCallExpression(init) && init.arguments.some((arg) => {
            const n = this.rustStripWrappers(arg);
            return n !== undefined && isPropertyAccessExpression(n)
                && RustTranspiler.RUST_TAGGED_CONTAINER_FIELDS.has(n.name.text);
        });
    }

    static readonly RUST_TAGGED_CONTAINER_FIELDS = new Set([ 'hashmap', 'subscriptions', 'futures' ]);

    /** True when every value the local can hold comes from an object literal:
     *  the runtime tags a dict (`__book_id`, `__ws_subs_url`, `__ws_sub_ref`,
     *  `__cache_backref`) only on handles its own store builds, so the helper's
     *  write-through branches are provably dead and `insert` is the whole
     *  helper. A `[ x, params ] = this.handle…(…)` tuple re-assigns the
     *  hand-written handler's own dict arguments. */
    rustInsertReceiverBuildsPlainDict(declaration: VariableDeclaration): boolean {
        const name = String((declaration.name as Identifier).text);
        const scope = this.rustEnclosingFunction(declaration);
        if (!this.rustPlainDictLiteral(declaration.initializer) || scope === undefined) {
            return false;
        }
        const declarationSymbol = this.rustSymbolOf(declaration.name as Identifier);
        let plain = true;
        this.rustWalkScope(scope, (n) => {
            if (!plain || !isBinaryExpression(n) || n.operatorToken.kind !== SyntaxKind.EqualsToken) {
                return;
            }
            const left: any = n.left;
            if (isIdentifier(left) && String(left.text) === name
                && (declarationSymbol === undefined || this.rustSymbolOf(left) === declarationSymbol)) {
                plain = this.rustPlainDictLiteral(n.right) || this.rustTypeIsUndefinedish(n.right);
            } else if (isArrayLiteralExpression(left)
                && left.elements.some((e) => isIdentifier(e) && String(e.text) === name)) {
                plain = this.rustHandlerTupleCall(n.right);
            }
        });
        return plain;
    }

    /** An object literal with no runtime tag key — the transpiler built it, so
     *  it is a fresh plain `Value::Map` on every path. */
    rustPlainDictLiteral(node: Node | undefined): boolean {
        if (node !== undefined && isParenthesizedExpression(node)) {
            return this.rustPlainDictLiteral(node.expression);
        }
        return node !== undefined && isObjectLiteralExpression(node) && node.properties.every((property: any) => {
            const key = property.name;
            if (key === undefined) {
                return false;
            }
            const text = isStringLiteral(key) ? key.text
                : (isIdentifier(key) ? String(key.text) : undefined);
            return text === undefined || !text.startsWith('__');
        });
    }

    /** `this.handle…(…)` — the hand-written `handle*AndParams` / `handleUntil…`
     *  family; each returns its own request/params dict arguments. */
    rustHandlerTupleCall(node: Node | undefined): boolean {
        const callee: any = node !== undefined && isCallExpression(node) ? node.expression : undefined;
        return callee !== undefined && isPropertyAccessExpression(callee) && callee.expression.kind === SyntaxKind.ThisKeyword
            && callee.name?.kind === SyntaxKind.Identifier && /^handle[A-Z]/.test(callee.name.text);
    }

    /** A `null`/`undefined` write leaves the receiver a non-dict, which the
     *  emitted `if let Value::Dict` no-ops exactly like the helper. */
    private rustTypeIsUndefinedish(node: Node): boolean {
        if (node.kind === SyntaxKind.NullKeyword || (isIdentifier(node) && node.text === 'undefined')) {
            return true;
        }
        const type = this.typeOfNodeIfAny(node);
        return type !== undefined && (type.flags & (TypeFlags.Undefined | TypeFlags.Null | TypeFlags.Void)) !== 0;
    }

    /** The single variable declaration a local identifier binds to, or
     *  undefined when the checker cannot answer / the binding is not a local. */
    rustSingleLocalDeclaration(ident: Identifier): VariableDeclaration | ParameterDeclaration | undefined {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const declarations = symbolDeclarations(checker.getSymbolAtLocation(ident));
        const declaration: any = declarations.length === 1 ? declarations[0] : undefined;
        return declaration !== undefined && (isVariableDeclaration(declaration) || isParameterDeclaration(declaration))
            ? declaration : undefined;
    }

    // Dict-shape proof for a write receiver: an object type with no class, array or callable shape
    // — `Dictionary<T>` instantiations count (they resolve to their interface target). A union keeps
    // the proof when every member is a Dict or `undefined` (both untaggable at runtime).
    rustWriteDictShape(type): boolean {
        if (type === undefined) return false;
        if (type.flags & TypeFlags.Union) {
            const parts: any[] = typeParts(type) ?? [];
            return parts.length > 0 && parts.every((part) => this.rustWriteDictShape(part));
        }
        if (type.flags & (TypeFlags.Undefined | TypeFlags.Void)) {
            return true;
        }
        const checker = this.getChecker();
        if (!(type.flags & TypeFlags.Object)
            || checker.isArrayType(type) || checker.isTupleType(type) || checker.isArrayLikeType(type)
            || ((typeTarget(type) ?? type as any).objectFlags & ObjectFlags.Class)) {
            return false;
        }
        return type.getCallSignatures().length === 0 && type.getConstructSignatures().length === 0;
    }

    // The receiver is a plain Dict on every path: its declared/initializer type is object-shaped
    // (never a class or array handle), its initializer is not an element read (the get_value COW
    // write-back pass keys on the `&mut <name>` text), and no write in scope assigns another shape.
    rustReceiverStaysDict(baseExpr, receiver): boolean {
        if (receiver.isField) {
            return this.rustFieldStaysDict(baseExpr, receiver.nameNode.text);
        }
        const ident = baseExpr;
        const declaration: any = this.rustSingleLocalDeclaration(ident);
        if (declaration === undefined) {
            return false;
        }
        // The declared-Dict table is its own proof (alwaysDict && stable, D2):
        // a table local the checker cannot type (an untyped `safe_dict*`
        // default) still stays a Dict at every use.
        if (this.rustDeclaredLocalEntry(ident) !== undefined) {
            return true;
        }
        // A parameter with a default carries the transpiler's own initializer,
        // so it keeps the pre-unit proof; without one only the annotation proof
        // (`Dict`-style params — the B-25 read family) can admit it.
        if (isParameterDeclaration(declaration) && this.rustParamStaysPlainDict(declaration)) {
            return true;
        }
        const name = ident.text;
        const initializer = declaration.initializer;
        const scope = this.rustEnclosingFunction(declaration);
        if (initializer === undefined || isElementAccessExpression(initializer)
            || declaration.name?.kind !== SyntaxKind.Identifier || scope === undefined) {
            return false;
        }
        let safe = this.rustWriteDictShape(this.typeOfNodeIfAny(ident))
            && this.rustWriteDictShape(this.typeOfNodeIfAny(initializer));
        this.rustWalkScope(scope, (n) => {
            if (n !== declaration && this.rustBindsName(n, name)) {
                safe = false; // a second binding of the name in scope — stay boxed
                return RUST_WALK_STOP;
            }
            if (isBinaryExpression(n) && n.operatorToken.kind === SyntaxKind.EqualsToken
                && isIdentifier(n.left) && n.left.text === name
                && !this.rustWriteDictShape(this.typeOfNodeIfAny(n.right))) {
                safe = false;
                return RUST_WALK_STOP;
            }
        });
        return safe;
    }

    // `this.<field>` receivers: the field is a plain dict (object-shaped checker type, or held as one
    // by the hand-written base when the TS declaration is `any`) and no `this.<field> = …` in the
    // method assigns another shape. Handle fields (cache/client/subscriptions/order book) are excluded.
    rustFieldStaysDict(baseExpr, fieldName: string): boolean {
        if (RustTranspiler.RUST_TAGGED_HANDLE_FIELDS.has(fieldName)
            || (!this.rustWriteDictShape(this.typeOfNodeIfAny(baseExpr))
                && !RustTranspiler.RUST_PLAIN_DICT_FIELDS.has(fieldName))) {
            return false;
        }
        const scope = this.rustEnclosingFunction(baseExpr);
        if (scope === undefined) {
            return false;
        }
        let safe = true;
        this.rustWalkScope(scope, (n) => {
            if (isBinaryExpression(n) && n.operatorToken.kind === SyntaxKind.EqualsToken
                && isPropertyAccessExpression(n.left) && n.left.expression.kind === SyntaxKind.ThisKeyword
                && n.left.name?.text === fieldName
                && !this.rustWriteDictShape(this.typeOfNodeIfAny(n.right))) {
                safe = false;
                return RUST_WALK_STOP;
            }
        });
        return safe;
    }

    // A parameter the checker proves is a plain dict (`Dict`, `Dictionary<T>`,
    // a `Market`-style alias — the proof B-25's native reads use) whose every
    // write in the body keeps that shape: an object literal with no runtime tag
    rustParamStaysPlainDict(declaration: ParameterDeclaration): boolean {
        if (declaration.type === undefined || declaration.name?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const type = this.getCheckedTypeOf(declaration.type);
        const scope = this.rustEnclosingFunction(declaration);
        if (type === undefined || !this.isProvenMapType(type) || scope === undefined) {
            return false;
        }
        const name = String((declaration.name as Identifier).text);
        let plain = true;
        this.rustWalkScope(scope, (n) => {
            if (isBinaryExpression(n) && rustIsAssignmentOperator(n.operatorToken.kind)
                && isIdentifier(n.left) && n.left.text === name
                && !this.rustPlainDictPreservingRhs(n.right, name)) {
                plain = false;
                return RUST_WALK_STOP;
            }
            if (isBinaryExpression(n) && n.operatorToken.kind === SyntaxKind.EqualsToken
                && isArrayLiteralExpression(n.left)
                && n.left.elements.some((e) => isIdentifier(e) && String((e as Identifier).text) === name)
                && !this.rustHandlerTupleCall(n.right)) {
                plain = false; // a tuple write keeps only the handle-arg family
                return RUST_WALK_STOP;
            }
        });
        return plain;
    }

    /** RHS of a write to a plain-dict parameter that keeps the shape. */
    rustPlainDictPreservingRhs(node: Node, name: string): boolean {
        // `this.handle…(…)` returns its own dict arguments (request-builder proof).
        if (this.rustPlainDictLiteral(node) || this.rustTypeIsUndefinedish(node)
            || (isIdentifier(node) && node.text === name) || this.rustHandlerTupleCall(node)) {
            return true;
        }
        if (isParenthesizedExpression(node) || isNonNullExpression(node) || isAsExpression(node)) {
            return this.rustPlainDictPreservingRhs(node.expression, name);
        }
        if (isConditionalExpression(node)) {
            return this.rustPlainDictPreservingRhs(node.whenTrue, name)
                && this.rustPlainDictPreservingRhs(node.whenFalse, name);
        }
        if (isBinaryExpression(node)
            && (node.operatorToken.kind === SyntaxKind.BarBarToken
                || node.operatorToken.kind === SyntaxKind.QuestionQuestionToken)) {
            return this.rustPlainDictPreservingRhs(node.left, name)
                && this.rustPlainDictPreservingRhs(node.right, name);
        }
        return false;
    }

    // Conservative "argument position expects a Value" bool test — the same set
    // ccxt's wrapBoolValueArgs pass uses on the helper call's value operand.
    rustPrintedBoolArg(raw: string): boolean {
        let s = raw.trim();
        while (s.startsWith('(') && s.endsWith(')')) {
            let depth = 0;
            let balanced = true;
            for (let k = 0; k < s.length; k++) {
                if (s[k] === '(') depth++;
                else if (s[k] === ')') { depth--; if (depth === 0 && k < s.length - 1) { balanced = false; break; } }
            }
            if (!balanced || depth !== 0) break;
            s = s.slice(1, -1).trim();
        }
        if (s.startsWith('!')) s = s.slice(1).trim();
        return RustTranspiler.RUST_BOOL_VALUE_HELPERS.some(fn => s.startsWith(fn + '('));
    }

    // `negate(&Value::Int(n))` is `Value::Int(-n)` (same for Float) — fold the
    // literal so no helper call is needed. Runtime `negate` also coerces
    // strings/bools/floats, so only Int/Float literals can be folded.
    foldNegateLiteral(operandText: string): string | undefined {
        const match = operandText.match(/^Value::(Int|Float)\((-?)(\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)\)$/);
        // leave big literals to the runtime helper
        if (!match || match[3].replaceAll('_', '').replace('.', '').length > 18) {
            return undefined;
        }
        const sign = match[2] === '-' ? '' : '-';
        return `Value::${match[1]}(${sign}${match[3]})`;
    }

    // Ensure a & ref prefix — skip only if already a reference
    ensureRef(expr: string): string {
        return expr.startsWith('&') ? expr : `&${expr}`;
    }

    // TS `number` / number-literal type proof for a comparison operand. Unions
    // (`number | undefined`) and `any` are rejected — those keep the helper.
    isNumberTyped(node) {
        const type = this.getChecker().getTypeAtLocation(node);
        return type !== undefined && (type.flags & (TypeFlags.Number | TypeFlags.NumberLiteral)) !== 0;
    }

    // Positions whose emitted Rust is a native `bool`: if/while/do/for
    // conditions, `? :` conditions, `!` operands and `&&` / `||` operands.
    // Parentheses are transparent.
    isBooleanPosition(node) {
        let current = node;
        let parent = current.parent;
        while (parent !== undefined && isParenthesizedExpression(parent)) {
            current = parent;
            parent = parent.parent;
        }
        if (parent === undefined) {
            return false;
        }
        switch (parent.kind) {
        case SyntaxKind.IfStatement:
        case SyntaxKind.WhileStatement:
        case SyntaxKind.DoStatement:
            return parent.expression === current;
        case SyntaxKind.ForStatement:
        case SyntaxKind.ConditionalExpression:
            return parent.condition === current;
        case SyntaxKind.PrefixUnaryExpression:
            return parent.operator === SyntaxKind.ExclamationToken;
        case SyntaxKind.BinaryExpression:
            return parent.operatorToken.kind === SyntaxKind.AmpersandAmpersandToken ||
                parent.operatorToken.kind === SyntaxKind.BarBarToken;
        }
        return false;
    }

    // `is_less_than` & co. compare two `Value`s and answer `false` for
    // non-numbers; with both operands checker-typed numbers the same f64
    // comparison runs natively on `Value::as_f64()` unwraps.
    printNativeNumericComparison(node, operator, leftText, rightText) {
        const unwrap = (text: string) => `${text}.as_f64().unwrap_or(f64::NAN)`;
        const comparison = `${unwrap(leftText)} ${operator} ${unwrap(rightText)}`;
        // Conditions/logical operands already expect a bool; every other
        // position stores the result in a `Value`, so box it as before.
        return this.isBooleanPosition(node) ? comparison : `Value::Bool(${comparison})`;
    }

    // How numeric an ordered-comparison operand is: 'definite' (numeric
    // literal / `.length` / `indexOf` — Int/Float at runtime, never Null),
    // 'number' (checker-typed — Int, Float or Null, never a string), undefined.
    rustNumericOperandKind(node): string | undefined {
        const inner = this.orderedComparisonOperand(node);
        // `.length` prints through printArrayLength (`Value::Int(len)` or `get_array_length`),
        // `.indexOf(x)` through printIndexOfCall (`get_index_of`): always `Value::Int`.
        if (inner.kind === SyntaxKind.NumericLiteral
            || (isPropertyAccessExpression(inner) && inner.name.text === 'length')
            || (inner.kind === SyntaxKind.CallExpression && this.callExpressionName(inner) === 'indexOf')) {
            return 'definite';
        }
        return this.isNumberTyped(node) ? 'number' : undefined;
    }

    // Parens and `x as T` print as the operand itself (printAsExpression drops
    // the assertion), so the operand's own shape drives the emission.
    orderedComparisonOperand(node) {
        let inner = node;
        while (inner !== undefined && (isParenthesizedExpression(inner) || isAsExpression(inner))) {
            inner = inner.expression;
        }
        return inner;
    }

    // Native text for an `is_less_than`-family call, undefined unless the
    // operands prove the helper's answer: one number pins `<`/`>`; `>=`/`<=`
    // OR `is_equal` in (TRUE for two Nulls) and need a 'definite' operand.
    printNativeOrderedComparison(node, op, left, right): string | undefined {
        const operator = RustTranspiler.NATIVE_COMPARISON_OPERATORS[op];
        if (operator === undefined || !this.printsValueExpression(this.orderedComparisonOperand(left)) ||
            !this.printsValueExpression(this.orderedComparisonOperand(right))) {
            return undefined;
        }
        const leftKind = this.rustNumericOperandKind(left);
        const rightKind = this.rustNumericOperandKind(right);
        const ordered = op === SyntaxKind.LessThanToken || op === SyntaxKind.GreaterThanToken;
        const proven = leftKind === 'definite' || rightKind === 'definite' ||
            (ordered
                ? (leftKind !== undefined || rightKind !== undefined)
                : (leftKind === 'number' && rightKind === 'number'));
        if (!proven && !this.rustOrderedProven(op, left, right)) {
            return this.strOrderedComparison(node, op, left, right) ?? this.nativeLooseOrderedComparison(node, op, left, right);
        }
        return this.printNativeIndexOfLiteralTest(node, op, left, right)
            ?? this.printNativeNumericComparison(node, operator, this.printNode(left, 0), this.printNode(right, 0));
    }

    // `s.indexOf("lit") >= 0` / `> -1` / `< 0` on a proven string place and a non-empty literal needle is a `contains`
    // test: a non-Str receiver gives `""`, which contains no non-empty literal, like the `None` -> -1 arm.
    printNativeIndexOfLiteralTest(node, op, left, right): string | undefined {
        const test = this.nativeIndexOfLiteralTestText(op, left, right);
        if (test === undefined) return undefined;
        return this.isBooleanPosition(node) ? test : `Value::Bool(${test})`;
    }

    nativeIndexOfLiteralTestText(op, left, right): string | undefined {
        const call: any = this.orderedComparisonOperand(left);
        if (call === undefined || !isCallExpression(call) || !isPropertyAccessExpression(call.expression) ||
            call.expression.name.text !== 'indexOf' || call.arguments?.length !== 1) {
            return undefined;
        }
        const bound = this.rustSliceLiteralBound(this.orderedComparisonOperand(right));
        const yes = (op === SyntaxKind.GreaterThanEqualsToken && bound === 0) || (op === SyntaxKind.GreaterThanToken && bound === -1);
        const no = op === SyntaxKind.LessThanToken && bound === 0;
        if (!yes && !no) return undefined;
        const needle = call.arguments[0];
        if ((!isStringLiteral(needle) && !isNoSubstitutionTemplateLiteral(needle)) || needle.text === '') return undefined;
        const literal = this.rustNativeStringLiteralArg(needle);
        const receiver = literal === undefined ? undefined : this.rustNativeStringReceiver(call, this.printNode(call.expression.expression, 0));
        if (literal === undefined || receiver === undefined || !RUST_PLAIN_PLACE.test(receiver)) return undefined;
        return `${no ? '!' : ''}${receiver}.as_str().unwrap_or("").contains("${literal}")`;
    }

    // ── native arithmetic (`+ - * /`) ────────────────────────────────────────
    // When the checker proves both operands are numbers (`Int`/`Float` at
    // runtime) or that one is always a string and the other a string or the
    // null the helper stringifies the same way, the helper call is replaced by
    // the arithmetic itself: a 4-arm `Value` match reproducing the helper's
    // Int/Float dispatch, `as_f64()` division, or a `format!` string concat.
    // Anything the checker cannot prove keeps the runtime helper.

    // `type` (or every member of a non-empty union) has exactly one of `flags`.
    rustTypeFlagsAll(type: any, flags: Set<number>): boolean {
        if (!type) {
            return false;
        }
        if (type.flags === TypeFlags.Union && Array.isArray(typeParts(type))) {
            return typeParts(type).length > 0 && typeParts(type).every((member: any) => this.rustTypeFlagsAll(member, flags));
        }
        return flags.has(type.flags);
    }

    isNumberLikeType(type: any): boolean {
        return this.rustTypeFlagsAll(type, new Set([ TypeFlags.Number, TypeFlags.NumberLiteral ]));
    }

    isStringLikeType(type: any): boolean {
        return this.rustTypeFlagsAll(type, new Set([ TypeFlags.String, TypeFlags.StringLiteral ]));
    }

    // Types whose runtime value the `add` helper stringifies exactly as `format!` does: a string,
    // or `undefined`/`null` boxed as `Value::Null` (`stringify_simple(Value::Null)` and `Display`
    // both give "null"). `any` is absent — the Precise-dict branch has no `Display` equivalent.
    private static readonly RUST_CONCAT_SAFE_FLAGS = new Set<number>([
        TypeFlags.String,
        TypeFlags.StringLiteral,
        TypeFlags.Undefined,
        TypeFlags.Null,
    ]);

    isStringOrNullishType(type: any): boolean {
        return this.rustTypeFlagsAll(type, RustTranspiler.RUST_CONCAT_SAFE_FLAGS);
    }

    // `Str` (`string | undefined`) operands concatenate natively only against an operand proven
    // ALWAYS a string: the helper then takes its string branch, which `format!` reproduces.
    // Without that anchor (`Str + Str`) the both-null case yields `Value::Null`, not "nullnull".
    isNativeStringConcatPair(leftType: any, rightType: any): boolean {
        return this.isStringOrNullishType(leftType) && this.isStringOrNullishType(rightType)
            && (this.isStringLikeType(leftType) || this.isStringLikeType(rightType));
    }

    // `(+|-)` with the left operand of `+=`/`-=`: assignment plus the same
    // native emission as the plain binary form.
    printNativeAssignmentArithmetic(op, left, right, leftText, rightText): string | undefined {
        const native = this.printNativeArithmetic(op, left, right, leftText, rightText);
        return native === undefined ? undefined : `${leftText} = ${native}`;
    }

    printNativeArithmetic(op, left, right, leftText, rightText): string | undefined {
        if (op === SyntaxKind.PercentToken) return this.printRustNativeMod(left, right, leftText, rightText) ?? this.rustNativeArithmetic(op, left, right, leftText, rightText);
        if (op !== SyntaxKind.PlusToken && op !== SyntaxKind.MinusToken &&
            op !== SyntaxKind.AsteriskToken && op !== SyntaxKind.SlashToken) {
            return undefined;
        }
        let leftType, rightType;
        try {
            const checker = this.getChecker();
            leftType = checker.getTypeAtLocation(left);
            rightType = checker.getTypeAtLocation(right);
        } catch (e) {
            return undefined;
        }
        const nativeIntResult = this.rustNativeAddSubtract(op, left, right, leftType, rightType, leftText, rightText); if (nativeIntResult !== undefined) return nativeIntResult;
        const r16 = this.rustNativeArithmetic(op, left, right, leftText, rightText); if (r16 !== undefined) return r16;
        const r20 = this.nativeNumericAdd(op, left, right, leftText, rightText); if (r20 !== undefined) return r20;
        if (op === SyntaxKind.PlusToken && (this.isNativeStringConcatPair(leftType, rightType) || this.concatIsAnchored(left, right, leftType, rightType)
            || this.strOrNullConcatIsAnchored(left, right, leftType, rightType))) {
            return this.printNativeStringConcat(leftText, rightText);
        }
        if (!this.isNumberLikeType(leftType) || !this.isNumberLikeType(rightType)) {
            return this.nativeCoercingArithmetic(op, left, right, leftText, rightText);
        }
        return this.printNativeNumeric(op, leftText, rightText);
    }

    printNativeStringConcat(leftText: string, rightText: string): string {
        return `Value::Str(format!("{}{}", ${leftText}, ${rightText}).into())`;
    }

    // Both operands are `Int`/`Float` at runtime; `-> Value::Null` covers the
    // `Null`/non-numeric values the same way the helper's fallthrough does.
    // Always parenthesised so it composes under `&`, in argument position and
    // as an operand of another native match.
    printNativeNumeric(op, leftText: string, rightText: string): string {
        const [ left, right ] = [ `(${leftText})`, `(${rightText})` ];
        if (op === SyntaxKind.SlashToken) {
            return `(match (${left}.as_f64(), ${right}.as_f64()) { (Some(x), Some(y)) if y != 0.0 => Value::Float(x / y), _ => Value::Null })`;
        }
        const sign = op === SyntaxKind.PlusToken ? '+' : (op === SyntaxKind.MinusToken ? '-' : '*');
        return `(match (&${left}, &${right}) {` +
            ` (Value::Int(x), Value::Int(y)) => Value::Int(x ${sign} y),` +
            ` (Value::Int(x), Value::Float(y)) => Value::Float(*x as f64 ${sign} *y),` +
            ` (Value::Float(x), Value::Int(y)) => Value::Float(*x ${sign} *y as f64),` +
            ` (Value::Float(x), Value::Float(y)) => Value::Float(x ${sign} y),` +
            ` _ => Value::Null })`;
    }

    private static readonly RUST_TYPEOF_HELPERS = new Map([
        ['string', 'is_string'], ['number', 'is_number'], ['boolean', 'is_bool'], ['object', 'is_object'], ['function', 'is_function'],
    ]);

    printCustomBinaryExpressionIfAny(node, identation) {
        const { left, right } = node;
        const op = node.operatorToken.kind;
        const isAssign = op === SyntaxKind.EqualsToken;
        // Array destructuring reassignment: [a, b] = expr → bind once, reassign each
        if (isAssign && left.kind === SyntaxKind.ArrayLiteralExpression) {
            const tmpName = '__destr_tmp';
            const rhs = this.printNode(right, 0);
            const nativeList = this.rustNativeListSource(right);
            const head = nativeList
                ? `let ${tmpName}: Vec<Value> = ${rhs}.as_array().cloned().unwrap_or_default()`
                : `let ${tmpName} = ${rhs}`;
            const assignments = left.elements.map((e, idx) => `${this.printNode(e, 0)} = ${nativeList
                ? this.printTypedVecElementRead(tmpName, idx) : `get_value(&${tmpName}, &Value::Int(${idx}))`}`).join('; ');
            return `{ ${head}; ${assignments}; }`;
        }
        // Element access assignment: a[b] = v → add_element_to_object(&mut a, &b, v)
        if (isAssign && left.kind === SyntaxKind.ElementAccessExpression) {
            const keys: any[] = [];
            let baseExpr: any = left;
            while (isElementAccessExpression(baseExpr)) {
                keys.unshift(baseExpr.argumentExpression);
                baseExpr = baseExpr.expression;
            }
            let acc = `&mut ${this.printNode(baseExpr, 0)}`;
            const keyStrs = keys.map(k => this.printNode(k, 0));
            for (const key of keyStrs.slice(0, -1)) acc = `get_value_mut(${acc}, &${key})`;
            const rhs = this.printNode(right, 0);
            const helperCall = `add_element_to_object(${acc}, &${keyStrs[keyStrs.length - 1]}, ${rhs})`;
            // a nested helper write whose value was read natively binds the value first, like the ccxt hoist did
            const helperWrite = this.rustDictHoistHosts.has(node)
                ? `{ let __be_tmp = ${rhs}; add_element_to_object(${acc}, &${keyStrs[keyStrs.length - 1]}, __be_tmp); }` : helperCall;
            const nestedInsert = keyStrs.length === 2
                ? (this.rustNestedBearerInsert(baseExpr, keys[0], keyStrs[0], keys[1], keyStrs[1], rhs)
                    ?? this.nestedDictWrite(baseExpr, keys, keyStrs, rhs, helperWrite))
                : (this.nestedDictWrite(baseExpr, keys, keyStrs, rhs, helperWrite)
                    ?? this.rustNestedBearerBucket(baseExpr, keys[0], keyStrs[0], right));
            if (nestedInsert !== undefined) return nestedInsert;
            const fieldNested = this.rustFieldNestedInsert(node, baseExpr, keys, keyStrs, rhs);
            if (fieldNested !== undefined) return fieldNested;
            // `x[k1][k2] = v` on a one-level bearer — the first hop is the
            // map's own `entry`, the write below it keeps its helper.
            const bearerChain = keyStrs.length > 1
                ? this.rustBearerChainedWrite(baseExpr, keys, keyStrs, rhs) : undefined;
            if (bearerChain !== undefined) return bearerChain;
            const nativeInsert = keyStrs.length === 1 ? (this.rustBearerDictInsert(baseExpr, keys[0], keyStrs[0], rhs) ?? this.rustMapParamDictInsert(baseExpr, keys[0], keyStrs[0], rhs) ?? this.printNativeBookMetaWrite(baseExpr, keys[0], keyStrs[0], rhs) ?? this.printNativeDictInsert(baseExpr, keys[0], keyStrs[0], rhs) ?? this.rustNativeDictInsert(baseExpr, keys[0], keyStrs[0], rhs)) : undefined;
            return nativeInsert ?? helperWrite;
        }
        // Rebuilding a typed dict bearer from a plain literal (`x = { .. }`)
        if (isAssign && isIdentifier(left) && this.rustDictBearerDeclaration(left) !== undefined
            && this.rustBearerPlainLiteral(right)) {
            return `${this.printNode(left, 0)} = (${this.rustObjectLiteralBlock(this.rustSkipWrappers(right), identation)})`;
        }
        // A bearer rebuilt from a fresh-map producer (`x = this.extend(..)`)
        if (isAssign && isIdentifier(left) && this.rustDictBearerDeclaration(left) !== undefined
            && this.rustDictProducer(right)) {
            return `${this.printNode(left, 0)} = ${this.printNode(right, 0)}.as_map().cloned().unwrap_or_default()`;
        }
        // typeof comparisons
        if (left.kind === SyntaxKind.TypeOfExpression) {
            const rightText = right.text;
            const target = this.printNode(left.expression, 0);
            const isDiff = op === SyntaxKind.ExclamationEqualsEqualsToken || op === SyntaxKind.ExclamationEqualsToken;
            const native = this.nativeValuePredicateText(rightText, left.expression, target);
            if (native !== undefined) {
                const negated = isDiff ? `!${native}` : native;
                // Conditions/logical operands expect a bool; other positions store a boxed `Value`.
                return this.isBooleanPosition(node) ? negated : `Value::Bool(${negated})`;
            }
            const helper = RustTranspiler.RUST_TYPEOF_HELPERS.get(rightText);
            if (helper !== undefined) return `${isDiff ? '!' : ''}${helper}(&${target})`;
        }
        // `in` — wrapped as Value so it composes in any context
        if (op === SyntaxKind.InKeyword) {
            const shadow = this.rustParamShadowOf(right);
            return (shadow !== undefined ? this.printShadowInOperator(shadow, left) : undefined)
                ?? this.bearerInOp(left, right) ?? this.printNativeInOperator(left, right)
                ?? this.literalInOp(left, right) ?? this.provenDictFieldInOp(left, right) ?? this.rustDictInOp(left, right)
                ?? `Value::Bool(in_op(&${this.printNode(right, 0)}, &${this.printNode(left, 0)}))`;
        }
        // `+=` / `-=` on regular variables
        if ((op === SyntaxKind.PlusEqualsToken || op === SyntaxKind.MinusEqualsToken) && left.kind !== SyntaxKind.ElementAccessExpression) {
            const isPlus = op === SyntaxKind.PlusEqualsToken;
            const leftText = this.printNode(left, 0);
            const rightText = this.printNode(right, 0);
            return this.printNativeAssignmentArithmetic(isPlus ? SyntaxKind.PlusToken : SyntaxKind.MinusToken, left, right, leftText, rightText)
                ?? `${leftText} = ${isPlus ? 'add' : 'subtract'}(&${leftText}, &${rightText})`;
        }
        // Native equality on unwrapped payloads when the checker proves the variants line up
        // (see printNativeEqualityComparison); the bool is boxed like the other Value helpers.
        if (op === SyntaxKind.EqualsEqualsToken || op === SyntaxKind.EqualsEqualsEqualsToken ||
            op === SyntaxKind.ExclamationEqualsToken || op === SyntaxKind.ExclamationEqualsEqualsToken) {
            const nativeEquality = this.printNativeEqualityComparison(left, right, op);
            if (nativeEquality) return `Value::Bool(${nativeEquality})`;
        }
        // A logical expression with a native-compare operand no longer starts with a bool helper: box it.
        if ((op === SyntaxKind.AmpersandAmpersandToken || op === SyntaxKind.BarBarToken)
            && (this.hasNativeComparisonOperand(left) || this.hasNativeComparisonOperand(right))) {
            return `Value::Bool(${this.printLogicalInBooleanContext(node)})`;
        }
        // Binary wrapper functions (is_equal, add, etc.) - add & to both sides
        if (op in this.binaryExpressionsWrappers) {
            const nativeCompare = RustTranspiler.NATIVE_COMPARISON_OPERATORS[op] !== undefined
                ? this.printNativeOrderedComparison(node, op, left, right) : undefined;
            if (nativeCompare !== undefined) return nativeCompare;
            const [fnName, close] = this.binaryExpressionsWrappers[op];
            const leftText = this.printNode(left, 0);
            const rightText = this.printNode(right, 0);
            return this.printNativeArithmetic(op, left, right, leftText, rightText)
                ?? `${fnName}${this.ensureRef(leftText)}, ${this.ensureRef(rightText)}${close}`;
        }
        return undefined;
    }

    printBinaryExpression(node, identation) {
        return this.printCustomBinaryExpressionIfAny(node, identation) || super.printBinaryExpression(node, identation);
    }

    // `Date.now()` → runtime helper returning current epoch millis.
    printDateNowCall(node, identation) {
        return 'date_now()';
    }

    // `str.padStart(len, pad)` / `str.padEnd(len, pad)` → runtime helpers `(&Value, &Value, &Value)`.
    printPadStartCall(node, identation, name, parsedArg, parsedArg2) {
        return this.printNativeStringPadStart(node, name) ?? `pad_start(${this.ensureRef(name)}, ${this.ensureRef(parsedArg)}, ${this.ensureRef(parsedArg2)})`;
    }

    printPadEndCall(node, identation, name, parsedArg, parsedArg2) {
        return this.printNativeStringPadEnd(node, name) ?? `pad_end(${this.ensureRef(name)}, ${this.ensureRef(parsedArg)}, ${this.ensureRef(parsedArg2)})`;
    }

    printVariableDeclarationList(node, identation) {
        const declaration = node.declarations[0];
        const indent = this.getIden(identation);
        if (declaration?.name.kind === SyntaxKind.ArrayBindingPattern) {
            const parsedElements = declaration.name.elements.map(e => this.printNode(e.name, 0));
            const syntheticName = parsedElements.join('') + 'Variable';
            const nativeList = this.rustNativeListSource(declaration.initializer);
            const head = nativeList
                ? `${indent}let ${syntheticName}: Vec<Value> = ${this.printNode(declaration.initializer, 0)}.as_array().cloned().unwrap_or_default();\n`
                : `${indent}let mut ${syntheticName} = ${this.printNode(declaration.initializer, 0)};\n`;
            const lines = parsedElements.map((e, idx) => `${indent}let mut ${e}: Value = ${nativeList
                ? this.printTypedVecElementRead(syntheticName, idx) : `get_value(&${syntheticName}, &Value::Int(${idx}))`}`);
            return head + lines.join(';\n');
        }
        const varName = this.printNode(declaration.name, 0);
        if (!declaration.initializer) {
            return `${indent}let mut ${varName}: Value = Value::Null`;
        }
        const parsedValue = this.printNode(declaration.initializer, identation).trim();
        if (declaration.initializer.kind === SyntaxKind.NewExpression) {
            return `${indent}let mut ${varName} = ${parsedValue}`;
        }
        // A read-only container bearer carries the container itself.
        const readBearer = node.declarations.length === 1 ? this.rustReadBearerKindOfDeclaration(declaration) : false;
        if (readBearer === 'list') {
            return `${indent}let mut ${varName}: Vec<Value> = ${parsedValue}.as_array().cloned().unwrap_or_default()`;
        }
        if (readBearer === 'map') {
            return `${indent}let mut ${varName}: indexmap::IndexMap<String, Value> = ${parsedValue}.as_map().cloned().unwrap_or_default()`;
        }
        if (node.declarations.length === 1 && this.rustVecLocalIsTyped(declaration)) {
            const native = this.rustVecNativeLiteral(declaration);
            return `${indent}let mut ${varName}: Vec<Value> = ${native ?? 'Vec::new()'}`;
        }
        if (node.declarations.length === 1 && this.rustNestedDictLocalIsTyped(declaration)) {
            const block = this.rustNestedObjectLiteralBlock(this.rustSkipWrappers(declaration.initializer), identation);
            return `${indent}let mut ${varName}: indexmap::IndexMap<String, indexmap::IndexMap<String, Value>> = (${block})`;
        }
        if (node.declarations.length === 1 && this.rustDictLocalIsTyped(declaration)) {
            const literal = this.rustSkipWrappers(declaration.initializer);
            if (!isObjectLiteralExpression(literal)) {
                return `${indent}let mut ${varName}: indexmap::IndexMap<String, Value> = ${parsedValue}.as_map().cloned().unwrap_or_default()`;
            }
            // Parenthesised: the driver strips the `;` of a statement ending in `};`.
            const block = this.rustObjectLiteralBlock(this.rustSkipWrappers(declaration.initializer), identation);
            return `${indent}let mut ${varName}: indexmap::IndexMap<String, Value> = (${block})`;
        }
        const boolValue = this.getRustBoolLocalInitializer(declaration, parsedValue);
        if (boolValue !== undefined) {
            this.rustBoolDeclaredLocals.add(declaration);
            return `${indent}let mut ${varName}: bool = ${boolValue}`;
        }
        const methodText = node.declarations.length === 1 ? this.rustStringMethodLocalInit(declaration) : undefined;
        if (methodText !== undefined) return `${indent}let mut ${varName}: String = ${methodText}`;
        const typedStr = this.rustSafeStringLocalIsTyped(declaration);
        const nativeStr = this.rustNativeStrCalleeKind(declaration.initializer) === 'str';
        const signApi = typedStr ? this.rustSignApiElementInit(declaration) : undefined;
        if (signApi !== undefined) {
            return `${indent}let mut ${varName}: Option<String> = ${signApi.receiver}.get(${signApi.index}).and_then(Value::as_str).map(str::to_owned)`;
        }
        if (typedStr) {
            // A native-`Option<String>` callee already carries the payload; `safeString` helpers need the unwrap.
            return `${indent}let mut ${varName}: Option<String> = ${parsedValue}${nativeStr ? '' : '.as_str().map(str::to_owned)'}`;
        }
        // A callee returning `Option<String>` into a boxed local keeps the box.
        return `${indent}let mut ${varName}: Value = ${nativeStr ? this.rustNativeStrValueBox(parsedValue) : parsedValue}`;
    }

    // ── native-typed locals ───────────────────────────────────────────────────
    //
    // A local is declared `bool` (instead of `Value`) when its initializer is
    // already a bool-valued Rust expression and every use is a condition sink
    // (`is_true(&x)`) — the one sink that accepts a native bool today.
    //
    // `is_true` is generic over `IsTruthy` (impl for `bool`/`&bool` in
    // runtime.rs); every other sink takes `&Value`, so any other use keeps the
    // local boxed. Bools come in two shapes: helpers whose Rust return type is
    // already `bool` (below), and the printer's own `Value::Bool(...)` box,
    // which the declaration drops at the init site.

    private static readonly RUST_BOOL_RESULT_HELPERS = new Set([
        'is_true', 'is_equal', 'is_greater_than', 'is_greater_than_or_equal',
        'is_less_than', 'is_less_than_or_equal', 'is_array', 'is_object',
        'is_string', 'is_number', 'is_bool', 'is_integer', 'is_function',
        'is_instance', 'starts_with', 'ends_with', 'in_op', 'contains',
    ]);

    // Hand-written Rust fns outside `runtime.rs` with a `-> bool` signature, keyed by the TS callee
    // name (verified in `rust/tests/src/tests_support.rs`). A call is already a Rust bool, so the
    // condition printer's `is_true(&…)` wrapper is the identity (`IsTruthy for bool`) and is dropped.
    private static readonly RUST_BOOL_RESULT_CALLEES = new Set([
        'tickerExceptionNeedsOhlcv',
    ]);

    // Call to a hand-written `-> bool` fn: the checker must agree the TS call
    // is boolean-typed and the callee must be in the verified table above.
    rustCallPrintsBool(node): boolean {
        if (node?.kind !== SyntaxKind.CallExpression) {
            return false;
        }
        const callee: any = node.expression;
        const name = callee?.kind === SyntaxKind.Identifier ? callee.text
            : callee?.kind === SyntaxKind.PropertyAccessExpression ? callee.name?.text : undefined;
        return name !== undefined && RustTranspiler.RUST_BOOL_RESULT_CALLEES.has(name) && this.rustTypeIsBoolean(node);
    }

    // Index just past the `"..."` literal opening at `i` (escapes skipped).
    private rustSkipStringLiteral(text: string, i: number): number {
        for (i++; i < text.length && text[i] !== '"'; i++) {
            if (text[i] === '\\') i++;
        }
        return i;
    }

    // `<box><expr>)` spanning the whole printed value → `<expr>`. The payload is
    // only reachable this way: the printer prints the value, not its parts.
    peelValueBox(printedValue: string, prefix: string): string | undefined {
        if (!printedValue.startsWith(prefix) || !printedValue.endsWith(')')) {
            return undefined;
        }
        let depth = 0;
        for (let i = prefix.length - 1; i < printedValue.length; i++) {
            const char = printedValue[i];
            if (char === '"') i = this.rustSkipStringLiteral(printedValue, i);
            else if (char === '(') depth++;
            else if (char === ')' && --depth === 0) {
                return i === printedValue.length - 1 ? printedValue.slice(prefix.length, i) : undefined;
            }
        }
        return undefined;
    }

    // `Value::Bool(<expr>)` spanning the whole expression → `<expr>`.
    peelValueBoolBox(printedValue: string): string | undefined {
        return this.peelValueBox(printedValue, 'Value::Bool(');
    }

    // `Value::Str(<expr>)` spanning the whole expression → `<expr>` (a String).
    peelValueStrBox(printedValue: string): string | undefined {
        return this.peelValueBox(printedValue, 'Value::Str(');
    }

    // `((expr))` → `expr` — a redundant layer kept from the TS source; the
    // right-hand side of a declaration binds the whole expression anyway.
    stripOuterParens(printedValue: string): string {
        let value = printedValue.trim();
        while (value.startsWith('(') && value.endsWith(')')) {
            let depth = 0;
            let closesAtEnd = true;
            for (let i = 0; i < value.length && closesAtEnd; i++) {
                const char = value[i];
                if (char === '"') i = this.rustSkipStringLiteral(value, i);
                else if (char === '(') depth++;
                else if (char === ')' && --depth === 0 && i !== value.length - 1) closesAtEnd = false;
            }
            if (!closesAtEnd || depth !== 0) break;
            value = value.slice(1, -1).trim();
        }
        return value;
    }

    // `is_equal(...)` / `!is_true(...)` / `contains(...)` — bare bool helper calls.
    printedBoolHelperCall(printedValue: string): boolean {
        const stripped = printedValue.startsWith('!') ? printedValue.slice(1).trim() : printedValue;
        const match = /^([a-z_][a-z0-9_]*)\(/.exec(stripped);
        return match !== null && RustTranspiler.RUST_BOOL_RESULT_HELPERS.has(match[1]);
    }

    // Source shapes the printer turns into a bool: comparisons, `&&`/`||`
    // (each operand is is_true-wrapped), `!`, `in`, `instanceof`, true/false.
    rustNodeIsBoolExpression(node): boolean {
        switch (node?.kind) {
        case SyntaxKind.TrueKeyword:
        case SyntaxKind.FalseKeyword:
            return true;
        case SyntaxKind.ParenthesizedExpression:
            return this.rustNodeIsBoolExpression(node.expression);
        case SyntaxKind.PrefixUnaryExpression:
            return node.operator === SyntaxKind.ExclamationToken;
        case SyntaxKind.BinaryExpression: {
            const kind = node.operatorToken.kind;
            return (RustTranspiler as any).COMPARISON_OPS.has(kind) || kind === SyntaxKind.AmpersandAmpersandToken
                || kind === SyntaxKind.BarBarToken || kind === SyntaxKind.InKeyword || kind === SyntaxKind.InstanceOfKeyword;
        }
        }
        return false;
    }

    rustTypeIsBoolean(node): boolean {
        try {
            const type = this.getChecker().getTypeAtLocation(node);
            return (type.flags & TypeFlags.BooleanLike) !== 0 || this.getChecker().typeToString(type).trim() === 'boolean';
        } catch (e) {
            return false; // no checker type → keep the boxed form
        }
    }

    rustTypeIsString(node): boolean {
        const checker: any = this.checkerOrUndefined();
        // no checker type → keep the boxed form
        return checker !== undefined && this.isStringLikeType(checker.getTypeAtLocation(node));
    }

    rustEnclosingFunction(node) {
        for (let current = node?.parent; current; current = current.parent) {
            switch (current.kind) {
            case SyntaxKind.MethodDeclaration:
            case SyntaxKind.FunctionDeclaration:
            case SyntaxKind.FunctionExpression:
            case SyntaxKind.ArrowFunction:
            case SyntaxKind.Constructor:
            case SyntaxKind.SourceFile:
                return current;
            }
        }
        return undefined;
    }

    rustBindsName(node, name: string): boolean {
        switch (node?.kind) {
        case SyntaxKind.VariableDeclaration:
        case SyntaxKind.Parameter:
        case SyntaxKind.FunctionDeclaration:
        case SyntaxKind.ClassDeclaration:
        case SyntaxKind.PropertyDeclaration:
        case SyntaxKind.FunctionExpression:
        case SyntaxKind.ArrowFunction:
            return node.name?.kind === SyntaxKind.Identifier && node.name.text === name;
        }
        return false;
    }

    // Only these uses compile against a native `bool` local today: `is_true(&x)`
    // (under any depth of `(...)`, `!`, `&&`/`||`), and the condition slot of
    // if/while/for/ternary — all printed is_true-wrapped.
    rustIdentifierUseIsCondition(node): boolean {
        for (let current: any = node, parent: any = node.parent; parent; current = parent, parent = parent.parent) {
            switch (parent.kind) {
            case SyntaxKind.ParenthesizedExpression:
                if (parent.expression !== current) return false;
                break;
            case SyntaxKind.PrefixUnaryExpression:
                if (parent.operator !== SyntaxKind.ExclamationToken || parent.operand !== current) return false;
                break;
            case SyntaxKind.BinaryExpression:
                if (parent.operatorToken.kind !== SyntaxKind.AmpersandAmpersandToken
                    && parent.operatorToken.kind !== SyntaxKind.BarBarToken) return false;
                break;
            case SyntaxKind.IfStatement:
            case SyntaxKind.WhileStatement:
            case SyntaxKind.DoStatement:
                return parent.expression === current;
            case SyntaxKind.ForStatement:
            case SyntaxKind.ConditionalExpression:
                return parent.condition === current;
            default:
                return false;
            }
        }
        return false;
    }

    // Visits every in-scope use of the local `name` declared by `declaration`: false as soon as the
    // name is re-bound in scope or `acceptUse(identifier)` rejects a use. `skipPropertyNames` leaves
    // `x.foo` / `{ foo }` names out of the uses.
    private rustLocalUsesAll(declaration, name: string, skipPropertyNames: boolean, acceptUse: (n) => boolean): boolean {
        const scope = this.rustEnclosingFunction(declaration);
        if (scope === undefined || name === undefined) {
            return false;
        }
        let safe = true;
        for (const n of this.rustScopeNameNodes(scope, name) as any[]) {
            if (n !== declaration && this.rustBindsName(n, name)) {
                safe = false; // a second binding of the name in scope — stay boxed
                break;
            }
            if (n.kind === SyntaxKind.Identifier && n !== declaration.name
                && !(skipPropertyNames && this.rustIdentifierIsPropertyName(n)) && !acceptUse(n)) {
                safe = false;
                break;
            }
        }
        return safe;
    }

    rustLocalUsesAcceptBool(declaration, sourceName: string): boolean {
        return this.rustLocalUsesAll(declaration, sourceName, false, (n) =>
            this.rustIdentifierUseIsCondition(n) || this.rustBoolParamUseAccepted(n));
    }

    // ── native `bool` parameters ──────────────────────────────────────────────
    //
    // A `boolean` parameter of a venue-local generated method prints `bool`
    // (required) or is bound with `.is_truthy()` (optional) when the checker
    // proves the type and every body read is a bool sink. Call sites and the
    // name-based dispatch arms coerce with `Value::is_truthy`, which is exactly
    // what the per-use `is_true(&x)` did, so the ABI stays a superset.

    private rustBoolParamDecisions = new Map<any, boolean>();

    rustParamPrintsBool(param): boolean {
        if (param?.kind !== SyntaxKind.Parameter) {
            return false;
        }
        let decision = this.rustBoolParamDecisions.get(param);
        if (decision === undefined) {
            this.rustBoolParamDecisions.set(param, false); // re-entrancy guard
            decision = this.rustParamPrintsBoolUncached(param);
            this.rustBoolParamDecisions.set(param, decision);
        }
        return decision;
    }

    rustParamPrintsBoolUncached(param): boolean {
        const method: any = param.parent;
        if (!isMethodDeclaration(method) || method.body === undefined) {
            return false;
        }
        if (param.name?.kind !== SyntaxKind.Identifier || param.dotDotDotToken !== undefined) {
            return false;
        }
        if ((method.modifiers ?? []).some((m: any) => m.kind === SyntaxKind.StaticKeyword)) {
            return false;
        }
        // The base tier and every base override keep the fixed `Value` ABI that
        // the hand-written trait declares.
        const baseFile = RustTranspiler.RUST_BASE_TIER_FILE;
        if (baseFile.test(param.getSourceFile().fileName)) {
            return false;
        }
        const hidden: any = this.getMethodOverride(method);
        if (hidden !== undefined && baseFile.test(hidden.getSourceFile().fileName)) {
            return false;
        }
        if (!this.rustTypeIsBoolean(param.name)) {
            return false;
        }
        // A method reference handed to `this.spawn(...)` / `.bind` keeps the
        // function-pointer shape, so the whole method stays boxed.
        if (this.rustMethodReferencedAsValue(method)) {
            return false;
        }
        return this.rustLocalUsesAll(param, param.name.text, true, (n) => this.rustBoolParamUseAccepted(n));
    }

    /** True when `this.<name>` is read as a value (not called) in the method's own file. */
    rustMethodReferencedAsValue(method): boolean {
        const name = method.name?.text;
        if (name === undefined) {
            return false;
        }
        const cached = this.rustValueReferencedMethods.get(method.getSourceFile().fileName);
        if (cached !== undefined) {
            return cached.has(name);
        }
        return this.rustValueReferenceCensus(method.getSourceFile()).has(name);
    }

    // Per-file, so the decision never depends on program membership (farm and
    // scoped regens must agree). A same-class reference is the shape that would
    // force a function pointer instead of the printed call.
    private rustValueReferencedMethods = new Map<string, Set<string>>();

    rustValueReferenceCensus(file): Set<string> {
        const names = new Set<string>();
        if (file === undefined) {
            return names;
        }
        const visit = (n: any) => {
            if (n.kind === SyntaxKind.PropertyAccessExpression && n.name?.kind === SyntaxKind.Identifier) {
                const parent = n.parent;
                const called = parent?.kind === SyntaxKind.CallExpression && parent.expression === n;
                if (!called) {
                    names.add(n.name.text);
                }
            }
            n.forEachChild(visit);
        };
        visit(file);
        this.rustValueReferencedMethods.set(file.fileName, names);
        return names;
    }

    /** Native type text of a parameter in the emitted signature. */
    rustParamType(param): string {
        if (this.rustParamPrintsBool(param)) return 'bool';
        if (this.rustParamPrintsMap(param)) return '&mut indexmap::IndexMap<String, Value>';
        if (this.rustParamPrintsStrVec(param)) return 'Vec<String>';
        return 'Value';
    }

    // A read of a native-`bool` parameter that still compiles: a condition slot,
    // or an argument of a call whose own parameter prints `bool`.
    rustBoolParamUseAccepted(node): boolean {
        if (this.rustIdentifierUseIsCondition(node)) {
            return true;
        }
        const call: any = node.parent;
        if (call?.kind !== SyntaxKind.CallExpression) {
            return false;
        }
        const at = Array.from(call.arguments).indexOf(node);
        if (at < 0) {
            return false;
        }
        const params = this.rustCalleeParams(call);
        return params !== undefined && this.rustNativeBoolArgumentSlot(params, at);
    }

    /** Parameter declarations of a call's resolved callee, when the checker has them. */
    rustCalleeParams(call): any[] | undefined {
        let declaration: any = this.rustCallDeclarations.get(call);
        if (declaration === undefined) {
            try {
                declaration = signatureDeclaration((this.getChecker() as any).getResolvedSignature(call)) ?? null;
            } catch (e) {
                return undefined;
            }
            this.rustCallDeclarations.set(call, declaration);
        }
        if (declaration === undefined || declaration === null) {
            return undefined;
        }
        const resolved: any = declaration.resolve?.() ?? declaration;
        return resolved.parameters === undefined ? undefined : Array.from(resolved.parameters);
    }

    /** `bool` text for an argument in a native-`bool` parameter slot. */
    rustBoolArgumentText(node, identation): string {
        const native = this.rustNativeBoolArgumentText(node);
        if (native !== undefined) {
            return native;
        }
        const printed = this.printNode(node, identation).trim();
        const peeled = this.peelValueBoolBox(this.stripOuterParens(printed));
        if (peeled !== undefined) {
            return `(${peeled})`;
        }
        // A plain path reads without the wrapping parens.
        return /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(printed)
            ? `${printed}.is_truthy()`
            : `(${printed}).is_truthy()`;
    }

    /** True when the call's `at`-th argument lands in a required native-`bool` slot. */
    rustNativeBoolArgumentSlot(params, at: number): boolean {
        const param: any = params !== undefined && at < params.length ? params[at] : undefined;
        if (param === undefined || param.initializer !== undefined || param.questionToken !== undefined) {
            return false;
        }
        return this.rustParamPrintsBool(param);
    }

    /** Argument shapes the printer already emits as a Rust `bool`. */
    rustNativeBoolArgumentText(node): string | undefined {
        const inner: any = node?.kind === SyntaxKind.ParenthesizedExpression ? node.expression : node;
        if (inner?.kind === SyntaxKind.TrueKeyword) {
            return 'true';
        }
        if (inner?.kind === SyntaxKind.FalseKeyword) {
            return 'false';
        }
        if (inner?.kind === SyntaxKind.Identifier) {
            const declaration: any = this.rustDeclaredNode(inner);
            if (declaration?.kind === SyntaxKind.Parameter && this.rustParamPrintsBool(declaration)) {
                return this.printNode(inner, 0).trim();
            }
            if (declaration?.kind === SyntaxKind.VariableDeclaration
                && this.getRustBoolLocalInitializer(declaration, this.printNode(inner, 0)) !== undefined) {
                return this.printNode(inner, 0).trim();
            }
            return undefined;
        }
        if (inner?.kind === SyntaxKind.PrefixUnaryExpression && inner.operator === SyntaxKind.ExclamationToken) {
            const operand = this.rustNativeBoolArgumentText(inner.operand);
            return operand === undefined ? undefined : `!${operand}`;
        }
        return undefined;
    }

    rustDeclaredNode(node): Node | undefined {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const symbol = checker.getSymbolAtLocation(node);
        return symbol === undefined ? undefined : symbolValueDeclaration(symbol) ?? symbolDeclarations(symbol)[0];
    }

    /** Condition text for a bare identifier of native-`bool` type, else undefined. */
    printNativeBoolParamCondition(node): string | undefined {
        const inner: any = this.unwrapParens(node) ?? node;
        if (inner?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const declaration: any = this.rustDeclaredNode(inner);
        return declaration?.kind === SyntaxKind.Parameter && this.rustParamPrintsBool(declaration)
            ? this.printNode(inner, 0).trim()
            : undefined;
    }

    // ── owned map parameters ──────────────────────────────────────────────────
    // A `Dict`-annotated parameter whose body only takes map operations and whose every call site passes a typed
    // dict bearer prints `&mut IndexMap`, so its writes are plain `.insert` with no per-site `Arc::make_mut` guard.

    private rustMapParamDecisions = new WeakMap<any, boolean>();

    // ── native `Vec<String>` parameters ───────────────────────────────────────
    // A required `string[]` parameter of a non-base method whose every body use is
    // `p.join('lit')` prints `Vec<String>`: the join is the std `.join(..)`, no
    // closure. The dispatcher builds the list with `Value::to_string_vec`, and
    // every call site passes an array literal of plain `Value` identifiers.

    private rustStrVecParamDecisions = new WeakMap<any, boolean>();

    rustParamPrintsStrVec(param): boolean {
        if (param?.kind !== SyntaxKind.Parameter) return false;
        let decision = this.rustStrVecParamDecisions.get(param);
        if (decision === undefined) {
            this.rustStrVecParamDecisions.set(param, false); // re-entrancy guard
            try {
                decision = this.rustStrVecParamUncached(param);
            } catch (e) {
                decision = false;
            }
            this.rustStrVecParamDecisions.set(param, decision);
        }
        return decision;
    }

    rustStrVecParamUncached(param): boolean {
        const method: any = param.parent;
        if (!isMethodDeclaration(method) || method.body === undefined) return false;
        if (param.name?.kind !== SyntaxKind.Identifier || param.dotDotDotToken !== undefined) return false;
        if (param.initializer !== undefined || param.questionToken !== undefined || param.type === undefined) return false;
        if ((method.modifiers ?? []).some((m: any) => m.kind === SyntaxKind.StaticKeyword)) return false;
        const baseFile = RustTranspiler.RUST_BASE_TIER_FILE;
        if (baseFile.test(param.getSourceFile().fileName)) return false;
        const hidden: any = this.getMethodOverride(method);
        if (hidden !== undefined && baseFile.test(hidden.getSourceFile().fileName)) return false;
        const checker: any = this.checkerOrUndefined();
        const type: any = checker === undefined ? undefined : this.getCheckedTypeOf(param.type);
        if (type === undefined || !checker.isArrayType(type)) return false;
        if (this.primitiveKindOfType(checker.getTypeArguments?.(type)?.[0]) !== 'string') return false;
        if (this.rustMethodReferencedAsValue(method)) return false;
        let joins = 0;
        const usesOk = this.rustLocalUsesAll(param, String(param.name.text), true, (n) => {
            const access: any = n.parent;
            if (!isPropertyAccessExpression(access) || access.expression !== n || String(access.name.text) !== 'join') return false;
            const call: any = access.parent;
            if (!isCallExpression(call) || call.expression !== access || call.arguments.length !== 1) return false;
            if (this.rustNativeStringLiteralArg(call.arguments[0]) === undefined) return false;
            joins++;
            return true;
        });
        if (!usesOk || joins === 0) return false;
        const index = Array.from(method.parameters as any).indexOf(param);
        return index >= 0 && this.rustStrVecCallSitesOk(method, index);
    }

    /** Every call site resolving to `method` passes an array literal of plain `Value` identifiers (none is fine: the dispatcher converts). */
    rustStrVecCallSitesOk(method, index: number): boolean {
        const name = String((method.name as any)?.text ?? '');
        if (name === '') return false;
        const key = this.rustDeclarationKey(method);
        for (const call of this.rustCallSitesForName(name) as any[]) {
            const args: any[] = call.arguments ?? [];
            if (args.some((a: any) => a.kind === SyntaxKind.SpreadElement)) return false;
            let declaration: any;
            try {
                declaration = signatureDeclaration((this.getChecker() as any).getResolvedSignature(call));
            } catch (e) {
                return false;
            }
            declaration = declaration?.resolve?.() ?? declaration;
            if (declaration === undefined || declaration === null || this.rustDeclarationKey(declaration) !== key) continue;
            if (!this.rustStrVecArgumentOk(args[index])) return false;
        }
        return true;
    }

    rustStrVecArgumentOk(arg): boolean {
        const inner: any = arg === undefined ? undefined : this.rustSkipWrappers(arg);
        if (inner !== undefined && this.rustStrVecValueLocal(inner)) return true;
        if (inner === undefined || !isArrayLiteralExpression(inner) || inner.elements.length === 0) return false;
        return Array.from(inner.elements as any).every((e: any) => isIdentifier(e)
            && this.primitiveKindOfType(this.getCheckedTypeOf(e)) === 'string'
            && this.isDeclaredValueIdentifier(e) && !this.rustStringLocalIdentifierIsTyped(e)
            && this.rustDeclarationOfIdentifier(e)?.kind !== SyntaxKind.BindingElement);
    }

    /** A plain `Value` local (not a param, not a typed container): `x.to_str_vec()` converts it. */
    rustStrVecValueLocal(node): boolean {
        if (!isIdentifier(node) || !this.isDeclaredValueIdentifier(node)) return false;
        const declaration: any = this.rustDeclarationOfIdentifier(node);
        if (declaration === undefined || !isVariableDeclaration(declaration) || declaration.name === node) return false;
        if (declaration.initializer === undefined || declaration.name?.kind !== SyntaxKind.Identifier) return false;
        if (this.rustStringLocalIdentifierIsTyped(node) || this.rustReadBearerKindOfDeclaration(declaration) !== false) return false;
        if (this.rustVecLocalIsTyped(declaration) || this.rustDictLocalIsTyped(declaration) || this.rustNestedDictLocalIsTyped(declaration)) return false;
        return this.getRustBoolLocalInitializer(declaration, '') === undefined;
    }

    rustNativeStrVecArgumentSlot(params, at: number): boolean {
        const param: any = params !== undefined && at < params.length ? params[at] : undefined;
        if (param === undefined || param.initializer !== undefined || param.questionToken !== undefined) return false;
        return this.rustParamPrintsStrVec(param);
    }

    /** `vec![a.to_string(), ..]` for an array literal landing in a `Vec<String>` slot. */
    rustStrVecArgumentText(node, identation): string {
        const inner: any = this.rustSkipWrappers(node);
        if (inner !== undefined && this.rustStrVecValueLocal(inner)) return `${this.printNode(inner, 0).trim()}.to_str_vec()`;
        if (inner === undefined || !isArrayLiteralExpression(inner)) return this.printNode(node, identation).trim();
        return `vec![${Array.from(inner.elements as any).map((e: any) => `${this.printNode(e, 0).trim()}.to_string()`).join(', ')}]`;
    }

    printStrVecParamJoin(node): string | undefined {
        const access: any = node?.expression;
        if (!isPropertyAccessExpression(access) || !isIdentifier(access.expression) || node.arguments?.length !== 1) return undefined;
        const declaration: any = this.rustDeclarationOfIdentifier(access.expression);
        if (declaration === undefined || !isParameterDeclaration(declaration) || !this.rustParamPrintsStrVec(declaration)) return undefined;
        const literal = this.rustNativeStringLiteralArg(node.arguments[0]);
        if (literal === undefined) return undefined;
        return `Value::Str(${this.printNode(access.expression, 0).trim()}.join("${literal}").into())`;
    }

    rustParamPrintsMap(param): boolean {
        if (param?.kind !== SyntaxKind.Parameter) {
            return false;
        }
        let decision = this.rustMapParamDecisions.get(param);
        if (decision === undefined) {
            this.rustMapParamDecisions.set(param, false); // re-entrancy guard
            try {
                decision = this.rustMapParamIsTypedUncached(param);
            } catch (e) {
                decision = false; // no proof -> the parameter keeps its `Value` box
            }
            this.rustMapParamDecisions.set(param, decision);
        }
        return decision;
    }

    rustMapParamIsTypedUncached(param): boolean {
        const method: any = param.parent;
        if (!isMethodDeclaration(method) || method.body === undefined) {
            return false;
        }
        if (param.name?.kind !== SyntaxKind.Identifier || param.dotDotDotToken !== undefined) {
            return false;
        }
        if (param.initializer !== undefined || param.questionToken !== undefined || param.type === undefined) {
            return false; // the optional-arg path binds through `get_arg`, a `Value`
        }
        if ((method.modifiers ?? []).some((m: any) => m.kind === SyntaxKind.StaticKeyword)) {
            return false;
        }
        // The base tier and every base override keep the fixed `Value` ABI the
        // hand-written trait declares.
        const baseFile = RustTranspiler.RUST_BASE_TIER_FILE;
        if (baseFile.test(param.getSourceFile().fileName)) {
            return false;
        }
        const hidden: any = this.getMethodOverride(method);
        if (hidden !== undefined && baseFile.test(hidden.getSourceFile().fileName)) {
            return false;
        }
        const type = this.getCheckedTypeOf(param.type);
        if (type === undefined || !this.isProvenMapType(type)) {
            return false;
        }
        if (this.rustMethodReferencedAsValue(method)) {
            return false;
        }
        const index = Array.from(method.parameters as any).indexOf(param);
        if (index < 0 || !this.rustMapParamBodyUsesOk(param)) {
            return false;
        }
        return this.rustMapParamCallSitesOk(method, index);
    }

    /** Every body use is a map operation the bearered printer emits, and at
     *  least one of them writes (otherwise the read shadow already covers it). */
    rustMapParamBodyUsesOk(param): boolean {
        let writes = 0;
        const safe = this.rustLocalUsesAll(param, String((param.name as any).text), true, (n) => {
            const kind = this.rustMapParamUseKind(n);
            if (kind === 'write') {
                writes++;
            }
            return kind !== undefined;
        });
        return safe && writes > 0;
    }

    /** `read` / `write` on a single-level key, or `box` where the printer moves
     *  the map into a `Value::Map(..)`; anything else has no printed form. */
    rustMapParamUseKind(node): string | undefined {
        const parent: any = node.parent;
        if (parent === undefined) {
            return undefined;
        }
        if (isElementAccessExpression(parent) && parent.expression === node) {
            if (!this.rustDictBearerElementUse(parent, String(node.text))) {
                return undefined;
            }
            // a chained write (`p[k1][k2] = v`) has a native print only on a local bearer
            if (isElementAccessExpression(parent.parent) && parent.parent.expression === parent) {
                let root: any = parent.parent;
                while (isElementAccessExpression(root.parent) && root.parent.expression === root) root = root.parent;
                const top: any = root.parent;
                if (top !== undefined && isBinaryExpression(top) && top.left === root
                    && rustIsAssignmentOperator(top.operatorToken.kind)) {
                    return undefined;
                }
            }
            const up: any = parent.parent;
            return (up !== undefined && isBinaryExpression(up) && up.left === parent
                && rustIsAssignmentOperator(up.operatorToken.kind)) ? 'write' : 'read';
        }
        if (isReturnStatement(parent) && parent.expression === node) {
            return 'box';
        }
        if (parent.kind === SyntaxKind.PropertyAssignment && parent.initializer === node) {
            return 'box';
        }
        // `x['k'] = <this param>`: the value of a native dict write.
        if (isBinaryExpression(parent) && parent.right === node
            && parent.operatorToken.kind === SyntaxKind.EqualsToken
            && isElementAccessExpression(parent.left)) {
            return 'box';
        }
        // A `this.`/`super.` call argument, unless it lands in another map slot
        // (a reborrow the printer does not emit).
        if (isCallExpression(parent) && parent.arguments.some((a: any) => a === node)) {
            const at = Array.from(parent.arguments).indexOf(node);
            const params = this.rustCalleeParams(parent);
            return this.rustNativeMapArgumentSlot(params, at) === undefined ? 'box' : undefined;
        }
        return undefined;
    }

    /** The value operand of a `m['k'] = x` write: the receiver takes a `Value`, so
     *  the map is boxed there (a move at its last use, a clone before it). */
    rustDictWriteValue(node): boolean {
        const parent: any = node?.parent;
        return parent !== undefined && isBinaryExpression(parent) && parent.right === node
            && parent.operatorToken.kind === SyntaxKind.EqualsToken
            && isElementAccessExpression(parent.left);
    }

    /** A use that prints the map as `Value::Map(x.clone())`: the body scan's
     *  `box` positions, never a key read or a map argument slot. */
    rustMapParamBoxes(node): boolean {
        const parent: any = node.parent;
        if (parent === undefined) {
            return false;
        }
        if (isReturnStatement(parent) && parent.expression === node) {
            return true;
        }
        if (parent.kind === SyntaxKind.PropertyAssignment && parent.initializer === node) {
            return true;
        }
        if (isBinaryExpression(parent) && parent.right === node
            && parent.operatorToken.kind === SyntaxKind.EqualsToken
            && isElementAccessExpression(parent.left)) {
            return true;
        }
        if (isCallExpression(parent) && parent.arguments.some((a: any) => a === node)) {
            const at = Array.from(parent.arguments).indexOf(node);
            return this.rustNativeMapArgumentSlot(this.rustCalleeParams(parent), at) === undefined;
        }
        return false;
    }

    /** A parameter printed as a native map, or undefined. */
    rustMapParamDeclaration(node): any | undefined {
        if (!isIdentifier(node)) {
            return undefined;
        }
        const declaration: any = this.rustDeclarationOfIdentifier(node);
        if (declaration === undefined || !isParameterDeclaration(declaration)) {
            return undefined;
        }
        return this.rustParamPrintsMap(declaration) ? declaration : undefined;
    }

    /** The `at`-th argument of a call lands in a native-map parameter slot. */
    rustNativeMapArgumentSlot(params, at: number): any | undefined {
        const param: any = params !== undefined && at < params.length ? params[at] : undefined;
        if (param === undefined || param.initializer !== undefined || param.questionToken !== undefined) {
            return undefined;
        }
        return this.rustParamPrintsMap(param) ? param : undefined;
    }

    /** `&mut <bearer>` for a map slot; every call site is proven a bearer. */
    rustMapArgumentText(node, identation): string {
        const inner: any = this.rustSkipWrappers(node);
        if (inner !== undefined && isIdentifier(inner) && this.rustMapArgumentIsBearer(inner)) {
            return `&mut ${this.printNode(inner, 0).trim()}`;
        }
        return this.printNode(node, identation).trim();
    }

    rustMapArgumentIsBearer(node): boolean {
        const inner: any = this.rustSkipWrappers(node);
        if (inner === undefined || !isIdentifier(inner)) {
            return false;
        }
        const declaration: any = this.rustDeclarationOfIdentifier(inner);
        return declaration !== undefined && isVariableDeclaration(declaration) && this.rustDictLocalIsTyped(declaration);
    }

    /** Program-wide call sites of `method`: every one passes a bearer in the slot. */
    rustMapParamCallSitesOk(method, index: number): boolean {
        const name = String((method.name as any)?.text ?? '');
        if (name === '') {
            return false;
        }
        const key = this.rustDeclarationKey(method);
        let proven = 0;
        for (const call of this.rustCallSitesForName(name) as any[]) {
            const args: any[] = call.arguments ?? [];
            if (args.some((a: any) => a.kind === SyntaxKind.SpreadElement)) {
                return false;
            }
            let declaration: any;
            try {
                declaration = signatureDeclaration((this.getChecker() as any).getResolvedSignature(call));
            } catch (e) {
                return false;
            }
            declaration = declaration?.resolve?.() ?? declaration;
            if (declaration === undefined || declaration === null || this.rustDeclarationKey(declaration) !== key) {
                continue;
            }
            const arg: any = args[index];
            if (arg === undefined || !this.rustMapArgumentIsBearer(arg)) {
                return false;
            }
            proven++;
        }
        return proven > 0;
    }

    rustDeclarationKey(node): string {
        const source = node?.getSourceFile?.();
        return source === undefined ? '' : `${source.fileName}:${node.pos}:${node.end}`;
    }

    private rustCallSitesCache = new WeakMap<any, Map<string, any[]>>();

    rustCallSitesForName(name: string): any[] {
        const program: any = this.getProgram();
        let table = this.rustCallSitesCache.get(program);
        if (table === undefined) {
            table = new Map<string, any[]>();
            this.rustCallSitesCache.set(program, table);
        }
        const cached = table.get(name);
        if (cached !== undefined) {
            return cached;
        }
        const calls: any[] = [];
        table.set(name, calls); // installed before the walk: a throwing walk admits nothing
        const names: string[] = (program.getSourceFileNames?.() ?? []) as any;
        for (const fileName of names) {
            const file: any = program.getSourceFile(fileName);
            if (file === undefined || file.isDeclarationFile) {
                continue;
            }
            const visit = (node: any) => {
                if (node?.kind === SyntaxKind.CallExpression) {
                    const callee: any = node.expression;
                    const calleeName = isPropertyAccessExpression(callee) && callee.name?.kind === SyntaxKind.Identifier
                        ? String(callee.name.text)
                        : (isIdentifier(callee) ? String(callee.text) : undefined);
                    if (calleeName === name) {
                        calls.push(node);
                    }
                }
                node.forEachChild(visit);
            };
            file.forEachChild(visit);
        }
        return calls;
    }

    /** `x['k'] = v` on a native-map parameter: the insert `add_element_to_object`
     *  performs on the same plain dict, on the map the type already is. */
    rustMapParamDictInsert(baseExpr, keyNode, keyText: string, valueText: string): string | undefined {
        const declaration = this.rustMapParamDeclaration(baseExpr);
        if (declaration === undefined) {
            return undefined;
        }
        const name = String(baseExpr.text);
        if (!this.rustDictBearerKeyOk(keyNode) && !this.rustBearerWriteKeyOk(keyNode, name)) {
            return undefined;
        }
        const keyArg = this.rustNativeInsertKeyArg({ text: name, isField: false, plain: true }, keyNode, keyText)
            ?? this.rustBearerWriteKeyArg(keyNode, keyText, name);
        if (keyArg === undefined) {
            return undefined;
        }
        return this.rustBearerInsertText(name, keyArg, valueText);
    }

    // A new string local built by `this.capitalize(v)` / `r.toUpperCase()` / `r.toLowerCase()` is a
    // native `String` when every use is a boxing move (return, object value, `this.` arg, `m[k] = x`).

    private rustStringMethodLocalDecisions = new WeakMap<any, boolean>();

    /** The native initializer text of a string-method local, else undefined. */
    rustStringMethodLocalInit(declaration): string | undefined {
        const init: any = declaration.initializer;
        if (declaration.name?.kind !== SyntaxKind.Identifier || init === undefined || !isCallExpression(init)
            || !isPropertyAccessExpression(init.expression)) return undefined;
        const callee: any = init.expression;
        const method = String(callee.name.text);
        let text: string | undefined;
        if (method === 'capitalize' && callee.expression.kind === SyntaxKind.ThisKeyword && init.arguments.length === 1) {
            text = `${this.printNode(init, 0).trim()}.to_string()`;
        } else if ((method === 'toUpperCase' || method === 'toLowerCase') && init.arguments.length === 0
            && callee.expression.kind !== SyntaxKind.ThisKeyword && isIdentifier(callee.expression)
            && this.rustParamShadowOf(callee.expression) === undefined) {
            const receiver = this.rustNativeStringReceiver(init, this.printNode(callee.expression, 0));
            if (receiver !== undefined) text = `${receiver}.as_str().map(str::${method === 'toUpperCase' ? 'to_uppercase' : 'to_lowercase'}).unwrap_or_default()`;
        }
        return text !== undefined && this.rustStringMethodLocalIsTyped(declaration) ? text : undefined;
    }

    rustStringMethodLocalIsTyped(declaration): boolean {
        let decision = this.rustStringMethodLocalDecisions.get(declaration);
        if (decision === undefined) {
            this.rustStringMethodLocalDecisions.set(declaration, false); // re-entrancy guard
            decision = this.primitiveKindOfType(this.typeOfNodeIfAny(declaration.name)) === 'string'
                && this.rustLocalUsesAll(declaration, declaration.name.text, true, (n) => this.rustStringMethodLocalBoxUse(n));
            this.rustStringMethodLocalDecisions.set(declaration, decision);
        }
        return decision;
    }

    rustStringMethodLocalBoxUse(n): boolean {
        const parent: any = n.parent;
        return isReturnStatement(parent) || this.rustDictWriteValue(n)
            || (parent?.kind === SyntaxKind.PropertyAssignment && parent.initializer === n)
            || (isCallExpression(parent) && parent.arguments.some((a) => a === n) && this.rustVecBoxingCallee(parent.expression));
    }

    // Typed string locals: `let x: Value = self.safeString(..)` is declared `Option<String>` when
    // the checker proves a string and every use is a native sink (`x.is_none()`, `x.as_deref() ==
    // Some("lit")`). The helper's Value is unwrapped with `.as_str()`; any other sink keeps the box.

    private static readonly RUST_STRING_LOCAL_HELPERS = new Set([
        'safeString', 'safeString2', 'safeStringN',
        'safeStringLower', 'safeStringLower2', 'safeStringLowerN',
        'safeStringUpper', 'safeStringUpper2', 'safeStringUpperN',
    ]);

    private rustStringLocalDecisions = new Map<any, boolean>();

    // `let x = this.safeString(..)` / `safeString(..)` — the whole initializer;
    // a call whose callee already returns `Option<String>` (a native-`Str`
    // method) is the same payload without the unwrap.
    rustSafeStringLocalInitializer(declaration): boolean {
        const initializer = declaration.initializer;
        if (declaration.name?.kind !== SyntaxKind.Identifier || initializer?.kind !== SyntaxKind.CallExpression) {
            return false;
        }
        if (this.rustNativeStrCalleeKind(initializer) === 'str') {
            return true;
        }
        const callee = initializer.expression;
        const helpers = RustTranspiler.RUST_STRING_LOCAL_HELPERS;
        if (callee?.kind === SyntaxKind.PropertyAccessExpression) {
            return callee.expression?.kind === SyntaxKind.ThisKeyword && helpers.has(callee.name.text);
        }
        return callee?.kind === SyntaxKind.Identifier && helpers.has(callee.text);
    }

    // The two uses that compile against an `Option<String>` local and print
    // natively: `x ==/!= null|undefined` and `x ==/!= "lit"`.
    rustStringLocalUseIsNative(node): boolean {
        const parent = node.parent;
        if (parent?.kind !== SyntaxKind.BinaryExpression) {
            return false;
        }
        const op = parent.operatorToken.kind;
        if (op !== SyntaxKind.EqualsEqualsToken && op !== SyntaxKind.EqualsEqualsEqualsToken
            && op !== SyntaxKind.ExclamationEqualsToken && op !== SyntaxKind.ExclamationEqualsEqualsToken) {
            return false;
        }
        const other = parent.left === node ? parent.right : (parent.right === node ? parent.left : undefined);
        if (other === undefined) {
            return false;
        }
        const otherLiteral = this.literalKindOfNode(other);
        // The string-literal compare prints as `<x>.as_deref() == Some("lit")`;
        // the printer's own rejections (replacement tokens) must match.
        return otherLiteral === 'null' || (otherLiteral === 'string' && !(other.text in this.StringLiteralReplacements));
    }

    // Every use compiles against `Option<String>`, and at least one native sink
    // consumes it (otherwise the retype buys nothing).
    rustSafeStringLocalIsTyped(declaration): boolean {
        const cached = this.rustStringLocalDecisions.get(declaration);
        if (cached !== undefined) {
            return cached;
        }
        this.rustStringLocalDecisions.set(declaration, false); // re-entrancy guard
        const decision = this.rustSignApiElementInit(declaration) !== undefined
            ? this.rustSignApiStringLocalIsTyped(declaration)
            : this.rustSafeStringLocalIsTypedUncached(declaration);
        this.rustStringLocalDecisions.set(declaration, decision);
        return decision;
    }

    // Only string-literal compares: the null compare prints `!= Value::Null` and needs the box.
    rustSignApiStringLocalIsTyped(declaration): boolean {
        if (this.primitiveKindOfType(this.typeOfNodeIfAny(declaration.name)) !== 'string') return false;
        let literalUses = 0;
        const safe = this.rustLocalUsesAll(declaration, declaration.name.text, true, (n) => {
            const other = n.parent?.kind === SyntaxKind.BinaryExpression ? (n.parent.left === n ? n.parent.right : n.parent.left) : undefined;
            if (other === undefined || this.literalKindOfNode(other) !== 'string' || !this.rustStringLocalUseIsNative(n)) return false;
            literalUses++;
            return true;
        });
        return safe && literalUses > 0;
    }

    rustSafeStringLocalIsTypedUncached(declaration): boolean {
        if (!this.rustSafeStringLocalInitializer(declaration)
            || this.primitiveKindOfType(this.typeOfNodeIfAny(declaration.name)) !== 'string') {
            return false;
        }
        let nativeUses = 0;
        const safe = this.rustLocalUsesAll(declaration, declaration.name.text, true,
            (n) => this.rustStringLocalUseIsNative(n) && ++nativeUses > 0);
        return safe && nativeUses > 0;
    }

    private static readonly RUST_SIGN_API_METHODS = new Set(['sign', 'fetch2', 'request']);

    /** The `api: string[]` / `section: string[]` parameter (position 1) of sign/fetch2/request an identifier names. */
    rustSignApiParam(node): ParameterDeclaration | undefined {
        if (node === undefined || !isIdentifier(node) || (node.text !== 'api' && node.text !== 'section')) return undefined;
        const declaration: any = this.rustDeclarationOfIdentifier(node);
        if (declaration === undefined || !isParameterDeclaration(declaration)) return undefined;
        const fn: any = declaration.parent;
        if (fn === undefined || !isMethodDeclaration(fn) || !isIdentifier(fn.name)) return undefined;
        if (!RustTranspiler.RUST_SIGN_API_METHODS.has(fn.name.text) || fn.parameters.indexOf(declaration) !== 1) return undefined;
        return String(declaration.type?.getText?.() ?? '').replace(/\s+/g, '') === 'string[]' ? declaration : undefined;
    }

    /** `api[N]` on a shadowed sign-api parameter: the element read the shadow prints as `api.get(N)`. */
    rustSignApiElementInit(declaration): { receiver: string, index: number } | undefined {
        const init: any = declaration.initializer;
        if (declaration.name?.kind !== SyntaxKind.Identifier || init === undefined || !isElementAccessExpression(init)) return undefined;
        const key: any = init.argumentExpression;
        if (!isNumericLiteral(key) || !/^\d+$/.test(String(key.text)) || !isIdentifier(init.expression)) return undefined;
        if (this.rustSignApiParam(init.expression) === undefined || this.rustParamShadowOf(init.expression) === undefined) return undefined;
        return { receiver: String(init.expression.text), index: Number(key.text) };
    }

    // `x.foo` / `{ foo: 1 }` — a property name is not a use of the local.
    rustIdentifierIsPropertyName(node): boolean {
        const parent = node.parent;
        switch (parent?.kind) {
        case SyntaxKind.PropertyAccessExpression:
        case SyntaxKind.PropertyAssignment:
        case SyntaxKind.PropertySignature:
        case SyntaxKind.ShorthandPropertyAssignment:
            return parent.name === node;
        }
        return false;
    }

    // Is this identifier occurrence bound to a typed string local?
    rustStringLocalIdentifierIsTyped(node): boolean {
        const checker: any = node?.kind === SyntaxKind.Identifier ? this.checkerOrUndefined() : undefined;
        if (checker === undefined) {
            return false;
        }
        const symbol = checker.getSymbolAtLocation(node);
        const declaration = symbolValueDeclaration(symbol) ?? symbolDeclarations(symbol)[0];
        return declaration?.kind === SyntaxKind.VariableDeclaration && this.rustSafeStringLocalIsTyped(declaration);
    }

    // `let x = <bool expr>` → the printed bool expression, or undefined.
    getRustBoolLocalInitializer(declaration, printedValue: string): string | undefined {
        const initializer = declaration.initializer;
        if (initializer === undefined || declaration.name?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const inner = this.stripOuterParens(printedValue);
        const peeled = this.peelValueBoolBox(inner);
        if (peeled === undefined && !this.printedBoolHelperCall(inner) && !this.rustNodeIsBoolExpression(initializer)) {
            return undefined;
        }
        if (!this.rustTypeIsBoolean(initializer) || !this.rustLocalUsesAcceptBool(declaration, declaration.name.text)) {
            return undefined;
        }
        return peeled ?? inner;
    }

    // ── native `Option<String>` returns (`: Str` methods) ─────────────────────
    //
    // An internal, non-override, non-async method declared `: Str`

    private rustNativeStrReturnDecisions = new WeakMap<Node, boolean>();

    // `ts/src/base/**` — the shared `Exchange` / `PredictionExchange` classes
    // (the transpiler synthesises variants like `.__ExchangeNoOverloads.ts`).
    private static readonly RUST_BASE_TIER_FILE = /ts[\\/]src[\\/]base[\\/]/;

    /** `'str'` when the method is emitted `-> Option<String>`, else undefined. */
    rustNativeStrReturnKind(node: Node): string | undefined {
        if (node === undefined || node.kind !== SyntaxKind.MethodDeclaration) {
            return undefined;
        }
        let decision = this.rustNativeStrReturnDecisions.get(node);
        if (decision === undefined) {
            this.rustNativeStrReturnDecisions.set(node, false); // re-entrancy guard
            decision = this.rustNativeStrReturnDecisionUncached(node);
            this.rustNativeStrReturnDecisions.set(node, decision);
        }
        return decision ? 'str' : undefined;
    }

    private rustMethodOverrides = new WeakMap<Node, Node | null>();
    private rustClassAncestorTables = new WeakMap<Node, Map<string, Node>[] | null>();

    /** Per ancestor class (nearest first): method name -> its LAST declaration; undefined when a
     *  parent class does not resolve. */
    private rustAncestorMethodTables(classDecl: Node): Map<string, Node>[] | undefined {
        const cached = this.rustClassAncestorTables.get(classDecl);
        if (cached !== undefined) {
            return cached ?? undefined;
        }
        const chain: Map<string, Node>[] = [];
        let parentClass = getAllSuperTypeNodes(classDecl)[0];
        let ok = true;
        while (parentClass !== undefined) {
            const parentClassDecl = this.getChecker().getTypeAtLocation(parentClass)?.getSymbol()?.valueDeclaration?.resolve();
            if (parentClassDecl === undefined) {
                ok = false;
                break;
            }
            const byName = new Map<string, Node>();
            for (const elem of (parentClassDecl as any).members ?? []) {
                if (isMethodDeclaration(elem)) {
                    byName.set(elem.name.getText().trim(), elem);
                }
            }
            chain.push(byName);
            parentClass = getAllSuperTypeNodes(parentClassDecl)[0] ?? undefined;
        }
        this.rustClassAncestorTables.set(classDecl, ok ? chain : null);
        return ok ? chain : undefined;
    }

    // base getMethodOverride rescans every parent member (getText) per call; same walk, memoized
    getMethodOverride(node: Node): Node {
        if (node === undefined || !isClassDeclaration(node.parent) || !(node.parent as any).heritageClauses) {
            return undefined;
        }
        const cached = this.rustMethodOverrides.get(node);
        if (cached !== undefined) {
            return cached ?? undefined;
        }
        const chain = this.rustAncestorMethodTables(node.parent);
        let method = undefined;
        if (chain === undefined) {
            this.warn(node, "Parent class", "Parent class not found");
        } else {
            const name = (node as any).name.text;
            for (const byName of chain) {
                method = byName.get(name) ?? method;
            }
        }
        this.rustMethodOverrides.set(node, method ?? null);
        return method;
    }

    private rustNativeStrReturnDecisionUncached(node): boolean {
        // An override's base/trait copy prints `-> Value`. The base classes are hand-tuned across the
        // whole tree: their methods are called from ~every derived file (and the hand-written runtime),
        // where the boxed `Value` ABI is load-bearing. Only per-exchange
        if (node.type === undefined || this.isAsyncFunction(node) || this.getMethodOverride(node) !== undefined
            || RustTranspiler.RUST_BASE_TIER_FILE.test(node.getSourceFile().fileName)) {
            return false;
        }
        let type: Type;
        try {
            type = this.getChecker().getTypeFromTypeNode(node.type);
        } catch (e) {
            return false;
        }
        return this.primitiveKindOfType(type) === 'string' && this.rustStrReturnPathsConvert(node.body);
    }

    /** Every `return` of the method's own body converts, and the body's last
     *  statement is one of them (so Rust sees no `()`-valued tail the
     *  `-> Value` post-passes would have patched with `Value::Null`). */
    rustStrReturnPathsConvert(body: Block): boolean {
        const last = body?.statements[body.statements.length - 1];
        if (last === undefined || !isReturnStatement(last)) {
            return false;
        }
        let ok = true;
        const visit = (n: Node) => {
            if (!ok || (n !== body && isFunctionLike(n))) {
                return; // a nested function keeps the boxed signature
            }
            if (isReturnStatement(n) && !this.rustStrReturnValueConverts(n.expression)) {
                ok = false;
                return;
            }
            n.forEachChild(visit);
        };
        body.forEachChild(visit);
        return ok;
    }

    /** A `return` value of a native-`Str` method: a nullish literal, an
     *  expression already printing an `Option<String>` (a nested retyped call
     *  or a typed string local), or a `Value`-printing expression the checker
     *  types `string | undefined`. */
    rustStrReturnValueConverts(expression: Node): boolean {
        const inner = this.unwrapParensNode(expression);
        if (inner === undefined) {
            return false;
        }
        if (this.literalKindOfNode(inner) === 'null' || this.rustStrNativeExpression(inner)) {
            return true;
        }
        return this.printsValueExpression(inner) && this.primitiveKindOfType(this.getCheckedTypeOf(inner)) === 'string';
    }

    /** An expression that already prints an `Option<String>` in a `: Str`
     *  method's return position. */
    rustStrNativeExpression(expression: Node): boolean {
        const inner = this.unwrapParensNode(expression);
        if (inner !== undefined && isCallExpression(inner)) {
            return this.rustNativeStrCalleeKind(inner) === 'str';
        }
        return inner !== undefined && isIdentifier(inner) && this.rustStringLocalIdentifierIsTyped(inner);
    }

    unwrapParensNode(node: Node): Node | undefined {
        let current = node;
        while (current !== undefined && isParenthesizedExpression(current)) {
            current = current.expression;
        }
        return current;
    }

    /** The callee declaration behind `self.<method>(..)` when it is emitted
     *  `-> Option<String>`; undefined otherwise (no proof → keep the box). */
    // call node -> resolved signature's declaration (null: none); a handle resolve per call is JS-heavy
    private rustCallDeclarations = new WeakMap<Node, Node | null>();

    rustNativeStrCalleeKind(node: Node): string | undefined {
        if (node === undefined || node.kind !== SyntaxKind.CallExpression) {
            return undefined;
        }
        let declaration = this.rustCallDeclarations.get(node);
        if (declaration === undefined) {
            try {
                declaration = signatureDeclaration((this.getChecker() as any).getResolvedSignature(node)) ?? null;
            } catch (e) {
                return undefined;
            }
            this.rustCallDeclarations.set(node, declaration);
        }
        return declaration?.kind === SyntaxKind.MethodDeclaration ? this.rustNativeStrReturnKind(declaration) : undefined;
    }

    /** `Option<String>` → `Value` (exact inverse of the return conversion). The operand is already a
     *  typed `String`, so the conversion is the standard `From` impl — no `|__s|` closure between them. */
    rustNativeStrValueBox(text: string): string {
        return `${text}.map(Value::from).unwrap_or(Value::Null)`;
    }

    /** True when a call to a native-`Str` callee must be boxed back to a
     *  `Value` at this position; the declaration and return printers run the
     *  conversion themselves. */
    rustNativeStrCallNeedsBox(node: Node): boolean {
        let current: any = node;
        let parent: any = current.parent;
        while (parent !== undefined && isParenthesizedExpression(parent) && parent.expression === current) {
            current = parent;
            parent = parent.parent;
        }
        if (parent === undefined) {
            return true;
        }
        if (isVariableDeclaration(parent) && parent.initializer === current && isIdentifier(parent.name)) {
            return false; // the declaration printer binds the type / boxes it
        }
        if (isReturnStatement(parent) && parent.expression === current) {
            // only a native-`Str` method's own return printer runs the conversion
            return this.rustNativeStrReturnKind(findAncestor(parent.parent, isFunctionLike) as any) !== 'str';
        }
        return true;
    }

    /** Wrap a call text when the callee returns a native `Option<String>`
     *  and the position still needs a `Value`. */
    rustBoxNativeStrCallIfNeeded(node: Node, text: string): string {
        return this.rustNativeStrCalleeKind(node) === 'str' && this.rustNativeStrCallNeedsBox(node)
            ? this.rustNativeStrValueBox(text) : text;
    }

    // ── declared-Dict locals (`let x: Value = self.safe_dict_k(..)`) ───────────
    //
    // The printer declares non-bool locals `Value`, and the checker types a

    private declaredDictLocalsCache: { src: SourceFile, table: Map<string, RustDeclaredDictLocalEntry[]> } | undefined;

    /** All `let x: Value = <dict-proven initialiser>` declarations of the current
     *  source file, keyed by local name in declaration order. */
    rustDeclaredDictLocals(): Map<string, RustDeclaredDictLocalEntry[]> {
        const src = this.getSrc();
        if (this.declaredDictLocalsCache?.src !== src) {
            let table: Map<string, RustDeclaredDictLocalEntry[]>;
            try {
                table = this.collectRustDeclaredDictLocals(src);
            } catch (e) {
                table = new Map(); // no proof -> consumers keep the helper
            }
            this.declaredDictLocalsCache = { src, table };
        }
        return this.declaredDictLocalsCache.table;
    }

    /** Printer hook for the helper-removal units: the proven kind of a declared
     *  local, or undefined when the local is not proven Dict at every use.
     *  Accepts the receiver node of the helper call (identifier, `x['k']` chain,
     *  `this.x` chain) or the declaration itself. */
    rustDeclaredLocalTypeResolver(node: Node): RustDeclaredLocalKind | undefined {
        return this.rustDeclaredLocalEntry(node)?.kind;
    }

    /** The table entry a use site resolves to (the declaration whose binding the
     *  use refers to, proven), or undefined. */
    rustDeclaredLocalEntry(node: Node): RustDeclaredDictLocalEntry | undefined {
        if (node === undefined) return undefined;
        const name = isVariableDeclaration(node) ? (node.name as Identifier).text : this.rootPlaceText(node);
        if (name === undefined) return undefined;
        const entries = this.rustDeclaredDictLocals().get(name);
        if (entries === undefined) return undefined;
        const start = node.getStart();
        const identifier = this.rustDeclaredLocalIdentifier(node);
        const symbol = identifier === undefined ? undefined : this.rustSymbolOf(identifier);
        let best: RustDeclaredDictLocalEntry | undefined;
        for (const entry of entries) {
            if (entry.start > start || !entry.alwaysDict || !entry.stable) continue;
            const scope = this.rustEnclosingFunction(entry.declaration);
            if (scope !== undefined && !this.isNodeInsideNode(node, scope)) continue;
            if (identifier !== undefined) {
                const entrySymbol = this.rustSymbolOf((entry.declaration.name as Identifier));
                if (symbol !== undefined && entrySymbol !== undefined && symbol !== entrySymbol) continue;
            }
            if (best === undefined || entry.start > best.start) best = entry;
        }
        return best;
    }

    /** The identifier at the head of a place (`x`, `x['k']`, `this.x` is not a
     *  local) — the node the resolver matches against the table. */
    private rustDeclaredLocalIdentifier(node: Node): Identifier | undefined {
        let current: any = node;
        while (current !== undefined && !isIdentifier(current)) {
            if (isElementAccessExpression(current) || isPropertyAccessExpression(current)) {
                if (current.expression.kind === SyntaxKind.ThisKeyword) return undefined;
            } else if (!isParenthesizedExpression(current) && !isNonNullExpression(current)) {
                return undefined;
            }
            current = current.expression;
        }
        return current;
    }

    /** Binding symbol of an identifier, or undefined when the checker cannot
     *  answer (ByContent probes without a class context, for instance). */
    private rustSymbolOf(node: Identifier): TsSymbol | undefined {
        return this.checkerOrUndefined()?.getSymbolAtLocation(node);
    }

    /** True when this identifier is a use of the given declaration's binding.
     *  Without a checker answer the callers stay conservative (reject). */
    private rustIdentifierRefersToDeclaration(node: Identifier, declaration: VariableDeclaration): boolean {
        const symbol = this.rustSymbolOf(node);
        return symbol !== undefined && symbol === this.rustSymbolOf(declaration.name as Identifier);
    }

    /** Census of the current source file's table, for reports and tests. */
    rustDeclaredDictLocalCensus(): { declarators: number, dict: number, alwaysDict: number, kindUnstable: number, retypeEligible: number } {
        let declarators = 0, dict = 0, alwaysDict = 0, kindUnstable = 0, retypeEligible = 0;
        for (const entries of this.rustDeclaredDictLocals().values()) {
            for (const entry of entries) {
                declarators++;
                if (entry.alwaysDict) alwaysDict++;
                if (entry.alwaysDict && entry.stable) dict++;
                if (entry.alwaysDict && !entry.stable) kindUnstable++;
                // every later use is an element access or a kind-preserving
                // mutator -> the only uses a native declaration has to serve.
                if (entry.alwaysDict && entry.stable && entry.uses.other === 0) retypeEligible++;
            }
        }
        return { declarators, dict, alwaysDict, kindUnstable, retypeEligible };
    }

    private collectRustDeclaredDictLocals(src: SourceFile): Map<string, RustDeclaredDictLocalEntry[]> {
        const candidates: { declaration: VariableDeclaration, name: string, source: string, defaultNode: Node | undefined }[] = [];
        this.rustWalkScope(src, (node) => {
            if (isVariableDeclaration(node) && node.initializer !== undefined && node.name.kind === SyntaxKind.Identifier) {
                const info = this.rustDictInitializerInfo(node.initializer);
                if (info !== undefined) {
                    candidates.push({ declaration: node, name: String(node.name.text), source: info.source, defaultNode: info.defaultNode });
                }
            }
        });
        candidates.sort((a, b) => a.declaration.getStart() - b.declaration.getStart());
        const table = new Map<string, RustDeclaredDictLocalEntry[]>();
        for (const candidate of candidates) {
            const declaration = candidate.declaration;
            const start = declaration.getStart();
            const alwaysDict = this.rustDictProvenExpression(candidate.defaultNode, table, start);
            const scan = this.rustDictLocalWriteScan(declaration, candidate.name, table);
            const entries = table.get(candidate.name) ?? [];
            entries.push({ kind: RUST_DECLARED_DICT_LOCALS.DICT, name: candidate.name, source: candidate.source,
                alwaysDict, stable: scan.stable, uses: scan.uses, declaration, start });
            table.set(candidate.name, entries);
        }
        return table;
    }

    /** The Dict-proven initialiser shape of a declaration, or undefined. */
    private rustDictInitializerInfo(node: Node): { source: string, defaultNode: Node | undefined } | undefined {
        if (isObjectLiteralExpression(node)) {
            return { source: 'value_map', defaultNode: node };
        }
        if (isParenthesizedExpression(node) || isAsExpression(node) || isNonNullExpression(node)) {
            return this.rustDictInitializerInfo(node.expression);
        }
        if (!isCallExpression(node)) return undefined;
        const callee = this.rustSafeDictCallee(node);
        if (callee === undefined) return undefined;
        return { source: callee, defaultNode: node.arguments[RUST_DECLARED_DICT_LOCALS.SAFE_CALLEES[callee]] };
    }

    /** Printed `safe_dict*` callee name of `self.<name>(..)`, or undefined. */
    private rustSafeDictCallee(node: CallExpression): string | undefined {
        const expression = node.expression;
        if (!isPropertyAccessExpression(expression) || expression.expression.kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }
        const printed = this.toSnakeCaseName(expression.name.text);
        return RUST_DECLARED_DICT_LOCALS.SAFE_CALLEES[printed] === undefined ? undefined : printed;
    }

    /** True when the expression can only be a Dict at run time: an object
     *  literal, a `safe_dict*` call with a Dict-proven default, an element of a
     *  one-element literal default, or an already-proven local. */
    private rustDictProvenExpression(node: Node | undefined, table: Map<string, RustDeclaredDictLocalEntry[]>, useStart: number): boolean {
        if (node === undefined) return false;
        if (isObjectLiteralExpression(node)) return true;
        if (isParenthesizedExpression(node) || isAsExpression(node) || isNonNullExpression(node)) {
            return this.rustDictProvenExpression(node.expression, table, useStart);
        }
        if (isArrayLiteralExpression(node)) {
            return node.elements.length === 1 && this.rustDictProvenExpression(node.elements[0], table, useStart);
        }
        if (isIdentifier(node)) {
            const entries = table.get(node.text) ?? [];
            return entries.some((entry) => {
                if (!entry.alwaysDict || entry.start > useStart) return false;
                const scope = this.rustEnclosingFunction(entry.declaration);
                return scope === undefined || this.isNodeInsideNode(node, scope);
            });
        }
        const info = this.rustDictInitializerInfo(node);
        return info !== undefined && this.rustDictProvenExpression(info.defaultNode, table, useStart);
    }

    /** D2 scan over the enclosing function: an assignment of a non-Dict-proven
     *  value would let the kind change. Every other write path the printer emits
     *  for a local is kind-preserving (`x['k'] = v` -> `add_element_to_object`,
     *  `x.push(v)` -> `append_to_array`, `delete x[k]` -> `remove`, nested
     *  `x['a']['b'] = v` -> `get_value_mut`/`set_value`). A *different* binding of
     *  the same name (sibling block, parameter) is not this local and does not
     *  count; when the checker cannot separate the two bindings the scan stays
     *  conservative and rejects. */
    private rustDictLocalWriteScan(declaration: VariableDeclaration, name: string, table: Map<string, RustDeclaredDictLocalEntry[]>): { stable: boolean, uses: { elementAccess: number, mutHelper: number, other: number } } {
        const uses = { elementAccess: 0, mutHelper: 0, other: 0 };
        let stable = true;
        const scope = this.rustEnclosingFunction(declaration);
        if (scope === undefined) return { stable, uses };
        const declarationSymbol = this.rustSymbolOf(declaration.name as Identifier);
        // every event of the scan is rooted at a node spelled `name`: a re-binding, a use, or the
        // identifier inside an assignment target / for-of-in head (the target's own node is an ancestor)
        for (const node of this.rustScopeNameNodes(scope, name) as any[]) {
            if (node !== declaration && this.rustBindsName(node, name)) {
                const otherSymbol = this.rustSymbolOf((node as any).name);
                if (declarationSymbol === undefined || otherSymbol === undefined || otherSymbol === declarationSymbol) {
                    stable = false; // same binding, or the checker cannot tell them apart
                    break;
                }
            }
            if (node.kind !== SyntaxKind.Identifier) continue;
            if (node !== declaration.name && this.rustIdentifierRefersToDeclaration(node, declaration)) {
                this.rustDictLocalClassifyUse(node, uses);
            }
            let target: any = node;
            while (target.parent !== undefined && (isParenthesizedExpression(target.parent) || isArrayLiteralExpression(target.parent)
                || isShorthandPropertyAssignment(target.parent) || isObjectLiteralExpression(target.parent))) {
                target = target.parent;
            }
            const holder: any = target.parent;
            if (holder !== undefined && isBinaryExpression(holder) && holder.left === target
                && rustIsAssignmentOperator(holder.operatorToken.kind) &&
                this.rustAssignmentWritesWholeLocal(holder.left, declaration) &&
                !this.rustDictProvenExpression(holder.right, table, declaration.getStart())) {
                stable = false; // the local itself is reassigned a non-Dict value
                break;
            }
            // `for (x of list)` / `for (x in obj)` rebind an existing local.
            if (holder !== undefined && (isForOfStatement(holder) || isForInStatement(holder)) && holder.initializer === target &&
                this.rustAssignmentWritesWholeLocal(holder.initializer, declaration)) {
                stable = false;
                break;
            }
        }
        return { stable, uses };
    }

    /** True when this assignment target writes the local ITSELF (`x = ..`,
     *  `[x, y] = ..`, `({x} = ..)`), as opposed to a write *into* it
     *  (`x['k'] = ..`, kind-preserving). */
    private rustAssignmentWritesWholeLocal(left: Node, declaration: VariableDeclaration): boolean {
        if (isIdentifier(left)) {
            return this.rustIdentifierRefersToDeclaration(left, declaration);
        }
        if (isParenthesizedExpression(left)) {
            return this.rustAssignmentWritesWholeLocal(left.expression, declaration);
        }
        if (isArrayLiteralExpression(left)) {
            return left.elements.some((element) => this.rustAssignmentWritesWholeLocal(element, declaration));
        }
        if (isObjectLiteralExpression(left)) {
            return left.properties.some((property) => {
                if (!isShorthandPropertyAssignment(property)) return false;
                return this.rustAssignmentWritesWholeLocal(property.name, declaration);
            });
        }
        return false;
    }

    /** One use of a dict-proven local: an element-access chain (`x['k']`, also
     *  the `x['k'] = v` write), a kind-preserving mutator (`x.push(v)`,
     *  `delete x[k]`), or something that would need the local to still be a
     *  `Value`. */
    private rustDictLocalClassifyUse(node: Node, uses: { elementAccess: number, mutHelper: number, other: number }): void {
        const isAccessOf = (p: any, c: Node) => p !== undefined &&
            (isElementAccessExpression(p) || isPropertyAccessExpression(p)) && p.expression === c;
        let current: any = node;
        const parent: any = current.parent;
        if (isAccessOf(parent, current)) {
            while (isAccessOf(current.parent, current)) current = current.parent;
            if (isElementAccessExpression(current)) uses.elementAccess++;
            else uses.other++; // `x.field` on a dict value
        } else if (parent !== undefined && (isDeleteExpression(parent) || (isCallExpression(parent) &&
            isPropertyAccessExpression(parent.expression) && parent.expression.expression === current &&
            parent.expression.name.text === 'push'))) {
            uses.mutHelper++;
        } else {
            uses.other++;
        }
    }


    printPropertyDeclaration(node, identation) {
        const name = this.printNode(node.name, 0);
        if (node.initializer) {
            const init = this.printNode(node.initializer, 0);
            return `${this.getIden(identation)}${name}: Value, // default: ${init}`;
        }
        return `${this.getIden(identation)}${name}: Value,`;
    }

    // Collect property declarations with their initializers for use in new()
    getStructFields(node): Array<{ name: string, init: string }> {
        return node.members.filter(m => m.kind === SyntaxKind.PropertyDeclaration).map(p => ({
            name: this.printNode(p.name, 0),
            init: p.initializer ? this.printNode(p.initializer, 0) : 'Value::Null',
        }));
    }

    printStruct(node, identation) {
        const fieldLines = this.getStructFields(node).map(f => `${this.getIden(identation + 1)}pub ${f.name}: Value,`).join('\n');
        return `#[derive(Debug, Clone)]\npub struct ${this.className} {\n${fieldLines}\n}`;
    }

    printNewMethod(node, identation) {
        const fieldInits = this.getStructFields(node).map(f => `${this.getIden(identation + 2)}${f.name}: ${f.init},`).join('\n');
        return `\nimpl ${this.className} {\n${this.getIden(identation + 1)}pub fn new() -> Self {\n${this.getIden(identation + 2)}${this.className} {\n${fieldInits}\n${this.getIden(identation + 2)}}\n${this.getIden(identation + 1)}}\n}`;
    }

    printClass(node, identation) {
        this.rustPrefetchClassTypes(node);
        this.className = node.name.text;

        // First pass: collect method signatures for optional param handling
        const methods = node.members.filter(m => m.kind === SyntaxKind.MethodDeclaration);
        methods.forEach((method: any) => {
            const requiredCount = method.parameters.filter(p => !p.initializer && !p.questionToken).length;
            if (requiredCount < method.parameters.length) {
                this.methodSignatures[method.name.text] = { requiredCount };
            }
        });

        const struct = this.printStruct(node, identation);
        const newMethod = this.printNewMethod(node, identation);
        const classMethods = methods.map(m => this.printMethodDeclaration(m, identation)).join('\n\n');
        return struct + newMethod + `\nimpl ${this.className} {\n${classMethods}\n}`;
    }

    printMethodDefinition(node, identation) {
        const name = (node.name as any).text;
        const params = node.parameters;
        const requiredParams = params.filter(p => !p.initializer && !p.questionToken);
        let parsedArgs = ['&self', ...requiredParams.map(p => `${this.printNode(p.name, 0)}: ${this.rustParamType(p)}`)].join(', ');
        if (requiredParams.length < params.length) {
            parsedArgs += ', optional_args: &[Value]';
        }
        const returnType = this.printRustFunctionType(node);
        const retStr = returnType ? ` -> ${returnType}` : '';
        return `${this.getIden(identation + 1)}pub fn ${name}(${parsedArgs})${retStr}`;
    }

    printRustFunctionType(node): string {
        // An internal `: Str` method that proves the conversion prints the
        // native `Option<String>` (its returns run the conversion; callers
        // box back where a `Value` is still needed).
        if (this.rustNativeStrReturnKind(node) === 'str') {
            return 'Option<String>';
        }
        try {
            const checker = this.getChecker();
            if (checker.getReturnTypeOfSignature(checker.getSignatureFromDeclaration(node)).flags === TypeFlags.Void) return '';
        } catch (e) {
            // ignore
        }
        return 'Value';
    }

    printMethodDeclaration(node, identation) {
        const methodDef = this.printMethodDefinition(node, identation);
        const params = node.parameters;
        const optionalParams = params.filter(p => p.initializer !== undefined || p.questionToken !== undefined);

        // Build optional param initializations
        const optionalInits = optionalParams.map((p, idx) => {
            const defaultVal = p.initializer ? this.printNode(p.initializer, 0) : 'Value::Null';
            const name = this.printNode(p.name, 0);
            // A native-`bool` optional keeps the truthiness the use sites applied.
            if (this.rustParamPrintsBool(p)) {
                return `${this.getIden(identation + 2)}let ${name}: bool = get_arg(optional_args, ${idx}, ${defaultVal}).is_truthy();\n`;
            }
            return `${this.getIden(identation + 2)}let ${name} = get_arg(optional_args, ${idx}, ${defaultVal});\n`;
        }).join('');

        const blockOpen = this.getBlockOpen(identation);
        const blockClose = this.getBlockClose(identation);
        const shadows = this.rustParamShadowLines(node, identation + 2);
        // D-27: a `handle*` method's `message: Dict` param gets a borrowed
        // `&IndexMap` shadow so its `safe_*` reads print natively.
        const shadowPlan = this.rustProHandlerShadowPlan(node, identation);
        const savedShadowParam = this.rustProHandlerShadowParam;
        if (shadowPlan !== undefined) this.rustProHandlerShadowParam = shadowPlan.param;
        const statements = node.body.statements.map(s => this.printNode(s, identation + 2)).join('\n');
        this.rustProHandlerShadowParam = savedShadowParam;
        const body = blockOpen + optionalInits + shadows + (shadowPlan?.lines ?? '') + statements + blockClose;

        return this.printNodeCommentsIfAny(node, identation, methodDef + body);
    }

    printFunctionDefinition(node, identation) {
        const name = node.name?.text ?? '';
        const params = node.parameters;
        const parsedArgs = params.map(p => `${this.printNode(p.name, 0)}: Value`).join(', ');
        const returnType = this.printRustFunctionType(node);
        const retStr = returnType ? ` -> ${returnType}` : '';
        return `${this.getIden(identation)}fn ${name}(${parsedArgs})${retStr}`;
    }

    printFunctionDeclaration(node, identation) {
        if (isArrowFunction(node)) {
            const parameters = node.parameters.map(p => `${this.printNode(p.name, 0)}: Value`).join(', ');
            const body = this.printNode(node.body);
            return `|${parameters}| ${body}`;
        }
        const funcDef = this.printFunctionDefinition(node, identation);
        const funcBody = super.printFunctionBody(node, identation);
        return this.printNodeCommentsIfAny(node, identation, funcDef + funcBody);
    }

    printOutOfOrderCallExpressionIfAny(node, identation) {
        if (node.expression.kind !== SyntaxKind.PropertyAccessExpression) {
            return undefined;
        }

        const expr = node.expression;
        const args = node.arguments;

        // Handle this.method(...) calls with optional params
        if (expr.expression.kind === SyntaxKind.ThisKeyword) {
            const methodName = expr.name.text;
            const sig = this.methodSignatures[methodName];
            if (sig) {
                const calleeParams = this.rustCalleeParams(node);
                const printArg = (a, at) => this.rustNativeMapArgumentSlot(calleeParams, at) !== undefined
                    ? this.rustMapArgumentText(a, 0)
                    : this.rustNativeStrVecArgumentSlot(calleeParams, at)
                        ? this.rustStrVecArgumentText(a, 0)
                        : (this.rustNativeBoolArgumentSlot(calleeParams, at)
                            ? this.rustBoolArgumentText(a, 0)
                            : this.printNode(a, 0));
                const printArgs = (list, from = 0) => list.map((a, i) => printArg(a, from + i)).join(', ');
                const requiredArgs = printArgs(args.slice(0, sig.requiredCount));
                const reqPart = requiredArgs ? `${requiredArgs}, ` : '';
                return `self.${methodName}(${reqPart}&[${printArgs(args.slice(sig.requiredCount), sig.requiredCount)}])`;
            }
        }

        return undefined;
    }

    // Arguments in a native-`bool` parameter slot print a Rust `bool`, carrying
    // the truthiness the callee's own use sites applied.
    printArgsForCallExpression(node, identation) {
        const params = this.rustCalleeParams(node);
        if (params === undefined) {
            return super.printArgsForCallExpression(node, identation);
        }
        return Array.from(node.arguments).map((arg, at) => {
            if (this.rustNativeMapArgumentSlot(params, at) !== undefined) {
                return this.rustMapArgumentText(arg, identation);
            }
            if (this.rustNativeStrVecArgumentSlot(params, at)) {
                return this.rustStrVecArgumentText(arg, identation);
            }
            return this.rustNativeBoolArgumentSlot(params, at)
                ? this.rustBoolArgumentText(arg, identation)
                : this.printNode(arg, identation).trim();
        }).join(', ');
    }

    printCallExpression(node, identation) {
        const expression = node.expression;

        // `this.safeString(<shadowed param>, 'k')` — the read inlined against
        // the parameter shadow (D-25). Ahead of the optional-arg dispatch below,
        // which prints the call for any callee with optional parameters
        const shadowSafeRead = this.printShadowSafeReadCall(node);
        if (shadowSafeRead !== undefined) return shadowSafeRead;

        // D-27: `this.safe_*(message, "k")` on a shadowed WS-handler param —
        // the native `.get("k")` match replaces the `safe_*_k` helper call.
        // Checked first: the out-of-order path would print the boxed call for
        const shadowRead = this.printProHandlerShadowRead(node);
        if (shadowRead !== undefined) return shadowRead;

        // Handle console.log specially
        if (expression.kind === SyntaxKind.PropertyAccessExpression) {
            const exprText = expression.getText().trim();
            if (exprText === 'console.log') {
                const args = node.arguments;
                if (args.length === 1) {
                    const argText = this.printNode(args[0], 0).trim();
                    return `println_val(${argText.startsWith('&') ? argText : `&${argText}`})`;
                }
                // Multiple args: print each
                const argParts = Array.from(args).map(a => {
                    const t = this.printNode(a, 0).trim();
                    return t.startsWith('Value::') || !t.startsWith('&') ? `&${t}` : t;
                }).join(', ');
                return `println_val(${argParts})`;
            }
        }

        const outOfOrder = this.printOutOfOrderCallExpressionIfAny(node, identation);
        if (outOfOrder) {
            return this.rustBoxNativeStrCallIfNeeded(node, outOfOrder);
        }

        // `parseInt`/`parseFloat` on a checker-proven string: native `str::parse`
        // instead of the runtime helper the ccxt post-pass would emit.
        const nativeParse = this.printNativeParseCall(node);
        if (nativeParse !== undefined) return nativeParse;

        // `this.json(v)`: `Exchange::json` is exactly the free `json_stringify`, which takes the value
        // by reference, so the call sites' `.clone()` is dropped. `self.<field>` args keep the method:
        // the post-pass hoisting `self.<method>(…)` out of `&mut self` args ignores a `&self.<field>`.
        if (expression.kind === SyntaxKind.PropertyAccessExpression &&
            expression.expression.kind === SyntaxKind.ThisKeyword &&
            expression.name.text === 'json' && node.arguments.length === 1) {
            const argText = this.printNode(node.arguments[0], 0).trim();
            if (!argText.includes('self.')) {
                const withoutClone = argText.replace(/\.clone\(\)$/, '');
                return `json_stringify(${this.ensureRef(withoutClone)})`;
            }
        }

        return this.rustBoxNativeStrCallIfNeeded(node, super.printCallExpression(node, identation));
    }

    printThisKeyword(node, identation) {
        return 'self';
    }

    // Native string args to the runtime error constructors, audited against
    // rust/ccxt-base/src/exchange_errors.rs: `msg` is `impl ToErrorMessage` (`&str`/`String`/`Value`
    // yield the same string) and `create_error`'s class name is `&str` (bare literal only).
    private static readonly RUST_ERROR_CONSTRUCTOR_ARGS: Record<string, ('msg' | 'str')[]> = {
        ...Object.fromEntries((
            'exchange_error authentication_error permission_denied account_not_enabled account_suspended ' +
            'arguments_required bad_request bad_symbol operation_rejected no_change margin_mode_already_set ' +
            'market_closed manual_interaction_needed restricted_location insufficient_funds invalid_address ' +
            'address_pending invalid_order order_not_found order_not_cached order_immediately_fillable ' +
            'order_not_fillable duplicate_order_id contract_unavailable not_supported invalid_proxy_settings ' +
            'exchange_closed_by_user operation_failed network_error d_do_s_protection rate_limit_exceeded ' +
            'exchange_not_available on_maintenance invalid_nonce checksum_error request_timeout bad_response ' +
            'null_response cancel_pending unsubscribe_error '
        ).trim().split(' ').map((n) => [n, ['msg']])),
        create_error: ['str', 'msg'],
    };

    // A string literal prints as the bare `"lit"` (`&str` — no String
    // allocation); a checker-proven string drops the redundant `Value::Str` box.
    printErrorConstructorArg(name: string, index: number, node, identation: number): string {
        const kind = (RustTranspiler as any).RUST_ERROR_CONSTRUCTOR_ARGS[name]?.[index];
        if (kind === undefined) {
            return this.printNode(node, identation);
        }
        if (isStringLiteral(node) && !(node.text in this.StringLiteralReplacements)) {
            return this.quotedStringLiteral(node.text);
        }
        const printed = this.printNode(node, identation).trim();
        if (kind !== 'msg' || !this.rustTypeIsString(node)) {
            return printed;
        }
        const payload = this.peelValueStrBox(printed)
            ?? this.peelValueStrBox(this.stripOuterParens(printed))
            ?? printed;
        // The `Value::Str(..)` box carries the `Cow` conversion; the error
        // ctors take an `impl ToErrorMessage` (String / &str / Value).
        return payload.replace(/\.into\(\)$/, '');
    }

    // `BadRequest` → `bad_request`: the class-to-runtime-fn name the ccxt
    // post-pass applies to `X::new(..)` calls.
    rustErrorConstructorName(className: string): string {
        return this.toSnakeCaseName(className);
    }

    printNewExpression(node, identation) {
        let expression = node.expression?.text;
        expression = expression ? expression : this.printNode(node.expression);
        // Plain `new Error(msg)` becomes just the message Value so it can be
        // formatted by `panic!("{:?}", ...)` in printThrowStatement.
        if (expression === 'Error') {
            const args = node.arguments.map(a => this.printNode(a, identation)).join(', ');
            return args || 'Value::Null';
        }
        // CCXT exception classes end in "Error", "Required", "Found", etc. and
        // are constructed via `new XError(msg)`. Route them through the runtime
        // error constructors (snake_case fn calls).
        const errorClassPattern = /^(?:[A-Z][a-zA-Z]*(?:Error|Required|Found|Failed|Rejected|Available|Exceeded|Limit|Pending|Funds|Address|Order|Cached|Fillable|Closed|Maintenance|Nonce|Timeout|Response|Settings|User|Supported|Implemented|Denied|Enabled|Suspended|Symbol|Change|Unavailable|Proxy|Set|Needed))$/;
        if (typeof expression === 'string' && errorClassPattern.test(expression)) {
            const snake = this.rustErrorConstructorName(expression);
            const args = node.arguments.map((a, index) => this.printErrorConstructorArg(snake, index, a, identation)).join(', ');
            return `crate::exchange_errors::${snake}(${args})`;
        }
        // Classes the ccxt post-pass routes to the same constructors — their
        // message argument is audited too; every other `X::new(..)` prints as
        // before.
        const args = typeof expression === 'string'
            ? node.arguments.map((a, index) => this.printErrorConstructorArg(this.rustErrorConstructorName(expression), index, a, identation)).join(', ')
            : node.arguments.map(a => this.printNode(a, identation)).join(', ');
        return `${expression}::new(${args})`;
    }

    /** `param.member` where `param` is a class-typed parameter, the member is
     *  string-typed and the read is a plain rvalue: `get_value_k(&param, "member")`. */
    printStringMemberOfClassParam(node: any, receiverText: string): string | undefined {
        const receiver = node.expression;
        if (!isIdentifier(receiver) || !isIdentifier(node.name)) return undefined;
        const source = node.getSourceFile ? node.getSourceFile().fileName : '';
        if (typeof source === 'string' && /\/test\//.test(source)) return undefined;
        const member = String(node.name.text);
        if (member === 'length' || member === 'hashmap' || member === 'subscriptions' || member === 'futures') return undefined;
        const declaration = this.rustSingleLocalDeclaration(receiver);
        if (declaration === undefined || !isParameterDeclaration(declaration)) return undefined;
        if (!this.isNativeAccessPositionSafe(node) || this.isNativeWriteTargetBase(node)) return undefined;
        const parent: any = node.parent;
        if (parent !== undefined && ((isPropertyAccessExpression(parent) || isElementAccessExpression(parent)) && parent.expression === node)) return undefined;
        const memberType = this.typeOfNodeIfAny(node);
        if (memberType === undefined || !this.isStringType(memberType.flags)) return undefined;
        const receiverType: any = this.typeOfNodeIfAny(receiver);
        if (receiverType === undefined || !(receiverType.flags & TypeFlags.Object) ||
            !(((typeTarget(receiverType) ?? receiverType).objectFlags) & ObjectFlags.Class)) return undefined;
        return `crate::value::get_value_k(&${receiverText}, ${this.quotedStringLiteral(member)})`;
    }

    printPropertyAccessExpression(node, identation) {
        const transformedProperty = this.transformPropertyAcessExpressionIfNeeded(node);
        if (transformedProperty) {
            return this.getIden(identation) + transformedProperty;
        }

        const rightSide = node.name.text;
        const rawExpression = node.getText().trim();

    if (this.FullPropertyAccessReplacements.hasOwnProperty(rawExpression)) { // eslint-disable-line
      return this.FullPropertyAccessReplacements[rawExpression]; // eslint-disable-line
        }

        const leftExpr = this.printNode(node.expression, 0);

        if (rightSide === 'length') {
            return this.printArrayLength(node, 0, leftExpr);
        }

        // `book.cache` / `book.nonce` on an order-book local (typed, or read off `this.orderbooks`).
        if (isIdentifier(node.name) && isIdentifier(node.expression) && !this.isCastOrParenOperand(node) && this.isNativeAccessPositionSafe(node) && !this.isNativeWriteTargetBase(node)) {
            const bookField = this.printNativeBookFieldRead(leftExpr, node.expression, rightSide, true);
            if (bookField !== undefined) return bookField;
        }

        // Typed field on a checker-proven map local (`x.field`) reads natively;
        // the ccxt post-pass otherwise rewrites it to `get_value(&x, "field")`.
        if (isIdentifier(node.name) && this.isShallowValueReceiver(node.expression) &&
            this.isNativeAccessPositionSafe(node) && !this.isNativeWriteTargetBase(node)) {
            const native = this.printNativeMapAccess(leftExpr, node.expression, String(rightSide));
            if (native) return native;
        }

        // A string-typed data member read off a class-typed parameter (a `Value`
        // in Rust, e.g. `sourceExchange.id`) is the `&str`-key lookup itself; the
        // ccxt field-access pass would turn the bare `x.id` into `get_value`.
        const stringMember = this.printStringMemberOfClassParam(node, leftExpr);
        if (stringMember !== undefined) return stringMember;

        return `${leftExpr}.${rightSide}`;
    }

    // ── native container access (`get_value(...)` -> `.get(...)`) ─────────────
    // When the TypeScript checker proves the receiver is a plain Map/List value
    // and the key is a literal, the runtime `get_value` key-marker / `__live_id`
    // paths cannot apply, so the access is emitted natively. Missing keys still
    // fall back to `Value::Null`.

    /** Methods whose Rust counterpart takes `&mut self`: a `self.<field>` read in
     *  their args must keep the `get_value(...)` shape the ccxt post-pass hoists. */
    static readonly MUT_SELF_METHODS = new Set([
        'watch', 'watch_multiple', 'fetch_order_book_snapshot', 'un_watch',
        'client', 'spawn', 'delay', 'fetch_tickers', 'extend', 'fetch',
        'send_evm_transaction',
    ]);

    /** Global parse helpers that go native (`str::parse`) on a proven string arg,
     *  keyed to the rust integer/float type their runtime helper parses into. */
    static readonly RUST_PARSE_HELPERS: Record<string, string> = {
        parseInt: 'i64',
        parseFloat: 'f64',
    };

    toSnakeCaseName(name: string): string {
        return name.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').replace(/([a-z\d])([A-Z])/g, '$1_$2').toLowerCase();
    }

    escapeRustStringLiteral(text: string): string {
        return String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
            .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    }

    getCheckedTypeOf(node): Type | undefined {
        return this.checkerOrUndefined()?.getTypeAtLocation(node);
    }

    typeSymbolOf(type: Type): TsSymbol | undefined {
        if (type === undefined || type === null) return undefined;
        return type?.getSymbol() ?? type?.getAliasSymbol();
    }

    /** Types declared outside ts/src (Date, Response, Array, Promise, …) are never
     *  backed by a plain `Value` map in the rust port. */
    isLibDeclaredType(type: Type): boolean {
        const declarations: any[] = symbolDeclarations(this.typeSymbolOf(type));
        return declarations.some(d => {
            const file = d?.getSourceFile?.()?.fileName ?? '';
            return /[\\/]lib\.[^\\/]*\.d\.ts$/.test(file) || /[\\/]node_modules[\\/]typescript[\\/]/.test(file);
        });
    }

    isClassInstanceType(type: Type): boolean {
        if (type === undefined) return false;
        if (type.flags & (TypeFlags.Union | TypeFlags.Intersection)) {
            return (typeParts(type) ?? []).some((member) => this.isClassInstanceType(member));
        }
        const symbol: any = this.typeSymbolOf(type) ?? type.getAliasSymbol();
        if (symbol?.flags & SymbolFlags.Class) return true;
        const declarations: any[] = symbolDeclarations(symbol);
        return declarations.some(d => isClassDeclaration(d) || isClassExpression(d));
    }

    hasCallableShape(type: Type): boolean {
        const checker = this.getChecker();
        return checker.getSignaturesOfType(type, SignatureKind.Call).length > 0 ||
            checker.getSignaturesOfType(type, SignatureKind.Construct).length > 0;
    }

    isProvenListType(type: Type): boolean {
        if (!(type.flags & TypeFlags.Object)) return false;
        // Tuple references carry the Tuple flag on their target.
        const objectFlags = ((type as any).objectFlags ?? 0) | ((typeTarget(type)?.objectFlags) ?? 0);
        if (objectFlags & ObjectFlags.Tuple) return true;
        const name = (this.typeSymbolOf(type) as any)?.name;
        if (name === 'Array' || name === 'ReadonlyArray') return true;
        const targetName = (this.typeSymbolOf(typeTarget(type)) as any)?.name;
        return targetName === 'Array' || targetName === 'ReadonlyArray';
    }

    /** True only for object types the rust port represents as `Value::Dict`
     *  (plain interfaces / index-signature / literal types — never classes). */
    isProvenMapType(type: Type): boolean {
        if (type === undefined) return false;
        if (type.flags & TypeFlags.Union) {
            // `Market` / `Currency` / `Order | undefined` style aliases: the runtime value is the dict (or
            // Null), so a map receiver is proven once every value-carrying member is a proven map. An
            // all-dict union without a nullish member stays on the strict path (a class may hide behind it).
            const parts: Type[] = typeParts(type) ?? [];
            const nullish = parts.filter((p) => this.rustTypeIsNullish(p));
            const valueParts = parts.filter((p) => !this.rustTypeIsNullish(p));
            return nullish.length > 0 && valueParts.length > 0 && valueParts.every((p) => this.isProvenMapType(p));
        }
        if (!(type.flags & TypeFlags.Object)) return false;
        if (this.isProvenListType(type)) return false;
        if (this.hasCallableShape(type)) return false;
        if (this.isClassInstanceType(type)) return false;
        if (this.isLibDeclaredType(type)) return false;
        // A named type or a string index signature; a bare `object` proves nothing.
        const hasStringIndex = this.getChecker().getIndexTypeOfType(type, IndexKind.String) !== undefined;
        return hasStringIndex || this.typeSymbolOf(type) !== undefined;
    }

    /** `undefined` / `null` / `void` / `never` — a union member that carries no
     *  runtime value; `Value::Null` is the only box these ever get. */
    rustTypeIsNullish(type: Type): boolean {
        return type !== undefined && (type.flags & (TypeFlags.Undefined | TypeFlags.Null | TypeFlags.Void | TypeFlags.Never)) !== 0;
    }

    isProvenMapExpression(node: Node): boolean {
        return this.isProvenMapType(this.getCheckedTypeOf(node));
    }

    isProvenListExpression(node: Node): boolean {
        if (this.rustIsOrderBookSide(node)) return false;
        const type = this.getCheckedTypeOf(node);
        return type !== undefined && this.isProvenListType(type);
    }

    /** RHS of a generator destructure that provably holds a `Value::Arr`: the
     *  checker-proven list, or a call whose callee returns an array literal on
     *  every path. */
    rustNativeListSource(node: Node): boolean {
        return this.isProvenListExpression(node) || this.rustCallReturnsProvenList(node);
    }

    /** `x.split(sep)` → the runtime `split`, which yields an array on every
     *  path (a non-string receiver gives the empty array, never a dict). */
    rustCallPrintsRuntimeSplit(node: Node): boolean {
        if (!isCallExpression(node) || node.arguments.length === 0) return false;
        const expression: any = node.expression;
        return isPropertyAccessExpression(expression) && expression.expression.kind !== SyntaxKind.ThisKeyword &&
            String(expression.name.text) === 'split';
    }

    /** True when the call's value is always a runtime array: the `handle*AndParams`
     *  family and its exchange overrides declare `any`, so the checker cannot
     *  prove the `[T, Dict]` tuple the body always builds — walk the resolved
     *  callee instead. */
    rustCallReturnsProvenList(node: Node): boolean {
        if (!isCallExpression(node)) return false;
        return this.rustProvenListCall(node, new Set());
    }

    private rustProvenListCall(node: Node, stack: Set<Node>): boolean {
        if (this.rustCallPrintsRuntimeSplit(node)) return true;
        const declaration = this.rustCalleeDeclaration(node);
        return declaration !== undefined && this.rustFunctionReturnsArrayLiteral(declaration, stack);
    }

    /** Implementation of a `x.y(..)` call, when the checker resolves one. */
    private rustCalleeDeclaration(node: Node): Node | undefined {
        if (!isCallExpression(node)) return undefined;
        if (!isPropertyAccessExpression((node as any).expression)) return undefined;
        try {
            return signatureDeclaration((this.getChecker() as any).getResolvedSignature(node));
        } catch (e) {
            return undefined;
        }
    }

    /** Every `return` in the function's own body builds an array literal, or
     *  delegates to a call that does. `throw` and fall-through (the printer's
     *  `Value::Null`) read the same through both forms. */
    private rustFunctionReturnsArrayLiteral(declaration: Node, stack: Set<Node>): boolean {
        if (stack.has(declaration)) return false;
        const body: any = (declaration as any).body;
        if (body === undefined || !isBlock(body)) return false;
        stack.add(declaration);
        try {
            let returns = 0;
            let all = true;
            const visit = (node: Node) => {
                if (!all) return;
                if (node !== body && isFunctionLike(node)) return; // nested closure
                if (isReturnStatement(node)) {
                    returns++;
                    const expression: any = node.expression;
                    all = expression !== undefined && (isArrayLiteralExpression(expression) ||
                        (isCallExpression(expression) && this.rustProvenListCall(expression, stack)) ||
                        (isParenthesizedExpression(expression) && isArrayLiteralExpression(expression.expression)));
                    return;
                }
                node.forEachChild(visit);
            };
            body.forEachChild(visit);
            return all && returns > 0;
        } finally {
            stack.delete(declaration);
        }
    }

    /** Native list-index read of a generator temp (`__destr_tmp.as_array()…`). */
    printNativeListIndex(receiverText: string, index: number, receiverNode?: Node): string {
        // The unshadowed `api` / `section` list of sign/fetch2/request reads its nth through the iterator.
        if (receiverNode !== undefined && this.rustSignApiParam(receiverNode) !== undefined) {
            return `${receiverText}.as_array().into_iter().flatten().nth(${index}).cloned().unwrap_or(Value::Null)`;
        }
        return `${receiverText}.as_array().and_then(|__arr| __arr.get(${index})).cloned().unwrap_or(Value::Null)`;
    }

    /** Element read of a `Vec<Value>` binding (a destructuring temp the printer declares typed). */
    printTypedVecElementRead(name: string, index: number): string {
        return `${name}.get(${index}).cloned().unwrap_or(Value::Null)`;
    }

    /** Native read for one chain level, or undefined to keep `get_value`. */
    // `book['bids'|'asks'|'nonce'|...]` on a checker-typed order-book class: the hand-written
    // `Value::book_field` serves the same shared-store read as `get_value_k`.
    printNativeBookFieldRead(receiverText: string, receiverNode: Node, keyText: string, viaStore = false): string | undefined {
        if (!RustTranspiler.RUST_ORDERBOOK_READ_FIELDS.has(keyText)) return undefined;
        // Test sources keep `get_value(&book, "bids")`: their side-extraction pass matches it.
        if (/\/test\//.test(String((receiverNode as any).getSourceFile?.().fileName ?? ''))) return undefined;
        if (this.rustDictBearerDeclaration(receiverNode) !== undefined || this.rustMapParamDeclaration(receiverNode) !== undefined) return undefined;
        const type = this.typeOfNodeIfAny(receiverNode);
        const name = type === undefined ? undefined : (this.typeSymbolOf(type) as any)?.name;
        if ((name === undefined || !RustTranspiler.RUST_ORDERBOOK_CLASSES.has(name)) && !(viaStore && this.rustReadsOrderbooksStore(receiverNode))) return undefined;
        return `${receiverText}.book_field("${keyText}")`;
    }

    printNativeContainerAccess(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined {
        // A read-only bearer holds the container itself.
        const readBearer = this.rustReadBearerKind(receiverNode);
        if (readBearer !== undefined) {
            const native = this.printReadBearerAccess(readBearer, receiverText, keyNode);
            if (native !== undefined) return native;
        }
        // A shadowed parameter reads through the borrowed container.
        const shadow = this.rustParamShadowOf(receiverNode);
        if (shadow !== undefined) {
            const native = this.printShadowContainerRead(shadow, keyNode);
            if (native !== undefined) return native;
        }
        if (isStringLiteralLikeNode(keyNode)) {
            const bookField = this.printNativeBookFieldRead(receiverText, receiverNode, keyNode.text);
            if (bookField !== undefined) return bookField;
            return this.printNativeMapAccess(receiverText, receiverNode, keyNode.text) ?? this.rustLocalDictLiteralRead(receiverText, receiverNode, keyNode.text);
        }
        if (isNumericLiteral(keyNode)) {
            const index = Number(keyNode.text);
            if (!Number.isInteger(index) || index < 0) return undefined;
            if (this.rustVecLocalDeclarationOf(receiverNode) !== undefined) {
                // A typed `Vec<Value>` local reads through the slice.
                return `${receiverText}.get(${index}).cloned().unwrap_or(Value::Null)`;
            }
            if (!this.isProvenListExpression(receiverNode) && !this.arrReadLocal(receiverNode)) return undefined;
            return this.printNativeListIndex(receiverText, index, receiverNode);
        }
        const dictRead = this.rustBearerDictDynamicRead(receiverText, receiverNode, keyNode) ?? this.printNativeDynamicMapAccess(receiverText, receiverNode, keyNode) ?? this.printNativeThisFieldDynamicMapAccess(receiverText, receiverNode, keyNode)
            ?? this.rustDynamicRead(receiverText, receiverNode, keyNode) ?? this.rustFieldDynamicRead(receiverText, receiverNode, keyNode)
            ?? this.rustLocalDictRead(receiverText, receiverNode, keyNode);
        if (dictRead !== undefined) return dictRead;
        // A non-literal index (the `for (let i = 0; …)` counter) into a
        // checker-proven list reads natively too.
        return this.printNativeDynamicListIndex(receiverText, receiverNode, keyNode) ?? this.listArithIndex(receiverText, receiverNode, keyNode);
    }

    /** `get_value(&X, &i)` for a checker-proven list `X` and a dynamic integer
     *  index local `i`: the runtime's own array branch, spelled natively.
     *  `get_value` reaches its array arm for an `Arr` receiver and its default
     *  (`Value::Null`) otherwise, so the emitted match reproduces both — an
     *  `Int` index by value (a negative or out-of-range index misses), a
     *  numeric string by parse, anything else a miss. */
    printNativeDynamicListIndex(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined {
        if (!this.isProvenListExpression(receiverNode) && !this.arrReadLocal(receiverNode)) return undefined;
        if (this.rustVecLocalDeclarationOf(receiverNode) !== undefined) {
            // A typed `Vec<Value>` local reads through the slice.
            if (!this.isRustValueIndexKey(keyNode) || this.isWriteBackBindRead(keyNode.parent)) return undefined;
            const place = this.printNode(keyNode, 0).trim();
            if (!place || place.startsWith('&')) return undefined;
            return `${receiverText}.get((${place}).as_i64().unwrap_or(-1) as usize).cloned().unwrap_or(Value::Null)`;
        }
        if (!this.isRustValueIndexKey(keyNode)) return undefined;
        // The ccxt `writeBackIndexedMutations` pass matches the `let x = get_value(&C, &K)` text to
        // write a mutated `x` back into `C[K]`; native text is invisible to it, so a bind the next
        // statement mutates keeps the helper.
        if (this.isWriteBackBindRead(keyNode.parent)) return undefined;
        const keyText = this.printNode(keyNode, 0).trim();
        // A text that already carries the post-pass `&` is not a place.
        if (!keyText || keyText.startsWith('&')) return undefined;
        if (this.rustI64CounterOf(this.rustSkipWrappers(keyNode)) !== undefined) {
            return `${receiverText}.as_array().map(Vec::as_slice).unwrap_or_default().get(${keyText} as usize).cloned().unwrap_or(Value::Null)`;
        }
        return `${receiverText}.as_array().and_then(|__arr| match &${keyText} { Value::Int(__n) => __arr.get(*__n as usize), Value::Str(__s) => __s.parse::<usize>().ok().and_then(|__n| __arr.get(__n)), _ => None }).cloned().unwrap_or(Value::Null)`;
    }

    /** True when this read initialises a local that the very next statement in
     *  the same block mutates (`x['k'] = v` -> `add_element_to_object(&mut x…)`,
     *  `x.push(v)` -> `append_to_array(&mut x…)`). */
    isWriteBackBindRead(read: Node): boolean {
        const declaration: any = read === undefined ? undefined : read.parent;
        if (declaration === undefined || !isVariableDeclaration(declaration) || declaration.initializer !== read) return false;
        if (!isIdentifier(declaration.name)) return false;
        const name = String(declaration.name.text);
        let statement: any = declaration;
        while (statement !== undefined && !isStatement(statement)) statement = statement.parent;
        const siblings: any[] = statement?.parent?.statements ?? [];
        const at = siblings.indexOf(statement);
        if (at < 0 || at + 1 >= siblings.length) return false;
        return this.rustStatementMutatesLocal(siblings[at + 1], name);
    }

    /** A statement containing a write into a local (`x['k'] = v`, `x.k = v`,
     *  `x.push(v)`). */
    rustStatementMutatesLocal(node: Node, name: string): boolean {
        let mutated = false;
        const visit = (n: Node) => {
            if (mutated) return;
            if ((isBinaryExpression(n) && rustIsAssignmentOperator(n.operatorToken.kind) && this.rootPlaceText(n.left) === name) ||
                (isCallExpression(n) && isPropertyAccessExpression(n.expression) &&
                n.expression.name.text === 'push' && this.rootPlaceText(n.expression.expression) === name)) {
                mutated = true;
                return;
            }
            n.forEachChild(visit);
        };
        node.forEachChild(visit);
        return mutated;
    }

    /** A dynamic index the printer emits as a `Value` number: a `let x = <numeric
     *  literal>` declaration of the same function (the C-style loop counter).
     *  Any other shape keeps the helper — the printed local could be a native
     *  `i64`/`f64`, which the `Value` match would not compile against. */
    isRustValueIndexKey(node: Node): boolean {
        const current: any = this.rustSkipWrappers(node);
        if (!isIdentifier(current)) return false;
        const type = this.getCheckedTypeOf(current);
        if (type === undefined || !(type.flags & (TypeFlags.Number | TypeFlags.NumberLiteral))) return false;
        const declaration: any = this.rustDeclarationOfIdentifier(current);
        if (declaration === undefined || !isVariableDeclaration(declaration) || declaration.initializer === undefined) return false;
        return isNumericLiteral(this.rustSkipWrappers(declaration.initializer));
    }

    /** Strips `( )`, `as T` and `!` wrappers. */
    rustSkipWrappers(node: any): any {
        while (node !== undefined && (isParenthesizedExpression(node) || isAsExpression(node) || isNonNullExpression(node))) node = node.expression;
        return node;
    }

    // Typed-parameter dict reads: a checker-proven plain dict param (`Dict`, `Dictionary<T>`,
    // `Market`-style alias) holds the dict or `Value::Null`, so `get_value`'s marker routes cannot
    // fire and the read is `m.get(k)`. The key must be a proven `Str` box so `.as_str()` reproduces it.

    /** The parameter declaration behind a receiver when its *annotation* proves
     *  a plain dict; undefined otherwise (no proof → keep the helper). */
    rustProvenDictParameter(node: Node): ParameterDeclaration | undefined {
        const declaration: any = this.rustDeclarationOfIdentifier(node);
        if (declaration === undefined || !isParameterDeclaration(declaration)) return undefined;
        if (declaration.type === undefined) return undefined;
        const type = this.getCheckedTypeOf(declaration.type);
        if (type === undefined || !this.isProvenMapType(type)) return undefined;
        // D2: a later write can change the kind.
        return this.rustLocalIsReassigned(declaration, String((declaration.name as any).text)) ? undefined : declaration;
    }

    /** `Str` (`string | undefined`) — the key box is `Value::Str` or Null. */
    rustKeyIsProvenString(node: Node): boolean {
        const type = this.getCheckedTypeOf(node);
        if (type === undefined) return false;
        const parts: Type[] = (type.flags & TypeFlags.Union) ? (typeParts(type) ?? []) : [type];
        let strings = 0;
        for (const part of parts) {
            if (part.flags & (TypeFlags.String | TypeFlags.StringLiteral)) {
                strings++;
                continue;
            }
            if (this.rustTypeIsNullish(part)) continue;
            return false;
        }
        return strings > 0;
    }

    /** The local/parameter proof of a dynamic-key map read: a parameter whose
     *  annotation proves a plain dict (B-25), or any local whose checker type
     *  proves a plain map and which nothing in the enclosing function
     *  re-assigns (D2). Returns the proven declaration. */
    rustProvenDynamicMapReceiver(node: Node): Declaration | undefined {
        const parameter = this.rustProvenDictParameter(node);
        if (parameter !== undefined) return parameter;
        if (!isIdentifier(node)) return undefined;
        const declaration: any = this.rustDeclarationOfIdentifier(node);
        if (declaration === undefined || !isVariableDeclaration(declaration)) return undefined;
        if (declaration.initializer === undefined) return undefined;
        if (!this.isProvenMapExpression(node)) return undefined;
        if (this.rustLocalIsReassigned(declaration, String(node.text))) return undefined;
        return declaration;
    }

    /** The element-access read a key node belongs to (`x[k]`, `x[(k)]`). */
    rustElementReadOfKey(keyNode: Node): Node | undefined {
        let current: any = keyNode;
        while (current !== undefined && (isParenthesizedExpression(current) || isAsExpression(current) || isNonNullExpression(current))) {
            current = current.parent;
        }
        const parent: any = current === undefined ? undefined : current.parent;
        if (parent === undefined || !isElementAccessExpression(parent) || parent.argumentExpression !== current) return undefined;
        return parent;
    }

    /** `x[k]` where `x` is a proven-dict parameter and `k` a proven string. */
    printNativeDynamicMapAccess(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined {
        if (this.rustProvenDynamicMapReceiver(receiverNode) === undefined) return undefined;
        if (!this.rustKeyIsProvenString(keyNode)) return undefined;
        // The ccxt `writeBackIndexedMutations` pass matches the
        // `let x = get_value(&C, &K)` text to write a mutated `x` back into
        // `C[K]`; the native text is invisible to it, so a bind the next
        const read = this.rustElementReadOfKey(keyNode);
        if (read !== undefined && this.isWriteBackBindRead(read)) return undefined;
        const keyText = this.printNode(keyNode, 0).trim();
        // A plain place keeps the borrow local; a call/temporary text does not.
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyText)) return undefined;
        if (this.rustNodeIsKeyUnsafePlace(keyText)) return undefined;
        return this.rustDictRead(receiverText, keyText, receiverNode);
    }

    /** Keys `get_value` serves from the book store / cache bucket / live
     *  snapshot instead of the dict itself — a dynamic read cannot prove the
     *  key away, so a place named after one stays boxed. */
    rustNodeIsKeyUnsafePlace(keyText: string): boolean {
        return RustTranspiler.RUST_DICT_LOCAL_UNSAFE_KEYS.has(keyText);
    }

    // ── parameter shadows (`let x = x.as_map().unwrap_or(&__x_empty)`) ─────────
    //
    // A `Dict`/`List` parameter holds the container or `Value::Null`, and

    private paramShadowCache: { src: SourceFile, tables: Map<Node, Map<string, RustParamShadow>> } | undefined;

    /** Functions whose shadow lines were actually emitted — a read converts
     *  only inside one of those (an arrow body prints inline and gets none). */
    private paramShadowEmitted: { src: SourceFile, fns: Set<Node> } | undefined;

    private rustParamShadowEmittedSet(): Set<Node> {
        const src = this.getSrc();
        if (this.paramShadowEmitted === undefined || this.paramShadowEmitted.src !== src) {
            this.paramShadowEmitted = { src, fns: new Set() };
        }
        return this.paramShadowEmitted.fns;
    }

    rustParamShadowTables(): Map<Node, Map<string, RustParamShadow>> {
        const src = this.getSrc();
        if (this.paramShadowCache === undefined || this.paramShadowCache.src !== src) {
            this.paramShadowCache = { src, tables: new Map() };
        }
        return this.paramShadowCache.tables;
    }

    /** Emitted shadow lines for a function, or '' when no parameter qualifies.
     *  The caller must use this before printing the body statements (it both
     *  registers the function as shadowed and computes the lines). */
    rustParamShadowLines(fn: Node, identation: number): string {
        const table = this.rustParamShadowTable(fn);
        if (table.size === 0) return '';
        const idn = this.getIden(identation);
        const lines: string[] = [];
        for (const shadow of table.values()) {
            const empty = `__${shadow.name}_empty`;
            if (this.rustFunctionDeclaresName(fn, empty)) continue;
            const map = shadow.kind === RUST_PARAM_SHADOWS.MAP;
            const accessor = map ? 'as_map' : 'as_array';
            lines.push(`${idn}let ${empty} = ${map ? 'indexmap::IndexMap::new()' : 'Vec::new()'};`);
            lines.push(`${idn}let ${shadow.name} = ${shadow.name}.${accessor}().unwrap_or(&${empty});`);
        }
        if (lines.length === 0) return '';
        this.rustParamShadowEmittedSet().add(fn);
        return lines.join('\n') + '\n';
    }

    private rustParamShadowTable(fn: Node): Map<string, RustParamShadow> {
        const tables = this.rustParamShadowTables();
        let table = tables.get(fn);
        if (table === undefined) {
            try {
                table = this.collectRustParamShadows(fn);
            } catch (e) {
                table = new Map(); // no proof -> every read keeps its helper
            }
            tables.set(fn, table);
        }
        return table;
    }

    /** The shadow a read receiver resolves to, or undefined (no proof → helper). */
    rustParamShadowOf(node: Node): RustParamShadow | undefined {
        const current: any = this.rustSkipWrappers(node);
        if (current === undefined || !isIdentifier(current)) return undefined;
        const name = String(current.text);
        const declaration = this.rustDeclarationOfIdentifier(current);
        if (declaration === undefined || !isParameterDeclaration(declaration)) return undefined;
        const emitted = this.rustParamShadowEmittedSet();
        let scope: any = current.parent;
        while (scope !== undefined) {
            if (isFunctionLike(scope)) {
                const entry = emitted.has(scope) ? this.rustParamShadowTable(scope).get(name) : undefined;
                if (entry !== undefined && entry.declaration === declaration) return entry;
            }
            scope = scope.parent;
        }
        return undefined;
    }

    /** True when the enclosing function already binds this name somewhere. */
    private rustFunctionDeclaresName(fn: Node, name: string): boolean {
        let found = false;
        this.rustWalkScope(fn, (node: Node) => {
            if (isFunctionLike(node)) return RUST_WALK_SKIP; // nested closure: own scope
            if ((isVariableDeclaration(node) || isParameterDeclaration(node)) && isIdentifier(node.name) && node.name.text === name) {
                found = true;
                return RUST_WALK_STOP;
            }
        });
        return found;
    }

    private collectRustParamShadows(fn: Node): Map<string, RustParamShadow> {
        const table = new Map<string, RustParamShadow>();
        const parameters: any[] = (fn as any).parameters ?? [];
        const body: any = (fn as any).body;
        if (body === undefined) return table;
        for (const param of parameters) {
            if (!isParameterDeclaration(param) || !isIdentifier(param.name)) continue;
            const name = String(param.name.text);
            if (name === 'optional_args') continue;
            if (param.type === undefined) continue;
            const type = this.getCheckedTypeOf(param.type);
            if (type === undefined) continue;
            // A ws order-book parameter is a `Value::Dict` in the port, but its TS class
            // carries methods, so only literal-key reads are proven for it.
            const wsDict = !this.isProvenMapType(type) && this.rustWsOrderBookClassType(type);
            const kind: RustParamShadowKind | undefined = (this.isProvenMapType(type) || wsDict) ? RUST_PARAM_SHADOWS.MAP :
                this.isProvenShadowListType(type) ? RUST_PARAM_SHADOWS.LIST : undefined;
            if (kind === undefined) continue;
            if (this.rustParameterIsClientHandle(param)) continue;
            if (this.rustParamShadowUseCensus(fn, param, kind, wsDict) === undefined) continue;
            table.set(name, { kind, name, declaration: param });
        }
        return table;
    }

    /** A checker-proven array parameter type (`Vec<Value>` on the rust side);
     *  tuples are excluded (their printed shape is not a plain `Vec`). */
    isProvenShadowListType(type: Type): boolean {
        if (type === undefined) return false;
        if (!(type.flags & TypeFlags.Object)) return false;
        const objectFlags = ((type as any).objectFlags ?? 0) | ((typeTarget(type)?.objectFlags) ?? 0);
        if (objectFlags & ObjectFlags.Tuple) return false;
        if (this.hasCallableShape(type)) return false;
        if (this.isClassInstanceType(type)) return false;
        const name = (this.typeSymbolOf(type) as any)?.name;
        if (name === 'Array' || name === 'ReadonlyArray') return true;
        const targetName = (this.typeSymbolOf(typeTarget(type)) as any)?.name;
        return targetName === 'Array' || targetName === 'ReadonlyArray';
    }

    /** Every reference to the parameter must be a printable read, and at least
     *  one must exist; anything else (a write, a `Value` pass-through, a Null
     *  comparison, a marker key) answers undefined and the parameter keeps its
     *  box. */
    private rustParamShadowUseCensus(fn: Node, param: ParameterDeclaration, kind: RustParamShadowKind, literalKeys = false): { reads: number } | undefined {
        const name = String((param.name as Identifier).text);
        const paramSymbol = this.rustSymbolOf(param.name as Identifier);
        if (paramSymbol === undefined) return undefined;
        let reads = 0;
        let ok = true;
        const visit = (node: Node) => {
            if (!ok) return;
            if (isIdentifier(node) && node.text === name && node !== param.name) {
                if (this.rustSymbolOf(node) !== paramSymbol || !this.rustParamUseIsRead(node, kind, literalKeys)) {
                    ok = false;
                    return;
                }
                reads++;
            }
            node.forEachChild(visit);
        };
        (fn as any).body.forEachChild(visit);
        return ok && reads > 0 ? { reads } : undefined;
    }

    /** One reference of a shadow candidate: true only for a read the shadow can
     *  print exactly (same proofs the emitted forms re-check). */
    private rustParamUseIsRead(id: Identifier, kind: RustParamShadowKind, literalKeys = false): boolean {
        const parent: any = id.parent;
        if (parent === undefined) return false;
        // `x[k]` — element read. Writes (`x[k] = v`, `x[k].push(..)`) and the
        // post-pass write-back binds keep the box.
        if (isElementAccessExpression(parent) && parent.expression === id) {
            if (this.isNativeWriteTargetBase(id)) return false;
            if (!this.isNativeAccessPositionSafe(id)) return false;
            if (this.isWriteBackBindRead(parent)) return false;
            if (literalKeys) return this.rustShadowKeyIsLiteral(parent.argumentExpression);
            return this.rustShadowKeyIsReadable(parent.argumentExpression, kind);
        }
        // `x.length` — array length read.
        if (isPropertyAccessExpression(parent) && parent.expression === id) {
            return kind === RUST_PARAM_SHADOWS.LIST && String(parent.name.text) === 'length';
        }
        // `'k' in x` / `k in x`.
        if (isBinaryExpression(parent) && parent.operatorToken.kind === SyntaxKind.InKeyword && parent.right === id) {
            if (kind !== RUST_PARAM_SHADOWS.MAP) return false;
            if (literalKeys) return this.rustShadowKeyIsLiteral(parent.left);
            return this.rustShadowKeyIsReadable(parent.left, RUST_PARAM_SHADOWS.MAP);
        }
        // `this.safe<Type>(x, 'k'[, default])` — the read families the shadow
        // inlines (literal keys only). Any other call keeps the box.
        if (isCallExpression(parent) && kind === RUST_PARAM_SHADOWS.MAP) {
            if (this.rustShadowSafeCallee(parent) === undefined) return false;
            const args: NodeArray<Expression> = parent.arguments;
            if (args[0] !== id || args.length < 2 || args.length > 3) return false;
            return this.rustShadowKeyIsLiteral(args[1]);
        }
        return false;
    }

    /** A key a shadow read can print: dicts take a bare string literal or a
     *  proven-string place, lists a literal non-negative index; the `safe_*`
     *  inline takes the literal key form only. Marker-route key names and keys
     *  whose text needs escaping are excluded. */
    private rustShadowKeyIsReadable(key: any, kind: RustParamShadowKind): boolean {
        if (key === undefined) return false;
        if (kind === RUST_PARAM_SHADOWS.MAP) {
            if (isStringLiteralLikeNode(key)) return this.rustShadowKeyIsLiteral(key);
            if (isIdentifier(key)) {
                return this.rustKeyIsProvenString(key) && !this.rustNodeIsKeyUnsafePlace(String(key.text));
            }
            return false;
        }
        if (isNumericLiteral(key)) {
            const index = Number(key.text);
            return Number.isInteger(index) && index >= 0;
        }
        // A loop-counter place (`for (let i = 0; ...)`) is a `Value::Int` on
        // every path, so the slice read below answers the helper's Int arm.
        return this.isRustValueIndexKey(key);
    }

    private rustShadowKeyIsLiteral(key: any): boolean {
        if (key === undefined || !isStringLiteralLikeNode(key)) return false;
        const text = String(key.text);
        return this.rustShadowKeyLiteral(text) && !this.rustNodeIsKeyUnsafePlace(text);
    }

    /** Keys whose text is safe to inline into a rust string literal. */
    private rustShadowKeyLiteral(text: string): boolean {
        return /^[A-Za-z0-9_./-]*$/.test(text) && text.length > 0;
    }

    /** `this.safeString`-style callee of a call, or undefined. */
    private rustShadowSafeCallee(node: CallExpression): string | undefined {
        const callee: any = (node as any).expression;
        if (callee === undefined || !isPropertyAccessExpression(callee)) return undefined;
        if (callee.expression.kind !== SyntaxKind.ThisKeyword) return undefined;
        const name = String(callee.name.text);
        return RUST_PARAM_SHADOWS.SAFE_READS.has(name) ? name : undefined;
    }

    /** `x['k']` / `x[i]` / `'k' in x` on a shadowed parameter: the native read, or undefined to keep
     *  the helper (the shadow proof guarantees it never happens for an emitted shadow). */
    printShadowContainerRead(shadow: RustParamShadow, keyNode: Node): string | undefined {
        const key: any = keyNode;
        if (shadow.kind === RUST_PARAM_SHADOWS.MAP) {
            const k = this.rustShadowMapKey(key);
            if (k === undefined) return undefined;
            return k.literal !== undefined ? `${shadow.name}.get("${k.literal}").cloned().unwrap_or(Value::Null)`
                : this.rustShadowKeyRead(shadow.name, k.place, keyNode);
        }
        if (isNumericLiteral(key)) {
            const index = Number(key.text);
            if (!Number.isInteger(index) || index < 0) return undefined;
            return `${shadow.name}.get(${index}).cloned().unwrap_or(Value::Null)`;
        }
        if (!this.isRustValueIndexKey(key)) return undefined;
        const place = this.printNode(key, 0).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(place)) return undefined;
        return `${shadow.name}.get((${place}).as_i64().unwrap_or(-1) as usize).cloned().unwrap_or(Value::Null)`;
    }

    /** `'k' in x` on a shadowed dict parameter. */
    printShadowInOperator(shadow: RustParamShadow, keyNode: Node): string | undefined {
        if (shadow.kind !== RUST_PARAM_SHADOWS.MAP) return undefined;
        const k = this.rustShadowMapKey(keyNode);
        if (k === undefined) return undefined;
        return k.literal !== undefined ? `Value::Bool(${shadow.name}.contains_key("${k.literal}"))`
            : `Value::Bool(${this.rustShadowKeyHas(shadow.name, k.place, keyNode)})`;
    }

    /** A shadow dict key: an inlinable literal, or a proven-string plain place. */
    private rustShadowMapKey(key: any): { literal?: string, place?: string } | undefined {
        if (isStringLiteralLikeNode(key)) {
            const text = String(key.text);
            return this.rustShadowKeyLiteral(text) && !this.rustNodeIsKeyUnsafePlace(text) ? { literal: text } : undefined;
        }
        if (!isIdentifier(key) || !this.rustKeyIsProvenString(key) || this.rustNodeIsKeyUnsafePlace(String(key.text))) return undefined;
        const place = this.printNode(key, 0).trim();
        return /^[A-Za-z_][A-Za-z0-9_]*$/.test(place) ? { place } : undefined;
    }

    /** `x.length` on a shadowed list parameter — `get_array_length` natively. */
    printShadowLength(shadow: RustParamShadow): string | undefined {
        if (shadow.kind !== RUST_PARAM_SHADOWS.LIST) return undefined;
        return `Value::Int(${shadow.name}.len() as i64)`;
    }

    /** `this.safe<Type>(x, 'k'[, default])` on a shadowed dict parameter: the
     *  runtime helper's exact semantics over `.get(..)`. */
    printShadowSafeReadCall(node: CallExpression): string | undefined {
        const callee = this.rustShadowSafeCallee(node);
        if (callee === undefined) return undefined;
        const args: any[] = (node as any).arguments ?? [];
        if (args.length < 2 || args.length > 3) return undefined;
        const shadow = this.rustParamShadowOf(args[0]);
        if (shadow === undefined || shadow.kind !== RUST_PARAM_SHADOWS.MAP) return undefined;
        const key: any = args[1];
        if (!isStringLiteralLikeNode(key)) return undefined;
        const text = String(key.text);
        if (!this.rustShadowKeyLiteral(text) || this.rustNodeIsKeyUnsafePlace(text)) return undefined;
        const fallback = args.length === 3 ? this.printNode(args[2], 0).trim() : 'Value::Null';
        const get = `${shadow.name}.get("${text}")`;
        // The ccxt post-pass strips the `;` of a statement ending in `};`
        // (`[/\};(\s*\n)/g, '}$1']`), so the match — like the printer's other
        // block-valued expressions — is parenthesized.
        const wrap = (text: string) => `(${text})`;
        switch (callee) {
        case 'safeValue':
            return wrap(`match ${get} { Some(__v) if !matches!(__v, Value::Null) && !matches!(__v, Value::Str(__s) if __s.is_empty()) => __v.clone(), _ => ${fallback} }`);
        case 'safeString':
            return wrap(`match ${get} { Some(Value::Str(__s)) if !__s.is_empty() => Value::Str(__s.clone()), Some(Value::Int(__n)) => Value::Str(__n.to_string().into()), Some(Value::Float(__f)) => Value::Str(__f.to_string().into()), _ => ${fallback} }`);
        case 'safeInteger':
            return wrap(`match ${get} { Some(Value::Int(__n)) => Value::Int(*__n), Some(Value::Float(__f)) => Value::Int(*__f as i64), Some(Value::Str(__s)) => match __s.parse::<i64>() { Ok(__n) => Value::Int(__n), Err(_) => match __s.parse::<f64>() { Ok(__f) if __f.is_finite() => Value::Int(__f as i64), _ => ${fallback} } }, _ => ${fallback} }`);
        case 'safeNumber':
            return wrap(`match ${get} { Some(Value::Float(__f)) => Value::Float(*__f), Some(Value::Int(__n)) => Value::Float(*__n as f64), Some(Value::Str(__s)) => match __s.parse::<f64>() { Ok(__n) => Value::Float(__n), Err(_) => ${fallback} }, _ => ${fallback} }`);
        case 'safeBool':
            return wrap(`match ${get} { Some(Value::Bool(__b)) => Value::Bool(*__b), _ => ${fallback} }`);
        case 'safeDict':
            return wrap(`match ${get} { Some(__v) if matches!(__v, Value::Dict(_)) => __v.clone(), _ => ${fallback} }`);
        case 'safeList':
            return wrap(`match ${get} { Some(__v) if matches!(__v, Value::Arr(_)) => __v.clone(), _ => ${fallback} }`);
        }
        return undefined;
    }

    // ── pro-tier WS handler `message` shadow (D-27) ───────────────────────────
    // `handle_x (client: Client, message: Dict)` is dispatched by NAME with
    // `Value` args, so the printed signature keeps `Value`; the annotation still

    /** The borrowed view bound by the shadow. */
    private static readonly PRO_HANDLER_SHADOW_NAME = '__pro_message';

    /** TS helper name -> emitted match kind. */
    private static readonly PRO_HANDLER_SHADOW_SAFE_READS: Record<string, string> = {
        'safeValue': 'value',
        'safeString': 'string',
        'safeInteger': 'integer',
        'safeNumber': 'float',
        'safeFloat': 'float',
        'safeDict': 'dict',
        'safeList': 'list',
        'safeBool': 'bool',
    };

    /** The `message: Dict` parameter of a WS handler method (2nd param of a
     *  `handle*` method), undefined when unproven or written (D2). */
    rustProHandlerMessageParam(node: Node): ParameterDeclaration | undefined {
        if (node === undefined || !isMethodDeclaration(node) || node.body === undefined) return undefined;
        const params: any[] = (node.parameters ?? []) as any;
        if (params.length < 2) return undefined;
        const methodName: any = node.name;
        if (methodName === undefined || !/^handle[A-Z]/.test(String(methodName.text ?? ''))) return undefined;
        const param: any = params[1];
        if (param === undefined || !isIdentifier(param.name) || param.type === undefined) return undefined;
        // The ws-handler shape `handle_x (client: Client, message: Dict)`: the
        // message is a required parameter and the first one is the Client
        // class handle. (Base helpers like `handleMarginModeAndParams
        if (param.initializer !== undefined || param.questionToken !== undefined) return undefined;
        const clientParam: any = params[0];
        if (clientParam === undefined || clientParam.type === undefined) return undefined;
        const clientType = this.getCheckedTypeOf(clientParam.type);
        if (clientType === undefined || !this.isClassInstanceType(clientType)) return undefined;
        const type = this.getCheckedTypeOf(param.type);
        if (type === undefined || !this.isProvenMapType(type)) return undefined;
        const name = String(param.name.text);
        return this.rustProHandlerParamIsWritten(param, name) ? undefined : param;
    }

    /** D2: a write rooted at the parameter (reassignment, element/property
     *  write, a merge/splice onto it) can reshape the dict after the shadow is
     *  taken — the shadow is skipped and every read keeps the helper. */
    rustProHandlerParamIsWritten(param: ParameterDeclaration, name: string): boolean {
        if (this.rustLocalIsReassigned(param, name)) return true;
        const scope = this.rustEnclosingFunction(param);
        if (scope === undefined) return true;
        if (this.rustStatementMutatesLocal(scope, name)) return true;
        const merging = ['deepExtend', 'extend', 'addElementToObject', 'remove'];
        let written = false;
        this.rustWalkScope(scope, (n: Node) => {
            if (isCallExpression(n) && n.arguments.length > 0 && isIdentifier(n.arguments[0]) && (n.arguments[0] as any).text === name) {
                const callee: any = n.expression;
                written = merging.includes(isPropertyAccessExpression(callee) ? String(callee.name?.text ?? '') :
                    isIdentifier(callee) ? String(callee.text ?? '') : '');
                if (written) return RUST_WALK_STOP;
            }
        });
        return written;
    }

    /** Shadow plan for a handler: the parameter plus the two binding lines,
     *  present only when some body read actually turns native (no dead shed). */
    rustProHandlerShadowPlan(node: Node, identation: number): { param: ParameterDeclaration, lines: string } | undefined {
        const param = this.rustProHandlerMessageParam(node);
        if (param === undefined) return undefined;
        // a D-25 parameter shadow already rebinds the name to the borrowed map; its reads are native
        if (this.rustParamShadowTable(node).has(String((param.name as any).text))) return undefined;
        const saved = this.rustProHandlerShadowParam;
        this.rustProHandlerShadowParam = param;
        let hasRead = false;
        const scope = this.rustEnclosingFunction(param);
        this.rustWalkScope(scope, (n: Node) => {
            if (isCallExpression(n) && this.printProHandlerShadowRead(n, true) !== undefined) {
                hasRead = true;
                return RUST_WALK_STOP;
            }
        });
        this.rustProHandlerShadowParam = saved;
        if (!hasRead) return undefined;
        const name = String((param.name as any).text);
        const view = RustTranspiler.PRO_HANDLER_SHADOW_NAME;
        const arc = `${view}_arc`;
        const map = 'indexmap::IndexMap<String, Value>';
        const ind = this.getIden(identation + 2);
        // an owned Arc clone keeps the shadow from borrowing the parameter (it may move later)
        const lines =
            `${ind}let ${arc}: std::sync::Arc<${map}> = (if let Value::Dict(__d) = &${name} { __d.clone() } else { std::sync::Arc::new(indexmap::IndexMap::new()) });\n` +
            `${ind}let ${view}: &${map} = &${arc};\n`;
        return { param, lines };
    }

    /** The `safe_*` call on the shadowed parameter prints as a native
     *  `.get("k")` match, or undefined when the call is not one. In `probe`
     *  mode the shape is checked without printing (the pre-scan must not print
     *  a node twice). */
    printProHandlerShadowRead(node: Node, probe = false): string | undefined {
        const param = this.rustProHandlerShadowParam;
        if (param === undefined || node === undefined || !isCallExpression(node)) return undefined;
        const callee: any = node.expression;
        if (callee === undefined || !isPropertyAccessExpression(callee)) return undefined;
        if (callee.expression.kind !== SyntaxKind.ThisKeyword) return undefined;
        const kind = RustTranspiler.PRO_HANDLER_SHADOW_SAFE_READS[String(callee.name?.text ?? '')];
        if (kind === undefined) return undefined;
        const args: any[] = (node.arguments ?? []) as any;
        if (args.length < 2 || args.length > 3) return undefined;
        const receiver: any = args[0];
        if (receiver === undefined || receiver.kind !== SyntaxKind.Identifier) return undefined;
        if (this.rustDeclarationOfIdentifier(receiver) !== param) return undefined;
        const key: any = args[1];
        if (key === undefined || !isStringLiteral(key)) return undefined;
        const keyText = key.text;
        if (keyText === '' || RustTranspiler.RUST_DICT_LOCAL_UNSAFE_KEYS.has(keyText)) return undefined;
        if (args.length === 3 && !this.rustProHandlerShadowDefaultShape(args[2])) return undefined;
        if (probe) return 'native';
        const dflt = args.length === 3 ? this.rustProHandlerShadowDefault(args[2]) : 'Value::Null';
        if (dflt === undefined) return undefined;
        return this.rustProHandlerShadowReadText(kind, this.escapeRustStringLiteral(keyText), dflt);
    }

    /** A miss-arm default the match can hold: absent (`Value::Null`) or a
     *  literal; a computed default keeps the helper (its Value is not
     *  re-printable inside an arm without re-evaluating it twice). */
    rustProHandlerShadowDefaultShape(node: Node): boolean {
        return node.kind === SyntaxKind.StringLiteral || node.kind === SyntaxKind.NumericLiteral ||
            node.kind === SyntaxKind.TrueKeyword || node.kind === SyntaxKind.FalseKeyword ||
            node.kind === SyntaxKind.NullKeyword || node.kind === SyntaxKind.ArrayLiteralExpression ||
            node.kind === SyntaxKind.ObjectLiteralExpression ||
            (isIdentifier(node) && (node as any).text === 'undefined');
    }

    rustProHandlerShadowDefault(node: Node): string | undefined {
        if (!this.rustProHandlerShadowDefaultShape(node)) return undefined;
        const text = this.printNode(node, 0).trim();
        return text === '' ? undefined : text;
    }

    /** Exact native form of the runtime `_k` helper: same value kinds, same
     *  empty-string-is-missing rule, same default (verified against
     *  `exchange_stubs.rs`). `.cloned()` keeps the emitted line clone-free for
     *  the ccxt clone-pruning passes; the parenthesised `match` keeps the
     *  driver's `};` trailing-block replacement off the statement's `;`. */
    rustProHandlerShadowReadText(kind: string, key: string, dflt: string): string {
        const m = RustTranspiler.PRO_HANDLER_SHADOW_NAME;
        const at = `${m}.get("${key}").cloned()`;
        switch (kind) {
        case 'value':
            return `(match ${at} { Some(Value::Str(__s)) if __s.is_empty() => ${dflt}, Some(__v) => __v, None => ${dflt} })`;
        case 'string':
            return `(match ${at} { Some(Value::Str(__s)) if !__s.is_empty() => Value::Str(__s), Some(Value::Int(__n)) => Value::Str(__n.to_string().into()), Some(Value::Float(__f)) => Value::Str(__f.to_string().into()), _ => ${dflt} })`;
        case 'integer':
            return `(match ${at} { Some(Value::Int(__n)) => Value::Int(__n), Some(Value::Float(__f)) => Value::Int(__f as i64), Some(Value::Str(__s)) if !__s.is_empty() => match __s.parse::<i64>() { Ok(__n) => Value::Int(__n), Err(_) => match __s.parse::<f64>() { Ok(__f) if __f.is_finite() => Value::Int(__f as i64), _ => ${dflt} } }, _ => ${dflt} })`;
        case 'float':
            return `(match ${at} { Some(Value::Float(__f)) => Value::Float(__f), Some(Value::Int(__n)) => Value::Float(__n as f64), Some(Value::Str(__s)) if !__s.is_empty() => match __s.parse::<f64>() { Ok(__f) => Value::Float(__f), Err(_) => ${dflt} }, _ => ${dflt} })`;
        case 'dict':
            return `(match ${at} { Some(__v) if matches!(__v, Value::Dict(_)) => __v, _ => ${dflt} })`;
        case 'list':
            return `(match ${at} { Some(__v) if matches!(__v, Value::Arr(_)) => __v, _ => ${dflt} })`;
        case 'bool':
            return `(match ${at} { Some(__v) if matches!(__v, Value::Bool(_)) => __v, _ => ${dflt} })`;
        }
        return undefined;
    }

    // ── closure-free dict reads / membership ──
    // A read keyed by a Str place prints `(if let (Some(__m), Some(__k)) = (M.as_map(), K.as_str()) { .. })`; `k in D`
    // on a proven Dict prints `D.as_map().is_some_and(..)`. Each site picks helper/closure/closure-free by line length.

    private rustDictPhase: 'normal' | 'probe' | 'final' = 'normal';
    private rustDictSites: Array<{ guarded: boolean, fc: number, ch: number, free: boolean }> = [];
    private rustDictDecisions: Array<'free' | 'closure' | 'helper'> = [];
    private rustDictOwnerDepth = 0;
    private rustDictHoistHosts = new Set<Node>();

    /** Base `Exchange` fields that hold plain, tag-free runtime state (never a cache/book marker). */
    static readonly RUST_DICT_FIELDS = new Set([
        'options', 'urls', 'markets', 'markets_by_id', 'currencies', 'currencies_by_id', 'commonCurrencies',
        'baseCurrencies', 'quoteCurrencies', 'timeframes', 'precision', 'limits', 'fees', 'has', 'exceptions',
        'features', 'api', 'accounts', 'accountsById', 'tokenBucket', 'headers', 'requiredCredentials',
        'networkAliases', 'balance', 'positions', 'ohlcvs', 'tickers', 'bidsasks', 'orderbooks', 'trades',
        'orders', 'myTrades', 'liquidations', 'myLiquidations', 'fundingRates', 'triggerOrders',
        'transactions', 'clients',
    ]);
    /** Fields whose values are themselves Dicts (cache containers / client handles). */
    static readonly RUST_DICT_VALUE_FIELDS = new Set([
        'ohlcvs', 'tickers', 'bidsasks', 'orderbooks', 'trades', 'orders', 'myTrades', 'liquidations',
        'myLiquidations', 'fundingRates', 'triggerOrders', 'positions', 'clients',
    ]);
    static readonly RUST_DICT_TAGGED_ENTRY_FIELDS = new Set([
        'options', 'urls', 'fees', 'exceptions', 'markets', 'currencies', 'headers', 'has', 'tokenBucket',
        'markets_by_id', 'currencies_by_id',
    ]);
    static readonly RUST_DICT_MARKER_KEYS = /^(?:timestamp|datetime|nonce|symbol|checksum|cache|hashmap|subscriptions|futures|\d+)$/;
    /** Base callees that only ever return a Dict (the content may still carry a marker). */
    static readonly RUST_DICT_CALLEES = new Set([
        'safeDict', 'safeDict2', 'safeDictN', 'safeDictionary', 'createSafeDictionary', 'extend', 'deepExtend',
        'omit', 'groupBy', 'indexBy', 'filterByArray',
    ]);

    /** Name of the base-Exchange runtime-state field behind `this.<name>`, else undefined. */
    rustDictField(node: Node): string | undefined {
        const n: any = this.rustSkipWrappers(node);
        if (n === undefined || !isPropertyAccessExpression(n) || n.expression.kind !== SyntaxKind.ThisKeyword) return undefined;
        const name = String(n.name.text);
        if (!RustTranspiler.RUST_DICT_FIELDS.has(name)) return undefined;
        let declaration: any;
        try {
            declaration = symbolValueDeclaration(this.getChecker().getSymbolAtLocation(n.name));
        } catch (e) {
            return undefined;
        }
        if (declaration === undefined || declaration.kind !== SyntaxKind.PropertyDeclaration) return undefined;
        return /ts[\\/]src[\\/]base[\\/](?:\.__ExchangeNoOverloads|Exchange)\.ts$/.test(String(declaration.getSourceFile().fileName)) ? name : undefined;
    }

    /** One dict-read site. `free` = closure-free text, `closure` = closure text, `helper` = the helper call;
     *  `guarded` = the helper form is kept when the closure would push the line over 400 chars. */
    rustDictSite(site: { free?: string, closure: string, helper?: string, guarded?: boolean }): string {
        const k = this.rustDictSites.length;
        const guarded = site.guarded === true && site.helper !== undefined;
        this.rustDictSites.push({
            guarded, free: site.free !== undefined,
            fc: site.free !== undefined ? site.free.length - site.closure.length : 0,
            ch: guarded ? site.closure.length - (site.helper as string).length : 0,
        });
        if (this.rustDictPhase === 'probe') return `\u0001${k}\u0002${guarded ? site.helper : site.closure}\u0003`;
        if (this.rustDictPhase === 'final') {
            const d = this.rustDictDecisions[k];
            if (d === 'helper' && site.helper !== undefined) return site.helper;
            if (d === 'closure' || site.free === undefined) return site.closure;
            return site.free;
        }
        return site.free ?? site.closure;
    }

    /** Dict read keyed by a Str place: closure-free when both operands are side-effect-free places. */
    rustDictRead(recv: string, key: string, node: Node, guarded = false): string {
        const free = RUST_PLAIN_PLACE.test(recv) && RUST_PLAIN_PLACE.test(key) && !this.isTestSource(node)
            ? `(if let (Some(__m), Some(__k)) = (${recv}.as_map(), ${key}.as_str()) { __m.get(__k).cloned().unwrap_or(Value::Null) } else { Value::Null })` : undefined;
        return this.rustDictSite({
            free, guarded, helper: `get_value(&${recv}, &${key})`,
            closure: `${recv}.as_map().and_then(|__m| ${key}.as_str().and_then(|__k| __m.get(__k))).cloned().unwrap_or(Value::Null)`,
        });
    }

    /** `K.as_str().and_then(|__k| D.get(__k))` on a shadowed parameter map. */
    rustShadowKeyRead(shadow: string, key: string, node: Node): string {
        const free = RUST_PLAIN_PLACE.test(key) && !this.isTestSource(node)
            ? `(if let Some(__k) = ${key}.as_str() { ${shadow}.get(__k).cloned().unwrap_or(Value::Null) } else { Value::Null })` : undefined;
        return this.rustDictSite({ free, closure: `${key}.as_str().and_then(|__k| ${shadow}.get(__k)).cloned().unwrap_or(Value::Null)` });
    }

    /** `K.as_str().map(|__k| D.contains_key(__k)).unwrap_or(false)` on a shadowed parameter map. */
    rustShadowKeyHas(shadow: string, key: string, node: Node): string {
        const free = RUST_PLAIN_PLACE.test(key) && !this.isTestSource(node)
            ? `matches!(${key}.as_str(), Some(__k) if ${shadow}.contains_key(__k))` : undefined;
        return this.rustDictSite({ free, closure: `${key}.as_str().map(|__k| ${shadow}.contains_key(__k)).unwrap_or(false)` });
    }

    /** Key text a dict read can take as `K.as_str()`: any printed place/expression that is not a boxed literal. */
    rustDictKeyText(keyNode: Node): string | undefined {
        const keyType = this.getCheckedTypeOf(keyNode);
        if (keyType === undefined || (keyType.flags & (TypeFlags.NumberLike | TypeFlags.BigIntLike | TypeFlags.BooleanLike)) !== 0) return undefined;
        const key = this.printNode(keyNode, 0).trim();
        if (key === '' || /^(?:crate::)?Value::(?:Str|Int|Float|Bool|Null)\b/.test(key) || key.startsWith('&')) return undefined;
        return key;
    }

    /** `this.<field>[k]` with a non-literal key: the runtime reads the key as a Str and yields
     *  Null for anything else, which is `K.as_str()`; the field container is never tagged. */
    rustFieldDynamicRead(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined {
        const field = this.rustDictField(receiverNode);
        if (field === undefined || field === 'accounts' || this.isTestSource(receiverNode)) return undefined;
        const key = this.rustDictKeyText(keyNode);
        if (key === undefined) return undefined;
        return this.rustDictRead(receiverText, key, receiverNode);
    }

    /** A local whose declaration and every write pin a Dict. 'plain': fresh object literals and nullish only
     *  (never tagged by the runtime); 'dicty': also dict-only base callees (content unproven). */
    rustDictLocalProof(ident: Node): 'plain' | 'dicty' | undefined {
        if (!isIdentifier(ident) || this.rustParamShadowOf(ident) !== undefined) return undefined;
        if (this.rustDictBearerDeclaration(ident) !== undefined || this.rustMapParamDeclaration(ident) !== undefined) return undefined;
        const declaration: any = this.rustSingleLocalDeclaration(ident);
        if (declaration === undefined || !isVariableDeclaration(declaration) || !isIdentifier(declaration.name)
            || declaration.initializer === undefined) return undefined;
        // the printer declares these as typed maps / vectors, not as `let x: Value`
        if (this.rustReadBearerKindOfDeclaration(declaration) || this.rustDictLocalIsTyped(declaration)
            || this.rustNestedDictLocalIsTyped(declaration) || this.rustVecLocalIsTyped(declaration)) return undefined;
        const scope = this.rustEnclosingFunction(declaration);
        const symbol = this.rustSymbolOf(declaration.name);
        if (scope === undefined || isSourceFile(scope) || symbol === undefined) return undefined;
        let proof = this.rustDictSource(declaration.initializer, false);
        if (proof === undefined) return undefined;
        const name = String(ident.text);
        for (const n of this.rustScopeNameNodes(scope, name) as any[]) {
            if (n === declaration) continue;
            if (this.rustBindsName(n, name)) {
                if (this.rustSymbolOf(n.name) === undefined) return undefined;
                continue;
            }
            if (n.kind !== SyntaxKind.Identifier || n === declaration.name || this.rustSymbolOf(n) !== symbol) continue;
            let target: any = n;
            while (target.parent !== undefined && (isParenthesizedExpression(target.parent) || isNonNullExpression(target.parent) || isAsExpression(target.parent))) target = target.parent;
            const parent: any = target.parent;
            if (parent === undefined) continue;
            if (isBinaryExpression(parent) && parent.left === target && rustIsAssignmentOperator(parent.operatorToken.kind)) {
                if (parent.operatorToken.kind !== SyntaxKind.EqualsToken || this.rustEnclosingFunction(n) !== scope) return undefined;
                const rhs = this.rustDictSource(parent.right, true);
                if (rhs === undefined) return undefined;
                if (rhs === 'dicty') proof = 'dicty';
                continue;
            }
            if (parent.kind === SyntaxKind.PrefixUnaryExpression || parent.kind === SyntaxKind.PostfixUnaryExpression
                || ((isForOfStatement(parent) || isForInStatement(parent)) && parent.initializer === target)) return undefined;
            // a destructuring write `[x, y] = ..`
            if (parent.kind === SyntaxKind.ArrayLiteralExpression && isBinaryExpression(parent.parent) && parent.parent.left === parent) return undefined;
        }
        return proof;
    }

    /** 'plain' for a fresh object literal (or nullish when `allowNullish`), 'dicty' for a dict-only base callee. */
    rustDictSource(node: any, allowNullish: boolean): 'plain' | 'dicty' | undefined {
        const n: any = this.rustSkipWrappers(node);
        if (n === undefined) return undefined;
        if (isObjectLiteralExpression(n)) {
            return n.properties.some((p: any) => p.kind === SyntaxKind.SpreadAssignment) ? undefined : 'plain';
        }
        if (allowNullish && (n.kind === SyntaxKind.NullKeyword || (isIdentifier(n) && String(n.text) === 'undefined'))) return 'plain';
        if (isCallExpression(n) && isPropertyAccessExpression(n.expression) && n.expression.expression.kind === SyntaxKind.ThisKeyword
            && RustTranspiler.RUST_DICT_CALLEES.has(String(n.expression.name.text)) && this.rustCalleeIsBase(n)) return 'dicty';
        return undefined;
    }

    /** `X[k]` on a proven local with a non-literal key. */
    rustLocalDictRead(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined {
        if (this.rustDictLocalProof(receiverNode) !== 'plain') return undefined;
        const key = this.rustDictKeyText(keyNode);
        if (key === undefined) return undefined;
        return this.rustDictRead(receiverText, key, receiverNode, true);
    }

    /** `X['k']` on a proven local, for a key the runtime does not route to a marker store. */
    rustLocalDictLiteralRead(receiverText: string, receiverNode: Node, keyText: string): string | undefined {
        const proof = this.rustDictLocalProof(receiverNode);
        if (proof === undefined || RustTranspiler.RUST_DICT_MARKER_KEYS.test(keyText)) return undefined;
        const literal = `"${this.escapeRustStringLiteral(keyText)}"`;
        return this.rustDictSite({
            guarded: true, helper: `get_value(&${receiverText}, &Value::Str(${literal}.into()))`,
            closure: `${receiverText}.as_map().and_then(|__m| __m.get(${literal})).cloned().unwrap_or(Value::Null)`,
        });
    }

    /** `k in D` on a base-field / field-container map or a proven local: `in_op`'s Dict arm. */
    rustDictInOp(key: Node, obj: Node): string | undefined {
        const recv: any = this.rustSkipWrappers(obj);
        if (recv === undefined) return undefined;
        let guarded = false;
        if (this.rustDictField(recv) === undefined) {
            const nested = isElementAccessExpression(recv) && recv.argumentExpression !== undefined
                && RustTranspiler.RUST_DICT_VALUE_FIELDS.has(String(this.rustDictField(recv.expression)))
                && !isStringLiteralLikeNode(recv.argumentExpression);
            if (!nested) {
                const proof = this.rustDictLocalProof(recv);
                // a dict-callee local keeps `in_op` for a computed key (content unproven); literal keys only
                if (proof === undefined || (proof !== 'plain' && !isStringLiteral(key))) return undefined;
                guarded = true;
            } else if (this.isTestSource(obj)) {
                return undefined;
            }
        } else if (this.isTestSource(obj)) {
            return undefined;
        }
        const recvText = this.printNode(recv, 0).trim();
        let keyText: string;
        if (isStringLiteral(key)) {
            const literal = this.rustStringLiteralOf(this.printStringLiteral(key));
            if (literal === undefined || (guarded && RustTranspiler.RUST_DICT_MARKER_KEYS.test(String(key.text)))) return undefined;
            return `Value::Bool(${this.rustDictSite({
                guarded, helper: `in_op(&${recvText}, &Value::Str(${literal}.into()))`,
                closure: `${recvText}.as_map().is_some_and(|__m| __m.contains_key(${literal}))`,
            })})`;
        }
        const printed = this.rustDictKeyText(key);
        if (printed === undefined) return undefined;
        // eslint-disable-next-line prefer-const
        keyText = printed;
        return `Value::Bool(${this.rustDictSite({
            guarded, helper: `in_op(&${recvText}, &${keyText})`,
            closure: `${recvText}.as_map().is_some_and(|__m| ${keyText}.as_str().is_some_and(|__k| __m.contains_key(__k)))`,
        })})`;
    }

    /** `this.F['k1']['k2'] = v` as a statement on a base runtime-state field: the first hop is the map's own
     *  `entry`, the write below it an `insert`; a value that reads `self` keeps the helper pair. */
    rustFieldNestedInsert(node: Node, baseExpr: any, keys: any[], keyStrs: string[], rhs: string): string | undefined {
        const field = this.rustDictField(baseExpr);
        // fields whose entries may be books / caches keep the tag-aware chain the native-insert pass prints
        if (keys.length !== 2 || field === undefined || RustTranspiler.RUST_DICT_TAGGED_ENTRY_FIELDS.has(field) || this.isTestSource(node)) return undefined;
        const parent: any = node.parent;
        if (parent === undefined || parent.kind !== SyntaxKind.ExpressionStatement || /\bself\b/.test(rhs)) return undefined;
        if (!isStringLiteral(keys[0]) || !isStringLiteral(keys[1])) return undefined;
        const k1 = this.rustStringLiteralOf(keyStrs[0]);
        const k2 = this.rustStringLiteralOf(keyStrs[1]);
        if (k1 === undefined || k2 === undefined) return undefined;
        const recv = this.printNode(baseExpr, 0).trim();
        const trimmed = rhs.trim();
        const value = this.rustPrintedBoolArg(rhs) ? `Value::Bool(${rhs})`
            : (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed) && trimmed !== 'self' && trimmed !== 'true' && trimmed !== 'false' ? `${trimmed}.clone()` : rhs);
        return `if let Value::Dict(__r08a) = &mut ${recv} { let __r08e = std::sync::Arc::make_mut(__r08a).entry(${k1}.to_string()).or_insert(Value::Null);`
            + ` if let Value::Dict(__r08b) = __r08e { std::sync::Arc::make_mut(__r08b).insert(${k2}.to_string(), ${value}); } }`;
    }

    /** `x[k] = f(x[k])`: the read sits in the value of an assignment the printer writes as a native
     *  insert (which binds the value first, `{ let __be_tmp = ..; insert }`), so the position rule that
     *  protects the helper-form write passes does not apply to it. */
    rustDictReadInNativeInsert(acc: string, receiver: Node, key: Node, chain: Node): string | undefined {
        if (this.isNativeWriteTargetBase(chain) || this.isTestSource(chain)) return undefined;
        const root = this.rootPlaceText(chain);
        if (root === undefined) return undefined;
        let host: any;
        for (let current: any = chain.parent; current; current = current.parent) {
            if (isStatement(current) || isSourceFile(current) || isFunctionLike(current)) break;
            if (isBinaryExpression(current) && current.operatorToken.kind === SyntaxKind.EqualsToken
                && this.isNodeInsideNode(chain, current.right) && this.rootPlaceText(current.left) === root) host = current;
        }
        if (host === undefined || !isElementAccessExpression(host.left)
            || host.parent?.kind !== SyntaxKind.ExpressionStatement || !this.isNativeAccessPositionSafe(chain, host)) return undefined;
        const base: any = host.left.expression;
        const keyNode: any = host.left.argumentExpression;
        const keyText = this.printNode(keyNode, 0);
        const writesNatively = !isElementAccessExpression(base) && (this.rustBearerDictInsert(base, keyNode, keyText, 'x') ?? this.rustMapParamDictInsert(base, keyNode, keyText, 'x')
            ?? this.printNativeBookMetaWrite(base, keyNode, keyText, 'x') ?? this.printNativeDictInsert(base, keyNode, keyText, 'x')
            ?? this.rustNativeDictInsert(base, keyNode, keyText, 'x')) !== undefined;
        if (isStringLiteralLikeNode(key)) return undefined;
        const read = this.rustFieldDynamicRead(acc, receiver, key) ?? this.rustLocalDictRead(acc, receiver, key);
        if (read !== undefined && !writesNatively) this.rustDictHoistHosts.add(host);
        return read;
    }

    /** Characters the ccxt clone passes add to a printed line afterwards: every bare local passed by value in a
     *  call or array-literal argument slot gets a `.clone()` (`autoCloneCallArgs` / `cloneInArrayLiterals`). */
    rustDictCloneGrowth(line: string): number {
        // a dynamic `throw new E[k](m)` prints `(read)::new(m)`; the ccxt create_error rewrite wraps both operands
        const thrown = /^\s*panic!\("\{\}", .*::new\(/.test(line)
            ? 'crate::exchange_errors::create_error(&crate::runtime::stringify_param(&('.length + ')), &crate::runtime::stringify_param(&('.length + ')))'.length - '::new('.length - 1 : 0;
        const masked = line.replace(/"(?:[^"\\]|\\.)*"/g, (m) => '"' + ' '.repeat(Math.max(0, m.length - 2)) + '"');
        let n = 0;
        // eslint-disable-next-line no-useless-escape
        for (const m of masked.matchAll(/(?<=[(\[,]\s?)([A-Za-z_][A-Za-z0-9_]*)(?=\s*[,)\]])/g)) {
            const start = m.index as number;
            const before = masked.slice(Math.max(0, start - 6), start);
            if (/&\s*(?:mut\s+)?$/.test(before) || /\bmut\s+$/.test(before) || /[:.]$/.test(before.trimEnd())) continue;
            if (/^(?:self|true|false|None|Some|Ok|Err|Value|i64|f64|String|usize|bool|__\w+)$/.test(m[1])) continue;
            n += 8;
        }
        return n + thrown;
    }

    /** `this.<field>['k'].length`: a read-only use of a literal-key read off a base runtime-state field. */
    rustFieldLengthRead(acc: string, receiver: Node, key: Node, chain: Node): string | undefined {
        const parent: any = chain.parent;
        if (parent === undefined || !isPropertyAccessExpression(parent) || parent.expression !== chain || String(parent.name.text) !== 'length') return undefined;
        if (this.rustDictField(receiver) === undefined || !isStringLiteralLikeNode(key) || this.isTestSource(chain) || !RUST_PLAIN_PLACE.test(acc)) return undefined;
        const text = String((key as any).text);
        if (text === '' || !/^[A-Za-z0-9_./-]+$/.test(text)) return undefined;
        const literal = `"${text}"`;
        return this.rustDictSite({
            guarded: true, helper: `get_value(&${acc}, &Value::Str(${literal}.into()))`,
            closure: `${acc}.as_map().and_then(|__m| __m.get(${literal})).cloned().unwrap_or(Value::Null)`,
        });
    }

    /** Statement-like nodes whose finished lines the 400-char budget is measured on. */
    private rustDictIsOwner(node: Node): boolean {
        switch (node.kind) {
        case SyntaxKind.ExpressionStatement:
        case SyntaxKind.VariableStatement:
        case SyntaxKind.ReturnStatement:
        case SyntaxKind.ThrowStatement:
        case SyntaxKind.IfStatement:
        case SyntaxKind.WhileStatement:
        case SyntaxKind.ForStatement:
            return true;
        default:
            return false;
        }
    }

    printNode(node, identation = 0): string {
        if (this.rustDictOwnerDepth > 0 || !this.rustDictIsOwner(node)) return super.printNode(node, identation);
        this.rustDictOwnerDepth++;
        try {
            return this.rustDictPrintOwner(node, identation);
        } finally {
            this.rustDictOwnerDepth--;
        }
    }

    /** Print a statement; when a finished line of it passes 400 chars, decide each dict site against the
     *  line it sits on (the budget the closure-free / closure / helper forms are chosen under). */
    private rustDictPrintOwner(node: Node, identation: number): string {
        const loops = this.forLoopCounter;
        this.rustDictPhase = 'normal';
        this.rustDictSites = [];
        const out = super.printNode(node, identation);
        const sites = this.rustDictSites;
        this.rustDictSites = [];
        if (sites.length === 0 || !sites.some((s) => s.fc > 0 || s.ch > 0) || !out.split('\n').some((l) => l.length > 400)) return out;
        this.rustDictPhase = 'probe';
        this.forLoopCounter = loops;
        const probe = super.printNode(node, identation);
        const probed = this.rustDictSites.length;
        this.rustDictSites = [];
        if (probed !== sites.length) return out;
        const decisions: Array<'free' | 'closure' | 'helper'> = sites.map(() => 'free');
        // Each site is judged against the line as the earlier stage left it (not cumulatively):
        // guarded sites first (helper vs closure), then closure vs closure-free.
        for (const line of probe.split('\n')) {
            // eslint-disable-next-line no-control-regex
            const ids = [ ...line.matchAll(/\u0001(\d+)\u0002/g) ].map((m) => Number(m[1]));
            if (ids.length === 0) continue;
            // eslint-disable-next-line no-control-regex
            const plain = line.replace(/\u0001\d+\u0002|\u0003/g, '');
            const base = plain.length + this.rustDictCloneGrowth(plain);
            let closureLen = base;
            for (const k of ids) {
                const s = sites[k];
                if (!s.guarded || s.ch <= 0) continue;
                if (base <= 400 && base + s.ch > 400) decisions[k] = 'helper';
                else closureLen += s.ch;
            }
            for (const k of ids) {
                const s = sites[k];
                if (decisions[k] === 'helper') continue;
                if (!s.free) { decisions[k] = 'closure'; continue; }
                if (closureLen <= 400 && closureLen + s.fc > 400) decisions[k] = 'closure';
            }
        }
        this.rustDictPhase = 'final';
        this.rustDictDecisions = decisions;
        this.forLoopCounter = loops;
        try {
            const final = super.printNode(node, identation);
            return this.rustDictSites.length === sites.length ? final : out;
        } finally {
            this.rustDictPhase = 'normal';
            this.rustDictSites = [];
            this.rustDictDecisions = [];
        }
    }

    printNativeMapAccess(receiverText: string, receiverNode: Node, keyText: string): string | undefined {
        // `client.url` on a ws `Client`: the handle's own accessor, no map closure.
        if (keyText === 'url' && this.rustIsWsClientType(this.getCheckedTypeOf(receiverNode))) return `${receiverText}.url()`;
        // A native-map parameter is an `&mut IndexMap` too.
        if (this.rustMapParamDeclaration(receiverNode) !== undefined && RustTranspiler.rustBearerKeyTextOk(keyText)) {
            return `${receiverText}.get("${this.escapeRustStringLiteral(keyText)}").cloned().unwrap_or(Value::Null)`;
        }
        // A typed dict bearer is a bare IndexMap, so the read is the
        // map lookup itself — no `as_map()` box and no `|__m|` closure.
        if (this.rustDictBearerDeclaration(receiverNode) !== undefined) {
            if (!RustTranspiler.rustBearerKeyTextOk(keyText)) return undefined;
            return `${receiverText}.get("${this.escapeRustStringLiteral(keyText)}").cloned().unwrap_or(Value::Null)`;
        }
        if (!this.isProvenMapExpression(receiverNode) && !this.rustLiteralReadOk(receiverNode, keyText)) {
            // Declared-Dict locals read natively too (see the classifier below).
            if (!this.rustIsDeclaredDictLocal(receiverNode)) return undefined;
            if (RustTranspiler.RUST_DICT_LOCAL_UNSAFE_KEYS.has(keyText)) return undefined;
            if (keyText === '' || /^\d+$/.test(keyText)) return undefined;
        }
        const key = this.escapeRustStringLiteral(keyText);
        return `${receiverText}.as_map().and_then(|__m| __m.get("${key}")).cloned().unwrap_or(Value::Null)`;
    }

    // Declared-Dict locals: the checker types many dict-holding locals `any`, losing the proof
    // above, but the declaration still proves a plain dict (object literal, `getArg(.., {})` bag,
    // `this.safeDict`, `extend` onto those, or an element of a map-typed container) at every read.

    /** Keys `get_value(_k)` serves from the book store, a cache bucket or a
     *  live `__live_id` snapshot instead of from the dict itself: those routes
     *  are invisible to a plain map read, so they keep the helper. */
    static readonly RUST_DICT_LOCAL_UNSAFE_KEYS = new Set([
        'timestamp', 'datetime', 'nonce', 'symbol', 'checksum', 'cache',
        'hashmap', 'subscriptions', 'futures',
    ]);

    rustDeclarationOfIdentifier(node: Node): Declaration | undefined {
        if (!isIdentifier(node)) return undefined;
        try {
            const symbol: any = this.getChecker().getSymbolAtLocation(node);
            return symbolValueDeclaration(symbol);
        } catch (e) {
            return undefined;
        }
    }

    /** Initializer shapes that construct or return a plain dict. */
    rustDictProducingInitializer(node: Node | undefined, seen: Set<Node>): boolean {
        if (node === undefined || node === null || seen.has(node)) return false;
        seen.add(node);
        if (isObjectLiteralExpression(node)) return true;
        if (isParenthesizedExpression(node) || isAsExpression(node) ||
            isNonNullExpression(node) || isTypeAssertion(node)) {
            return this.rustDictProducingInitializer((node as any).expression, seen);
        }
        if (isIdentifier(node)) {
            const declaration: any = this.rustDeclarationOfIdentifier(node);
            if (declaration === undefined || !isVariableDeclaration(declaration)) return false;
            return this.rustDictProducingInitializer(declaration.initializer, seen);
        }
        if (isElementAccessExpression(node)) {
            // `this.markets[symbol]`: the container's declared element type is
            // what the rust port stores there.
            const containerType = this.getCheckedTypeOf((node as any).expression);
            if (containerType === undefined) return false;
            const elementType = this.getChecker().getIndexTypeOfType(containerType, IndexKind.String);
            return elementType !== undefined && this.isProvenMapType(elementType);
        }
        if (!isCallExpression(node)) return false;
        const callee: any = (node as any).expression;
        if (!isPropertyAccessExpression(callee) || callee.expression.kind !== SyntaxKind.ThisKeyword) {
            return false;
        }
        const name = String(callee.name.text);
        // Readers whose rust counterpart returns the stored dict itself.
        // `this.client(url)` returns the WS client handle Dict the runtime keeps
        // (`Map{url, subscriptions, futures}`), never a class instance.
        if (['safeDict', 'safeMarketStructure', 'market', 'currency', 'safeMarket', 'safeCurrency', 'client'].includes(name)) return true;
        // `extend`/`deepExtend` merge onto their first argument.
        if (name === 'extend' || name === 'deepExtend') {
            return this.rustDictProducingInitializer((node as any).arguments[0], seen);
        }
        return false;
    }

    /** D2: the proof holds only while nothing re-assigns the local. */
    rustLocalIsReassigned(declaration: Declaration, name: string): boolean {
        let scope: Node | undefined = declaration;
        while (scope !== undefined && !isFunctionLike(scope) && !isSourceFile(scope)) scope = scope.parent;
        if (scope === undefined) return true;
        // only an identifier spelled `name` can be the assignment's left side
        return this.rustScopeNameNodes(scope, name).some((id: any) => {
            const node: any = id.parent;
            return id.kind === SyntaxKind.Identifier && node !== undefined && isBinaryExpression(node) && node.left === id
                && node.operatorToken.kind >= SyntaxKind.FirstAssignment && node.operatorToken.kind <= SyntaxKind.LastAssignment;
        });
    }

    /** True when the receiver is a local declared as (or provably holding) a
     *  plain dict — `get_value(_k)` and this read agree on every key the
     *  runtime does not route elsewhere. */
    rustIsDeclaredDictLocal(node: Node): boolean {
        const declaration: any = this.rustDeclarationOfIdentifier(node);
        if (declaration === undefined) return false;
        const name = declaration.name?.text;
        if (typeof name !== 'string') return false;
        if (isParameterDeclaration(declaration)) {
            // A `Client`-typed parameter is the WS handle passed to `handle_message`/`handle*`
            // (`ws_client::client_value`): a `Value::Dict{url, subscriptions, futures}` in the port, not
            // the TS class. Its fields are plain map reads.
            if (!this.rustParameterIsClientHandle(declaration) && !this.rustDictProducingInitializer(declaration.initializer, new Set())) return false;
        } else if (isVariableDeclaration(declaration)) {
            if (!this.rustDictProducingInitializer(declaration.initializer, new Set())) return false;
        } else {
            return false;
        }
        return !this.rustLocalIsReassigned(declaration, name);
    }

    /** The ws `OrderBook` class (`ts/src/base/ws/OrderBook.ts`): the rust port never
     *  builds a struct for it — `order_book()` returns a `Value::Dict` — so its
     *  element reads are plain map reads on a proven map. */
    rustWsOrderBookClassType(type: Type | undefined): boolean {
        if (type === undefined) return false;
        if (type.flags & (TypeFlags.Union | TypeFlags.Intersection)) {
            return (typeParts(type) ?? []).some((member: Type) => this.rustWsOrderBookClassType(member));
        }
        if (!(type.flags & TypeFlags.Object)) return false;
        const symbol: any = this.typeSymbolOf(type);
        if (symbol === undefined || symbol.name !== 'OrderBook' || (symbol.flags & SymbolFlags.Class) === 0) return false;
        const members = (type.getProperties?.() ?? []).map((p: any) => String(p.name));
        return members.includes('bids') && members.includes('asks');
    }

    /** Types the port stores as a plain `Value::Dict`: a checker-proven map, or the
     *  ws order book class. */
    rustDictBearerType(type: Type | undefined): boolean {
        return this.isProvenMapType(type as Type) || this.rustWsOrderBookClassType(type);
    }

    /** A parameter declared as the ws `Client` class (or a union with it). The
     *  class is the default export of `ts/src/base/ws/Client.ts`, so its type
     *  symbol is named `default`; the declaration itself carries the name. */
    rustParameterIsClientHandle(declaration: ParameterDeclaration): boolean {
        return this.rustIsWsClientType(this.getCheckedTypeOf(declaration.name));
    }

    /** The ws `Client` class (or a union with it); its type symbol is the file's `default` export. */
    rustIsWsClientType(type: Type | undefined): boolean {
        const named = (t: Type | undefined): boolean => {
            if (t === undefined) return false;
            return symbolDeclarations(this.typeSymbolOf(t)).some((d: any) => {
                if (!isClassDeclaration(d) || d.name === undefined || d.name.text !== 'Client') return false;
                const file = String(d.getSourceFile().fileName).replace(/\\/g, '/');
                return file.endsWith('/ws/Client.ts') || file.endsWith('/ws/Client.d.ts');
            });
        };
        return named(type) || (typeParts(type) ?? []).some((member: Type) => named(member));
    }

    /** Constant string argument of `parseInt`/`parseFloat` folded the way rust's
     *  `str::parse` would; undefined when the fold is not obviously exact. */
    foldParsedStringLiteral(name: string, text: string): string | undefined {
        const t = text.trim();
        if (name === 'parseInt') {
            if (!/^[+-]?[0-9]+$/.test(t)) return undefined;
            const value = BigInt(t.replace(/^\+/, '') || '0');
            if (value < -9223372036854775808n || value > 9223372036854775807n) return undefined;
            return `Value::Int(${value.toString()})`;
        }
        if (!/^[+-]?[0-9]+(?:\.[0-9]+)?$/.test(t)) return undefined;
        const value = Number(t);
        // `String(value)` must re-read as a rust float literal holding the same f64;
        // `-0` prints as `0`, which would drop the sign the runtime keeps.
        if (!Number.isFinite(value) || Object.is(value, -0)) return undefined;
        if (!/^-?[0-9]+(?:\.[0-9]+)?$/.test(String(value))) return undefined;
        return `Value::Float(${String(value)})`;
    }

    /** `parseInt(x)` / `parseFloat(x)` with a single checker-proven string argument
     *  become the runtime helper's own match with native `str::parse`; every other
     *  argument shape keeps the helper call the ccxt post-pass rewrites. */
    printNativeParseCall(node: CallExpression): string | undefined {
        const callee = node.expression;
        if (!isIdentifier(callee)) return undefined;
        const name = String(callee.text);
        const helper = RustTranspiler.RUST_PARSE_HELPERS[name];
        if (helper === undefined) return undefined;
        if (node.arguments.length !== 1) return undefined; // radix / unknown arity
        const arg = node.arguments[0];
        const type = this.getCheckedTypeOf(arg);
        if (type === undefined || !this.isStringType(type.flags)) return undefined;
        if (isStringLiteralLikeNode(arg)) {
            const folded = this.foldParsedStringLiteral(name, arg.text);
            if (folded !== undefined) return folded;
        }
        const argText = this.printNode(arg, 0).trim();
        // The post-pass adds the `&`; a text that already carries one is not a place.
        if (!argText || argText.startsWith('&')) return undefined;
        if (helper === 'i64') {
            return `(match &${argText} { Value::Str(__parse_s) => __parse_s.trim().parse::<i64>().map(Value::Int).unwrap_or(Value::Null), Value::Int(__parse_n) => Value::Int(*__parse_n), Value::Float(__parse_f) => Value::Int(*__parse_f as i64), _ => Value::Null })`;
        }
        return `(match &${argText} { Value::Str(__parse_s) => __parse_s.trim().parse::<f64>().map(Value::Float).unwrap_or(Value::Null), Value::Float(__parse_f) => Value::Float(*__parse_f), Value::Int(__parse_n) => Value::Float(*__parse_n as f64), _ => Value::Null })`;
    }

    isNodeInsideNode(node: Node, container: Node): boolean {
        return node.pos >= container.pos && node.end <= container.end;
    }

    /** Root place of an access chain (`x` for `x['a']['b']`, `this.balance` for
     *  `this.balance['usdt']`), or undefined for a temporary. */
    rootPlaceText(node: Node): string | undefined {
        let current: any = node;
        while (isPropertyAccessExpression(current) || isElementAccessExpression(current) || isParenthesizedExpression(current)) {
            if (!isParenthesizedExpression(current) && current.expression.kind === SyntaxKind.ThisKeyword) return current.getText().trim();
            current = current.expression;
        }
        return current && (isIdentifier(current) || current.kind === SyntaxKind.ThisKeyword) ? current.getText().trim() : undefined;
    }

    /** The ccxt post-passes hoist `get_value(...)` reads out of `&mut` calls by
     *  matching their text; the native form is invisible to them, so it is only
     *  emitted where no such hoist is needed. */
    isNativeAccessPositionSafe(node: Node, ignoreAssign?: Node): boolean {
        const parent = node.parent;
        // `x['k'].push(...)` / `x['k'](...)`: the post-pass rewrites the target.
        if (parent && (isPropertyAccessExpression(parent) || isCallExpression(parent)) && parent.expression === node && !this.pureStringMethodReceiver(node)) return false;
        const root = this.rootPlaceText(node);
        for (let current: any = node.parent; current; current = current.parent) {
            if (isStatement(current) || isSourceFile(current) || isFunctionLike(current)) break;
            if (isBinaryExpression(current) && this.isNodeInsideNode(node, current.right)) {
                const op = current.operatorToken.kind;
                const isAssign = op === SyntaxKind.EqualsToken || (op >= SyntaxKind.PlusEqualsToken && op <= SyntaxKind.CaretEqualsToken);
                if (isAssign && root !== undefined && current !== ignoreAssign && this.rootPlaceText(current.left) === root) return false;
            }
            if (isCallExpression(current) && isPropertyAccessExpression(current.expression) &&
                this.isNodeInsideNode(node, current) && current.arguments.some(a => this.isNodeInsideNode(node, a))) {
                const callee = current.expression;
                // Same-place receiver (`x.push(x[0])`) is rewritten to `&mut x` args.
                if (root !== undefined && this.rootPlaceText(callee.expression) === root) return false;
                // `&mut self.<method>(...)` arg lists are hoisted by the ccxt
                // pass because a `&self` reborrow conflicts with the outer `&mut self`.
                if (callee.expression.kind === SyntaxKind.ThisKeyword &&
                    RustTranspiler.MUT_SELF_METHODS.has(this.toSnakeCaseName(String(callee.name.text))) &&
                    (root === undefined || root === 'this' || root.startsWith('this.'))) return false;
            }
        }
        return true;
    }

    /** `(x.k as T).push(..)`: the cast wrapper hides the push receiver from the position check. */
    isCastOrParenOperand(node: Node): boolean {
        return node.parent !== undefined && (isAsExpression(node.parent) || isParenthesizedExpression(node.parent));
    }

    /** Receiver shapes whose printed text is a single `Value` place (`x`, `this.x`). */
    isShallowValueReceiver(node: Node): boolean {
        return isIdentifier(node) || (isPropertyAccessExpression(node) && node.expression.kind === SyntaxKind.ThisKeyword);
    }

    /** True when this read is the receiver of an element-access chain that is
     *  written (`x['a'] = v`, `x['a']['b'] = v`, `delete x['a']['b']`), or a
     *  property write itself (`x.k = v`, `delete x.k`). The ccxt write passes
     *  match the `get_value(&…)` / `x.k` text to reach the real container, so a
     *  native read would write into a discarded clone. */
    isNativeWriteTargetBase(node: Node): boolean {
        const isWrite = (n: any, target: any) => n !== undefined && (isDeleteExpression(n) ||
            (isBinaryExpression(n) && n.left === target && rustIsAssignmentOperator(n.operatorToken.kind)));
        const parent: any = node.parent;
        if (isWrite(parent, node)) return true;
        if (parent === undefined || !isElementAccessExpression(parent) || parent.expression !== node) return false;
        let current: any = parent;
        while (current.parent !== undefined && isElementAccessExpression(current.parent) && current.parent.expression === current) current = current.parent;
        return isWrite(current.parent, current);
    }

    transformPropertyAcessExpressionIfNeeded(node) {
        // Printed here (as before) so the receiver's loop-flag numbering in the
        // generated file matches the pinned baseline for non-length accesses.
        const leftExpr = this.printNode(node.expression, 0);
        if (node.name.text !== 'length') return undefined;
        const shadow = this.rustParamShadowOf(node.expression);
        const native = shadow !== undefined ? this.printShadowLength(shadow) : undefined;
        return native ?? this.printArrayLength(node, 0, leftExpr);
    }

    // `crate::value::get_value_k` is `get_value` for a `&str` key — the same
    // dict lookup minus the per-read `Value::Str` allocation. Three literal-key
    // families reach branches only `get_value` has (numeric cache/side indices,
    // the cache `hashmap` bucket, live client `subscriptions`/`futures`) and a
    // `this`/class receiver is not a `Value`, so those keep `get_value`.
    staticKeyLookup(node, container): string | undefined {
        if (!isStringLiteral(node)) return undefined;
        // Test sources keep the allocating form: the test-only post-passes
        // pattern-match `get_value(&…, &Value::Str(…))` call sites.
        const source = (node as any).getSourceFile ? (node as any).getSourceFile().fileName : '';
        if (typeof source === 'string' && /\/test\//.test(source)) return undefined;
        if (container.kind === SyntaxKind.ThisKeyword) return undefined;
        const text = node.text;
        if (text === '' || text in this.StringLiteralReplacements) return undefined;
        if (/^\d+$/.test(text) || text === 'hashmap' || text === 'subscriptions' || text === 'futures') return undefined;
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) return undefined;
        const type = checker.getTypeAtLocation(container);
        if (type !== undefined && ((type as any).objectFlags & ObjectFlags.Class)) return undefined;
        return this.quotedStringLiteral(text);
    }

    printElementAccessExpression(node, identation) {
        const special = this.printElementAccessExpressionExceptionIfAny(node);
        if (special) return special;
        // `obj['x'] = v` is rewritten to `crate::set_value(...)` by a pass that
        // matches the `get_value(&obj, &key)` target shape, so targets keep it.
        // `d['a'].push(v)` lowers to `append_to_array(&mut <target>, v)` and the
        // ccxt pass giving it write-through semantics (`append_to_object_array`)
        // matches `append_to_array(&mut get_value(&` literally, so call/property
        // targets keep the allocating form too: `get_value_k` is invisible to
        // that pass and the append would land on a discarded COW clone.
        const parent = node.parent;
        const keepGetValue = parent !== undefined && (
            (isBinaryExpression(parent) && parent.left === node &&
                parent.operatorToken.kind >= SyntaxKind.FirstAssignment && parent.operatorToken.kind <= SyntaxKind.LastAssignment) ||
            ((isPropertyAccessExpression(parent) || isCallExpression(parent)) && parent.expression === node));
        const chain: any[] = [];
        let current: any = node;
        while (isElementAccessExpression(current)) {
            chain.unshift(current);
            current = current.expression;
        }
        // One checker proof per chain: the emitted text replaces `get_value` only
        // when it is legal at the position the whole chain occupies.
        const nativeAllowed = this.isNativeAccessPositionSafe(node) && !this.isNativeWriteTargetBase(node);
        // A two-level bearer reads both levels in one lookup.
        if (nativeAllowed && chain.length === 2 && isIdentifier(current)) {
            const nested = this.rustNestedBearerRead(current, chain[0].argumentExpression, chain[1].argumentExpression);
            if (nested !== undefined) return nested;
        }
        let acc = this.printNode(current, 0);
        for (const { expression: receiver, argumentExpression: key } of chain) {
            const native = nativeAllowed ? this.printNativeContainerAccess(acc, receiver, key)
                : (this.rustDictReadInNativeInsert(acc, receiver, key, node) ?? this.rustFieldLengthRead(acc, receiver, key, node));
            const staticKey = native === undefined && !keepGetValue ? this.staticKeyLookup(key, receiver) : undefined;
            acc = native ?? (staticKey !== undefined
                ? `crate::value::get_value_k(&${acc}, ${staticKey})`
                : `get_value(&${acc}, &${this.printNode(key, 0)})`);
        }
        return acc;
    }

    printForStatement(node, identation) {
        const idn = this.getIden(identation);
        const idn1 = this.getIden(identation + 1);
        let initStr = node.initializer ? this.printNode(node.initializer, identation + 1) + ';\n' : '';
        let condStr = node.condition ? this.printComparisonInBooleanContext(node.condition, 0).trim() : 'true';
        const incrStr = node.incrementor ? this.printNode(node.incrementor, 0) : '';
        // A proven `Value::Int` counter steps in place; one that only indexes lists is a plain `i64`.
        const counter = incrStr !== '' ? this.rustIntCounter(node, initStr, incrStr) : undefined;
        const bound = counter?.sign === '+' ? this.rustI64CounterPlan(node, counter, condStr) : undefined;
        const printBody = () => node.statement.statements.map(s => this.printNode(s, identation + 1)).join('\n');
        let statements: string;
        let typed = false;
        if (bound !== undefined && counter !== undefined) {
            const before = this.forLoopCounter;
            const previous = this.rustI64Counters.get(counter.name);
            this.rustI64Counters.set(counter.name, counter.symbol);
            try {
                statements = printBody();
            } finally {
                if (previous === undefined) this.rustI64Counters.delete(counter.name);
                else this.rustI64Counters.set(counter.name, previous);
            }
            typed = this.rustI64BodyIsClosed(statements, counter.name);
            if (!typed) {
                this.forLoopCounter = before;
                statements = printBody();
            }
        } else {
            statements = printBody();
        }
        const body = `{\n${statements}\n${idn}}`;
        // A C-style `for` becomes a Rust `while`. The increment must run on
        // every iteration *including* one ended by `continue`, so it is folded
        // into the condition (guarded by a first-iteration flag); at the end of
        // the body a `continue` would skip it and spin the loop forever.
        if (incrStr !== '') {
            const flag = `__for_first_${this.forLoopCounter++}`;
            let step = `${incrStr};`;
            if (counter !== undefined) {
                // `n` unless the function already uses that name: an early text pass reads `*n` as a use of that local.
                const bind = (this.rustScopeNameNodes(this.rustEnclosingFunction(node), 'n') as any[]).length > 0 ? '__n' : 'n';
                step = `if let Value::Int(${bind}) = &mut ${counter.name} { *${bind} ${counter.sign}= 1; }`;
            }
            if (typed && counter !== undefined && bound !== undefined) {
                initStr = initStr.replace(`let mut ${counter.name}: Value = Value::Int(${counter.literal});`, `let mut ${counter.name}: i64 = ${counter.literal};`);
                condStr = `${counter.name} < (${bound}.len() as i64)`;
                step = `${counter.name} += 1;`;
            }
            const cond = `{ if !${flag} { ${step} } ${flag} = false; ${condStr} }`;
            return `${idn}{\n${idn1}${initStr}${idn1}let mut ${flag}: bool = true;\n${idn1}while ${cond} ${body}\n${idn}}`;
        }
        return `${idn}{\n${idn1}${initStr}${idn1}while ${condStr} ${body}\n${idn}}`;
    }

    // `for (let i = <int>; …; i++)` over a `Value` counter: when the incrementor is the only write
    // to `i` the payload is always `Value::Int`, so the step bumps it in place (no 5-arm match).
    rustIntCounter(node, initStr: string, incrStr: string): { name: string, sign: '+' | '-', literal: string, symbol: any } | undefined {
        const init: any = node.initializer;
        const incr: any = node.incrementor;
        if (init?.kind !== SyntaxKind.VariableDeclarationList || init.declarations.length !== 1 || !(init.flags & NodeFlags.BlockScoped)) return undefined;
        const declaration: any = init.declarations[0];
        if (!isIdentifier(declaration.name) || /\/test\//.test(String(node.getSourceFile?.().fileName ?? ''))) return undefined;
        const name = String(declaration.name.text);
        // The declaration must print as the boxed int literal the Int payload relies on.
        const printed = new RegExp(`^let mut ${name}: Value = Value::Int\\((-?\\d+)\\);$`).exec(initStr.trim());
        if (printed === null) return undefined;
        const sign = [ '+', '-' ].find((s) => incrStr.trim() === `${name} = ${this.printNativeNumeric(s === '+' ? SyntaxKind.PlusToken : SyntaxKind.MinusToken, name, 'Value::Int(1)')}`) as '+' | '-' | undefined;
        if (sign === undefined) return undefined;
        const symbol = this.rustSymbolOf(declaration.name);
        if (symbol === undefined) return undefined;
        for (const n of this.rustScopeNameNodes(node, name) as any[]) {
            if (n === declaration || n === declaration.name || this.isNodeInsideNode(n, incr)) continue;
            if (n.kind === SyntaxKind.VariableDeclaration && this.rustBindsName(n, name)) return undefined;
            if (n.kind === SyntaxKind.Identifier && this.rustSymbolOf(n) === symbol && this.rustIdentifierIsWritten(n)) return undefined;
        }
        return { name, sign, literal: printed[1], symbol };
    }

    /** True when the identifier is (part of) an assignment target, a `++`/`--` operand or a `for-in/of` head. */
    rustIdentifierIsWritten(id: any): boolean {
        let current: any = id;
        while (current.parent !== undefined && (isParenthesizedExpression(current.parent) || isArrayLiteralExpression(current.parent)
            || isObjectLiteralExpression(current.parent) || isShorthandPropertyAssignment(current.parent)
            || current.parent.kind === SyntaxKind.PropertyAssignment || current.parent.kind === SyntaxKind.SpreadElement
            || current.parent.kind === SyntaxKind.SpreadAssignment || isAsExpression(current.parent) || isNonNullExpression(current.parent))) {
            current = current.parent;
        }
        const up: any = current.parent;
        if (up === undefined) return false;
        if (isBinaryExpression(up)) return up.left === current && rustIsAssignmentOperator(up.operatorToken.kind);
        if (up.kind === SyntaxKind.PostfixUnaryExpression || up.kind === SyntaxKind.PrefixUnaryExpression) {
            return up.operator === SyntaxKind.PlusPlusToken || up.operator === SyntaxKind.MinusMinusToken;
        }
        return (isForInStatement(up) || isForOfStatement(up)) && up.initializer === current;
    }

    // ── `i64` loop counters ───────────────────────────────────────────────────
    // A proven `Value::Int` counter bounded by `i < <place>.length` whose every other use is a list
    // index read or a boxed argument/initializer is a plain `i64`: reads become `.get(i as usize)`,
    // boxed uses `Value::Int(i)`. The body is printed with the counter registered; if any use printed
    // another way the body is printed again as a `Value` counter.
    private rustI64Counters = new Map<string, any>();

    /** The place `X` of a `i < X.length` condition over this counter, when its uses are all admissible. */
    rustI64CounterPlan(node, counter: { name: string, symbol: any }, condStr: string): string | undefined {
        const printed = new RegExp(`^${counter.name}\\.as_f64\\(\\)\\.unwrap_or\\(f64::NAN\\) < Value::Int\\((self\\.\\w+|\\w+)\\.len\\(\\) as i64\\)\\.as_f64\\(\\)\\.unwrap_or\\(f64::NAN\\)$`).exec(condStr);
        if (printed === null) return undefined;
        for (const id of this.rustScopeNameNodes(node.statement, counter.name) as any[]) {
            if (id.kind !== SyntaxKind.Identifier || this.rustIdentifierIsPropertyName(id) || this.rustSymbolOf(id) !== counter.symbol) continue;
            const up: any = id.parent;
            const admissible = (isElementAccessExpression(up) && up.argumentExpression === id)
                || this.rustI64BoxedUse(id)
                || (isVariableDeclaration(up) && up.initializer === id);
            if (!admissible) return undefined;
        }
        return printed[1];
    }

    /** A bare counter use that is an argument of a `this.m(..)` call or the value of an `x[k] = i` write. */
    rustI64BoxedUse(id: any): boolean {
        const up: any = id.parent;
        if (isCallExpression(up)) {
            const callee: any = up.expression;
            return callee.kind === SyntaxKind.PropertyAccessExpression && callee.expression.kind === SyntaxKind.ThisKeyword
                && up.arguments.some((a) => a === id);
        }
        return isBinaryExpression(up) && up.operatorToken.kind === SyntaxKind.EqualsToken && up.right === id
            && (isElementAccessExpression(up.left) || isPropertyAccessExpression(up.left));
    }

    /** The registered counter's symbol when `node` is a use of it, else undefined. */
    rustI64CounterOf(node: any): any {
        const symbol = this.rustI64Counters.size === 0 || !isIdentifier(node) ? undefined : this.rustI64Counters.get(String(node.text));
        return symbol !== undefined && this.rustSymbolOf(node) === symbol ? symbol : undefined;
    }

    /** True when every use of `name` in the printed body is a `.get(name as usize)` read or a `Value::Int(name)` box. */
    rustI64BodyIsClosed(text: string, name: string): boolean {
        const masked = text.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/\/\/[^\n]*/g, '');
        const count = (re: RegExp): number => (masked.match(re) ?? []).length;
        const word = `(?<![\\w.])${name}(?![\\w])`;
        const uses = count(new RegExp(word, 'g'));
        const closed = count(new RegExp(`\\.get\\(${name} as usize\\)`, 'g')) + count(new RegExp(`Value::Int\\(${name}\\)`, 'g'));
        return uses > 0 && uses === closed;
    }

    private static readonly COMPARISON_OPS = new Set([
        SyntaxKind.EqualsEqualsToken, SyntaxKind.EqualsEqualsEqualsToken, SyntaxKind.ExclamationEqualsToken, SyntaxKind.ExclamationEqualsEqualsToken,
        SyntaxKind.LessThanToken, SyntaxKind.LessThanEqualsToken, SyntaxKind.GreaterThanToken, SyntaxKind.GreaterThanEqualsToken,
    ]);

    // Comparison helpers that can be replaced by a native numeric operator.
    private static readonly NATIVE_COMPARISON_OPERATORS: Record<number, string> = {
        [SyntaxKind.LessThanToken]: '<', [SyntaxKind.LessThanEqualsToken]: '<=',
        [SyntaxKind.GreaterThanToken]: '>', [SyntaxKind.GreaterThanEqualsToken]: '>=',
    };

    isEqualityOp(op): boolean {
        return op === SyntaxKind.EqualsEqualsToken || op === SyntaxKind.EqualsEqualsEqualsToken ||
            op === SyntaxKind.ExclamationEqualsToken || op === SyntaxKind.ExclamationEqualsEqualsToken;
    }

    isLogicalOp(op): boolean {
        return op === SyntaxKind.AmpersandAmpersandToken || op === SyntaxKind.BarBarToken;
    }

    printCondition(node, identation) {
        const idn = this.getIden(identation);
        if (node.kind === SyntaxKind.BinaryExpression) {
            const opKind = node.operatorToken.kind;
            // Comparison binary expressions already return bool — skip is_true() wrapping
            if (RustTranspiler.COMPARISON_OPS.has(opKind)) return this.printComparisonInBooleanContext(node, identation);
            // Logical &&/|| operands are individually is_true()-wrapped in
            // printBinaryExpression, so the whole expression is already bool —
            // unless one carries a native compare, which needs no is_true().
            if (this.isLogicalOp(opKind)) {
                const native = this.hasNativeComparisonOperand(node.left) || this.hasNativeComparisonOperand(node.right);
                return idn + (native ? this.printLogicalInBooleanContext(node) : this.printNode(node, 0));
            }
        }
        // PrefixUnary ! — delegate to avoid double-wrapping
        if (node.kind === SyntaxKind.PrefixUnaryExpression && node.operator === SyntaxKind.ExclamationToken) {
            return this.printPrefixUnaryExpression(node, identation);
        }
        // A bare identifier of native-`bool` type: `is_true(&x)` is the identity.
        const nativeBoolParam = this.printNativeBoolParamCondition(node);
        if (nativeBoolParam !== undefined) return idn + nativeBoolParam;
        // A call to a hand-written `-> bool` fn is already a Rust bool.
        if (this.rustCallPrintsBool(node)) return idn + this.printNode(node, 0);
        // Checker-proved boolean Value (safe_bool / get_value): native matches!.
        const nativeTruthiness = this.printNativeTruthiness(node);
        if (nativeTruthiness !== undefined) return idn + nativeTruthiness;
        const nativeTruthinessText = this.rustNativeTruthiness(node); if (nativeTruthinessText !== undefined) return idn + nativeTruthinessText;
        const identifierTruthiness = this.printNativeIdentifierTruthiness(node);
        if (identifierTruthiness !== undefined) return idn + identifierTruthiness;
        // B-26: an operand whose printer emission is already a Rust `bool`.
        const nativeCondition = this.printNativeParenthesizedCondition(node);
        if (nativeCondition !== undefined && this.rustConditionBoolSlot(node)) return idn + nativeCondition;
        const expression = this.printNode(node, 0);
        const peeled = this.peelValueBoolBox(this.stripOuterParens(expression));
        if (peeled !== undefined && this.rustConditionBoolSlot(node) && !this.printedBoolHelperCall(this.stripOuterParens(peeled))) {
            return `${idn}(${peeled})`;
        }
        return `${idn}is_true(&${this.printTruthyArgument(expression)})`;
    }

    // B-26: `is_true(&(…)` on an operand the printer already emits as a native Rust `bool` (payload
    // compares, `matches!` predicates, `&&`/`||` of those) is the identity (`IsTruthy for bool`);
    // native text has no helper token, so it is emitted only in a bool slot (`isBareBoolEmissionSafe`).

    /** Bool-slot text of a parenthesised native comparison/predicate, else undefined. */
    printNativeParenthesizedCondition(node): string | undefined {
        const inner = this.unwrapParens(node);
        if (inner === undefined || inner === node || inner.kind !== SyntaxKind.BinaryExpression) return undefined;
        const op = inner.operatorToken.kind;
        if (this.isLogicalOp(op)) {
            // Every operand of a logical already prints a bool; keep the wrapper
            // when they are all helper-led (the post-passes key on that token).
            if (!this.hasNativeComparisonOperand(inner.left) && !this.hasNativeComparisonOperand(inner.right)) return undefined;
            return `(${this.printLogicalInBooleanContext(inner)})`;
        }
        if (!RustTranspiler.COMPARISON_OPS.has(op)) return undefined;
        let native: string | undefined;
        if (inner.left.kind === SyntaxKind.TypeOfExpression) {
            // `typeof x === 'string'` prints the same native predicate as `x in obj`.
            native = this.nativeValuePredicateText(inner.right.text, inner.left.expression, this.printNode(inner.left.expression, 0));
            const isDiff = op === SyntaxKind.ExclamationEqualsEqualsToken || op === SyntaxKind.ExclamationEqualsToken;
            if (native !== undefined && isDiff) native = '!' + native;
        } else {
            native = this.isEqualityOp(op) ? this.nativeEqualityText(inner) : this.printNativeOrderedComparison(inner, op, inner.left, inner.right);
        }
        return native === undefined ? undefined : `(${native})`;
    }

    // The argument of an `is_true(&…)` sink with the printer's `Value::Bool(…)` box peeled when it
    // spans the whole argument: `IsTruthy for Value` unboxes `Value::Bool(b)` to `b`, so the bool
    // prints bare. `is_true` is the one sink taking a native `bool`; the marker stays for post-passes.
    printTruthyArgument(expression: string): string {
        const inner = this.peelValueBoolBox(this.stripOuterParens(expression));
        // parens kept: `is_true(&a == b)` would re-associate the argument.
        return inner === undefined ? expression : `(${inner})`;
    }

    // `assert(<cond>, <msgs>)` — the test harness' `assert<T: Truthy>` takes a
    // native `bool` (`impl Truthy for bool`), so a whole-argument
    // `Value::Bool(…)` box prints bare there too. The message list is untouched.
    printAssertCall(node, identation, parsedArgs) {
        const [first, rest] = this.splitFirstArgument(parsedArgs);
        const inner = this.peelValueBoolBox(this.stripOuterParens(first));
        return inner === undefined ? `assert(${parsedArgs})` : `assert((${inner})${rest})`;
    }

    // Splits an already-printed argument list after its first top-level `,`.
    splitFirstArgument(parsedArgs: string): [string, string] {
        let depth = 0;
        for (let i = 0; i < parsedArgs.length; i++) {
            const char = parsedArgs[i];
            if (char === '"') {
                for (i++; i < parsedArgs.length && parsedArgs[i] !== '"'; i++) {
                    if (parsedArgs[i] === '\\') i++;
                }
            } else if ('([{'.includes(char)) depth++;
            else if (')]}'.includes(char)) depth--;
            else if (char === ',' && depth === 0) return [parsedArgs.slice(0, i), parsedArgs.slice(i)];
        }
        return [parsedArgs, ''];
    }

    // Bool-position text for a comparison: the native payload compare (already
    // bool) when the checker proves it, the is_equal() helper otherwise.
    printComparisonInBooleanContext(node, identation) {
        const native = this.nativeEqualityText(node);
        return this.getIden(identation) + (native ? `(${native})` : this.printNode(node, 0));
    }

    // Native equality text of `node` (parens unwrapped), if the checker proves it.
    nativeEqualityText(node) {
        const inner = this.unwrapParens(node);
        if (inner === undefined || inner.kind !== SyntaxKind.BinaryExpression || !this.isEqualityOp(inner.operatorToken.kind)) return undefined;
        return this.printNativeEqualityComparison(inner.left, inner.right, inner.operatorToken.kind);
    }

    unwrapParens(node) {
        let inner = node;
        while (inner !== undefined && inner.kind === SyntaxKind.ParenthesizedExpression) inner = inner.expression;
        return inner;
    }

    // Does `node` carry a native payload compare in a position where the old
    // text started with a bool helper? The post-pass types locals by that token.
    hasNativeComparisonOperand(node) {
        const inner = this.unwrapParens(node);
        if (inner === undefined) return false;
        if (inner.kind === SyntaxKind.PrefixUnaryExpression && inner.operator === SyntaxKind.ExclamationToken) {
            return this.hasNativeComparisonOperand(inner.operand);
        }
        if (this.nativeEqualityText(inner) !== undefined) return true;
        if (inner.kind === SyntaxKind.BinaryExpression && this.nativeIndexOfLiteralTestText(inner.operatorToken.kind, inner.left, inner.right) !== undefined) return true;
        return inner.kind === SyntaxKind.BinaryExpression && this.isLogicalOp(inner.operatorToken.kind) &&
            (this.hasNativeComparisonOperand(inner.left) || this.hasNativeComparisonOperand(inner.right));
    }

    // Bare `&&`/`||` text of a logical expression (its operands are bools).
    printLogicalInBooleanContext(node) {
        const token = node.operatorToken.kind === SyntaxKind.AmpersandAmpersandToken ? '&&' : '||';
        return `${this.printCondition(node.left, 0).trim()} ${token} ${this.printCondition(node.right, 0).trim()}`;
    }

    printWhileStatement(node, identation) {
        return `${this.getIden(identation)}while ${this.printCondition(node.expression, 0)}${this.printBlock(node.statement, identation)}`;
    }

    printIfStatement(node, identation) {
        const elseStatement = node.elseStatement;
        const ifBody = this.printBlock(node.thenStatement, identation, elseStatement !== undefined);
        const head = node.parent.kind === SyntaxKind.IfStatement ? 'else if ' : `${this.getIden(identation)}if `;
        let ifComplete = `${head}${this.printCondition(node.expression, 0)}${ifBody}`;
        if (elseStatement?.kind === SyntaxKind.Block) {
            ifComplete += ` else${this.printBlock(elseStatement, identation)}`;
        } else if (elseStatement?.kind === SyntaxKind.IfStatement) {
            ifComplete += ' ' + this.printIfStatement(elseStatement, identation);
        }
        return this.printNodeCommentsIfAny(node, identation, ifComplete);
    }

    printPostFixUnaryExpression(node, identation) {
        const { operand, operator } = node;
        const helper = operator === SyntaxKind.PlusPlusToken ? 'add' : operator === SyntaxKind.MinusMinusToken ? 'subtract' : undefined;
        if (helper === undefined) return super.printPostFixUnaryExpression(node, identation);
        const operandText = this.printNode(operand, 0);
        const native = this.printNativeIncrement(helper === 'add' ? SyntaxKind.PlusToken : SyntaxKind.MinusToken, operand, operandText);
        return `${this.getIden(identation)}${operandText} = ${native ?? `${helper}(&${operandText}, &Value::Int(1))`}`;
    }

    // `x++` / `x--` on a checker-typed number: native `+`/`-` with `Value::Int(1)`.
    printNativeIncrement(op, operand, operandText: string): string | undefined {
        try {
            if (!this.isNumberLikeType(this.getChecker().getTypeAtLocation(operand))) return undefined;
        } catch (e) {
            return undefined;
        }
        return this.printNativeNumeric(op, operandText, 'Value::Int(1)');
    }

    printPrefixUnaryExpression(node, identation) {
        const { operand, operator } = node;
        const idn = this.getIden(identation);
        if (operator === SyntaxKind.ExclamationToken) return idn + '!' + this.printCondition(operand, 0);
        if (operator !== SyntaxKind.MinusToken) return idn + this.PrefixFixOperators[operator] + this.printNode(operand, 0);
        const operandText = this.printNode(operand, 0);
        return idn + (this.foldNegateLiteral(operandText) ?? this.printRustNativeNegate(operand, operandText) ?? `negate(&${operandText})`);
    }

    printObjectLiteralExpression(node, identation) {
        return `Value::Map(${this.rustObjectLiteralBlock(node, identation)})`;
    }

    /** The object-literal block on its own (`{ let mut m = …; m }`) — the payload a
     *  `Value::Map(..)` box carries and the initialiser a typed dict bearer needs. */
    rustObjectLiteralBlock(node, identation) {
        const escapeKey = (s: any): string => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
            .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
        const idn2 = this.getIden(identation + 2);
        const lines = node.properties.map(p => {
            // Shorthand: { foo }  →  m.insert("foo", foo.clone());
            if (isShorthandPropertyAssignment(p)) {
                const name = (p.name as Identifier).text;
                return `${idn2}m.insert("${escapeKey(name)}".to_string(), ${name}.clone());`;
            }
            const keyText = isStringLiteral(p.name) ? p.name.text : p.name.text;
            return `${idn2}m.insert("${escapeKey(keyText)}".to_string(), ${this.printNode(p.initializer, 0)});`;
        });
        const idn1 = this.getIden(identation + 1);
        const body = lines.map(l => l + '\n').join('');
        return `{\n${idn1}let mut m = std::collections::HashMap::new();\n${body}${idn1}m\n${this.getIden(identation)}}`;
    }

    printArrayLiteralExpression(node, identation) {
        return `Value::from(vec![${node.elements.map(e => this.printNode(e, 0)).join(', ')}])`;
    }

    printDeleteExpression(node, identation) {
        return this.provenDictFieldDelete(node) ?? `remove(&mut ${this.printNode(node.expression.expression, 0)}, &${this.printNode(node.expression.argumentExpression, 0)})`;
    }

    printInstanceOfExpression(node, identation) {
        return `${this.getIden(identation)}is_instance(&${this.printNode(node.left, 0)}, &${this.printNode(node.right, 0)})`;
    }

    printConditionalExpression(node, identation) {
        const condition = this.printCondition(node.condition, 0);
        const whenTrue = this.printTernaryArm(node.whenTrue);
        const whenFalse = this.printTernaryArm(node.whenFalse);
        // `ternary` is `if cond { a } else { b }` over `Value`; the arms are
        // normalized to `Value`, so the native form matches it and evaluates
        // only the taken arm (TS semantics).
        return `(if ${condition} { ${whenTrue} } else { ${whenFalse} })`;
    }

    // Free runtime functions that print as `bool` (not `Value`) — mirror of the
    // Rust pipeline's `ternary()` bool-boxing list.
    private static readonly BOOL_VALUE_PREFIXES = [
        'is_equal', 'is_true', 'is_greater_than', 'is_less_than',
        'is_greater_than_or_equal', 'is_less_than_or_equal', 'is_array',
        'is_object', 'in_op', 'is_number', 'is_string',
    ];

    private static isBoolValueExpression(text: string): boolean {
        let value = text.trim();
        while (value.startsWith('(') && value.endsWith(')')) {
            let depth = 0;
            let wrapsWhole = true;
            for (let i = 0; i < value.length && wrapsWhole; i++) {
                if (value[i] === '(') depth++;
                else if (value[i] === ')' && --depth === 0 && i < value.length - 1) wrapsWhole = false;
            }
            if (!wrapsWhole) break;
            value = value.slice(1, -1).trim();
        }
        if (value.startsWith('!')) value = value.slice(1).trim();
        return RustTranspiler.BOOL_VALUE_PREFIXES.some((fn) => value.startsWith(fn + '('));
    }

    // An if-expression arm keeps the type `ternary()`'s `Value` parameters gave
    // it: box bool expressions, and clone bare identifiers so the arm does not
    // move a local the caller still uses.
    printTernaryArm(node, identation = 0) {
        const text = this.printNode(node, identation);
        const trimmed = text.trim();
        if (RustTranspiler.isBoolValueExpression(trimmed)) return `Value::Bool(${trimmed})`;
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed) && trimmed !== 'self' && trimmed !== 'true' && trimmed !== 'false') return `${trimmed}.clone()`;
        return text;
    }

    // Built-in method call overrides
    printArrayIsArrayCall(node, identation, parsedArg = undefined) {
        return `Value::Bool(${this.nativeValuePredicateText('array', node?.arguments?.[0], parsedArg) ?? `is_array(&${parsedArg})`})`;
    }

    printObjectKeysCall(node, identation, parsedArg = undefined) {
        return this.bearerEnum(node, 'keys') ?? this.provenDictFieldEnum(node, parsedArg, 'keys') ?? this.predictionEnum(node, parsedArg, 'keys') ?? this.baseEnum(node, parsedArg, 'keys') ?? `object_keys(&${parsedArg})`;
    }

    printObjectValuesCall(node, identation, parsedArg = undefined) {
        return this.bearerEnum(node, 'values') ?? this.provenDictFieldEnum(node, parsedArg, 'values') ?? this.predictionEnum(node, parsedArg, 'values') ?? this.baseEnum(node, parsedArg, 'values') ?? `object_values(&${parsedArg})`;
    }

    /** `Object.keys/values(x)` on a typed bearer — the map's own iterators. A bearer is built
     *  from an object literal, so the helper's ws/tag filters have nothing to strip. */
    bearerEnum(node: any, kind: 'keys' | 'values'): string | undefined {
        const arg = this.bearerEnumArg(node);
        if (arg === undefined || this.rustDictBearerDeclaration(arg) === undefined) return undefined;
        const recv = String(arg.text);
        const body = kind === 'keys'
            ? `${recv}.keys().map(|__k| Value::Str(__k.clone().into())).collect()`
            : `${recv}.values().cloned().collect()`;
        return `Value::Array(${body})`;
    }

    /** The single plain-identifier argument of `Object.keys/values(…)`. */
    bearerEnumArg(node: any): Identifier | undefined {
        if (!isCallExpression(node) || (node.arguments?.length ?? 0) !== 1) return undefined;
        const callee: any = node.expression;
        if (!isPropertyAccessExpression(callee) || !isIdentifier(callee.expression)
            || String(callee.expression.text) !== 'Object'
            || (String(callee.name.text) !== 'keys' && String(callee.name.text) !== 'values')) {
            return undefined;
        }
        const arg: any = this.rustSkipWrappers(node.arguments[0]);
        return arg !== undefined && isIdentifier(arg) ? arg : undefined;
    }

    printJsonParseCall(node, identation, parsedArg = undefined) {
        return `json_parse(&${parsedArg})`;
    }

    printJsonStringifyCall(node, identation, parsedArg = undefined) {
        return `json_stringify(&${parsedArg})`;
    }

    printMathFloorCall(node, identation, parsedArg = undefined) {
        return this.printRustNativeMathCall(node, 'floor', parsedArg) ?? `math_floor(&${parsedArg})`;
    }

    // No `.await` here: `printAwaitExpression` appends it for `await Promise.all(...)`.
    printPromiseAllCall(node, identation, parsedArg = undefined) {
        return `promise_all(&${parsedArg})`;
    }

    // Rust uses postfix `.await`; the base transpiler defaults to prefix.
    printAwaitExpression(node, identation) {
        return `${this.printNode(node.expression, identation)}.await`;
    }

    printMathRoundCall(node, identation, parsedArg = undefined) {
        return this.printRustNativeMathCall(node, 'round', parsedArg) ?? `math_round(&${parsedArg})`;
    }

    printMathCeilCall(node, identation, parsedArg = undefined) {
        return this.printRustNativeMathCall(node, 'ceil', parsedArg) ?? `math_ceil(&${parsedArg})`;
    }

    printNumberIsIntegerCall(node, identation, parsedArg = undefined) {
        return `is_integer(&${parsedArg})`;
    }

    printArrayPushCall(node, identation, name = undefined, parsedArg = undefined) {
        return this.printRustVecPush(node, name, parsedArg) ?? this.arrPush(node, name, parsedArg) ?? `append_to_array(&mut ${name}, ${parsedArg})`;
    }

    printIncludesCall(node, identation, name = undefined, parsedArg = undefined) {
        return `Value::Bool(contains(&${name}, &${parsedArg}))`;
    }

    printIndexOfCall(node, identation, name = undefined, parsedArg = undefined) {
        return this.printNativeStringIndexOf(node, name) ?? this.printNativeStringIndexOfString(node, name) ?? this.looseIndexOf(name, parsedArg);
    }

    printStartsWithCall(node, identation, name = undefined, parsedArg = undefined) {
        const native = this.printNativeStringAffixTest(node, name, 'starts_with') ?? this.printAffixTest(node, name, 'starts_with');
        if (native !== undefined) return `Value::Bool(${native})`;
        return `Value::Bool(starts_with(&${name}, &${parsedArg}))`;
    }

    printEndsWithCall(node, identation, name = undefined, parsedArg = undefined) {
        const native = this.printNativeStringAffixTest(node, name, 'ends_with') ?? this.printAffixTest(node, name, 'ends_with');
        if (native !== undefined) return `Value::Bool(${native})`;
        return `Value::Bool(ends_with(&${name}, &${parsedArg}))`;
    }

    printTrimCall(node, identation, name = undefined) {
        return this.printTrim(node, name) ?? `trim(&${name})`;
    }

    printJoinCall(node, identation, name = undefined, parsedArg = undefined) {
        return this.printStrVecParamJoin(node) ?? this.printVecJoin(node) ?? this.printNativeStringJoin(node, name) ?? `join(&${name}, &${parsedArg})`;
    }

    printSplitCall(node, identation, name = undefined, parsedArg = undefined) {
        return this.printNativeStringSplit(node, name) ?? this.printRustSplit(node, name) ?? `split(&${name}, &${parsedArg})`;
    }

    printConcatCall(node, identation, name = undefined, parsedArg = undefined) {
        return `concat(${name}.clone(), ${parsedArg}.clone())`;
    }

    printToFixedCall(node, identation, name = undefined, parsedArg = undefined) {
        return this.printNativeToFixed(node, name) ?? `to_fixed(&${name}, &${parsedArg})`;
    }

    printToStringCall(node, identation, name = undefined) {
        return this.printRustNativeToString(node, name) ?? this.printRustToString(node, name) ?? `to_string_val(&${name})`;
    }

    printToUpperCaseCall(node, identation, name = undefined) {
        return this.printNativeStringCase(node, name, 'to_uppercase') ?? this.printRustCase(node, name, 'to_uppercase') ?? this.looseStrCase(name, 'to_uppercase');
    }

    printToLowerCaseCall(node, identation, name = undefined) {
        return this.printNativeStringCase(node, name, 'to_lowercase') ?? this.printRustCase(node, name, 'to_lowercase') ?? this.looseStrCase(name, 'to_lowercase');
    }

    printShiftCall(node, identation, name = undefined) {
        return `shift(${name}.clone())`;
    }

    printReverseCall(node, identation, name = undefined) {
        return `${name} = reverse(${name}.clone())`;
    }

    printPopCall(node, identation, name = undefined) {
        return `pop(${name}.clone())`;
    }

    printSliceCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return this.printNativeStringSlice(node, name) ?? this.looseSlice(name, parsedArg, parsedArg2 ?? 'Value::Null');
    }

    printReplaceCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return this.printNativeStringReplace(node, name) ?? this.printRustReplace(node, name) ?? this.printReplace(node, name) ?? `replace_str(&${name}, &${parsedArg}, &${parsedArg2})`;
    }

    printReplaceAllCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return this.printNativeStringReplace(node, name) ?? this.printRustReplace(node, name) ?? this.printReplace(node, name) ?? `replace_all_str(&${name}, &${parsedArg}, &${parsedArg2})`;
    }

    // `{}` (Display) renders an ExchangeError as `[Kind] message`; `{:?}` would dump the struct fields.
    printThrowStatement(node, identation) {
        return `${this.getIden(identation)}panic!("{}", ${this.printNode(node.expression, 0)});`;
    }

    rustCatchBindingIsRead(block: Node, name: string): boolean {
        let read = false;
        const visit = (n: Node) => {
            if (read) return;
            if (isIdentifier(n) && n.text === name) { read = true; return; }
            n.forEachChild(visit);
        };
        block.forEachChild(visit);
        return read;
    }

    printTryStatement(node, identation) {
        const body = (block) => block.statements.map(s => this.printNode(s, identation + 1)).join('\n');
        const rawName = node.catchClause?.variableDeclaration?.name?.text;
        const iden = this.getIden(identation);
        const errorName = rawName ? `_${rawName}` : '_e';
        // A handler that never reads its binding needs no payload: `is_err()` is native.
        const head = rawName !== undefined && this.rustCatchBindingIsRead(node.catchClause.block, rawName)
            ? `if let Err(${errorName}) = _try_result {` : 'if _try_result.is_err() {';
        return `${iden}let _try_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {\n${body(node.tryBlock)}\n${iden}}));\n` +
            `${iden}${head}\n${body(node.catchClause.block)}\n${iden}}`;
    }

    printReturnStatement(node, identation) {
        const exp = node.expression;
        const idn = this.getIden(identation);
        if (!exp) return `${idn}return;`;
        // `return X;` inside a native-`Option<String>` method: the printed
        // expression is still the `Value` box, so convert it back to the
        // native payload (a nullish literal is the `None` arm).
        const fn: any = findAncestor(node.parent, isFunctionLike);
        if (this.rustNativeStrReturnKind(fn) === 'str' && this.rustStrReturnValueConverts(exp)) {
            if (this.literalKindOfNode(this.unwrapParensNode(exp)) === 'null') return `${idn}return None;`;
            const suffix = this.rustStrNativeExpression(exp) ? '' : '.as_str().map(str::to_owned)';
            return `${idn}return ${this.printNode(exp, 0).trim()}${suffix};`;
        }
        return `${idn}return ${this.printNode(exp, 0).trim()};`;
    }

    printBreakStatement(node, identation) {
        return `${this.getIden(identation)}break;`;
    }

    printContinueStatement(node, identation) {
        return `${this.getIden(identation)}continue;`;
    }

    printConstructorDeclaration(node, identation) {
        return ''; // handled in printNewMethod
    }

    printSpreadElement(node, identation) {
        return `${this.getIden(identation)}${this.printNode(node.expression, 0)}`;
    }

    // Native element write on a local the plain-dict proof admits through its write history:
    // `const x = this.account ()`, a `let x = {}` / `let x: Dict = undefined` later reassigned,
    // `[ x, p ] = this.handleUntilOption (…)`.

    /** Base-tier methods whose every return is a fresh tag-free object
     *  literal (no venue override, no hand-written stub replaces them). */
    private static readonly RUST_PLAIN_DICT_BUILDERS = new Set([ 'account', 'safeLedgerEntry', 'depositWithdrawFee' ]);

    /** Base-tier `[Dict, Dict]` tuple helpers that hand back their `request` argument (index 1). */
    private static readonly RUST_REQUEST_TUPLE_HELPERS = new Set([ 'handleUntilOption' ]);

    rustNativeDictInsert(baseExpr, keyNode, keyText: string, valueText: string): string | undefined {
        if (!isIdentifier(baseExpr) || !this.rustLocalStaysPlain(baseExpr)) {
            return undefined;
        }
        // Every write is a fresh literal / builder: the receiver is untagged and
        // a book-meta key needs no `__book_id` guard (`plain: true`).
        const receiver = { text: String(baseExpr.text), isField: false, plain: true, nameNode: baseExpr };
        const keyArg = this.rustNativeInsertKeyArg(receiver, keyNode, keyText);
        if (keyArg === undefined) {
            return undefined;
        }
        const name = receiver.text;
        const value = this.rustPrintedBoolArg(valueText) ? `Value::Bool(${valueText})` : valueText.trim();
        const insert = (val: string) =>
            `if let Value::Dict(__d) = &mut ${name} { std::sync::Arc::make_mut(__d).insert(${keyArg}, ${val}); }`;
        // same operand handling as printNativeDictInsert: hoist a read of the receiver, clone a bare place
        if (new RegExp(`\\b${name}\\b`).test(value)) {
            return `{ let __be_tmp = ${value}; ${insert('__be_tmp')} }`;
        }
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value) && value !== 'self' && value !== 'true' && value !== 'false') {
            return insert(`${value}.clone()`);
        }
        return insert(value);
    }

    /** A local (single binding in its function, no closure capture of a write)
     *  whose declaration and every write is a plain-dict source or nullish. A
     *  nullish value leaves a non-Dict, which `if let Value::Dict` no-ops on
     *  exactly like the helper's `_ => {}` arm. */
    rustLocalStaysPlain(ident: Identifier, depth = 0): boolean {
        const checker: any = this.checkerOrUndefined();
        const declarations: any[] = checker === undefined ? [] : symbolDeclarations(checker.getSymbolAtLocation(ident));
        const declaration: any = declarations.length === 1 ? declarations[0] : undefined;
        if (declaration === undefined || depth > 4) {
            return false;
        }
        if (declaration.kind === SyntaxKind.BindingElement) {
            return this.rustTupleBindingStaysPlain(ident, declaration, depth);
        }
        if (!isVariableDeclaration(declaration) || declaration.name?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const scope = this.rustEnclosingFunction(declaration);
        if (scope === undefined || isSourceFile(scope) || this.rustEnclosingFunction(ident) !== scope) {
            return false;
        }
        const name = String(ident.text);
        const symbol = this.rustSymbolOf(declaration.name as Identifier);
        if (symbol === undefined) {
            return false;
        }
        if (declaration.initializer !== undefined && !this.rustPlainSource(declaration.initializer, name)) {
            return false;
        }
        let plain = true;
        for (const node of this.rustScopeNameNodes(scope, name) as any[]) {
            if (node === declaration) continue;
            if (this.rustBindsName(node, name)) {
                // a sibling block's own `const x` is another binding; only an unresolved one rejects
                if (this.rustSymbolOf(node.name) === undefined) { plain = false; break; }
                continue;
            }
            if (node.kind !== SyntaxKind.Identifier || node === declaration.name || this.rustSymbolOf(node) !== symbol) continue;
            if (this.rustEnclosingFunction(node) !== scope) { plain = false; break; } // captured by a callback
            if (!this.rustUseKeepsPlain(node, name)) { plain = false; break; }
        }
        return plain;
    }

    /** `const [ x, p ] = this.handleUntilOption (k, r, …)` with `r` itself a
     *  plain local: element 0 is `r` handed back, and `x` is never re-written. */
    private rustTupleBindingStaysPlain(ident: Identifier, element: any, depth: number): boolean {
        const pattern: any = element.parent;
        const declaration: any = pattern?.parent;
        if (pattern?.kind !== SyntaxKind.ArrayBindingPattern || declaration === undefined || !isVariableDeclaration(declaration)
            || ![0, 1].includes(pattern.elements.indexOf(element)) || element.name?.kind !== SyntaxKind.Identifier
            || element.initializer !== undefined || element.dotDotDotToken !== undefined) {
            return false;
        }
        if (pattern.elements.indexOf(element) === 1 ? !this.paramsSlot(declaration.initializer, undefined, depth) : !this.rustTupleHeadIsPlain(declaration.initializer, undefined, depth)) {
            return false;
        }
        const scope = this.rustEnclosingFunction(declaration);
        const name = String(ident.text);
        const symbol = this.rustSymbolOf(element.name);
        if (scope === undefined || symbol === undefined || this.rustEnclosingFunction(ident) !== scope) {
            return false;
        }
        for (const node of this.rustScopeNameNodes(scope, name) as any[]) {
            if (node.kind !== SyntaxKind.Identifier || node === element.name || this.rustSymbolOf(node) !== symbol) continue;
            if (this.rustEnclosingFunction(node) !== scope || !this.rustUseKeepsPlain(node, name)) return false;
        }
        return true;
    }

    /** The shipped construction proof (literal-built local / handler tuple), read-only. */
    private rustShippedPlain(ident: Identifier): boolean {
        const declaration = this.rustSingleLocalDeclaration(ident);
        return declaration !== undefined && isVariableDeclaration(declaration as any)
            && this.rustInsertReceiverBuildsPlainDict(declaration as VariableDeclaration);
    }

    /** A use of the local: reads and element writes keep the box; a direct
     *  assignment must store a plain source; any other write shape rejects. */
    private rustUseKeepsPlain(node: Node, name: string): boolean {
        let target: any = node;
        while (target.parent !== undefined && (isParenthesizedExpression(target.parent) || isNonNullExpression(target.parent) || isAsExpression(target.parent))) {
            target = target.parent;
        }
        const parent: any = target.parent;
        if (parent === undefined) return true;
        if (isBinaryExpression(parent) && parent.left === target && rustIsAssignmentOperator(parent.operatorToken.kind)) {
            return parent.operatorToken.kind === SyntaxKind.EqualsToken && this.rustPlainSource(parent.right, name);
        }
        if (parent.kind === SyntaxKind.ArrayLiteralExpression) {
            const assign: any = parent.parent;
            if (assign !== undefined && isBinaryExpression(assign) && assign.left === parent) {
                return this.rustRequestTupleWrite(assign.right, parent.elements.indexOf(target), name);
            }
        }
        // a field of a `let`-bound literal aliasing the local feeds ccxt's
        // writeBackAliasedArrayMutations, which keys on the helper text
        if ((parent.kind === SyntaxKind.PropertyAssignment || parent.kind === SyntaxKind.ShorthandPropertyAssignment)
            && !(parent.kind === SyntaxKind.PropertyAssignment && parent.initializer !== target)) {
            let literal: any = parent.parent;
            while (literal?.parent !== undefined && (isParenthesizedExpression(literal.parent) || isAsExpression(literal.parent))) literal = literal.parent;
            if (literal?.parent === undefined || isVariableDeclaration(literal.parent)) return false;
        }
        if (parent.kind === SyntaxKind.PrefixUnaryExpression || parent.kind === SyntaxKind.PostfixUnaryExpression
            || parent.kind === SyntaxKind.DeleteExpression
            || ((isForOfStatement(parent) || isForInStatement(parent)) && parent.initializer === target)) {
            return false;
        }
        return true;
    }

    /** `[ x, … ] = this.handleUntilOption (k, x, …)` — element 0 is the request
     *  argument handed back (base-tier implementation, no override). */
    private rustRequestTupleWrite(rhs: Node, index: number, name: string): boolean {
        return index === 1 ? this.paramsSlot(rhs, name, 0) : (index === 0 && this.rustTupleHeadIsPlain(rhs, name, 0));
    }

    /** Element 0 of `this.m (…)` is a plain dict: `m` is the base-tier
     *  `handleUntilOption` (returns its `request` argument), or a method of the
     *  calling file (Rust calls it statically) whose every `return [ X, … ]`
     *  has X a plain literal / plain local, or a parameter whose argument here is. */
    private rustTupleHeadIsPlain(rhs: Node, selfName: string | undefined, depth: number): boolean {
        const call: any = this.rustStripWrappers(rhs);
        if (depth > 4 || call === undefined || !isCallExpression(call) || !isPropertyAccessExpression(call.expression)
            || call.expression.expression.kind !== SyntaxKind.ThisKeyword) {
            return false;
        }
        const argPlain = (index: number): boolean => {
            const arg: any = this.rustStripWrappers(call.arguments[index]);
            return arg !== undefined && (this.rustPlainDictLiteral(arg) || (isIdentifier(arg)
                && (String(arg.text) === selfName || this.rustLocalStaysPlain(arg, depth + 1) || this.rustShippedPlain(arg))));
        };
        if (RustTranspiler.RUST_REQUEST_TUPLE_HELPERS.has(String(call.expression.name.text))) {
            return this.rustCalleeIsBase(call) && argPlain(1);
        }
        let declaration: any;
        try {
            declaration = signatureDeclaration((this.getChecker() as any).getResolvedSignature(call));
        } catch (e) {
            return false;
        }
        if (declaration?.kind !== SyntaxKind.MethodDeclaration || declaration.body === undefined
            || declaration.getSourceFile() !== call.getSourceFile()) {
            return false;
        }
        let plain = true;
        let returns = 0;
        this.rustWalkScope(declaration.body, (n) => {
            if (isArrowFunction(n) || n.kind === SyntaxKind.FunctionExpression) return RUST_WALK_SKIP;
            if (!isReturnStatement(n)) return;
            returns++;
            const tuple: any = this.rustStripWrappers(n.expression);
            const head: any = tuple?.kind === SyntaxKind.ArrayLiteralExpression ? this.rustStripWrappers(tuple.elements[0]) : undefined;
            const param = head !== undefined && isIdentifier(head) ? declaration.parameters.findIndex((p) => p.name?.kind === SyntaxKind.Identifier && String(p.name.text) === String(head.text)) : -1;
            const ok = head !== undefined && (this.rustPlainDictLiteral(head)
                || (param >= 0 ? (this.rustSymbolOf(head) === this.rustSymbolOf(declaration.parameters[param].name) && argPlain(param)
                    && this.rustParamUnassigned(declaration, String(head.text)))
                    : (isIdentifier(head) && this.rustLocalStaysPlain(head, depth + 1))));
            if (!ok) { plain = false; return RUST_WALK_STOP; }
        });
        return plain && returns > 0;
    }

    /** A pass-through parameter: never assigned in the method body. */
    private rustParamUnassigned(method: any, name: string): boolean {
        let kept = true;
        this.rustWalkScope(method.body, (n) => {
            if (isBinaryExpression(n) && rustIsAssignmentOperator(n.operatorToken.kind) && isIdentifier(n.left) && String(n.left.text) === name) {
                kept = false;
                return RUST_WALK_STOP;
            }
        });
        return kept;
    }

    /** A value that is a fresh plain dict, nullish, or the local itself. */
    rustPlainSource(node: Node, name: string): boolean {
        const stripped: any = this.rustStripWrappers(node);
        if (stripped === undefined) return false;
        if (this.rustPlainDictLiteral(stripped) || this.rustTypeIsUndefinedish(stripped)
            || (isIdentifier(stripped) && String(stripped.text) === name)) {
            return true;
        }
        if (isConditionalExpression(stripped)) {
            return this.rustPlainSource(stripped.whenTrue, name) && this.rustPlainSource(stripped.whenFalse, name);
        }
        if (isCallExpression(stripped) && isPropertyAccessExpression(stripped.expression)
            && stripped.expression.expression.kind === SyntaxKind.ThisKeyword
            && RustTranspiler.RUST_PLAIN_DICT_BUILDERS.has(String(stripped.expression.name.text))) {
            return this.rustCalleeIsBase(stripped);
        }
        if (this.rustPlainDictSource(stripped)) return true;
        // `x = this.omit|keysort (x, …)` copies x's own map; `this.extend (…)` builds a
        // fresh map from its dict arguments — plain when each of them is.
        if (isCallExpression(stripped) && isPropertyAccessExpression(stripped.expression)
            && stripped.expression.expression.kind === SyntaxKind.ThisKeyword && stripped.arguments.length > 0
            && this.rustCalleeIsBase(stripped)) {
            const callee = String(stripped.expression.name.text);
            const first: any = this.rustStripWrappers(stripped.arguments[0]);
            if (callee === 'omit' || callee === 'keysort') {
                return first !== undefined && isIdentifier(first) && String(first.text) === name;
            }
            if (callee === 'extend') {
                return stripped.arguments.every((a) => this.rustPlainSource(a, name));
            }
        }
        return false;
    }

    /** The checker resolves the call to the base-tier implementation (a venue
     *  override could return anything). */
    private rustCalleeIsBase(call: Node): boolean {
        let declaration: any;
        try {
            declaration = signatureDeclaration((this.getChecker() as any).getResolvedSignature(call));
        } catch (e) {
            return false;
        }
        // a method body, or the base function behind an `omit = omit;` property
        return declaration !== undefined && (declaration.body !== undefined || this.baseOverload(declaration))
            && RustTranspiler.RUST_BASE_TIER_FILE.test(String(declaration.getSourceFile().fileName).replace(/\\/g, '/'));
    }

    // `this.<field>[k]`: a class property whose declared type proves a plain dict is a
    // container struct field (never a book/cache/side/client/live marker dict), so
    // `get_value`'s marker routes cannot fire and the read is `m.get(k)`.

    /** The class property declaration behind `this.<name>` when its annotation proves a plain dict. */
    rustProvenDictThisField(node: Node): Declaration | undefined {
        if (!isPropertyAccessExpression(node) || node.expression.kind !== SyntaxKind.ThisKeyword) return undefined;
        let declaration: any;
        try {
            declaration = symbolValueDeclaration(this.getChecker().getSymbolAtLocation(node.name));
        } catch (e) {
            return undefined;
        }
        if (declaration === undefined || declaration.kind !== SyntaxKind.PropertyDeclaration || declaration.type === undefined) return undefined;
        const type = this.getCheckedTypeOf(declaration.type);
        return type !== undefined && this.isProvenMapType(type) ? declaration : undefined;
    }

    /** `this.<field>[a]` whose declared field type's element type is itself a plain dict
     *  (`Dictionary<Dictionary<T>>`). */
    rustProvenDictThisFieldElement(node: Node): boolean {
        if (!isElementAccessExpression(node)) return false;
        const field: any = this.rustProvenDictThisField(node.expression);
        if (field === undefined) return false;
        const fieldType = this.getCheckedTypeOf(field.type);
        const parts: Type[] = (fieldType.flags & TypeFlags.Union) ? (typeParts(fieldType) ?? []).filter((p) => !this.rustTypeIsNullish(p)) : [fieldType];
        return parts.length === 1 && this.isProvenMapType(this.getChecker().getIndexTypeOfType(parts[0], IndexKind.String));
    }

    /** `this.<field>[k]` with a proven-dict field and a proven string key place. */
    printNativeThisFieldDynamicMapAccess(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined {
        if (this.rustProvenDictThisField(receiverNode) === undefined && !this.rustProvenDictThisFieldElement(receiverNode)) return undefined;
        if (!this.rustKeyIsProvenString(keyNode)) return undefined;
        const keyText = this.printNode(keyNode, 0).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyText)) return undefined;
        return this.rustDictRead(receiverText, keyText, receiverNode);
    }

    // `const x = []` locals declared `Vec<Value>` when every use is a statement
    // `x.push(v)` (native push), `x.length`, `return x` or an argument inside a `return`
    // (boxed once as `Value::from(x)`). Anything else keeps the `Value` box and `append_to_array`.
    private rustVecLocalDecisions = new WeakMap<Node, boolean>();

    rustVecLocalIsTyped(declaration): boolean {
        if (declaration?.kind !== SyntaxKind.VariableDeclaration) return false;
        let decision = this.rustVecLocalDecisions.get(declaration);
        if (decision === undefined) {
            this.rustVecLocalDecisions.set(declaration, false); // re-entrancy guard
            decision = this.rustVecLocalIsTypedUncached(declaration);
            this.rustVecLocalDecisions.set(declaration, decision);
        }
        return decision;
    }

    rustVecLocalIsTypedUncached(declaration): boolean {
        const init = declaration.initializer;
        if (declaration.name?.kind !== SyntaxKind.Identifier || init === undefined
            || !isArrayLiteralExpression(init)
            || init.elements.some((element) => element.kind === SyntaxKind.SpreadElement)) return false;
        const checker: any = this.checkerOrUndefined();
        const type = checker?.getTypeAtLocation(declaration.name);
        if (type === undefined || !checker.isArrayType(type)) return false;
        const name = String(declaration.name.text);
        const fn = this.rustEnclosingFunction(declaration);
        if (fn === undefined || isSourceFile(fn)) return false;
        // The tests pipeline's text post-passes key on the boxed `Value` local shape.
        const source = declaration.getSourceFile?.()?.fileName;
        if (typeof source === 'string' && /\/test\//.test(source)) return false;
        let pushes = 0;
        const safe = this.rustLocalUsesAll(declaration, name, false, (n) => {
            const parent = n.parent;
            if ((isPropertyAccessExpression(parent) && parent.name === n)
                || (parent?.kind === SyntaxKind.PropertyAssignment && parent.name === n)) return true;
            if (this.rustEnclosingFunction(n) !== fn) return false;
            if (isPropertyAccessExpression(parent) && parent.expression === n) {
                const member = String(parent.name.text);
                if (member === 'length') {
                    const up = parent.parent;
                    return !(isBinaryExpression(up) && up.left === parent && rustIsAssignmentOperator(up.operatorToken.kind))
                        && up?.kind !== SyntaxKind.PrefixUnaryExpression && up?.kind !== SyntaxKind.PostfixUnaryExpression;
                }
                if (member === 'push' && this.rustVecPushShape(parent.parent, name)) {
                    pushes++;
                    return true;
                }
                return this.vecJoinUse(parent);
            }
            return this.rustVecValueUse(n, name) || this.vecUse(n) || this.vecPropertyUse(n);
        });
        return safe && pushes > 0;
    }

    /** The array literal's native `vec![..]`: elements are `Value`s taken by move, so a
     *  bare local is cloned (the boxed form relied on ccxt's argument-clone pass). */
    rustVecNativeLiteral(declaration): string | undefined {
        const initializer: any = declaration?.initializer;
        if (!isArrayLiteralExpression(initializer) || initializer.elements.length === 0) return undefined;
        const parts = initializer.elements.map((element) => {
            const text = this.printNode(element, 0).trim();
            const bare = /^[A-Za-z_][A-Za-z0-9_]*$/.test(text) && text !== 'self' && text !== 'true' && text !== 'false';
            return bare ? `${text}.clone()` : text;
        });
        return `vec![${parts.join(', ')}]`;
    }

    // `x.push(v);` as a whole statement, one non-spread argument not naming `x`.
    rustVecPushShape(call, name: string): boolean {
        if (!isCallExpression(call) || call.arguments.length !== 1 || call.parent?.kind !== SyntaxKind.ExpressionStatement) return false;
        const arg = call.arguments[0];
        if (arg.kind === SyntaxKind.SpreadElement) return false;
        let mentions = false;
        const visit = (m) => {
            if (mentions) return;
            if (m.kind === SyntaxKind.Identifier && m.text === name) { mentions = true; return; }
            m.forEachChild?.(visit);
        };
        visit(arg);
        return !mentions;
    }

    // `return x` / `return f(.., x, ..)` with `x` named once in the statement: a boxing move.
    // Elsewhere a boxing argument / object-literal value must be the local's last use outside any loop.
    rustVecValueUse(n, name: string): boolean {
        const parent = n.parent;
        if (isReturnStatement(parent)) return true;
        const isArg = isCallExpression(parent) && parent.arguments.some((a) => a === n) && this.rustVecBoxingCallee(parent.expression);
        const isProp = parent?.kind === SyntaxKind.PropertyAssignment && parent.initializer === n;
        if (!isArg && !isProp) return false;
        let statement: any = parent;
        while (statement !== undefined && !isStatement(statement)) statement = statement.parent;
        if (statement === undefined) return false;
        if (!isReturnStatement(statement) && !this.rustVecIsFinalUse(n, name)) return false;
        let count = 0;
        const visit = (m) => {
            if (m.kind === SyntaxKind.Identifier && m.text === name) count++;
            m.forEachChild?.(visit);
        };
        visit(statement);
        return count === 1;
    }

    rustVecIsFinalUse(n, name: string): boolean {
        const fn = this.rustEnclosingFunction(n);
        for (let current: any = n.parent; current !== undefined && current !== fn; current = current.parent) {
            switch (current.kind) {
            case SyntaxKind.ForStatement: case SyntaxKind.ForInStatement: case SyntaxKind.ForOfStatement:
            case SyntaxKind.WhileStatement: case SyntaxKind.DoStatement:
                return false;
            }
        }
        const end = n.getEnd?.() ?? n.end;
        return !(this.rustScopeNameNodes(fn, name) as any[]).some((m) => m.kind === SyntaxKind.Identifier && m !== n
            && (m.getStart?.() ?? m.pos) >= end && !this.rustIdentifierIsPropertyName(m));
    }

    // `this.m(..)` / `super.m(..)` / `Promise.all(..)`: every argument prints through printNode as a `Value`.
    rustVecBoxingCallee(callee): boolean {
        if (!isPropertyAccessExpression(callee)) return false;
        const receiver: any = callee.expression;
        if (receiver.kind === SyntaxKind.ThisKeyword || receiver.kind === SyntaxKind.SuperKeyword) return true;
        return receiver.kind === SyntaxKind.Identifier && receiver.text === 'Promise' && String(callee.name.text) === 'all';
    }

    rustVecLocalDeclarationOf(node): any {
        if (node?.kind !== SyntaxKind.Identifier) return undefined;
        const checker: any = this.checkerOrUndefined();
        const symbol = checker?.getSymbolAtLocation(node);
        const declaration = symbolValueDeclaration(symbol) ?? symbolDeclarations(symbol)[0];
        return declaration !== undefined && declaration.name !== node && this.rustVecLocalIsTyped(declaration) ? declaration : undefined;
    }

    printRustVecPush(node, name: string | undefined, parsedArg: string | undefined): string | undefined {
        const receiver = node?.expression?.expression;
        if (name === undefined || parsedArg === undefined || this.rustVecLocalDeclarationOf(receiver) === undefined) return undefined;
        const arg = parsedArg.trim();
        // `append_to_array` takes the value by move; ccxt's post-pass cloned a bare local there.
        const value = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(arg) && arg !== 'self' && arg !== 'true' && arg !== 'false' ? `${arg}.clone()` : arg;
        return `${name}.push(${value})`;
    }

    transformIdentifier(node, identifier) {
        const text = super.transformIdentifier(node, identifier);
        const parent = node?.parent;
        if (this.rustI64Counters.size > 0 && this.rustI64CounterOf(node) !== undefined
            && (this.rustI64BoxedUse(node) || (isVariableDeclaration(parent) && parent.initializer === node))) return `Value::Int(${text})`;
        // An argument in a native-map slot passes the map itself
        // (`&mut` is added by the caller printer), never a `Value::Map` box.
        if (parent !== undefined && isCallExpression(parent) && parent.arguments.some((a) => a === node)) {
            const at = Array.from(parent.arguments).indexOf(node as any);
            if (this.rustNativeMapArgumentSlot(this.rustCalleeParams(parent), at) !== undefined
                && (this.rustDictBearerDeclaration(node) !== undefined || this.rustMapParamDeclaration(node) !== undefined)) {
                return text;
            }
        }
        // A two-level bearer is boxed at its single admitted move.
        // Checked first: a two-level read also satisfies the one-level chain test below.
        if (this.rustNestedDictBearerDeclaration(node) !== undefined && parent !== undefined
            && ((isReturnStatement(parent) && parent.expression === node)
                || (isCallExpression(parent) && parent.arguments.some((a) => a === node))
                || (parent.kind === SyntaxKind.PropertyAssignment && parent.initializer === node))) {
            return `Value::from(${text})`;
        }
        // A native-map parameter is a bare map too; every non-key use
        // moves a clone into a `Value`.
        if (this.rustMapParamDeclaration(node) !== undefined && this.rustMapParamBoxes(node)) {
            return `Value::Map(${text}.clone())`;
        }
        // A typed dict bearer is boxed only at the single final move its
        // declaration proof admitted (`return x` / an argument of a `this.` call /
        // the value of a parent object literal).
        const bearer = this.rustDictBearerDeclaration(node);
        if (bearer !== undefined && parent !== undefined
            && ((isReturnStatement(parent) && parent.expression === node)
                || (isCallExpression(parent) && parent.arguments.some((a) => a === node))
                || this.rustDictWriteValue(node)
                || this.rustBearerLiteralMove(node))) {
            // Only the map's last use moves into the box; an earlier
            // one boxes a clone, so a bearer may be handed out more than once.
            return `Value::Map(${text}${!this.rustDictBearerCloned.has(bearer) && this.rustVecIsFinalUse(node, String(node.text)) ? '' : '.clone()'})`;
        }
        const stringMethod: any = this.rustDeclarationOfIdentifier(node);
        if (stringMethod !== undefined && isVariableDeclaration(stringMethod) && stringMethod.name !== node
            && this.rustStringMethodLocalInit(stringMethod) !== undefined) {
            return `Value::from(${text}${this.rustVecIsFinalUse(node, String(node.text)) ? '' : '.clone()'})`;
        }
        if (parent === undefined || !(isReturnStatement(parent) || (isCallExpression(parent) && parent.arguments.some((a) => a === node)
            && this.rustVecBoxingCallee(parent.expression)) || (parent.kind === SyntaxKind.PropertyAssignment && parent.initializer === node))) return text;
        if (this.rustVecLocalDeclarationOf(node) === undefined) return text;
        return this.rustVecValueUse(node, String(node.text)) ? `Value::from(${text})` : `Value::from(${text}.clone())`;
    }

    // ── typed dict bearers ────────────────────────────────────────────────────
    // A local that builds one object literal, is only read/written by literal keys and moves at most once is declared
    // a bare `IndexMap<String, Value>`: reads `.get(k)`, writes `.insert(k, v)`. Any other use keeps the `Value` box.

    private rustDictBearerDecisions = new WeakMap<any, boolean>();

    /** Bearers whose escapes all box a clone (the prediction-tier multi-escape rule). */
    private rustDictBearerCloned = new WeakSet<any>();

    /** A prediction venue: `ts/src/prediction/<id>.ts` builds nested request maps in one method. */
    // eslint-disable-next-line no-useless-escape
    private static readonly RUST_PREDICTION_VENUE_FILE = /ts[\/]src[\/]prediction[\/][^/]+\.ts$/;

    /** The declaration behind `node` when it is a local typed as a dict bearer. */
    rustDictBearerDeclaration(node: any): any | undefined {
        if (!isIdentifier(node)) return undefined;
        const declaration: any = this.rustDeclarationOfIdentifier(node);
        if (declaration === undefined || !isVariableDeclaration(declaration) || declaration.name === node) return undefined;
        return this.rustDictLocalIsTyped(declaration) ? declaration : undefined;
    }

    rustDictLocalIsTyped(declaration: any): boolean {
        if (declaration?.kind !== SyntaxKind.VariableDeclaration) return false;
        let decision = this.rustDictBearerDecisions.get(declaration);
        if (decision === undefined) {
            this.rustDictBearerDecisions.set(declaration, false); // re-entrancy guard
            try {
                decision = this.rustDictLocalIsTypedUncached(declaration);
            } catch (e) {
                decision = false; // no proof -> the local keeps its `Value` box
            }
            this.rustDictBearerDecisions.set(declaration, decision);
        }
        return decision;
    }

    rustDictLocalIsTypedUncached(declaration: any): boolean {
        const init: any = declaration.initializer;
        if (declaration.name?.kind !== SyntaxKind.Identifier || init === undefined) return false;
        const literal: any = this.rustSkipWrappers(init);
        const produced = !isObjectLiteralExpression(literal) && this.rustDictProducer(init);
        if (!isObjectLiteralExpression(literal) && !produced) return false;
        // A dict read out of a live store (`x.hashmap()`, `x.subscriptions`) is a
        // tagged handle: its writes must reach the store, so it keeps the helper.
        if (produced && this.rustInitReadsTaggedStore(init)) return false;
        const entries: any[] = produced ? [] : literal.properties;
        for (const property of entries) {
            if (property.kind === SyntaxKind.SpreadAssignment) return false;
            const propertyName: any = property.name;
            if (propertyName === undefined || propertyName.kind === SyntaxKind.ComputedPropertyName
                || !RustTranspiler.rustBearerKeyTextOk(String(propertyName.text))) return false;
        }
        const name = String(declaration.name.text);
        const fn: any = this.rustEnclosingFunction(declaration);
        if (fn === undefined || isSourceFile(fn)) return false;
        // The tests pipeline's text post-passes key on the boxed `Value` local shape.
        const source: any = declaration.getSourceFile?.()?.fileName;
        if (typeof source === 'string' && /\/test\//.test(source)) return false;
        // A prediction venue nests its builders (`{ action: obj }`, `f (x, obj)`), so a
        // local there escapes more than once; every escape then boxes a clone.
        const prediction = typeof source === 'string'
            && RustTranspiler.RUST_PREDICTION_VENUE_FILE.test(source.replace(/\\/g, '/'));
        const escapes: any[] = [];
        let elementUses = 0;
        const safe = this.rustLocalUsesAll(declaration, name, false, (n: any) => {
            if (this.rustIdentifierIsPropertyName(n)) {
                // `{ x }` shorthand is a value use, not a name; anything else spelled
                // like the local is a property name, not this binding.
                return !(n.parent?.kind === SyntaxKind.ShorthandPropertyAssignment && n.parent.name === n);
            }
            if (!this.rustIdentifierRefersToDeclaration(n, declaration)) return false;
            if (this.rustEnclosingFunction(n) !== fn) return false; // a closure capture
            const parent: any = n.parent;
            if (isReturnStatement(parent) && parent.expression === n) {
                escapes.push(n);
                return true;
            }
            if (isCallExpression(parent) && parent.arguments.some((a: any) => a === n)
                && isPropertyAccessExpression(parent.expression)
                && (parent.expression.expression.kind === SyntaxKind.ThisKeyword
                    || parent.expression.expression.kind === SyntaxKind.SuperKeyword)) {
                escapes.push(n);
                return true;
            }
            if (prediction && parent.kind === SyntaxKind.PropertyAssignment && parent.initializer === n) {
                escapes.push(n);
                return true;
            }
            if (prediction && isCallExpression(parent) && parent.arguments.some((a: any) => a === n)) {
                // A collection/JSON reader prints its own receiver text (`Object.keys(x)`,
                // `JSON.stringify(x)`), so passing through the box would only add a clone.
                if (this.nativeReadCallee(parent)) return false;
                escapes.push(n);
                return true;
            }
            if (isElementAccessExpression(parent) && parent.expression === n) {
                if (!this.rustDictBearerElementUse(parent, name)) return false;
                elementUses++;
                return true;
            }
            // The value of a dict write (`m['k'] = x`) is boxed once.
            if (this.rustDictWriteValue(n)) return true;
            // `Object.keys/values(x)` prints the map's own iterators.
            if (isCallExpression(parent) && this.bearerEnumArg(parent) === n) return true;
            // `k in x` — the map's own lookup behind the helper's `Str` test.
            if (isBinaryExpression(parent) && parent.operatorToken.kind === SyntaxKind.InKeyword
                && parent.right === n) return this.bearerInOpKeyText(parent.left) !== undefined;
            // A rebuilt plain literal keeps the bearer (write side).
            if (this.rustBearerRebuild(n)) return true;
            // A rebuild from a fresh-map producer keeps the map type.
            const reuse = this.rustProducerReuse(n);
            if (reuse) return true;
            return false;
        });
        if (!safe) return false;
        // A produced map that also escapes re-boxes as `Value::Map(x.clone())`
        // at the escape, so it pays off only where the bearer folds a helper call on it.
        if (produced && escapes.length > 0 && elementUses === 0) return false;
        // A return / `this.` call escape boxes a move at the last use, a clone before it.
        // Any other escape is prediction-tier only, and then every escape boxes a clone.
        for (const escape of escapes) {
            if (this.boxSiteOk(escape) === true) continue;
            if (!prediction) return false;
            this.rustDictBearerCloned.add(declaration);
        }
        return true;
    }

    /** A call that builds a fresh plain map — the request/params builders, `parseJson`, and the `handle*` family.
     *  The checker proves the result Dict-shaped and every copied map operand plain, so the bearer may be declared
     *  from the call and the box is cloned out once. */
    rustDictProducer(node: any): boolean {
        const call: any = this.rustSkipWrappers(node);
        if (!isCallExpression(call)) return false;
        const callee: any = call.expression;
        if (!isPropertyAccessExpression(callee) || callee.expression.kind !== SyntaxKind.ThisKeyword
            || callee.name?.kind !== SyntaxKind.Identifier) return false;
        const method = String(callee.name.text);
        const handle = /^handle[A-Z]/.test(method);
        if (!handle && !RustTranspiler.RUST_DICT_PRODUCER_CALLEES.has(method)) {
            // The callee's own returns build a fresh untagged map.
            return this.rustCallBuildsContainer(call, 'map', 0);
        }
        if (!this.rustWriteDictShape(this.typeOfNodeIfAny(call))) return false;
        // `parseJson` takes text, a `handle*` call hands back the dict it was given.
        if (handle || method === 'parseJson') return true;
        const args: any[] = (call as any).arguments ?? [];
        const copied = method === 'extend' || method === 'deepExtend' ? args : args.slice(0, 1);
        if (copied.length === 0) return false;
        for (const arg of copied) {
            if (!this.copyOnlyPlainMap(arg)) return false;
        }
        return true;
    }

    /** A map operand the producer only copies into a fresh map: built by the
     *  transpiler (literal / bearer / admitted producer) or a Dict-typed place.
     *  `any` is out — its content may carry a runtime tag. */
    copyOnlyPlainMap(arg: any): boolean {
        const node: any = this.rustSkipWrappers(arg);
        if (isObjectLiteralExpression(node)) return this.rustPlainDictLiteral(node);
        if (isIdentifier(node) && this.rustDictBearerDeclaration(node) !== undefined) return true;
        if (isCallExpression(node)) return this.rustDictProducer(node);
        const type: any = this.typeOfNodeIfAny(node);
        if (type === undefined || (type.flags & (TypeFlags.Any | TypeFlags.Unknown)) !== 0) return false;
        return this.rustWriteDictShape(type);
    }

    /** `x = this.extend(..)` on a bearer — the producer hands back a
     *  fresh map, so the local keeps its `IndexMap` type and the print clones the
     *  box out at the assignment. */
    rustProducerReuse(node: any): boolean {
        const parent: any = node?.parent;
        if (parent === undefined || !isBinaryExpression(parent) || parent.left !== node) return false;
        return parent.operatorToken.kind === SyntaxKind.EqualsToken && this.rustDictProducer(parent.right);
    }

    private static readonly RUST_DICT_PRODUCER_CALLEES = new Set([
        'extend', 'deepExtend', 'omit', 'keysort', 'parseJson', 'safeDict',
    ]);

    // ── callee-return container proof ─────────────────────────────────────────
    // A local initialised from `this.<m>(…)` whose method body builds a fresh, untagged container on every return holds
    // only that container, so the store-tag routes of the helpers cannot fire and it may carry the container type.

    /** Builders that hand back one of their own arguments: the container kind is
     *  the argument's (they only add fields to it). */
    private static readonly RUST_BUILDER_PASSTHROUGH = new Set([ 'safeTicker', 'safeOrder', 'safeTrade', 'safePosition' ]);

    /** `this.<m>(…)` whose every return is a fresh untagged
     *  container of `kind` — the method's own body, no venue override (the
     *  checker resolves the most derived declaration for `this`). */
    rustCallBuildsContainer(call: any, kind: 'map' | 'list', depth = 0): boolean {
        if (depth > 2) return false;
        // A pass-through builder hands back its own first argument (it only adds
        // fields to it), so the argument's kind is the result's.
        const passCallee: any = (call as any)?.expression;
        const passMethod = isPropertyAccessExpression(passCallee) ? String((passCallee as any).name?.text) : undefined;
        if (passMethod !== undefined && RustTranspiler.RUST_BUILDER_PASSTHROUGH.has(passMethod)) {
            const passArgs: any[] = (call as any).arguments ?? [];
            if (passArgs.length === 0) return false;
            return this.rustBuiltContainerKind(passArgs[0], depth + 1) === kind;
        }
        let declaration: any;
        try {
            declaration = signatureDeclaration((this.getChecker() as any).getResolvedSignature(call));
        } catch (e) {
            return false;
        }
        if (declaration === undefined || declaration === null || declaration.body === undefined) return false;
        if (declaration.kind !== SyntaxKind.MethodDeclaration) return false;
        const body: any = declaration.body;
        let returns = 0;
        let ok = true;
        const visit = (node: any) => {
            if (!ok) return;
            if (node !== body && isFunctionLike(node)) return; // a nested closure owns its own returns
            if (isReturnStatement(node)) {
                returns++;
                if (this.rustBuiltContainerKind(node.expression, depth + 1) !== kind) ok = false;
                return;
            }
            // A store write (`this.orderbooks[sym] = book`, `this.tickers = ..`)
            // hands the container to the runtime store, which tags it: a later
            // native write would bypass the store, so such a callee is out.
            if (isBinaryExpression(node) && rustIsAssignmentOperator(node.operatorToken.kind)
                && this.rustThisRootedPlace(node.left)) {
                ok = false;
                return;
            }
            node.forEachChild(visit);
        };
        body.forEachChild(visit);
        return ok && returns > 0;
    }

    /** A call operand that hands back a live-store map: `x.hashmap()` (the ws
     *  order/subscription cache) or a `.subscriptions` / `.futures` read. The
     *  runtime tags those dicts, so a write must reach the store. */
    rustInitReadsTaggedStore(node: any): boolean {
        const init: any = this.rustSkipWrappers(node);
        if (!isCallExpression(init)) return false;
        return ((init as any).arguments ?? []).some((arg: any) => {
            const n: any = this.rustSkipWrappers(arg);
            if (n === undefined) return false;
            if (isPropertyAccessExpression(n)) return RustTranspiler.RUST_TAGGED_CONTAINER_FIELDS.has(String((n as any).name.text));
            if (isCallExpression(n) && isPropertyAccessExpression(n.expression)) {
                return RustTranspiler.RUST_TAGGED_CONTAINER_FIELDS.has(String((n as any).expression.name.text));
            }
            return false;
        });
    }

    /** `this.<field>` or `this.<field>[…]` — a store the runtime may tag. */
    rustThisRootedPlace(node: any): boolean {
        if (isPropertyAccessExpression(node)) return node.expression.kind === SyntaxKind.ThisKeyword;
        if (isElementAccessExpression(node)) return this.rustThisRootedPlace(node.expression);
        return false;
    }

    /** Container kind an expression the callee body builds yields, or undefined.
     *  Shapes: a tag-free literal, a local that only ever receives element
     *  writes, a `this.` builder that copies plain operands, a pass-through
     *  builder of a built argument. */
    rustBuiltContainerKind(node: any, depth = 0): 'map' | 'list' | undefined {
        if (depth > 3) return undefined;
        const expr: any = this.rustSkipWrappers(node);
        if (expr === undefined || expr === null) return undefined;
        if (isObjectLiteralExpression(expr)) return this.rustPlainDictLiteral(expr) ? 'map' : undefined;
        if (isArrayLiteralExpression(expr)) return 'list';
        if (isIdentifier(expr)) {
            const declaration: any = this.rustDeclarationOfIdentifier(expr);
            if (declaration === undefined || !isVariableDeclaration(declaration) || declaration.name === expr) return undefined;
            const built = this.rustBuiltContainerKind(declaration.initializer, depth + 1);
            if (built === undefined || !this.rustLocalContainerWritesOnly(declaration, String(expr.text), built, depth + 1)) return undefined;
            return built;
        }
        if (!isCallExpression(expr)) return undefined;
        const callee: any = expr.expression;
        if (!isPropertyAccessExpression(callee)) return undefined;
        const method = String(callee.name.text);
        const owner: any = callee.expression;
        const args: any[] = (expr as any).arguments ?? [];
        if (owner.kind === SyntaxKind.ThisKeyword) {
            if (RustTranspiler.RUST_BUILDER_PASSTHROUGH.has(method) && args.length > 0) {
                return this.rustBuiltContainerKind(args[0], depth + 1);
            }
            if (RustTranspiler.RUST_DICT_PRODUCER_CALLEES.has(method) && method !== 'safeDict') {
                // `extend`/`deepExtend`/`omit`/`keysort` copy plain operands into a
                // fresh map; `parseJson` always builds one.
                if (method === 'parseJson') return 'map';
                const copied = method === 'extend' || method === 'deepExtend' ? args : args.slice(0, 1);
                if (copied.length === 0) return undefined;
                for (const arg of copied) {
                    if (this.rustBuiltContainerKind(arg, depth + 1) === undefined && !this.copyOnlyPlainMap(arg)) return undefined;
                }
                return 'map';
            }
            if (method === 'safeList' || method === 'safeListValue') {
                return args.length < 3 || isArrayLiteralExpression(this.rustSkipWrappers(args[2])) ? 'list' : undefined;
            }
            if (this.rustCallBuildsContainer(expr, 'map', depth + 1)) return 'map';
            if (this.rustCallBuildsContainer(expr, 'list', depth + 1)) return 'list';
            return undefined;
        }
        if (owner.kind === SyntaxKind.Identifier) {
            const ownerName = String(owner.text);
            if (ownerName === 'Object' && (method === 'keys' || method === 'values' || method === 'entries')) return 'list';
            if (ownerName === 'Promise' && method === 'all') return 'list';
            // `x.split(sep)` — the runtime split is an array on every path.
            if (method === 'split') return 'list';
        }
        return undefined;
    }

    /** True when the only writes to this local inside its own function are
     *  element writes and container rebuilds (no whole-local write of another
     *  shape): the container it was built as is what it holds at every use. */
    private rustLocalContainerWritesOnly(declaration: any, name: string, kind: 'map' | 'list', depth: number): boolean {
        const scope: any = this.rustEnclosingFunction(declaration);
        if (scope === undefined || isSourceFile(scope)) return false;
        let ok = true;
        const isThisLocal = (left: any): boolean => isIdentifier(left) && String(left.text) === name
            && this.rustIdentifierRefersToDeclaration(left, declaration);
        this.rustWalkScope(scope, (n: any) => {
            if (!ok) return;
            if (isBinaryExpression(n) && rustIsAssignmentOperator(n.operatorToken.kind)) {
                if (!isThisLocal(n.left)) return;
                // A rebuild from a container the same proof admits keeps the kind.
                if (n.operatorToken.kind !== SyntaxKind.EqualsToken
                    || this.rustBuiltContainerKind(n.right, depth + 1) !== kind) ok = false;
                return;
            }
            if ((isForOfStatement(n) || isForInStatement(n)) && isThisLocal(n.initializer)) ok = false;
        });
        return ok;
    }

    /** An escape the printer boxes: a `return` of the local, or an argument of a
     *  `this.`/`super.` call. Anything else (a free-function argument) has no box
     *  site. */
    boxSiteOk(node: any): boolean {
        const parent: any = node?.parent;
        if (parent === undefined) return false;
        if (isReturnStatement(parent) && parent.expression === node) return true;
        return isCallExpression(parent) && parent.arguments.some((a: any) => a === node)
            && isPropertyAccessExpression(parent.expression)
            && (parent.expression.expression.kind === SyntaxKind.ThisKeyword
                || parent.expression.expression.kind === SyntaxKind.SuperKeyword);
    }

    /** `Object.keys/values/entries`, `JSON.*`, `String(x)`, `typeof`-style readers: the printer
     *  emits them from the receiver's own text, so a bearer boxed there is a wasted clone. */
    nativeReadCallee(call: any): boolean {
        const callee: any = call?.expression;
        const native: Set<string> = (RustTranspiler as any).NATIVE_READ_NAMESPACES;
        if (callee === undefined || native === undefined) return false;
        if (isPropertyAccessExpression(callee) && isIdentifier(callee.expression)) return native.has(String(callee.expression.text));
        return isIdentifier(callee) && native.has(String(callee.text));
    }

    private static readonly NATIVE_READ_NAMESPACES = new Set([ 'Object', 'JSON', 'Array', 'Promise', 'Math', 'String', 'Number' ]);

    /** One `x[...]` use rooted at the bearer: a key read or a single-level `x['k'] = v`
     *  write. Chained reads stay native at the first level; a chained/compound write,
     *  `delete` and a call on the read reach the container through a `&mut Value`, so
     *  they keep the box. */
    rustDictBearerElementUse(access: any, name: string): boolean {
        let root: any = access;
        while (isElementAccessExpression(root.parent) && root.parent.expression === root) root = root.parent;
        const up: any = root.parent;
        const write = up !== undefined && isBinaryExpression(up) && up.left === root
            && rustIsAssignmentOperator(up.operatorToken.kind);
        if (write) {
            if (up.operatorToken.kind !== SyntaxKind.EqualsToken) return false;
            // Only the first key of a chain has to be proven — the
            // bucket below it is the map's own `entry`, the rest keeps its helper.
            if (root !== access) return this.rustBearerChainHopArg(access.argumentExpression, this.printNode(access.argumentExpression, 0), name) !== undefined;
            return this.rustDictBearerKeyOk(access.argumentExpression) || this.rustBearerWriteKeyOk(access.argumentExpression, name);
        }
        if (up !== undefined && (isDeleteExpression(up) || (isCallExpression(up) && up.expression === root)
            || up.kind === SyntaxKind.PrefixUnaryExpression || up.kind === SyntaxKind.PostfixUnaryExpression)) return false;
        // The printer proves the position on the outermost chain node.
        if (!this.isNativeAccessPositionSafe(root) || this.isNativeWriteTargetBase(root)) return false;
        // ccxt's write-back pass matches `get_value` text to write a mutated bind back.
        if (this.isWriteBackBindRead(access)) return false;
        return this.rustDictBearerKeyOk(access.argumentExpression);
    }

    /** A literal string key, or a checker-proven `string` place. A by-construction
     *  object literal carries no marker key (`__book_id`, `__cacheKind`, `__live_id`)
     *  and no ws client-handle triple, so `get_value`'s store routes cannot fire and
     *  the read is the map lookup. */
    rustDictBearerKeyOk(keyNode: any): boolean {
        const key: any = this.rustSkipWrappers(keyNode);
        if (key === undefined) return false;
        if (isStringLiteralLikeNode(key)) return RustTranspiler.rustBearerKeyTextOk(String((key as any).text));
        if (!isIdentifier(key) || !this.rustKeyIsProvenString(key) || this.rustStringLocalIdentifierIsTyped(key)) return false;
        if (this.rustNodeIsKeyUnsafePlace(String((key as any).text))) return false;
        return /^[A-Za-z_][A-Za-z0-9_]*$/.test(this.printNode(key, 0).trim());
    }

    /** Keys a bearer may carry: no empty/numeric key, no ws client-handle marker
     *  (`subscriptions`/`futures` serve their live registry) and nothing `__`-prefixed. */
    static rustBearerKeyTextOk(text: string): boolean {
        return text !== '' && !/^\d+$/.test(text) && !text.startsWith('__')
            && text !== 'subscriptions' && text !== 'futures';
    }

    /** `x[k]` on a bearer with a proven `string` key place: an `IndexMap` lookup, and
     *  `get_value`'s non-`Str` key branches (always `Value::Null` here) become the
     *  `""` fallback — the bearer can never hold an empty key. */
    rustBearerDictDynamicRead(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined {
        const typed = this.rustDictBearerDeclaration(receiverNode) !== undefined
            || this.rustMapParamDeclaration(receiverNode) !== undefined;
        if (!typed) return undefined;
        const key: any = this.rustSkipWrappers(keyNode);
        if (key === undefined || isStringLiteralLikeNode(key) || !this.rustDictBearerKeyOk(key)) return undefined;
        if (this.isWriteBackBindRead(this.rustElementReadOfKey(keyNode))) return undefined;
        const keyText = this.printNode(keyNode, 0).trim();
        return `${receiverText}.get(${keyText}.as_str().unwrap_or("")).cloned().unwrap_or(Value::Null)`;
    }

    /** `x['k'] = v` on a bearer: the insert `add_element_to_object` performs on the
     *  same plain dict, minus the box (`Arc::make_mut` guard the type proves). */
    rustBearerDictInsert(baseExpr: any, keyNode: any, keyText: string, valueText: string): string | undefined {
        const declaration = this.rustDictBearerDeclaration(baseExpr);
        const name = String(baseExpr.text);
        if (declaration === undefined || !(this.rustDictBearerKeyOk(keyNode) || this.rustBearerWriteKeyOk(keyNode, name))) return undefined;
        const keyArg = this.rustNativeInsertKeyArg({ text: name, isField: false, plain: true }, keyNode, keyText)
            ?? this.rustBearerWriteKeyArg(keyNode, keyText, name);
        if (keyArg === undefined) return undefined;
        return this.rustBearerInsertText(name, keyArg, valueText);
    }

    /** `<name>.insert(<key>, <value>)` for a receiver the type proves is a map. The
     *  insert holds the receiver's `&mut`, so a value that reads it binds first; the
     *  trailing `;` keeps the block unit-typed when it stands as a statement. */
    rustBearerInsertText(name: string, keyArg: string, valueText: string): string {
        const value = this.rustPrintedBoolArg(valueText) ? `Value::Bool(${valueText})` : valueText;
        if (new RegExp(`\\b${name}\\b`).test(value)) {
            return `{ let __be_tmp = ${value}; ${name}.insert(${keyArg}, __be_tmp); }`;
        }
        const trimmed = value.trim();
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed) && trimmed !== 'self' && trimmed !== 'true' && trimmed !== 'false') {
            return `${name}.insert(${keyArg}, ${trimmed}.clone())`;
        }
        return `${name}.insert(${keyArg}, ${value})`;
    }

    // ── chained writes on a one-level bearer ──────────────────────────────────
    // `x[k1][k2] = v` roots at a plain `IndexMap<String, Value>`: the bucket is the map's own
    // `entry(k1).or_default()` — the same `or_insert(Value::Null)` `get_value_mut` performs — so the write goes native.

    /** The `entry` key of a chained write's first hop, or undefined when the key
     *  cannot be proven. The bearer proof and the emission share this one answer,
     *  so a local is never typed on a chain the printer then prints boxed. */
    rustBearerChainHopArg(keyNode: any, keyText: string, name: string): string | undefined {
        return this.rustNativeInsertKeyArg({ text: name, isField: false, plain: true }, keyNode, keyText)
            ?? this.rustBearerWriteKeyArg(keyNode, keyText, name);
    }

    rustBearerChainedWrite(baseExpr: any, keys: any[], keyStrs: string[], valueText: string): string | undefined {
        if (this.rustDictBearerDeclaration(baseExpr) === undefined) return undefined;
        const name = String(baseExpr.text);
        const hop = this.rustBearerChainHopArg(keys[0], keyStrs[0], name);
        if (hop === undefined) return undefined;
        const value = this.rustPrintedBoolArg(valueText) ? `Value::Bool(${valueText})` : valueText;
        const readsReceiver = new RegExp(`\\b${name}\\b`).test(value);
        const acc = `${name}.entry(${hop}).or_default()`;
        // Two levels: the bucket holds a plain map, so the write is the guarded
        // native insert the boxed form prints for the same shape.
        const lastKey = keyStrs.length === 2 ? this.rustBearerChainHopArg(keys[1], keyStrs[1], name) : undefined;
        if (lastKey !== undefined) {
            const trimmed = value.trim();
            const payload = readsReceiver ? '__be_tmp'
                : (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed) && !/^(?:self|true|false)$/.test(trimmed) ? `${trimmed}.clone()` : value);
            const insert = `if let Value::Dict(__d) = ${acc} { std::sync::Arc::make_mut(__d).insert(${lastKey}, ${payload}); }`;
            return readsReceiver ? `{ let __be_tmp = ${value}; ${insert} }` : insert;
        }
        // Deeper: every middle hop stays a `get_value_mut`, the last write the helper.
        let deepAcc = acc;
        for (const middle of keyStrs.slice(1, -1)) deepAcc = `get_value_mut(${deepAcc}, &${middle})`;
        const tail = `add_element_to_object(${deepAcc}, &${keyStrs[keyStrs.length - 1]}, `;
        if (readsReceiver) return `{ let __be_tmp = ${value}; ${tail}__be_tmp); }`;
        return `${tail}${value})`;
    }

    // ── the write side of the typed dict bearer ───────────────────────────────
    // The bearer is a bare `IndexMap<String, Value>`, so every write must print `.insert(<String>, <Value>)` with no
    // box and no `cow_guard`. These proofs only add shapes; a write the key type cannot prove keeps the helper.

    /** A key the bearer write takes natively: the checker proves a `string` and
     *  the printed key is a `Value::Str(..)` whose payload is that `String`, or a
     *  native `Option<String>` place. A key that names the receiver is out (the
     *  insert holds its `&mut`). */
    rustBearerWriteKeyOk(keyNode: any, receiverName: string): boolean {
        return this.rustBearerWriteKeyArg(keyNode, this.printNode(keyNode, 0), receiverName) !== undefined;
    }

    /** `m[k] = v` on a bearer with `k` a native `Option<String>` local. */
    placeKeyNative(key: any): boolean {
        if (!isIdentifier(key) || !this.rustStringLocalIdentifierIsTyped(key)) return false;
        const name = String(key.text);
        return name !== 'self' && !this.rustNodeIsKeyUnsafePlace(name);
    }

    /** The native map key for a printed bearer-write key, or undefined when the
     *  box's payload is not a `String`. Literal keys stay with the shared path. */
    rustBearerWriteKeyArg(keyNode: any, keyText: string, receiverName: string): string | undefined {
        const key: any = this.rustSkipWrappers(keyNode);
        if (key === undefined || isStringLiteral(key)) return undefined;
        if (this.placeKeyNative(key) === true) return `${String(key.text)}.clone().unwrap_or_default()`;
        const text = String(keyText).trim();
        if (text === '' || new RegExp(`\\b${receiverName}\\b`).test(text)) return undefined;
        if (!this.rustKeyIsProvenString(key)) return this.stringifiedWriteKeyArg(key, text);
        const boxed = text.match(/^Value::Str\((.+)\)$/s);
        // A string-proven member read prints a `Value` box, not a `Str` payload.
        if (boxed === null) return this.stringifiedWriteKeyArg(key, text);
        const payload = boxed[1].trim().replace(/\.into\(\)$/, '').trim();
        if (/^format!\(/s.test(payload)) return payload;
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(payload) && payload !== 'self') return `${payload}.to_string()`;
        return undefined;
    }

    /** A write key of any boxed type: `add_element_to_object` stores a non-`Str` key through `stringify_simple`,
     *  which `stringify_param` is, so the same call is the whole key conversion. Only `Value`-printed shapes qualify. */
    stringifiedWriteKeyArg(key: any, text: string): string | undefined {
        if (!this.keyTextIsValuePlace(key, text)) return undefined;
        return `crate::runtime::stringify_param(&(${text}))`;
    }

    /** The printed text of a key place that is a `Value` and safe to evaluate in a
     *  key position: no nested statement, assignment or await. */
    keyTextIsValuePlace(key: any, text: string): boolean {
        if (text === '' || text.includes(';') || /(?:^|[^=!<>])=\s/.test(text) || /\bawait\b/.test(text)) {
            return false;
        }
        if (key.kind === SyntaxKind.ArrowFunction || key.kind === SyntaxKind.FunctionExpression
            || key.kind === SyntaxKind.AwaitExpression) {
            return false;
        }
        // A printed `Value`: a box, a match arm, or a map read (`get_value` /
        // `unwrap_or(Value::Null)`) — a `string | undefined` member read prints the
        // box, so the type alone would refuse a place that really is a `Value`.
        if (/^(?:Value::|\(match |\(if |get_value|crate::value::get_value_k)|unwrap_or\(Value::Null\)/.test(text)) {
            return true;
        }
        return this.keyPrintsAsValue(this.typeOfNodeIfAny(key));
    }

    /** `k in x` on a typed bearer: `in_op`'s own Dict arm — a key that is not a
     *  `Str` is never a hit — with the lookup on the bare map. */
    bearerInOp(key: any, obj: any): string | undefined {
        const recv: any = this.rustSkipWrappers(obj);
        if (recv === undefined || !isIdentifier(recv) || this.rustDictBearerDeclaration(recv) === undefined) {
            return undefined;
        }
        const text = this.bearerInOpKeyText(key);
        if (text === undefined) return undefined;
        return `Value::Bool(matches!(&${text}, Value::Str(__k) if ${String(recv.text)}.contains_key(__k.as_ref())))`;
    }

    /** The key half of `bearerInOp`, also used while the receiver's own bearer
     *  proof is still running (its declaration probe answers "not typed" then). */
    bearerInOpKeyText(key: any): string | undefined {
        const keyNode: any = this.rustSkipWrappers(key);
        if (keyNode === undefined || isStringLiteral(keyNode)) return undefined;
        const text = this.printNode(key, 0).trim();
        if (!/^(?:[A-Za-z_][A-Za-z0-9_]*|crate::|Value::|\(match |\(if )/.test(text)
            || !this.keyTextIsValuePlace(keyNode, text)) return undefined;
        return text;
    }

    /** The printed Rust for this TS type is a `Value`: `any`, an object/dict shape,
     *  or a union of those with nullish. A `string`/number/bool place prints its own
     *  Rust type instead (the caller's string proof owns those). */
    keyPrintsAsValue(type: any): boolean {
        if (type === undefined) return false;
        const parts: any[] = (type.flags & TypeFlags.Union) ? ((typeParts(type) ?? []) as any[]) : [ type ];
        if (parts.length === 0) return false;
        const checker: any = this.checkerOrUndefined();
        return parts.every((part: any) => {
            if ((part.flags & TypeFlags.Any) !== 0) return true;
            if ((part.flags & (TypeFlags.Undefined | TypeFlags.Null | TypeFlags.Void)) !== 0) return true;
            if ((part.flags & (TypeFlags.StringLike | TypeFlags.NumberLike | TypeFlags.BooleanLike
                | TypeFlags.BigIntLike | TypeFlags.ESSymbolLike | TypeFlags.TypeParameter)) !== 0) return false;
            if ((part.flags & TypeFlags.Object) === 0) return false;
            return checker === undefined || (!checker.isArrayType(part) && !checker.isTupleType(part));
        });
    }

    /** A plain object literal a bearer may be rebuilt from (`x = { .. }`): no
     *  spread, literal keys only — the same rules the declaration proof applies. */
    rustBearerPlainLiteral(node: any): boolean {
        const literal: any = this.rustSkipWrappers(node);
        if (!isObjectLiteralExpression(literal)) return false;
        if (literal.properties.some((p: any) => p.kind === SyntaxKind.SpreadAssignment)) return false;
        return literal.properties.every((property: any) => {
            const propertyName: any = property.name;
            return propertyName !== undefined && propertyName.kind !== SyntaxKind.ComputedPropertyName
                && RustTranspiler.rustBearerKeyTextOk(String(propertyName.text));
        });
    }

    /** `x = { .. }` (or a compound rebuild) on a bearer: the value is the map. */
    rustBearerRebuild(n: any): boolean {
        const parent: any = n.parent;
        if (parent === undefined) return false;
        if (isBinaryExpression(parent) && parent.left === n) {
            return parent.operatorToken.kind === SyntaxKind.EqualsToken && this.rustBearerPlainLiteral(parent.right);
        }
        return this.rustBearerLiteralMove(n);
    }

    /** The move of a bearer into a parent object literal's value. Shorthand
     *  (`{ x }`) is out: the literal printer clones the name without passing
     *  through the identifier printer, so the box could not be emitted. */
    rustBearerLiteralMove(node: any): boolean {
        const parent: any = node?.parent;
        if (parent === undefined || parent.kind !== SyntaxKind.PropertyAssignment || parent.initializer !== node) return false;
        return isObjectLiteralExpression(parent.parent);
    }

    // ── read-only container bearers ───────────────────────────────────────────
    // A local that provably holds a list (or a plain dict) and is only read by element access is declared
    // `Vec<Value>` (resp. a bare `IndexMap`), so reads print the native op. Any other use keeps the box and the helper.

    private rustReadBearerDecisions = new WeakMap<any, 'list' | 'map' | false>();

    /** The container kind a local is declared as, or undefined (no proof). */
    rustReadBearerKind(node: any): 'list' | 'map' | undefined {
        if (!isIdentifier(node)) return undefined;
        const declaration: any = this.rustDeclarationOfIdentifier(node);
        if (declaration === undefined || declaration === node || declaration.name === node) return undefined;
        const kind = this.rustReadBearerKindOfDeclaration(declaration);
        return kind === false ? undefined : kind;
    }

    rustReadBearerKindOfDeclaration(declaration: any): 'list' | 'map' | false {
        if (declaration?.kind !== SyntaxKind.VariableDeclaration) return false;
        let decision = this.rustReadBearerDecisions.get(declaration);
        if (decision === undefined) {
            this.rustReadBearerDecisions.set(declaration, false); // re-entrancy guard
            try {
                decision = this.rustReadBearerKindUncached(declaration);
            } catch (e) {
                decision = false; // no proof -> the local keeps its `Value` box
            }
            this.rustReadBearerDecisions.set(declaration, decision);
        }
        return decision;
    }

    rustReadBearerKindUncached(declaration: any): 'list' | 'map' | false {
        const init: any = this.rustSkipWrappers(declaration.initializer);
        if (declaration.name?.kind !== SyntaxKind.Identifier || init === undefined) return false;
        // The declaration printer types one binding per statement.
        const list: any = declaration.parent;
        if (list?.kind !== SyntaxKind.VariableDeclarationList || list.declarations?.length !== 1) return false;
        // Literal-built containers belong to the Vec / dict local families.
        if (isArrayLiteralExpression(init) || isObjectLiteralExpression(init)) return false;
        const kind = this.rustContainerProducingKind(init, new Set());
        if (kind === undefined) return false;
        const name = String(declaration.name.text);
        const fn: any = this.rustEnclosingFunction(declaration);
        if (fn === undefined || isSourceFile(fn)) return false;
        // The tests pipeline's text post-passes key on the boxed `Value` local shape.
        const source: any = declaration.getSourceFile?.()?.fileName;
        if (typeof source === 'string' && /\/test\//.test(source)) return false;
        if (this.rustLocalIsReassigned(declaration, name)) return false;
        const safe = this.rustLocalUsesAll(declaration, name, false, (n: any) => {
            if (this.rustIdentifierIsPropertyName(n)) {
                return !(n.parent?.kind === SyntaxKind.ShorthandPropertyAssignment && n.parent.name === n);
            }
            if (!this.rustIdentifierRefersToDeclaration(n, declaration)) return false;
            if (this.rustEnclosingFunction(n) !== fn) return false; // a closure capture
            const parent: any = n.parent;
            if (isElementAccessExpression(parent) && parent.expression === n) {
                return this.rustReadBearerElementUse(parent, kind);
            }
            if (kind === 'list' && isPropertyAccessExpression(parent) && parent.expression === n
                && String(parent.name.text) === 'length') {
                const up: any = parent.parent;
                return up?.kind !== SyntaxKind.PrefixUnaryExpression && up?.kind !== SyntaxKind.PostfixUnaryExpression
                    && !(isBinaryExpression(up) && up.left === parent && rustIsAssignmentOperator(up.operatorToken.kind));
            }
            return false;
        });
        return safe ? kind : false;
    }

    /** One element read rooted at the bearer: a plain read the native op serves. */
    rustReadBearerElementUse(access: any, kind: 'list' | 'map'): boolean {
        let root: any = access;
        while (isElementAccessExpression(root.parent) && root.parent.expression === root) root = root.parent;
        const up: any = root.parent;
        // A write, `delete`, or a call/property target still reaches the helper.
        if (up !== undefined && (isDeleteExpression(up) || (isBinaryExpression(up) && up.left === root)
            || (isCallExpression(up) && up.expression === root)
            || up.kind === SyntaxKind.PrefixUnaryExpression || up.kind === SyntaxKind.PostfixUnaryExpression)) return false;
        // The printer proves the position on the outermost chain node.
        if (!this.isNativeAccessPositionSafe(root) || this.isNativeWriteTargetBase(root)) return false;
        if (this.isWriteBackBindRead(access)) return false;
        return this.rustReadBearerKeyOk(kind, access.argumentExpression);
    }

    /** Key a read-only bearer serves natively: a literal string for a map, a
     *  literal (or proven-number `Value`) index for a list. */
    rustReadBearerKeyOk(kind: 'list' | 'map', keyNode: any): boolean {
        const key: any = this.rustSkipWrappers(keyNode);
        if (key === undefined) return false;
        if (kind === 'map') {
            if (!isStringLiteralLikeNode(key)) return false;
            const text = String((key as any).text);
            return RustTranspiler.rustBearerKeyTextOk(text) && !RustTranspiler.RUST_DICT_LOCAL_UNSAFE_KEYS.has(text);
        }
        if (isNumericLiteral(key)) {
            const index = Number(key.text);
            return Number.isInteger(index) && index >= 0;
        }
        return this.isRustValueIndexKey(key);
    }

    /** Native read of one bearer level; undefined keeps the helper. */
    printReadBearerAccess(kind: 'list' | 'map', receiverText: string, keyNode: any): string | undefined {
        const key: any = this.rustSkipWrappers(keyNode);
        if (!this.rustReadBearerKeyOk(kind, key)) return undefined;
        if (kind === 'map') {
            return `${receiverText}.get("${this.escapeRustStringLiteral(String((key as any).text))}").cloned().unwrap_or(Value::Null)`;
        }
        if (isNumericLiteral(key)) return `${receiverText}.get(${Number((key as any).text)}).cloned().unwrap_or(Value::Null)`;
        const keyText = this.printNode(keyNode, 0).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyText)) return undefined;
        // A `Value` index: an in-range Int reads, a negative/absent/other key misses
        // (`-1 as usize` is out of range, exactly `get_value`'s default branch).
        if (this.rustI64CounterOf(key) !== undefined) return `${receiverText}.get(${keyText} as usize).cloned().unwrap_or(Value::Null)`;
        return `${receiverText}.get(${keyText}.as_i64().unwrap_or(-1) as usize).cloned().unwrap_or(Value::Null)`;
    }

    /** Container kind a printed `Value` expression provably yields on every path. */
    rustContainerProducingKind(node: any, seen: Set<Node>): 'list' | 'map' | undefined {
        if (node === undefined || node === null || seen.has(node)) return undefined;
        seen.add(node);
        if (isArrayLiteralExpression(node)) return 'list';
        if (isObjectLiteralExpression(node)) return 'map';
        if (isParenthesizedExpression(node) || isAsExpression(node) || isNonNullExpression(node) || isTypeAssertion(node)
            || node.kind === SyntaxKind.AwaitExpression) {
            return this.rustContainerProducingKind((node as any).expression, seen);
        }
        if (isConditionalExpression(node)) return undefined;
        if (isElementAccessExpression(node)) {
            // `this.orderbooks[symbol]`: the container's declared element type is what
            // the port stores there.
            const elementType = this.rustStringIndexedElementType((node as any).expression);
            return elementType !== undefined && this.rustDictBearerType(elementType) ? 'map' : undefined;
        }
        if (isIdentifier(node)) {
            const declaration: any = this.rustDeclarationOfIdentifier(node);
            if (declaration === undefined || !isVariableDeclaration(declaration) || declaration.name === node) return undefined;
            // An alias of an already-typed container is not a `Value` place.
            if (this.rustReadBearerKindOfDeclaration(declaration) !== false || this.rustVecLocalIsTyped(declaration)
                || this.rustDictLocalIsTyped(declaration)) return undefined;
            return this.rustContainerProducingKind(this.rustSkipWrappers(declaration.initializer), seen);
        }
        if (!isCallExpression(node)) return undefined;
        const callee: any = (node as any).expression;
        if (!isPropertyAccessExpression(callee)) return undefined;
        const method = String(callee.name.text);
        const owner: any = callee.expression;
        // `x.split(sep)` prints the runtime split: an array on every path.
        if (method === 'split' && owner.kind !== SyntaxKind.ThisKeyword) return 'list';
        if (owner.kind === SyntaxKind.Identifier) {
            const ownerName = String(owner.text);
            if (ownerName === 'Object' && (method === 'keys' || method === 'values' || method === 'entries')) return 'list';
            if (ownerName === 'Promise' && method === 'all') return 'list';
            return undefined;
        }
        if (owner.kind !== SyntaxKind.ThisKeyword) return undefined;
        // An array-returning reader: `safeList` only when its default is a list.
        if (method === 'safeList' || method === 'safeListValue') {
            const args: any[] = (node as any).arguments ?? [];
            return args.length < 3 || isArrayLiteralExpression(this.rustSkipWrappers(args[2])) ? 'list' : undefined;
        }
        if (method === 'safeDict' || method === 'safeMarket' || method === 'safeMarketStructure'
            || method === 'market' || method === 'currency' || method === 'safeCurrency') return 'map';
        // `safeValue(container, key)` without a default: the element or `undefined`.
        if (method === 'safeValue' || method === 'safeValue2') {
            const args: any[] = (node as any).arguments ?? [];
            if (args.length !== 2) return undefined;
            const elementType = this.rustStringIndexedElementType(args[0]);
            return elementType !== undefined && this.rustDictBearerType(elementType) ? 'map' : undefined;
        }
        // The callee's own returns build the container.
        const built = this.rustBuiltContainerKind(node, 0);
        if (built !== undefined) return built;
        return undefined;
    }

    /** Declared element type of a container indexed by a string key. */
    rustStringIndexedElementType(node: Node | undefined): Type | undefined {
        if (node === undefined) return undefined;
        const containerType = this.getCheckedTypeOf(node);
        if (containerType === undefined) return undefined;
        return this.getChecker().getIndexTypeOfType(containerType, IndexKind.String) ?? undefined;
    }

    // Two-level dict bearers: an object literal whose every value is an object literal is declared
    // `IndexMap<String, IndexMap<String, Value>>`, so `x[k1][k2] = v` is one `entry(k1)..insert(k2, v)` and
    // `x[k1][k2]` a two-step lookup. Any other shape keeps the box.

    private rustNestedBearerDecisions = new WeakMap<any, boolean>();

    /** The declaration behind `node` when it is a local typed as a two-level
     *  dict bearer. */
    rustNestedDictBearerDeclaration(node: any): any {
        if (!isIdentifier(node)) return undefined;
        const declaration: any = this.rustDeclarationOfIdentifier(node);
        if (declaration === undefined || !isVariableDeclaration(declaration) || declaration.name === node) return undefined;
        return this.rustNestedDictLocalIsTyped(declaration) ? declaration : undefined;
    }

    rustNestedDictLocalIsTyped(declaration: any): boolean {
        if (declaration?.kind !== SyntaxKind.VariableDeclaration) return false;
        let decision = this.rustNestedBearerDecisions.get(declaration);
        if (decision === undefined) {
            this.rustNestedBearerDecisions.set(declaration, false); // re-entrancy guard
            try {
                decision = this.rustNestedDictLocalIsTypedUncached(declaration);
            } catch (e) {
                decision = false; // no proof -> the local keeps its `Value` box
            }
            this.rustNestedBearerDecisions.set(declaration, decision);
        }
        return decision;
    }

    /** `{ k: { .. }, .. }` — every value an object literal, every key a plain
     *  string: the outer map's value type is the inner `IndexMap`, never a box. */
    rustNestedDictLiteral(node: any): any {
        const literal: any = this.rustSkipWrappers(node);
        if (!isObjectLiteralExpression(literal)) return undefined;
        for (const property of literal.properties as unknown as any[]) {
            if (property.kind !== SyntaxKind.PropertyAssignment || property.name === undefined
                || property.name.kind === SyntaxKind.ComputedPropertyName) return undefined;
            if (!RustTranspiler.rustBearerKeyTextOk(String(property.name.text))) return undefined;
            const inner: any = this.rustSkipWrappers(property.initializer);
            if (!isObjectLiteralExpression(inner)) return undefined;
            for (const entry of inner.properties as unknown as any[]) {
                if (isShorthandPropertyAssignment(entry)) continue;
                if (entry.kind !== SyntaxKind.PropertyAssignment || entry.name === undefined
                    || entry.name.kind === SyntaxKind.ComputedPropertyName) return undefined;
                if (!RustTranspiler.rustBearerKeyTextOk(String(entry.name.text))) return undefined;
            }
        }
        return literal;
    }

    rustNestedDictLocalIsTypedUncached(declaration: any): boolean {
        if (declaration?.kind !== SyntaxKind.VariableDeclaration) return false;
        if (declaration.name?.kind !== SyntaxKind.Identifier || declaration.initializer === undefined) return false;
        if (this.rustNestedDictLiteral(declaration.initializer) === undefined) return false;
        const name = String(declaration.name.text);
        const fn: any = this.rustEnclosingFunction(declaration);
        if (fn === undefined || isSourceFile(fn)) return false;
        // The tests pipeline's text post-passes key on the boxed `Value` local shape.
        const source: any = declaration.getSourceFile?.()?.fileName;
        if (typeof source === 'string' && /\/test\//.test(source)) return false;
        const escapes: any[] = [];
        let nestedUses = 0;
        const safe = this.rustLocalUsesAll(declaration, name, false, (n: any) => {
            if (this.rustIdentifierIsPropertyName(n)) {
                return !(n.parent?.kind === SyntaxKind.ShorthandPropertyAssignment && n.parent.name === n);
            }
            if (!this.rustIdentifierRefersToDeclaration(n, declaration)) return false;
            if (this.rustEnclosingFunction(n) !== fn) return false; // a closure capture
            const parent: any = n.parent;
            if (isReturnStatement(parent) && parent.expression === n) {
                escapes.push(n);
                return true;
            }
            if (isCallExpression(parent) && parent.arguments.some((a: any) => a === n)
                && isPropertyAccessExpression(parent.expression)
                && (parent.expression.expression.kind === SyntaxKind.ThisKeyword
                    || parent.expression.expression.kind === SyntaxKind.SuperKeyword)) {
                escapes.push(n);
                return true;
            }
            if (isElementAccessExpression(parent) && parent.expression === n) {
                if (!this.rustNestedBearerElementUse(parent, name)) return false;
                nestedUses += 1;
                return true;
            }
            if (parent.kind === SyntaxKind.PropertyAssignment && parent.initializer === n
                && parent.parent?.parent !== undefined && isObjectLiteralExpression(parent.parent)) {
                escapes.push(n);
                return true;
            }
            return false;
        });
        if (!safe || escapes.length > 1) return false;
        // Without a two-level use nothing proves the inner map; flat stays correct.
        if (nestedUses === 0) return false;
        if (escapes.length === 1 && !this.rustVecIsFinalUse(escapes[0], name)) return false;
        return true;
    }

    /** One use rooted at the bearer: exactly two key levels, either read
     *  (`x[k1][k2]` in a value position) or a whole-entry write (`x[k1][k2] = v`
     *  whose value never reads the receiver, which the write holds `&mut` of). */
    rustNestedBearerElementUse(access: any, name: string): boolean {
        let root: any = access;
        while (isElementAccessExpression(root.parent) && root.parent.expression === root) root = root.parent;
        const level1: any = root.expression;
        if (root === access) {
            // A bucket seeded as `x[k1] = {}` is the inner map itself.
            const up1: any = root.parent;
            if (!isIdentifier(level1) || String(level1.text) !== name) return false;
            if (!isBinaryExpression(up1) || up1.left !== root || up1.operatorToken.kind !== SyntaxKind.EqualsToken) return false;
            const seed: any = this.rustSkipWrappers(up1.right);
            if (!isObjectLiteralExpression(seed) || seed.properties.length !== 0) return false;
            return this.rustDictBearerKeyOk(access.argumentExpression);
        }
        if (!isElementAccessExpression(level1) || !isElementAccessExpression(access)) return false;
        const base: any = level1.expression;
        if (!isIdentifier(base) || String(base.text) !== name) return false;
        if (!this.rustDictBearerKeyOk(access.argumentExpression) || !this.rustDictBearerKeyOk(root.argumentExpression)) return false;
        const up: any = root.parent;
        const write = up !== undefined && isBinaryExpression(up) && up.left === root
            && rustIsAssignmentOperator(up.operatorToken.kind);
        if (write) {
            if (up.operatorToken.kind !== SyntaxKind.EqualsToken) return false;
            return !new RegExp(`\\b${name}\\b`).test(String(up.right.getText?.() ?? ''));
        }
        if (up !== undefined && (isDeleteExpression(up) || (isCallExpression(up) && up.expression === root)
            || up.kind === SyntaxKind.PrefixUnaryExpression || up.kind === SyntaxKind.PostfixUnaryExpression)) return false;
        if (!this.isNativeAccessPositionSafe(root) || this.isNativeWriteTargetBase(root)) return false;
        if (this.isWriteBackBindRead(access)) return false;
        return true;
    }

    /** The initialiser of a two-level bearer: one bucket per key, a line per entry. */
    rustNestedObjectLiteralBlock(literal: any, identation = 0): string {
        const escapeKey = (s: any): string => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
            .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
        const idn1 = this.getIden(identation + 1);
        const lines: string[] = [];
        for (const property of literal.properties as unknown as any[]) {
            const inner: any = this.rustSkipWrappers(property.initializer);
            lines.push(`${idn1}let mut __inner = indexmap::IndexMap::<String, Value>::new();`);
            for (const entry of inner.properties as unknown as any[]) {
                const keyText = String(entry.name.text);
                const value = isShorthandPropertyAssignment(entry)
                    ? `${keyText}.clone()` : this.printNode(entry.initializer, 0);
                lines.push(`${idn1}__inner.insert("${escapeKey(keyText)}".to_string(), ${value});`);
            }
            lines.push(`${idn1}m.insert("${escapeKey(property.name.text)}".to_string(), __inner);`);
        }
        const body = lines.map((l) => l + '\n').join('');
        return `{\n${idn1}let mut m = indexmap::IndexMap::<String, indexmap::IndexMap<String, Value>>::new();\n${body}${idn1}m\n${this.getIden(identation)}}`;
    }

    /** Read key: a bare literal, or the String an `IndexMap` lookup takes. */
    rustNestedBearerReadKey(node: any, text: string, receiver = ''): string | undefined {
        if (isStringLiteralLikeNode(node)) return `"${this.escapeRustStringLiteral(String((node as any).text))}"`;
        const arg = this.rustNativeInsertKeyArg({ text: receiver, isField: false, plain: true }, node, text);
        return arg === undefined ? undefined : `&${arg}`;
    }

    /** Write key: the `String` an `entry`/`insert` takes. */
    rustNestedBearerWriteKey(node: any, text: string, receiver = ''): string | undefined {
        if (isStringLiteralLikeNode(node)) return `"${this.escapeRustStringLiteral(String((node as any).text))}".to_string()`;
        return this.rustNativeInsertKeyArg({ text: receiver, isField: false, plain: true }, node, text);
    }

    /** `x[k1][k2] = v` on a two-level bearer: create the bucket, insert. */
    rustNestedBearerInsert(baseExpr: any, key1Node: any, key1Text: string, key2Node: any, key2Text: string, valueText: string): string | undefined {
        if (this.rustNestedDictBearerDeclaration(baseExpr) === undefined) return undefined;
        const name = String(baseExpr.text);
        if (new RegExp(`\\b${name}\\b`).test(valueText)) return undefined;
        const k1 = this.rustNestedBearerWriteKey(key1Node, key1Text, name);
        const k2 = this.rustNestedBearerWriteKey(key2Node, key2Text, name);
        if (k1 === undefined || k2 === undefined) return undefined;
        const value = this.rustPrintedBoolArg(valueText) ? `Value::Bool(${valueText})` : valueText.trim();
        const arg = /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) && value !== 'self' && value !== 'true' && value !== 'false'
            ? `${value}.clone()` : value;
        return `${name}.entry(${k1}).or_default().insert(${k2}, ${arg})`;
    }

    /** `x[k1] = {}` on a two-level bearer: seed the bucket, no box, no helper. */
    rustNestedBearerBucket(baseExpr: any, key1Node: any, key1Text: string, valueNode: any): string | undefined {
        if (this.rustNestedDictBearerDeclaration(baseExpr) === undefined) return undefined;
        const value: any = this.rustSkipWrappers(valueNode);
        if (!isObjectLiteralExpression(value) || value.properties.length !== 0) return undefined;
        const k1 = this.rustNestedBearerWriteKey(key1Node, key1Text, String(baseExpr.text));
        if (k1 === undefined) return undefined;
        return `${String(baseExpr.text)}.entry(${k1}).or_default()`;
    }

    /** `x[k1][k2]` on a two-level bearer: the two map lookups, boxed like `get_value`. */
    rustNestedBearerRead(baseExpr: any, key1Node: any, key2Node: any): string | undefined {
        if (this.rustNestedDictBearerDeclaration(baseExpr) === undefined) return undefined;
        const name = String(baseExpr.text);
        const k1 = this.rustNestedBearerReadKey(key1Node, this.printNode(key1Node, 0).trim(), name);
        const k2 = this.rustNestedBearerReadKey(key2Node, this.printNode(key2Node, 0).trim(), name);
        if (k1 === undefined || k2 === undefined) return undefined;
        return `${name}.get(${k1}).and_then(|__n| __n.get(${k2})).cloned().unwrap_or(Value::Null)`;
    }

    // Native IndexMap ops for `k in X`, `delete X[k]`, `Object.keys/values(X)`.

    /** Source path of a node (forward slashes). */
    provenDictFieldPath(node: Node): string {
        const src: any = (node as any)?.getSourceFile?.();
        return typeof src?.fileName === 'string' ? src.fileName.replace(/\\/g, '/') : '';
    }

    /** Test sources keep the helpers: tests-pipeline post-passes match `in_op(` text. */
    isTestSource(node: Node): boolean {
        return /\/test\//.test(this.provenDictFieldPath(node));
    }

    /** `k in X` with a non-literal key on a dict-shaped receiver: `in_op`'s Dict arm.
     *  The Arr arm is the only other `true` path; the dict proof excludes it. */
    provenDictFieldInOp(key, obj): string | undefined {
        const recv: any = this.rustStripWrappers(obj);
        if (this.isTestSource(obj) || !this.isShallowValueReceiver(recv) || this.rustParamShadowOf(recv) !== undefined
            || (isPropertyAccessExpression(recv) && RustTranspiler.RUST_TAGGED_CONTAINER_FIELDS.has(String(recv.name.text)))
            || !this.isDictShapedType(this.typeOfNodeIfAny(obj))) {
            return undefined;
        }
        const objExpr = this.printNode(obj, 0).trim();
        const keyExpr = this.printNode(key, 0).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyExpr) || keyExpr === 'self') {
            return undefined; // the key is borrowed beside the receiver: plain locals only
        }
        return `Value::Bool(matches!((&${objExpr}, &${keyExpr}), (Value::Dict(__d), Value::Str(__k)) if __d.contains_key(__k.as_ref())))`;
    }

    /** `delete X[k]` on a receiver the native-insert proof admits (never a ws
     *  subscriptions snapshot, so `try_ws_subs_remove` is dead): `shift_remove`. */
    provenDictFieldDelete(node): string | undefined {
        const target: any = node?.expression;
        if (target === undefined || !isElementAccessExpression(target) || this.isTestSource(node)) {
            return undefined;
        }
        const base: any = target.expression;
        const receiver = this.rustNativeInsertReceiver(base);
        // ws-capable tiers: a local/param may alias a `client.subscriptions` snapshot
        // (live-store route in the helper); admit only fields, literal-built locals and
        // declared-Dict table locals whose initialiser reads no tagged container.
        const restTier = /\/ts\/src\/[^/]+\.ts$/.test(this.provenDictFieldPath(node));
        const declaredLocal = !receiver?.isField && this.rustDeclaredLocalEntry(base) !== undefined
            && !this.rustLocalInitReadsTaggedContainer(base);
        if (receiver !== undefined && !receiver.isField && !restTier && receiver.plain !== true && !declaredLocal) {
            return undefined;
        }
        if (receiver === undefined || this.rustParamShadowOf(base) !== undefined
            || !this.rustReceiverStaysDict(base, receiver)
            || (receiver.isField && RustTranspiler.RUST_TAGGED_CONTAINER_FIELDS.has(String(receiver.nameNode.text)))
            || (!receiver.isField && this.rustLocalInitReadsTaggedContainer(base))) {
            return undefined;
        }
        const recv = this.printNode(base, 0).trim();
        const keyNode: any = target.argumentExpression;
        const literal = isStringLiteral(keyNode) ? this.rustStringLiteralOf(this.printNode(keyNode, 0).trim()) : undefined;
        if (literal !== undefined) {
            return `if let Value::Dict(__d) = &mut ${recv} { std::sync::Arc::make_mut(__d).shift_remove(${literal}); }`;
        }
        const keyExpr = this.printNode(keyNode, 0).trim();
        if (!this.rustDeleteKeyBorrowable(keyExpr, recv)) {
            return undefined;
        }
        const emitted = `if let (Value::Dict(__d), Value::Str(__k)) = (&mut ${recv}, &${keyExpr}) { std::sync::Arc::make_mut(__d).shift_remove(__k.as_ref()); }`;
        return emitted.length > 380 ? undefined : emitted; // keep the line under the long400 budget
    }

    /** A key the native `if let` can borrow beside `&mut RECV`: one expression
     *  (no statement), naming neither the receiver nor its owner — the tuple
     *  would borrow `self` twice — and never a bare `self`. */
    rustDeleteKeyBorrowable(keyExpr: string, recv: string): boolean {
        if (keyExpr.length === 0 || keyExpr.includes(';') || /\bself\b/.test(keyExpr)) {
            return false;
        }
        return !(/^[A-Za-z_][A-Za-z0-9_]*$/.test(recv)
            && new RegExp(`(^|[^A-Za-z0-9_])${recv}([^A-Za-z0-9_]|$)`).test(keyExpr));
    }

    /** `this.<field>` with a declared plain-dict type that is no ws container: the
     *  hand-written base builds these maps itself and never tags them. */
    untaggedDictField(node): boolean {
        return isPropertyAccessExpression(node) && node.expression.kind === SyntaxKind.ThisKeyword
            && !RustTranspiler.RUST_TAGGED_CONTAINER_FIELDS.has(String(node.name.text))
            && !RustTranspiler.RUST_TAGGED_HANDLE_FIELDS.has(String(node.name.text))
            && this.rustDeclaredPlainDictField(node);
    }

    rustDeclaredPlainDictField(node): boolean {
        let declaration: any;
        try {
            declaration = symbolValueDeclaration(this.getChecker().getSymbolAtLocation(node.name));
        } catch (e) {
            return false;
        }
        if (declaration === undefined || declaration.kind !== SyntaxKind.PropertyDeclaration || declaration.type === undefined) return false;
        const type = this.getCheckedTypeOf(declaration.type);
        return type !== undefined && this.isProvenMapType(type);
    }

    /** `Object.keys/values(X)` in REST-tier sources (`ts/src/<id>.ts`): no ws client
     *  there, so X never carries the `__ws_subs_url`/`__ws_sub_ref` tags the helper filters. */
    provenDictFieldEnum(node, parsedArg: string | undefined, kind: 'keys' | 'values'): string | undefined {
        const arg: any = this.rustStripWrappers(node?.arguments?.[0]);
        if (arg === undefined || parsedArg === undefined
            || !(/\/ts\/src\/[^/]+\.ts$/.test(this.provenDictFieldPath(node)) || this.untaggedDictField(arg))
            || !(isIdentifier(arg) || isPropertyAccessExpression(arg) || isElementAccessExpression(arg) || isCallExpression(arg))
            || this.rustParamShadowOf(arg) !== undefined) {
            return undefined;
        }
        const type = this.typeOfNodeIfAny(arg);
        const parts: Type[] = type === undefined ? [] : ((type.flags & TypeFlags.Union) ? (typeParts(type) ?? []) : [type]);
        if (parts.some((p) => this.getChecker().isArrayType(p) || this.getChecker().isTupleType(p)
            || (p.flags & (TypeFlags.StringLike | TypeFlags.NumberLike | TypeFlags.BooleanLike | TypeFlags.BigIntLike)) !== 0)) {
            return undefined; // native-typed locals (bool / Option<String>) have no `as_map`
        }
        const text = parsedArg.trim();
        const recv = /^[A-Za-z_][A-Za-z0-9_.]*$/.test(text) ? text : `(${text})`;
        const body = kind === 'keys' ? '__m.keys().map(|__k| Value::Str(__k.clone().into())).collect()' : '__m.values().cloned().collect()';
        return `Value::Array(${recv}.as_map().map(|__m| ${body}).unwrap_or_default())`;
    }

    // String methods on a checker-proven string receiver print native `str` code. The
    // receiver is a `Value`; `as_str()` reaches the payload and its `None` arm is the helper's
    // non-`Str` branch (Null / false / empty array / -1). Literal operands only, unless noted.

    /** Printed receiver usable as a method receiver, else undefined. */
    rustNativeStringReceiver(node, receiverText: string, kind = 'string'): string | undefined {
        if (node === undefined || !isCallExpression(node) || !isPropertyAccessExpression(node.expression)) return undefined;
        if (typeof receiverText !== 'string' || receiverText.includes('\n') || receiverText.trim().startsWith('&')) return undefined;
        const receiver = node.expression.expression;
        if (receiver.kind === SyntaxKind.ThisKeyword || receiver.kind === SyntaxKind.SuperKeyword) return undefined;
        if (kind === 'string' && this.primitiveKindOfType(this.typeOfNodeIfAny(receiver)) !== 'string') return undefined;
        if (isIdentifier(receiver) && this.rustStringLocalIdentifierIsTyped(receiver)) return undefined;
        const text = receiverText.trim();
        return /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(text) ? text : `(${text})`;
    }

    /** Escaped text of a string-literal argument, else undefined. */
    rustNativeStringLiteralArg(node): string | undefined {
        if (node === undefined || (!isStringLiteral(node) && !isNoSubstitutionTemplateLiteral(node))) return undefined;
        if (node.text in this.StringLiteralReplacements) return undefined;
        return this.escapeRustStringLiteral(node.text);
    }

    // `x.toUpperCase()` / `x.toLowerCase()`: the helper's `Value::Str` arm, Null otherwise.
    printNativeStringCase(node, receiverText: string, method: string): string | undefined {
        const receiver = this.rustNativeStringReceiver(node, receiverText);
        if (receiver === undefined || (node.arguments?.length ?? 0) !== 0) return undefined;
        return this.rustStrCaseConvert(receiver, method);
    }

    // Case conversion of a Str place: non-Str stays Null. Closure-free for a plain place (read once either way).
    rustStrCaseConvert(receiver: string, method: string): string {
        if (RUST_PLAIN_PLACE.test(receiver)) {
            return `(if let Some(__s) = ${receiver}.as_str() { Value::Str(__s.${method}().into()) } else { Value::Null })`;
        }
        return `${receiver}.as_str().map(|__s| Value::Str(__s.${method}().into())).unwrap_or(Value::Null)`;
    }

    // `x.startsWith("lit")` / `x.endsWith("lit")` → a bool (false for a non-`Str` receiver).
    printNativeStringAffixTest(node, receiverText: string, method: string): string | undefined {
        const receiver = this.rustNativeStringReceiver(node, receiverText);
        if (receiver === undefined || node.arguments?.length !== 1) return undefined;
        const literal = this.rustNativeStringLiteralArg(node.arguments[0]);
        if (literal === undefined) return undefined;
        // A non-empty literal is never matched by the `""` a non-Str receiver gives: closure-free.
        if (literal !== '' && RUST_PLAIN_PLACE.test(receiver)) return `${receiver}.as_str().unwrap_or("").${method}("${literal}")`;
        return `${receiver}.as_str().is_some_and(|__s| __s.${method}("${literal}"))`;
    }

    // `x.split("lit")`: an array of the parts, the empty array for a non-`Str` receiver.
    printNativeStringSplit(node, receiverText: string): string | undefined {
        const receiver = this.rustNativeStringReceiver(node, receiverText);
        if (receiver === undefined || node.arguments?.length !== 1) return undefined;
        const literal = this.rustNativeStringLiteralArg(node.arguments[0]);
        if (literal === undefined) return undefined;
        if (RUST_PLAIN_PLACE.test(receiver)) {
            return `Value::Array(if let Some(__s) = ${receiver}.as_str() { __s.split("${literal}").map(Value::from).collect() } else { Vec::new() })`;
        }
        return `Value::Array(${receiver}.as_str().map(|__s| __s.split("${literal}").map(Value::from).collect()).unwrap_or_default())`;
    }

    // `x.replace("a", "b")`: the helper replaces every occurrence (`str::replace`), else the receiver.
    printNativeStringReplace(node, receiverText: string): string | undefined {
        const receiver = this.rustNativeStringReceiver(node, receiverText);
        if (receiver === undefined || node.arguments?.length !== 2) return undefined;
        const from = this.rustNativeStringLiteralArg(node.arguments[0]);
        const to = this.rustNativeStringLiteralArg(node.arguments[1]);
        if (from === undefined || to === undefined) return undefined;
        return `${receiver}.as_str().map(|__s| Value::Str(__s.replace("${from}", "${to}").into())).unwrap_or_else(|| ${receiver}.clone())`;
    }

    // `x.padStart(N, "c")` with a one-char alphanumeric pad: `format!` width counts chars and never
    // truncates, which is the helper's arm for a one-char pad.
    printNativeStringPadStart(node, receiverText: string): string | undefined {
        const receiver = this.rustNativeStringReceiver(node, receiverText);
        if (receiver === undefined || node.arguments?.length !== 2) return undefined;
        const width = this.rustSliceLiteralBound(node.arguments[0]);
        const pad = node.arguments[1];
        if (width === undefined || width < 0 || width > 4096) return undefined;
        if ((!isStringLiteral(pad) && !isNoSubstitutionTemplateLiteral(pad)) || !/^[A-Za-z0-9 ]$/.test(pad.text)) return undefined;
        return `${receiver}.as_str().map(|__s| Value::Str(format!("{:${pad.text}>${width}}", __s).into())).unwrap_or(Value::Null)`;
    }

    // `x.padEnd(N, "c")` — the padStart arm with right padding (`<`): the helper appends
    // `repeat(need)` of a one-char pad, which `format!` width reproduces exactly.
    printNativeStringPadEnd(node, receiverText: string): string | undefined {
        const receiver = this.rustNativeStringReceiver(node, receiverText);
        if (receiver === undefined || node.arguments?.length !== 2) return undefined;
        const width = this.rustSliceLiteralBound(node.arguments[0]);
        const pad = node.arguments[1];
        if (width === undefined || width < 0 || width > 4096) return undefined;
        if ((!isStringLiteral(pad) && !isNoSubstitutionTemplateLiteral(pad)) || !/^[A-Za-z0-9 ]$/.test(pad.text)) return undefined;
        return `${receiver}.as_str().map(|__s| Value::Str(format!("{:${pad.text}<${width}}", __s).into())).unwrap_or(Value::Null)`;
    }

    // `x.toFixed(N)` on a checker-proven number and a literal digit count: the helper's Int/Float
    // arms are exactly `format!("{:.*}")` over the f64 payload. A string payload (which the helper
    // parses) is not proven here, so it keeps the helper. `Value::str` matches the shape the
    // ccxt-side string-helper pass already emits for the same site.
    printNativeToFixed(node, receiverText: string): string | undefined {
        if (node === undefined || !isCallExpression(node) || !isPropertyAccessExpression(node.expression)) return undefined;
        if (node.arguments?.length !== 1) return undefined;
        if (this.primitiveKindOfType(this.typeOfNodeIfAny(node.expression.expression)) !== 'number') return undefined;
        const receiver = this.rustNativeStringReceiver(node, receiverText, 'number');
        if (receiver === undefined) return undefined;
        const digits = this.rustSliceLiteralBound(node.arguments[0]);
        if (digits === undefined || digits < 0 || digits > 100) return undefined;
        return `Value::str(format!("{:.*}", ${digits}, ${receiver}.as_f64().unwrap_or(0.0)))`;
    }

    // `x.indexOf(y)` with a proven-string needle: `-1` when either side is not a `Str` (byte index).
    printNativeStringIndexOfString(node, receiverText: string): string | undefined {
        const receiver = this.rustNativeStringReceiver(node, receiverText);
        if (receiver === undefined || node.arguments?.length !== 1) return undefined;
        const needle = node.arguments[0];
        if (!isIdentifier(needle) || this.primitiveKindOfType(this.typeOfNodeIfAny(needle)) !== 'string') return undefined;
        if (!this.isDeclaredValueIdentifier(needle) || this.rustStringLocalIdentifierIsTyped(needle)) return undefined;
        const needleText = this.printNode(needle, 0).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(needleText)) return undefined;
        return `Value::Int(${receiver}.as_str().zip(${needleText}.as_str()).and_then(|(__s, __n)| __s.find(__n)).map(|__i| __i as i64).unwrap_or(-1))`;
    }

    // `xs.join("lit")` on a `string[]`: `Display` renders `Str`/`Null` like the helper does.
    printNativeStringJoin(node, receiverText: string): string | undefined {
        const receiver = this.rustNativeStringReceiver(node, receiverText, 'array');
        if (receiver === undefined || node.arguments?.length !== 1) return undefined;
        const literal = this.rustNativeStringLiteralArg(node.arguments[0]);
        if (literal === undefined) return undefined;
        const checker: any = this.checkerOrUndefined();
        const type: any = this.typeOfNodeIfAny(node.expression.expression);
        if (checker === undefined || type === undefined || !checker.isArrayType(type)) return undefined;
        const element = checker.getTypeArguments?.(type)?.[0];
        if (this.primitiveKindOfType(element) !== 'string') return undefined;
        return `Value::Str(${receiver}.as_array().map(|__a| __a.iter().map(|__v| __v.to_string()).collect::<Vec<String>>().join("${literal}")).unwrap_or_default().into())`;
    }

    // Numeric/string helpers on checker-proven `number` / `string` operands (nullish members
    // allowed: the helper's Null arm is reproduced). Each native form answers exactly what the helper
    // answers for Int/Float/Str/Null boxes; any other operand type keeps the helper.
    rustOperandKind(node): string | undefined {
        try {
            if (node === undefined || !this.printsValueExpression(node)) return undefined;
            return this.primitiveKindOfType(this.typeOfNodeIfAny(node));
        } catch (e) {
            return undefined;
        }
    }

    // `x.toString()` on a number/string: `to_string_val` is `stringify_simple`, i.e. `Display`.
    // Typed `Option<String>` receivers have no `Display`, so they keep the helper.
    printRustNativeToString(node, name: string): string | undefined {
        const receiver = node?.expression?.expression;
        const kind = this.rustOperandKind(receiver);
        if (kind !== 'number' && kind !== 'string') return undefined;
        const inner = this.unwrapParensNode(receiver);
        if (inner !== undefined && (this.rustStringLocalIdentifierIsTyped(inner) || this.rustNativeStrCalleeKind(inner) === 'str')) return undefined;
        return `Value::Str(format!("{}", ${name}).into())`;
    }

    // `Math.floor|round|ceil(n)`: the helper answers `Float(op(x))` for a numeric box, `Null` otherwise.
    printRustNativeMathCall(node, op: string, parsedArg: string): string | undefined {
        if (this.rustOperandKind(node?.arguments?.[0]) !== 'number') return undefined;
        return `(${parsedArg}).as_f64().map(|__x| Value::Float(__x.${op}())).unwrap_or(Value::Null)`;
    }

    // `-n`: Int/Float flip sign in place, a Null box stays Null (helper's fallthrough).
    printRustNativeNegate(operand, operandText: string): string | undefined {
        if (this.rustOperandKind(operand) !== 'number' && this.rustNumericKind(operand) === undefined) return undefined;
        return `(match &(${operandText}) { Value::Int(x) => Value::Int(-x), Value::Float(x) => Value::Float(-x), _ => Value::Null })`;
    }

    // `a % b` on numbers: Int pair stays Int, any Float widens; a zero divisor or Null answers Null.
    printRustNativeMod(left, right, leftText: string, rightText: string): string | undefined {
        if (this.rustOperandKind(left) !== 'number' || this.rustOperandKind(right) !== 'number') return undefined;
        return `(match (&(${leftText}), &(${rightText})) {` +
            ' (Value::Int(x), Value::Int(y)) if *y != 0 => Value::Int(x % y),' +
            ' (Value::Int(x), Value::Float(y)) if *y != 0.0 => Value::Float(*x as f64 % *y),' +
            ' (Value::Float(x), Value::Int(y)) if *y != 0 => Value::Float(*x % *y as f64),' +
            ' (Value::Float(x), Value::Float(y)) if *y != 0.0 => Value::Float(x % y),' +
            ' _ => Value::Null })';
    }

    // `.length` always prints `Value::Int` (`get_array_length` / `Value::Int(len)`), so a
    // `.length` read, or a `const` local initialised from one, is a never-null Int whatever its receiver.
    rustIsDefiniteInt(node): boolean {
        const inner = this.rustStripWrappers(node);
        if (inner === undefined) return false;
        if (isPropertyAccessExpression(inner)) return String(inner.name.text) === 'length';
        if (!isIdentifier(inner)) return false;
        const declaration: any = this.rustSingleLocalDeclaration(inner);
        if (declaration === undefined || !isVariableDeclaration(declaration) || declaration.name?.kind !== SyntaxKind.Identifier) return false;
        if ((declaration.parent?.flags & NodeFlags.Const) === 0) return false;
        const init = this.rustStripWrappers(declaration.initializer);
        return init !== undefined && isPropertyAccessExpression(init) && String(init.name.text) === 'length';
    }

    // Int-only (definite) or checker-proven number (Int/Float/Null) operand that prints a `Value`.
    rustNumericOperand(node): string | undefined {
        if (this.rustIsDefiniteInt(node)) return 'definite';
        return this.rustOperandKind(node) === 'number' ? 'number' : undefined;
    }

    // `a === b` with a definite Int side against a number literal, a number or another definite Int:
    // is_equal compares Int/Float payloads as f64 and Null only equals Null, which `as_f64()` mirrors.
    rustLengthEquality(left, right, op): string | undefined {
        if (!this.rustIsDefiniteInt(left) && !this.rustIsDefiniteInt(right)) return undefined;
        const operator = (op === SyntaxKind.EqualsEqualsToken || op === SyntaxKind.EqualsEqualsEqualsToken) ? '==' : '!=';
        const [ definite, other ] = this.rustIsDefiniteInt(left) ? [ left, right ] : [ right, left ];
        if (!this.printsValueExpression(definite)) return undefined;
        const otherInner = this.rustStripWrappers(other);
        if (otherInner !== undefined && otherInner.kind === SyntaxKind.NumericLiteral) {
            const text = this.numericLiteralF64Text(otherInner);
            if (text === undefined) return undefined;
            return `${this.printNode(definite, 0)}.as_f64() ${operator} Some(${text})`;
        }
        if (this.rustNumericOperand(other) === undefined) return undefined;
        return `${this.printNode(left, 0)}.as_f64() ${operator} ${this.printNode(right, 0)}.as_f64()`;
    }

    // `a + b` / `a - b` with a definite Int operand and a numeric one: the helper's Int/Float dispatch.
    // `s + n` / `n + s` with s a non-null string and n numeric: the helper's string branch, i.e.
    // `stringify_simple` of each side, which equals `Display` for Str/Int/Float/Null.
    rustNativeAddSubtract(op, left, right, leftType, rightType, leftText: string, rightText: string): string | undefined {
        if (op !== SyntaxKind.PlusToken && op !== SyntaxKind.MinusToken) return undefined;
        const leftNumeric = this.rustNumericOperand(left);
        const rightNumeric = this.rustNumericOperand(right);
        if ((leftNumeric === 'definite' && rightNumeric !== undefined) || (rightNumeric === 'definite' && leftNumeric !== undefined)) {
            return this.printNativeNumeric(op, leftText, rightText);
        }
        if (op !== SyntaxKind.PlusToken) return undefined;
        const stringSide = this.isStringLikeType(leftType) && rightNumeric !== undefined ? left
            : (this.isStringLikeType(rightType) && leftNumeric !== undefined ? right : undefined);
        if (stringSide === undefined || !this.printsValueExpression(stringSide)) return undefined;
        const inner = this.unwrapParensNode(stringSide);
        if (inner !== undefined && (this.rustStringLocalIdentifierIsTyped(inner) || this.rustNativeStrCalleeKind(inner) === 'str')) return undefined;
        return this.printNativeStringConcat(leftText, rightText);
    }

    // Native reads on receivers the plain-dict proof admits (tag-free literal / `account ()` / `omit` /
    // `extend` / tuple element 0 locals) and on `Dict`-annotated parameters whose writes keep them plain:
    // no marker route of `get_value` can fire on such a receiver.

    /** 'local' for a proven plain-dict local, 'param' for a plain-kept dict parameter. */
    rustPlainReceiver(node: Node): 'local' | 'param' | undefined {
        if (node === undefined || !isIdentifier(node) || this.rustParamShadowOf(node) !== undefined) return undefined;
        const declaration: any = this.rustSingleLocalDeclaration(node as Identifier);
        if (declaration !== undefined && isParameterDeclaration(declaration)) {
            if (declaration.type === undefined || declaration.dotDotDotToken !== undefined) return undefined;
            const type = this.getCheckedTypeOf(declaration.type);
            if (type === undefined || !this.isProvenMapType(type)) return undefined;
            return this.rustParamStaysPlainDict(declaration) ? 'param' : undefined;
        }
        try {
            return (this.rustLocalStaysPlain(node as Identifier) || this.rustShippedPlain(node as Identifier)) ? 'local' : undefined;
        } catch (e) {
            return undefined;
        }
    }

    /** A literal-key read (`x['k']` / `x.k`) on a proven plain receiver. */
    rustLiteralReadOk(receiverNode: Node, keyText: string): boolean {
        const kind = this.rustPlainReceiver(receiverNode);
        if (kind === undefined || keyText === '') return false;
        if (kind === 'param' && RustTranspiler.RUST_DICT_LOCAL_UNSAFE_KEYS.has(keyText)) return false;
        const read: any = receiverNode.parent;
        return read === undefined || !this.isWriteBackBindRead(read);
    }

    /** `x[k]` on a proven plain receiver with a `Value` key place (`string` or `any` typed). */
    rustDynamicRead(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined {
        const kind = this.rustPlainReceiver(receiverNode);
        if (kind === undefined) return undefined;
        const key: any = this.rustSkipWrappers(keyNode);
        if (key === undefined || !isIdentifier(key) || this.rustStringLocalIdentifierIsTyped(key)) return undefined;
        const type = this.getCheckedTypeOf(key);
        if (type === undefined || !((type.flags & TypeFlags.Any) || this.rustKeyIsProvenString(key))) return undefined;
        const read = this.rustElementReadOfKey(keyNode);
        if (read !== undefined && this.isWriteBackBindRead(read)) return undefined;
        const keyText = this.printNode(keyNode, 0).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyText)) return undefined;
        if (kind === 'param' && this.rustNodeIsKeyUnsafePlace(keyText)) return undefined;
        return this.rustDictRead(receiverText, keyText, receiverNode);
    }

    // Typed `Vec<Value>` locals also admit an argument of a non-`&mut self` `this.m(..)`
    // call that is not the final use (boxed as `Value::from(x.clone())`, the clone the post-pass
    // gave the boxed local) and a plain `x[i]` read with a number index (native `Vec::get`).
    vecUse(n): boolean {
        const parent = n.parent;
        if (isCallExpression(parent) && parent.arguments.some((a) => a === n)) {
            const callee: any = parent.expression;
            if (!isPropertyAccessExpression(callee)) return false;
            const kind = callee.expression.kind;
            if (kind !== SyntaxKind.ThisKeyword && kind !== SyntaxKind.SuperKeyword) return false;
            if (RustTranspiler.MUT_SELF_METHODS.has(this.toSnakeCaseName(String(callee.name.text)))) return false;
            let mentions = 0;
            const visit = (m) => { if (m.kind === SyntaxKind.Identifier && m.text === n.text) mentions++; m.forEachChild?.(visit); };
            parent.arguments.forEach(visit);
            if (mentions !== 1) return false;
            return this.rustVecValueUse(n, String(n.text)) || !this.loopBetween(n);
        }
        return isElementAccessExpression(parent) && parent.expression === n && this.vecReadShape(parent);
    }

    // A loop around the use that does not also hold the declaration: a per-iteration Vec clone
    // would cost O(n) where the boxed local only bumped its Arc.
    loopBetween(n): boolean {
        const declaration = this.rustVecLocalDeclarationOf(n) ?? this.rustSingleLocalDeclaration(n);
        const fn = this.rustEnclosingFunction(n);
        for (let current: any = n.parent; current !== undefined && current !== fn; current = current.parent) {
            if (declaration !== undefined && this.isNodeInsideNode(declaration, current)) return false;
            switch (current.kind) {
            case SyntaxKind.ForStatement: case SyntaxKind.ForInStatement: case SyntaxKind.ForOfStatement:
            case SyntaxKind.WhileStatement: case SyntaxKind.DoStatement:
                return true;
            }
        }
        return false;
    }

    // `x[k]` as a plain value read: not a write/delete/++ target, not a chain or call receiver,
    // not a bind the next statement mutates (ccxt's write-back keys on `get_value` text).
    vecReadShape(access): boolean {
        const up: any = access.parent;
        if (up === undefined || isDeleteExpression(up) || up.kind === SyntaxKind.PrefixUnaryExpression
            || up.kind === SyntaxKind.PostfixUnaryExpression) return false;
        if (isBinaryExpression(up) && up.left === access && rustIsAssignmentOperator(up.operatorToken.kind)) return false;
        if ((isPropertyAccessExpression(up) || isElementAccessExpression(up) || isCallExpression(up)) && up.expression === access) return false;
        if (this.isWriteBackBindRead(access)) return false;
        const key: any = this.rustStripWrappers(access.argumentExpression);
        if (key === undefined) return false;
        if (isNumericLiteral(key)) return Number.isInteger(Number(key.text)) && Number(key.text) >= 0;
        // a `Value` number counter (`let i = 0`), as for the native dynamic list index
        return this.isRustValueIndexKey(key);
    }

    printElementAccessExpressionExceptionIfAny(node) {
        const receiver: any = node?.expression;
        if (receiver?.kind !== SyntaxKind.Identifier || this.rustVecLocalDeclarationOf(receiver) === undefined
            || !this.vecReadShape(node)) return super.printElementAccessExpressionExceptionIfAny(node);
        const name = this.printNode(receiver, 0).trim();
        const key: any = this.rustStripWrappers(node.argumentExpression);
        // `get_value`'s array arm: an Int index by `as usize` (negative misses), anything else misses.
        const index = isNumericLiteral(key) ? String(Number(key.text))
            : `(${this.printNode(node.argumentExpression, 0).trim()}).as_i64().unwrap_or(-1) as usize`;
        return `${name}.get(${index}).cloned().unwrap_or(Value::Null)`;
    }

    // An expression that always holds a `Value::Arr`: a runtime-split / array-literal-returning call,
    // or a never-reassigned local initialised from one (through `const y = x` aliases).
    provenListValue(node, depth = 0): boolean {
        const inner = this.rustStripWrappers(node);
        if (inner === undefined || depth > 4 || this.rustIsOrderBookSide(inner)) return false;
        if (isCallExpression(inner)) return this.rustCallReturnsProvenList(inner);
        if (!isIdentifier(inner)) return false;
        const declaration: any = this.rustSingleLocalDeclaration(inner);
        if (declaration === undefined || !isVariableDeclaration(declaration) || declaration.initializer === undefined
            || !isIdentifier(declaration.name)) return false;
        if (this.rustLocalIsReassigned(declaration, String(declaration.name.text))) return false;
        return this.provenListValue(declaration.initializer, depth + 1);
    }

    // Plain-dict sources from base `safeDict*` reads of unshared dicts and same-file
    // sync request builders; native truthiness / bool equality on operands proven `Value::Bool`
    // or `Value::Null` at runtime (bool tuple elements, bool-returning exchange methods).

    /** Base-tier bool readers whose Rust form returns `Value::Bool` or `Value::Null`
     *  (`safe_bool*` keep only `Value::Bool` or the default; the `check_option_bool` stub). */
    private static readonly RUST_BOOL_READERS: { [name: string]: number } = { safeBool: 2, safeBool2: 3, safeBoolN: 2, checkOptionBool: -1 };
    private static readonly RUST_DICT_READERS: { [name: string]: number } = { safeDict: 2, safeDict2: 3, safeDictN: 2 };
    /** A REST venue file (`ts/src/<id>.ts`): no base / pro / prediction tier. */
    private static readonly RUST_REST_FILE = /ts\/src\/[^/]+\.ts$/;

    /** Extra plain-dict write sources (write-history proof), REST venue files only: no
     *  runtime tagged handle (book, ws subscription, cache bucket) is reachable there. */
    private rustVisiting = new Set<any>();

    rustPlainDictSource(node: any, depth = 0): boolean {
        if (depth > 4 || !isCallExpression(node) || !isPropertyAccessExpression(node.expression)
            || node.expression.expression.kind !== SyntaxKind.ThisKeyword
            || !this.plainSourceTier(node)) {
            return false;
        }
        const callee = String(node.expression.name.text);
        const defaultIndex = RustTranspiler.RUST_DICT_READERS[callee];
        if (defaultIndex !== undefined) {
            const fallback: any = this.rustStripWrappers(node.arguments[defaultIndex]);
            return this.rustCalleeIsBase(node) && node.arguments.length <= defaultIndex + 1
                && (fallback === undefined || this.rustPlainDictLiteral(fallback) || this.rustTypeIsUndefinedish(fallback))
                && this.rustUnsharedDict(node.arguments[0]) && this.tierSourceOk(node.arguments[0]);
        }
        if (this.freshCopy(node, depth)) return true;
        return this.rustPlainBuilder(node, depth);
    }

    /** `this.options`, a parameter, or a const local whose initializer reads no `this` field
     *  but `options` and no tagged container (`hashmap`, `subscriptions`, `futures`). */
    rustUnsharedDict(arg: any): boolean {
        const node: any = this.rustStripWrappers(arg);
        if (node === undefined) return false;
        if (isPropertyAccessExpression(node) && node.expression.kind === SyntaxKind.ThisKeyword) {
            return String(node.name.text) === 'options';
        }
        if (!isIdentifier(node)) return false;
        const declaration: any = this.rustSingleLocalDeclaration(node);
        if (declaration === undefined) return false;
        // runtime tags live on pro-only fields; a REST method's parameter is caller data
        if (isParameterDeclaration(declaration)) return true;
        if (!isVariableDeclaration(declaration) || (declaration.parent?.flags & NodeFlags.Const) === 0 || declaration.initializer === undefined) return false;
        let clean = true;
        const visit = (n: any) => {
            if (!clean) return;
            if (isPropertyAccessExpression(n)) {
                const field = String(n.name.text);
                const isCallee = isCallExpression(n.parent) && n.parent.expression === n;
                if (RustTranspiler.RUST_TAGGED_CONTAINER_FIELDS.has(field)
                    || (n.expression.kind === SyntaxKind.ThisKeyword && !isCallee && field !== 'options')) {
                    clean = false;
                    return;
                }
            }
            n.forEachChild(visit);
        };
        visit(declaration.initializer);
        return clean;
    }

    /** `this.m (…)` on a sync method of the calling file whose every `return` is a plain
     *  literal, a plain local, or `this.extend|omit|keysort (plain, …unshared)`. */
    rustPlainBuilder(call: any, depth: number): boolean {
        const method: any = this.rustMethodImpl(call);
        if (method === undefined || method.getSourceFile() !== call.getSourceFile()
            || (method.modifiers ?? []).some((m: any) => m.kind === SyntaxKind.AsyncKeyword)) {
            return false;
        }
        // a builder whose proof reaches itself again (recursion through locals) proves nothing
        if (this.rustVisiting.has(method)) return false;
        this.rustVisiting.add(method);
        let plain = true;
        let returns = 0;
        try {
            this.rustWalkScope(method.body, (n) => {
                if (isArrowFunction(n) || n.kind === SyntaxKind.FunctionExpression) return RUST_WALK_SKIP;
                if (!isReturnStatement(n)) return;
                returns++;
                if (!this.rustPlainReturn(n.expression, depth)) { plain = false; return RUST_WALK_STOP; }
            });
        } finally {
            this.rustVisiting.delete(method);
        }
        return plain && returns > 0;
    }

    rustPlainReturn(expr: any, depth: number): boolean {
        const node: any = this.rustStripWrappers(expr);
        if (node === undefined) return false;
        const plainHead = (head: any): boolean => {
            const h: any = this.rustStripWrappers(head);
            return h !== undefined && (this.rustPlainDictLiteral(h)
                || (isIdentifier(h) && this.rustLocalStaysPlain(h, depth + 1)) || this.rustPlainDictSource(h, depth + 1));
        };
        if (plainHead(node)) return true;
        if (!isCallExpression(node) || !isPropertyAccessExpression(node.expression)
            || node.expression.expression.kind !== SyntaxKind.ThisKeyword || node.arguments.length === 0
            || !this.rustCalleeIsBase(node)) {
            return false;
        }
        const callee = String(node.expression.name.text);
        if (callee === 'omit' || callee === 'keysort') return plainHead(node.arguments[0]);
        return callee === 'extend' && plainHead(node.arguments[0])
            && node.arguments.slice(1).every((a) => plainHead(a) || (this.rustUnsharedDict(a) && this.tierSourceOk(a)));
    }

    /** The single bodied method declaration `this.m (…)` resolves to (implementation of an
     *  overload set), in the calling file or the base tier. */
    rustMethodImpl(call: any): any {
        const checker: any = this.checkerOrUndefined();
        const callee: any = call?.expression;
        if (checker === undefined || !isPropertyAccessExpression(callee) || callee.expression.kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }
        let declarations: any[];
        try {
            declarations = symbolDeclarations(checker.getSymbolAtLocation(callee.name))
                .filter((d: any) => d.kind === SyntaxKind.MethodDeclaration && d.body !== undefined);
        } catch (e) {
            return undefined;
        }
        // a base-tier caller may dispatch to any venue override
        const callerFile = String(call.getSourceFile().fileName).replace(/\\/g, '/');
        if (declarations.length !== 1 || RustTranspiler.RUST_BASE_TIER_FILE.test(callerFile)) return undefined;
        const file = String(declarations[0].getSourceFile().fileName).replace(/\\/g, '/');
        return declarations[0].getSourceFile() === call.getSourceFile() || RustTranspiler.RUST_BASE_TIER_FILE.test(file)
            ? declarations[0] : undefined;
    }

    /** The expression's Rust value is always `Value::Bool(_)` or `Value::Null`. */
    rustBoolValue(expr: any, depth = 0): boolean {
        let node: any = this.rustStripWrappers(expr);
        while (node !== undefined && node.kind === SyntaxKind.AwaitExpression) node = this.rustStripWrappers(node.expression);
        if (node === undefined || depth > 5) return false;
        switch (node.kind) {
        case SyntaxKind.TrueKeyword:
        case SyntaxKind.FalseKeyword:
        case SyntaxKind.NullKeyword:
            return true;
        case SyntaxKind.Identifier:
            return node.text === 'undefined' || this.rustBoolLocal(node, depth + 1);
        case SyntaxKind.PrefixUnaryExpression:
            return node.operator === SyntaxKind.ExclamationToken;
        case SyntaxKind.BinaryExpression: {
            const op = node.operatorToken.kind;
            return RustTranspiler.COMPARISON_OPS.has(op) || this.isLogicalOp(op);
        }
        case SyntaxKind.ConditionalExpression:
            return this.rustBoolValue(node.whenTrue, depth + 1) && this.rustBoolValue(node.whenFalse, depth + 1);
        case SyntaxKind.CallExpression:
            return this.rustBoolCall(node, depth);
        }
        return false;
    }

    /** A base `safeBool*` with a bool default, `checkOptionBool`, or a method (calling file or
     *  base tier) whose every `return` is such a value. */
    rustBoolCall(call: any, depth: number): boolean {
        if (!isPropertyAccessExpression(call.expression) || call.expression.expression.kind !== SyntaxKind.ThisKeyword) return false;
        const reader = RustTranspiler.RUST_BOOL_READERS[String(call.expression.name.text)];
        if (reader !== undefined) {
            if (!this.rustCalleeIsBase(call)) return false;
            return reader < 0 || call.arguments.length <= reader
                || (call.arguments.length === reader + 1 && this.rustBoolValue(call.arguments[reader], depth + 1));
        }
        // at least one return must be a real bool: an all-`undefined` stub proves nothing
        let sawBool = false;
        return this.rustEveryReturn(call, depth, (e) => {
            const nullish = this.rustTypeIsUndefinedish(this.rustStripWrappers(e) ?? e);
            sawBool = sawBool || !nullish;
            return nullish || this.rustBoolValue(e, depth + 1);
        }) && sawBool;
    }

    rustEveryReturn(call: any, depth: number, ok: (e: any) => boolean): boolean {
        const method: any = this.rustMethodImpl(call);
        if (method === undefined || this.rustVisiting.has(method)) return false;
        this.rustVisiting.add(method);
        let proven = true;
        let returns = 0;
        try {
            this.rustWalkScope(method.body, (n) => {
                if (isArrowFunction(n) || n.kind === SyntaxKind.FunctionExpression) return RUST_WALK_SKIP;
                if (!isReturnStatement(n)) return;
                returns++;
                if (n.expression === undefined || !ok(n.expression)) { proven = false; return RUST_WALK_STOP; }
            });
        } finally {
            this.rustVisiting.delete(method);
        }
        return proven && returns > 0;
    }

    /** Element `index` of `this.m (…)`'s tuple is a bool value on every return path. */
    rustBoolTupleElement(expr: any, index: number, depth: number): boolean {
        let call: any = this.rustStripWrappers(expr);
        while (call !== undefined && call.kind === SyntaxKind.AwaitExpression) call = this.rustStripWrappers(call.expression);
        if (call === undefined || !isCallExpression(call) || depth > 5) return false;
        return this.rustEveryReturn(call, depth, (e) => {
            const tuple: any = this.rustStripWrappers(e);
            if (tuple?.kind === SyntaxKind.ArrayLiteralExpression) {
                const element = tuple.elements[index];
                return element !== undefined && element.kind !== SyntaxKind.SpreadElement && this.rustBoolValue(element, depth + 1);
            }
            return this.rustBoolTupleElement(tuple, index, depth + 1);
        });
    }

    /** A local whose declaration and every write store a bool value. Locals the printer or
     *  ccxt's narrowBoolLocals may declare `bool` (bool-expression initializer) are left out. */
    rustBoolLocal(ident: any, depth: number): boolean {
        const checker: any = this.checkerOrUndefined();
        if (depth > 5) return false;
        const declarations: any[] = checker === undefined ? [] : symbolDeclarations(checker.getSymbolAtLocation(ident));
        const declaration: any = declarations.length === 1 ? declarations[0] : undefined;
        if (declaration === undefined) return false;
        let nameNode: any;
        let variable: any;
        if (declaration.kind === SyntaxKind.BindingElement) {
            const pattern: any = declaration.parent;
            variable = pattern?.parent;
            if (pattern?.kind !== SyntaxKind.ArrayBindingPattern || variable === undefined || !isVariableDeclaration(variable)
                || declaration.initializer !== undefined || declaration.dotDotDotToken !== undefined
                || declaration.name?.kind !== SyntaxKind.Identifier
                || !this.rustBoolTupleElement(variable.initializer, pattern.elements.indexOf(declaration), depth)) {
                return false;
            }
            nameNode = declaration.name;
        } else if (isVariableDeclaration(declaration) && declaration.name?.kind === SyntaxKind.Identifier) {
            const init: any = this.rustStripWrappers(declaration.initializer);
            if (init !== undefined && (this.rustNodeIsBoolExpression(init)
                || !(this.rustTypeIsUndefinedish(init) || (isIdentifier(init) && init.text === 'undefined') || this.rustBoolValue(init, depth)))) {
                return false;
            }
            variable = declaration;
            nameNode = declaration.name;
        } else {
            return false;
        }
        const scope = this.rustEnclosingFunction(variable);
        const symbol = this.rustSymbolOf(nameNode);
        const name = String(nameNode.text);
        if (scope === undefined || isSourceFile(scope) || symbol === undefined) return false;
        for (const node of this.rustScopeNameNodes(scope, name) as any[]) {
            if (node.kind !== SyntaxKind.Identifier || node === nameNode || this.rustSymbolOf(node) !== symbol) continue;
            if (this.rustEnclosingFunction(node) !== scope) return false;
            let target: any = node;
            while (target.parent !== undefined && (isParenthesizedExpression(target.parent) || isNonNullExpression(target.parent) || isAsExpression(target.parent))) target = target.parent;
            const parent: any = target.parent;
            if (isBinaryExpression(parent) && parent.left === target && rustIsAssignmentOperator(parent.operatorToken.kind)) {
                if (parent.operatorToken.kind !== SyntaxKind.EqualsToken || this.rustNodeIsBoolExpression(this.rustStripWrappers(parent.right))
                    || !this.rustBoolValue(parent.right, depth)) return false;
            } else if (parent?.kind === SyntaxKind.ArrayLiteralExpression) {
                const assign: any = parent.parent;
                if (assign !== undefined && isBinaryExpression(assign) && assign.left === parent
                    && !this.rustBoolTupleElement(assign.right, parent.elements.indexOf(target), depth)) return false;
            } else if ((parent?.kind === SyntaxKind.PrefixUnaryExpression && parent.operator !== SyntaxKind.ExclamationToken) || parent?.kind === SyntaxKind.PostfixUnaryExpression
                || parent?.kind === SyntaxKind.DeleteExpression
                || ((isForOfStatement(parent) || isForInStatement(parent)) && parent.initializer === target)) {
                return false;
            }
        }
        return true;
    }

    /** `if (x)` on a local or `this.m (…)` proven a bool value: `x.as_bool() == Some(true)`
     *  is `is_true` on `Value::Bool`/`Value::Null`; bool slots only (leading-token boxing). */
    rustNativeTruthiness(node: any): string | undefined {
        const inner: any = this.unwrapParens(node);
        if (inner === undefined || (!isIdentifier(inner) && !isCallExpression(inner))
            || !this.printsValueExpression(inner) || !this.isBareBoolEmissionSafe(node)
            || (isCallExpression(inner) && this.rustCallPrintsBool(inner)) || !this.rustBoolValue(inner)) {
            return undefined;
        }
        // the text ccxt's is_true post-pass prints for the same proof; `!` needs the parens
        const text = `${this.printNode(inner, 0)}.as_bool() == Some(true)`;
        let current: any = node;
        while (current.parent !== undefined && isParenthesizedExpression(current.parent)) current = current.parent;
        const negated = current.parent?.kind === SyntaxKind.PrefixUnaryExpression && current.parent.operator === SyntaxKind.ExclamationToken;
        return negated ? `(${text})` : text;
    }

    /** `x === true|false` with `x` proven a bool value: `is_equal` against a `Value::Bool` is
     *  the payload compare there (Null matches neither). */
    rustNativeBoolEquality(left: any, right: any, op: any): string | undefined {
        const leftLiteral = left.kind === SyntaxKind.TrueKeyword || left.kind === SyntaxKind.FalseKeyword;
        const rightLiteral = right.kind === SyntaxKind.TrueKeyword || right.kind === SyntaxKind.FalseKeyword;
        if (leftLiteral === rightLiteral) return undefined;
        const [ literal, other ] = leftLiteral ? [ left, right ] : [ right, left ];
        const inner: any = this.unwrapParens(other);
        if (inner === undefined || (!isIdentifier(inner) && !isCallExpression(inner)) || !this.printsValueExpression(inner)
            || (isCallExpression(inner) && this.rustCallPrintsBool(inner)) || !this.rustBoolValue(inner)) {
            return undefined;
        }
        const operator = (op === SyntaxKind.EqualsEqualsToken || op === SyntaxKind.EqualsEqualsEqualsToken) ? '==' : '!=';
        return `${this.printNode(inner, 0)}.as_bool() ${operator} Some(${literal.kind === SyntaxKind.TrueKeyword ? 'true' : 'false'})`;
    }

    // Proven-`Str` operands: a `this.safeString*` call (no default or a string-literal
    // default) or a native-`Str` callee re-boxed into `Value`, or a `const`/never-reassigned local
    // initialized from one, can only hold `Value::Str` / `Value::Null`, whatever its TS type says.
    rustProvenStrSource(node): boolean {
        const inner: any = this.unwrapParensNode(node);
        if (inner === undefined || !isCallExpression(inner)) return false;
        if (this.rustNativeStrCalleeKind(inner) === 'str') return true;
        const callee: any = inner.expression;
        if (!isPropertyAccessExpression(callee) || callee.expression.kind !== SyntaxKind.ThisKeyword) return false;
        const name = callee.name.text;
        if (!RustTranspiler.RUST_STRING_LOCAL_HELPERS.has(name)) return false;
        const arity = /N$/.test(name) || !/2$/.test(name) ? 2 : 3;
        const args = inner.arguments ?? [];
        if (args.length === arity) return true;
        return args.length === arity + 1 && (isStringLiteral(args[arity]) || isNoSubstitutionTemplateLiteral(args[arity]));
    }

    rustProvenStrIdentifier(node): boolean {
        if (node === undefined || !isIdentifier(node) || this.rustStringLocalIdentifierIsTyped(node)) return false;
        const checker: any = this.checkerOrUndefined();
        const declarations: any[] = checker === undefined ? [] : symbolDeclarations(checker.getSymbolAtLocation(node));
        if (declarations.length !== 1 || !isVariableDeclaration(declarations[0])) return false;
        const declaration: any = declarations[0];
        if (declaration.name?.kind !== SyntaxKind.Identifier || !this.rustProvenStrSource(declaration.initializer)) return false;
        // every later write keeps the proof (D2): only `x = <proven source>`
        return this.rustLocalUsesAll(declaration, declaration.name.text, true, (n) => {
            if (this.rustWriteTarget(n)) return false;
            const parent: any = n.parent;
            if (parent?.kind !== SyntaxKind.BinaryExpression || parent.left !== n) return !(parent?.kind === SyntaxKind.PrefixUnaryExpression || parent?.kind === SyntaxKind.PostfixUnaryExpression) || parent.operator === SyntaxKind.ExclamationToken;
            const op = parent.operatorToken.kind;
            if (op < SyntaxKind.FirstAssignment || op > SyntaxKind.LastAssignment) return true;
            return op === SyntaxKind.EqualsToken && this.rustProvenStrSource(parent.right);
        });
    }

    /** A destructuring / for-in-of target: a write the direct-assignment check cannot see. */
    rustWriteTarget(node): boolean {
        let current: any = node;
        let parent: any = node.parent;
        while (parent !== undefined && (isArrayLiteralExpression(parent) || isObjectLiteralExpression(parent) || isParenthesizedExpression(parent)
            || parent.kind === SyntaxKind.PropertyAssignment || parent.kind === SyntaxKind.ShorthandPropertyAssignment || parent.kind === SyntaxKind.SpreadElement)) {
            current = parent;
            parent = parent.parent;
        }
        if ((isForOfStatement(parent) || isForInStatement(parent)) && parent.initializer === current) return true;
        return current !== node && isBinaryExpression(parent) && parent.left === current && parent.operatorToken.kind === SyntaxKind.EqualsToken;
    }

    /** `x` / `(x as string)` → the identifier under parens / `as`. */
    rustPeelCast(node): any {
        let current: any = node;
        while (current !== undefined && (isParenthesizedExpression(current) || isAsExpression(current))) current = current.expression;
        return current;
    }

    /** Printed text of an operand that is always `Value::Str` / `Value::Null`, else undefined:
     *  a proven-`Str` local, a checker-`string` declared local/param (the checker-string needle rule), or
     *  `"lit" + e` / `e + "lit"` (the `add` helper's string branch always yields `Value::Str`). */
    rustStrOperand(node, allowChecker: boolean): string | undefined {
        const inner = this.rustPeelCast(node);
        if (inner === undefined) return undefined;
        if (isIdentifier(inner)) {
            if (this.rustStringLocalIdentifierIsTyped(inner)) return undefined;
            const proven = this.rustProvenStrIdentifier(inner);
            const checked = allowChecker && this.isDeclaredValueIdentifier(inner)
                && this.primitiveKindOfType(this.typeOfNodeIfAny(inner)) === 'string';
            if (!proven && !checked) return undefined;
            const text = this.printNode(inner, 0).trim();
            return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text) ? text : undefined;
        }
        if (allowChecker && isBinaryExpression(inner) && inner.operatorToken.kind === SyntaxKind.PlusToken
            && (isStringLiteral(inner.left) || isStringLiteral(inner.right))) {
            const text = this.printNode(inner, 0).trim();
            return text.includes('\n') ? undefined : `(${text})`;
        }
        return undefined;
    }

    // `a === b` with both sides proven `Str`/`Null`: `is_equal` is exactly the derived `PartialEq`
    // there (Null==Null, Str by content, Str vs Null false — its f64 fallback needs a number).
    printRustProvenStrEquality(left, right, op): string | undefined {
        if (!this.rustProvenStrIdentifier(this.unwrapParensNode(left)) || !this.rustProvenStrIdentifier(this.unwrapParensNode(right))) return undefined;
        const operator = (op === SyntaxKind.EqualsEqualsToken || op === SyntaxKind.EqualsEqualsEqualsToken) ? '==' : '!=';
        return `${this.printNode(left, 0)} ${operator} ${this.printNode(right, 0)}`;
    }

    /** Receiver text when the call's receiver is a proven-`Str` local (checker strings are handled separately). */
    rustReceiver(node, receiverText: string): string | undefined {
        if (node === undefined || !isCallExpression(node) || !isPropertyAccessExpression(node.expression)) return undefined;
        const receiver = this.rustPeelCast(node.expression.expression);
        if (!this.rustProvenStrIdentifier(receiver)) return undefined;
        const text = (receiverText ?? '').trim();
        return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text) ? text : undefined;
    }

    /** The checker-string receiver, when it prints as a bare name (it is read twice). */
    rustCheckerStrReceiver(node, receiverText: string): string | undefined {
        const receiver = this.rustNativeStringReceiver(node, receiverText);
        return receiver !== undefined && /^[A-Za-z_][A-Za-z0-9_]*$/.test(receiver) ? receiver : undefined;
    }

    // `s.replace(p, "lit")`: the helper replaces every occurrence when all three are `Str`, else
    // returns the receiver; `p` is a proven/checker string operand.
    printRustReplace(node, receiverText: string): string | undefined {
        if (node?.arguments?.length !== 2) return undefined;
        const receiver = this.rustReceiver(node, receiverText) ?? this.rustCheckerStrReceiver(node, receiverText);
        const to = this.rustNativeStringLiteralArg(node.arguments[1]);
        if (receiver === undefined || to === undefined || this.rustNativeStringLiteralArg(node.arguments[0]) !== undefined) return undefined;
        const from = this.rustStrOperand(node.arguments[0], true);
        if (from === undefined) return undefined;
        return `${receiver}.as_str().zip(${from}.as_str()).map(|(__s, __p)| Value::Str(__s.replace(__p, "${to}").into())).unwrap_or_else(|| ${receiver}.clone())`;
    }

    // `s.split(d)` with a proven/checker string delimiter: the parts, `[]` unless both are `Str`.
    printRustSplit(node, receiverText: string): string | undefined {
        if (node?.arguments?.length !== 1 || this.rustNativeStringLiteralArg(node.arguments[0]) !== undefined) return undefined;
        const receiver = this.rustReceiver(node, receiverText) ?? this.rustCheckerStrReceiver(node, receiverText);
        const delim = receiver === undefined ? undefined : this.rustStrOperand(node.arguments[0], true);
        if (delim === undefined) return undefined;
        return `Value::Array(${receiver}.as_str().zip(${delim}.as_str()).map(|(__s, __d)| __s.split(__d).map(Value::from).collect()).unwrap_or_default())`;
    }

    // `x.toString()` on a proven-`Str` local: `stringify_simple` of `Str`/`Null` is `Display`.
    printRustToString(node, receiverText: string): string | undefined {
        const receiver = this.rustReceiver(node, receiverText);
        return receiver === undefined || (node.arguments?.length ?? 0) !== 0 ? undefined : `Value::Str(format!("{}", ${receiver}).into())`;
    }

    // `x.toUpperCase()` / `x.toLowerCase()` on a proven-`Str` local (any TS type).
    printRustCase(node, receiverText: string, method: string): string | undefined {
        const receiver = this.rustReceiver(node, receiverText);
        return receiver === undefined || (node.arguments?.length ?? 0) !== 0 ? undefined : this.rustStrCaseConvert(receiver, method);
    }

    // The plain-dict source proof reaches overloaded base readers (`safeDict` declares
    // bodiless overload signatures; the implementation in the same class is what runs).

    /** A bodiless overload signature whose class also holds the bodied implementation. */
    baseOverload(declaration: any): boolean {
        // a bodiless top-level `function f<T>(…): T;` overload (generic `omit`) whose bodied implementation follows in the same file
        if (declaration?.kind === SyntaxKind.FunctionDeclaration && declaration.body === undefined && isIdentifier(declaration.name)) {
            const fname = String(declaration.name.text);
            return (declaration.parent?.statements ?? []).some((m: any) => m.kind === SyntaxKind.FunctionDeclaration
                && m.body !== undefined && isIdentifier(m.name) && String(m.name.text) === fname);
        }
        if (declaration?.kind !== SyntaxKind.MethodDeclaration || declaration.body !== undefined || !isIdentifier(declaration.name)) return false;
        const name = String(declaration.name.text);
        return (declaration.parent?.members ?? []).some((m: any) => m.kind === SyntaxKind.MethodDeclaration
            && m.body !== undefined && isIdentifier(m.name) && String(m.name.text) === name);
    }

    /** `x[a ± b]` on a checker-proven list, each operand a numeric literal, a `Value` loop
     *  counter or a `const n = y.length` local: the key prints as a `Value` number, so the
     *  list arm of `get_value` (Int index, else miss) is spelled natively. */
    listArithIndex(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined {
        const key: any = this.rustSkipWrappers(keyNode);
        if (!this.isProvenListExpression(receiverNode) || key === undefined || !isBinaryExpression(key)
            || (key.operatorToken.kind !== SyntaxKind.MinusToken && key.operatorToken.kind !== SyntaxKind.PlusToken)
            || !this.valueNumberOperand(key.left) || !this.valueNumberOperand(key.right)) return undefined;
        if (this.isWriteBackBindRead(keyNode.parent)) return undefined;
        const keyText = this.printNode(keyNode, 0).trim();
        if (!keyText || keyText.startsWith('&')) return undefined;
        return `${receiverText}.as_array().and_then(|__arr| match &(${keyText}) { Value::Int(__n) if *__n >= 0 => __arr.get(*__n as usize), _ => None }).cloned().unwrap_or(Value::Null)`;
    }

    valueNumberOperand(node: any): boolean {
        const operand: any = this.rustSkipWrappers(node);
        if (operand === undefined) return false;
        if (isNumericLiteral(operand)) return Number.isInteger(Number(operand.text));
        if (!isIdentifier(operand)) return false;
        if (this.isRustValueIndexKey(operand)) return true;
        if (this.rustParamShadowOf(operand) !== undefined || this.rustStringLocalIdentifierIsTyped(operand)) return false;
        const declaration: any = this.rustDeclarationOfIdentifier(operand);
        if (declaration === undefined || !isVariableDeclaration(declaration) || (declaration.parent?.flags & NodeFlags.Const) === 0) return false;
        const init: any = this.rustSkipWrappers(declaration.initializer);
        return init !== undefined && isPropertyAccessExpression(init) && String(init.name.text) === 'length';
    }

    // `Vec<Value>` locals also admit `x.join("lit")` on a `string[]` (native join of the
    // elements' Display text, as the helper's `stringify_simple` prints `Str`/`Null`) and an
    // object-literal property value no push follows (boxed `Value::from(x.clone())`).
    vecJoinUse(access): boolean {
        const call: any = access.parent;
        if (!isCallExpression(call) || call.expression !== access || String(access.name.text) !== 'join' || call.arguments.length !== 1) return false;
        if (this.rustNativeStringLiteralArg(call.arguments[0]) === undefined) return false;
        const checker: any = this.checkerOrUndefined();
        const type: any = checker?.getTypeAtLocation(access.expression);
        if (type === undefined || !checker.isArrayType(type)) return false;
        return this.primitiveKindOfType(checker.getTypeArguments?.(type)?.[0]) === 'string';
    }

    printVecJoin(node): string | undefined {
        const access: any = node?.expression;
        if (!isPropertyAccessExpression(access) || !isIdentifier(access.expression)
            || this.rustVecLocalDeclarationOf(access.expression) === undefined || !this.vecJoinUse(access)) return undefined;
        const literal = this.rustNativeStringLiteralArg(node.arguments[0]);
        const name = this.printNode(access.expression, 0).trim();
        return `Value::Str(${name}.iter().map(|__v| __v.to_string()).collect::<Vec<String>>().join("${literal}").into())`;
    }

    // `{ 'k': x }` with `x` named once in the statement, outside any loop the declaration is not in,
    // and no `x.push` after it: the clone is the array's final contents, as the aliased box was.
    vecPropertyUse(n): boolean {
        const parent: any = n.parent;
        if (parent?.kind !== SyntaxKind.PropertyAssignment || parent.initializer !== n || this.loopBetween(n)) return false;
        const name = String(n.text);
        let statement: any = parent;
        while (statement !== undefined && !isStatement(statement)) statement = statement.parent;
        if (statement === undefined) return false;
        let count = 0;
        const visit = (m) => { if (m.kind === SyntaxKind.Identifier && m.text === name) count++; m.forEachChild?.(visit); };
        visit(statement);
        if (count !== 1) return false;
        const fn = this.rustEnclosingFunction(n);
        const end = n.getEnd?.() ?? n.end;
        return !(this.rustScopeNameNodes(fn, name) as any[]).some((m) => m.kind === SyntaxKind.Identifier && m !== n
            && (m.getStart?.() ?? m.pos) >= end && isPropertyAccessExpression(m.parent) && m.parent.expression === m
            && String(m.parent.name.text) === 'push');
    }
    // Numeric operand kinds beyond the checker: 'definite' = always Int/Float (never Null),
    // 'number' = Int/Float/Null. Covers `this.sum` of numbers, numeric same-file method returns,
    // locals whose every write is numeric, and flow-narrowed (guarded non-undefined) number identifiers.
    private rustInProgress = new Set<any>();
    private rustAssumed = new Set<any>();

    rustNumericKind(node, depth = 0): string | undefined {
        const inner: any = this.rustStripWrappers(node);
        if (inner === undefined || depth > 8) return undefined;
        if (this.rustInProgress.has(inner)) return this.assumedNumericSelf(inner);
        this.rustInProgress.add(inner);
        try {
            const structural = this.rustStructuralKind(inner, depth);
            if (structural === 'definite') return 'definite';
            if (structural === 'number') return 'number';
            return this.rustOperandKind(inner) === 'number' ? 'number' : undefined;
        } catch (e) {
            return undefined;
        } finally {
            this.rustInProgress.delete(inner);
        }
    }

    rustCombine(kinds: (string | undefined)[]): string | undefined {
        if (kinds.length === 0 || kinds.some((k) => k === undefined)) return undefined;
        return kinds.every((k) => k === 'definite') ? 'definite' : 'number';
    }

    rustStructuralKind(inner: any, depth: number): string | undefined {
        if (inner.kind === SyntaxKind.NumericLiteral) return 'definite';
        if (isPrefixUnaryExpression(inner) && inner.operator === SyntaxKind.MinusToken && inner.operand.kind === SyntaxKind.NumericLiteral) return 'definite';
        if (this.rustIsDefiniteInt(inner)) return 'definite';
        if (isCallExpression(inner) && this.callExpressionName(inner) === 'indexOf') return 'definite';
        if (isBinaryExpression(inner)) {
            const op = inner.operatorToken.kind;
            if (op !== SyntaxKind.PlusToken && op !== SyntaxKind.MinusToken && op !== SyntaxKind.AsteriskToken
                && op !== SyntaxKind.SlashToken && op !== SyntaxKind.PercentToken) return undefined;
            const both = this.rustCombine([ this.rustNumericKind(inner.left, depth + 1), this.rustNumericKind(inner.right, depth + 1) ]);
            // `/` and `%` answer Null for a zero divisor
            return (both === 'definite' && (op === SyntaxKind.SlashToken || op === SyntaxKind.PercentToken)) ? 'number' : both;
        }
        if (isCallExpression(inner)) return this.rustCallKind(inner, depth);
        if (isIdentifier(inner)) return this.rustIdentifierKind(inner, depth);
        return undefined;
    }

    rustCallKind(call: any, depth: number): string | undefined {
        const callee = call.expression;
        if (!isPropertyAccessExpression(callee) || callee.expression.kind !== SyntaxKind.ThisKeyword) return undefined;
        if (String(callee.name.text) === 'sum') {
            return this.rustCombine(call.arguments.map((a) => this.rustNumericKind(a, depth + 1)));
        }
        let declaration: any;
        try {
            declaration = signatureDeclaration((this.getChecker() as any).getResolvedSignature(call));
        } catch (e) {
            return undefined;
        }
        if (declaration?.kind !== SyntaxKind.MethodDeclaration || declaration.body === undefined
            || declaration.getSourceFile() !== call.getSourceFile()) return undefined;
        const kinds: (string | undefined)[] = [];
        const visit = (n: any) => {
            if (n !== declaration && isFunctionLike(n)) return;
            if (isReturnStatement(n)) kinds.push(n.expression === undefined ? undefined : this.rustNumericKind(n.expression, depth + 1));
            n.forEachChild?.(visit);
        };
        declaration.body.forEachChild(visit);
        return this.rustCombine(kinds) === undefined ? undefined : 'number';
    }

    rustIdentifierKind(ident: any, depth: number): string | undefined {
        if (this.rustParamShadowOf(ident) !== undefined || !this.printsValueExpression(ident)) return undefined;
        const declaration: any = this.rustSingleLocalDeclaration(ident);
        if (declaration === undefined || declaration.name?.kind !== SyntaxKind.Identifier) return undefined;
        // a guard removed `undefined` from a nullable declaration: the box is Int/Float here
        const here: any = this.typeOfNodeIfAny(ident);
        const declared: any = this.typeOfNodeIfAny(declaration.name);
        if (here !== undefined && declared !== undefined && (here.flags === TypeFlags.Number || here.flags === TypeFlags.NumberLiteral)
            && (declared.flags & TypeFlags.Union) && (typeParts(declared) ?? []).some((t: any) => t.flags & (TypeFlags.Undefined | TypeFlags.Null))
            && !this.rustHasWrites(declaration)) {
            return 'definite';
        }
        // an explicit annotation (`let a: any = 1`) declares a polymorphic box: keep the helper
        if (!isVariableDeclaration(declaration) || declaration.initializer === undefined || declaration.type !== undefined) return undefined;
        // inductive: a write reading the local itself (`r = this.sum (r, n)`) assumes it numeric
        if (this.rustAssumed.has(declaration)) return 'number';
        this.rustAssumed.add(declaration);
        try {
            return this.rustWrittenKind(declaration, depth);
        } finally {
            this.rustAssumed.delete(declaration);
        }
    }

    rustWrittenKind(declaration: any, depth: number): string | undefined {
        const kinds: (string | undefined)[] = [ this.rustNumericKind(declaration.initializer, depth + 1) ];
        const fn = this.rustEnclosingFunction(declaration);
        if (fn === undefined) return undefined;
        const name = String(declaration.name.text);
        for (const m of this.rustScopeNameNodes(fn, name) as any[]) {
            if (m.kind !== SyntaxKind.Identifier || m === declaration.name) continue;
            const parent: any = m.parent;
            if (isBinaryExpression(parent) && parent.left === m && rustIsAssignmentOperator(parent.operatorToken.kind)) {
                const op = parent.operatorToken.kind;
                const right = this.rustNumericKind(parent.right, depth + 1);
                if (op === SyntaxKind.EqualsToken || op === SyntaxKind.PlusEqualsToken || op === SyntaxKind.MinusEqualsToken || op === SyntaxKind.AsteriskEqualsToken) kinds.push(right);
                else if (op === SyntaxKind.SlashEqualsToken || op === SyntaxKind.PercentEqualsToken) kinds.push(right === undefined ? undefined : 'number');
                else kinds.push(undefined);
            } else if ((parent?.kind === SyntaxKind.PrefixUnaryExpression || parent?.kind === SyntaxKind.PostfixUnaryExpression)
                && (parent.operator === SyntaxKind.PlusPlusToken || parent.operator === SyntaxKind.MinusMinusToken)) {
                continue;
            } else if (parent !== undefined && ((isArrayLiteralExpression(parent) && isBinaryExpression(parent.parent) && parent.parent.left === parent)
                || ((isForOfStatement(parent) || isForInStatement(parent)) && parent.initializer === m))) {
                kinds.push(undefined);
            }
        }
        return this.rustCombine(kinds);
    }

    // No assignment / `++` / `--` names the binding: only control-flow guards narrow it.
    rustHasWrites(declaration: any): boolean {
        const fn = isParameterDeclaration(declaration) ? declaration.parent : this.rustEnclosingFunction(declaration);
        if (fn === undefined) return true;
        return (this.rustScopeNameNodes(fn, String(declaration.name.text)) as any[]).some((m) => {
            const parent: any = m.parent;
            if (m.kind !== SyntaxKind.Identifier || m === declaration.name) return false;
            return (isBinaryExpression(parent) && parent.left === m && rustIsAssignmentOperator(parent.operatorToken.kind))
                || parent?.kind === SyntaxKind.PrefixUnaryExpression && (parent.operator === SyntaxKind.PlusPlusToken || parent.operator === SyntaxKind.MinusMinusToken)
                || parent?.kind === SyntaxKind.PostfixUnaryExpression;
        });
    }

    // Both sides Int/Float/Null: `<`/`>` are f64 compares with Null false; `<=`/`>=` also OR in
    // `is_equal` (Null == Null), so they need one never-null side.
    rustOrderedProven(op, left, right): boolean {
        const l = this.rustNumericKind(left);
        const r = this.rustNumericKind(right);
        if (l === undefined || r === undefined) return false;
        return op === SyntaxKind.LessThanToken || op === SyntaxKind.GreaterThanToken || l === 'definite' || r === 'definite';
    }

    // `a - b` / `a * b` / `a / b` / `a % b` on operands proven Int/Float/Null: the helper's dispatch.
    rustNativeArithmetic(op, left, right, leftText: string, rightText: string): string | undefined {
        if (op !== SyntaxKind.MinusToken && op !== SyntaxKind.AsteriskToken && op !== SyntaxKind.SlashToken && op !== SyntaxKind.PercentToken) return undefined;
        if (!this.printsValueExpression(this.rustStripWrappers(left)) || !this.printsValueExpression(this.rustStripWrappers(right))) return undefined;
        if (this.rustNumericKind(left) === undefined || this.rustNumericKind(right) === undefined) return undefined;
        if (op !== SyntaxKind.PercentToken) return this.printNativeNumeric(op, leftText, rightText);
        return `(match (&(${leftText}), &(${rightText})) {` +
            ' (Value::Int(x), Value::Int(y)) if *y != 0 => Value::Int(x % y),' +
            ' (Value::Int(x), Value::Float(y)) if *y != 0.0 => Value::Float(*x as f64 % *y),' +
            ' (Value::Float(x), Value::Int(y)) if *y != 0 => Value::Float(*x % *y as f64),' +
            ' (Value::Float(x), Value::Float(y)) if *y != 0.0 => Value::Float(x % y),' +
            ' _ => Value::Null })';
    }

    // String helpers on proven-`Str` operands. `add(a, b)` with one side always a
    // `Value::Str` takes the helper's `string_concat` arm, which is `Display` for every box but a
    // Precise dict (only `new Precise` locals, typed `Precise`), so the other side may be any non-Precise box.
    alwaysStr(node): boolean {
        const inner: any = this.unwrapParensNode(node);
        if (inner === undefined) return false;
        if (isStringLiteral(inner) || isNoSubstitutionTemplateLiteral(inner)) return true;
        if (isBinaryExpression(inner) && inner.operatorToken.kind === SyntaxKind.PlusToken) return this.alwaysStr(inner.left) || this.alwaysStr(inner.right);
        return isCallExpression(inner) && isPropertyAccessExpression(inner.expression) && inner.expression.name.text === 'toString'
            && (inner.arguments?.length ?? 0) === 0 && this.printsValueExpression(inner.expression.expression);
    }

    concatOperandSafe(node, type): boolean {
        if (this.alwaysStr(node)) return true;
        const inner: any = this.unwrapParensNode(node);
        if (!this.printsValueExpression(inner) || this.rustNativeStrCalleeKind(inner) === 'str') return false;
        // typed `String`/`Vec<Value>` locals print without a `Value` box
        if (isIdentifier(inner) && (this.rustStringLocalIdentifierIsTyped(inner) || this.rustVecLocalDeclarationOf(inner) !== undefined)) return false;
        const parts: any[] = type === undefined ? [] : ((type.flags & TypeFlags.Union) ? (typeParts(type) ?? []) : [type]);
        return parts.length > 0 && parts.every((t) => String(t?.symbol?.escapedName ?? t?.symbol?.name ?? '') !== 'Precise');
    }

    concatIsAnchored(left, right, leftType, rightType): boolean {
        return (this.alwaysStr(left) && this.concatOperandSafe(right, rightType))
            || (this.alwaysStr(right) && this.concatOperandSafe(left, leftType));
    }

    /** Checker-string or proven-`Str` receiver printed as a plain name / parenthesised. */
    strReceiverText(node, receiverText: string): string | undefined {
        return this.rustNativeStringReceiver(node, receiverText) ?? this.rustReceiver(node, receiverText);
    }

    // `x.trim()`: the helper's `Str` arm is `str::trim`, Null otherwise.
    printTrim(node, receiverText: string): string | undefined {
        const receiver = this.strReceiverText(node, receiverText);
        if (receiver === undefined || (node.arguments?.length ?? 0) !== 0) return undefined;
        return `${receiver}.as_str().map(|__s| Value::Str(__s.trim().to_string().into())).unwrap_or(Value::Null)`;
    }

    // `x.startsWith(p)` / `x.endsWith(p)` with a proven/checker string operand: false unless both are `Str`.
    printAffixTest(node, receiverText: string, method: string): string | undefined {
        if (node?.arguments?.length !== 1) return undefined;
        const receiver = this.strReceiverText(node, receiverText);
        const arg = receiver === undefined ? undefined : this.rustStrOperand(node.arguments[0], true);
        if (arg === undefined) return undefined;
        return `${receiver}.as_str().zip(${arg}.as_str()).is_some_and(|(__s, __p)| __s.${method}(__p))`;
    }

    // `x.replace(p, r)` / `x.replaceAll(p, r)`: both helpers replace every occurrence when all three
    // are `Str`, else return the receiver; `p`/`r` are literals or proven/checker string operands.
    printReplace(node, receiverText: string): string | undefined {
        if (node?.arguments?.length !== 2) return undefined;
        const receiver = this.strReceiverText(node, receiverText);
        if (receiver === undefined || !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(receiver)) return undefined;
        const operand = (arg) => {
            const literal = this.rustNativeStringLiteralArg(arg);
            return literal !== undefined ? `Value::Str("${literal}".into())` : this.rustStrOperand(arg, true);
        };
        const from = operand(node.arguments[0]);
        const to = operand(node.arguments[1]);
        if (from === undefined || to === undefined) return undefined;
        return `match (${receiver}.as_str(), ${from}.as_str(), ${to}.as_str()) { (Some(__s), Some(__p), Some(__r)) => Value::Str(__s.replace(__p, __r).into()), _ => ${receiver}.clone() }`;
    }

    // Collection helpers on locals whose runtime shape is proven: `"k" in x` on a plain-dict
    // receiver, `Object.keys/values` on one in prediction sources, and `.length` /
    // `.push` on a `Value::Arr`-only local (never a book/cache marker the helpers route).

    /** `"lit" in x` where x is a proven plain local / plain-kept Dict parameter. */
    literalInOp(key, obj): string | undefined {
        if (!isStringLiteral(key) || this.isTestSource(key)) return undefined;
        const recv: any = this.rustStripWrappers(obj);
        if (recv === undefined || !isIdentifier(recv) || this.rustPlainReceiver(recv) === undefined) return undefined;
        const keyLiteral = this.rustStringLiteralOf(this.printStringLiteral(key));
        if (keyLiteral === undefined) return undefined;
        return `Value::Bool(matches!(&${this.printNode(recv, 0).trim()}, Value::Dict(__d) if __d.contains_key(${keyLiteral})))`;
    }

    /** `Object.keys/values(x)` in `ts/src/prediction/<id>.ts` on a proven plain local. */
    predictionEnum(node, parsedArg: string | undefined, kind: 'keys' | 'values'): string | undefined {
        const arg: any = this.rustStripWrappers(node?.arguments?.[0]);
        if (arg === undefined || parsedArg === undefined || !isIdentifier(arg)
            || !/\/ts\/src\/prediction\/[^/]+\.ts$/.test(this.provenDictFieldPath(node))
            || this.rustPlainReceiver(arg) !== 'local') return undefined;
        const body = kind === 'keys' ? '__m.keys().map(|__k| Value::Str(__k.clone().into())).collect()' : '__m.values().cloned().collect()';
        return `Value::Array(${parsedArg.trim()}.as_map().map(|__m| ${body}).unwrap_or_default())`;
    }

    /** Base-tier array readers whose result is the stored `Value::Arr` or the default argument. */
    private static readonly RUST_LIST_READERS: { [name: string]: number } = { safeList: 2, safeList2: 3, safeListN: 2 };

    /** A source that is a `Value::Arr` or `Value::Null` (both helpers agree with `len()` / a no-op
     *  push there): `[...]`, nullish, a runtime `split`, base `toArray`, or a base `safeList*`
     *  read whose default is absent, nullish or `[...]`. */
    arrSource(node: any, allowNull: boolean): boolean {
        const n: any = this.rustStripWrappers(node);
        if (n === undefined) return false;
        if (this.extraArrSource(n)) return true;
        if (isArrayLiteralExpression(n)) return !n.elements.some((e: any) => e.kind === SyntaxKind.SpreadElement);
        if (n.kind === SyntaxKind.NullKeyword || (isIdentifier(n) && String(n.text) === 'undefined')) return allowNull;
        if (this.rustCallPrintsRuntimeSplit(n)) return true;
        if (!isCallExpression(n) || !isPropertyAccessExpression(n.expression) || n.expression.expression.kind !== SyntaxKind.ThisKeyword) return false;
        const callee = String(n.expression.name.text);
        if (callee === 'toArray') return n.arguments.length === 1 && this.rustCalleeIsBase(n);
        const index = RustTranspiler.RUST_LIST_READERS[callee];
        if (index === undefined || n.arguments.length > index + 1) return false;
        const fallback: any = this.rustStripWrappers(n.arguments[index]);
        const arrDefault = fallback !== undefined && isArrayLiteralExpression(fallback);
        return (arrDefault || (allowNull && (fallback === undefined || fallback.kind === SyntaxKind.NullKeyword
            || (isIdentifier(fallback) && String(fallback.text) === 'undefined')))) && this.rustCalleeIsBase(n);
    }

    /** A local whose every write (declaration included) is an `arrSource`, never captured by
     *  a closure: its `Value` is a plain `Value::Arr` (the runtime never tags an array). */
    arrLocal(ident: any, allowNull: boolean): boolean {
        if (ident === undefined || !isIdentifier(ident) || this.rustParamShadowOf(ident) !== undefined || this.isTestSource(ident)) return false;
        const declaration: any = this.rustSingleLocalDeclaration(ident);
        if (declaration === undefined || !isVariableDeclaration(declaration) || !isIdentifier(declaration.name)
            || !this.arrSource(declaration.initializer, allowNull)) return false;
        const scope = this.rustEnclosingFunction(declaration);
        if (scope === undefined || isSourceFile(scope) || this.rustEnclosingFunction(ident) !== scope) return false;
        const name = String(declaration.name.text);
        const symbol = this.rustSymbolOf(declaration.name);
        if (symbol === undefined) return false;
        for (const n of this.rustScopeNameNodes(scope, name) as any[]) {
            if (n.kind !== SyntaxKind.Identifier || n === declaration.name || this.rustSymbolOf(n) !== symbol) continue;
            if (this.rustEnclosingFunction(n) !== scope) return false;
            let target: any = n;
            while (target.parent !== undefined && (isParenthesizedExpression(target.parent) || isNonNullExpression(target.parent) || isAsExpression(target.parent))) target = target.parent;
            const parent: any = target.parent;
            if (parent === undefined) continue;
            // a dict-literal field aliasing the local feeds ccxt's writeBackAliasedArrayMutations (keys on the helper)
            if (parent.kind === SyntaxKind.ShorthandPropertyAssignment || (parent.kind === SyntaxKind.PropertyAssignment && parent.initializer === target)) return false;
            if (isBinaryExpression(parent) && parent.left === target && rustIsAssignmentOperator(parent.operatorToken.kind)) {
                if (parent.operatorToken.kind !== SyntaxKind.EqualsToken || !this.arrSource(parent.right, allowNull)) return false;
                continue;
            }
            if (parent.kind === SyntaxKind.ArrayLiteralExpression && isBinaryExpression(parent.parent) && parent.parent.left === parent) return false;
            if ((parent.kind === SyntaxKind.PrefixUnaryExpression || parent.kind === SyntaxKind.PostfixUnaryExpression)
                && (parent.operator === SyntaxKind.PlusPlusToken || parent.operator === SyntaxKind.MinusMinusToken)) return false;
        }
        return true;
    }

    /** `x[i]` on an Arr-only local, except the initializer shapes the native get_value
     *  post-pass already retypes to `Vec<Value>`/native reads (it owns those). */
    arrReadLocal(ident: any): boolean {
        if (!this.arrLocal(ident, true)) return false;
        const declaration: any = this.rustSingleLocalDeclaration(ident);
        const initializer: any = declaration?.initializer;
        if (initializer === undefined) return false;
        return !this.ownedArrayInitializer(initializer);
    }

    private ownedArrayInitializer(initializer: any): boolean {
        if (isArrayLiteralExpression(initializer)) return true;
        if (!isCallExpression(initializer) || !isPropertyAccessExpression(initializer.expression)) return false;
        const callee: any = initializer.expression;
        const member = String(callee.name.text);
        if (member === 'split') return true;
        if (callee.expression.kind === SyntaxKind.ThisKeyword) return /^(?:safeList|arrayConcat)/.test(member);
        if (isIdentifier(callee.expression) && String(callee.expression.text) === 'Object') {
            return member === 'keys' || member === 'values';
        }
        return false;
    }

    /** `x.length` on an Arr-only local: `get_array_length`'s marker arms need a Dict. */
    arrLength(node, receiver: string): string | undefined {
        const recv: any = this.rustStripWrappers(node?.expression);
        if (!this.arrLocal(recv, true)) return undefined;
        return `Value::Int(${receiver}.len() as i64)`;
    }

    /** `x.push(v)` statement on an Arr-only local: `append_to_array`'s cache-push arm needs a Dict. */
    arrPush(node, name: string | undefined, parsedArg: string | undefined): string | undefined {
        const recv: any = node?.expression?.expression;
        // A `Value` local read straight out of a plain `IndexMap` local
        // carries no book-cache handle, so its push is the same guarded `Arc::make_mut`.
        if (name !== undefined && parsedArg !== undefined && this.bearerReadLocal(recv)
            && node?.arguments?.length === 1 && node.arguments[0].kind !== SyntaxKind.SpreadElement
            && node.parent?.kind === SyntaxKind.ExpressionStatement && name.trim() === this.printNode(recv, 0).trim()
            && this.rustVecPushShape(node, String(recv.text))) {
            const bareArg = parsedArg.trim();
            const bareValue = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(bareArg) && bareArg !== 'self' && bareArg !== 'true' && bareArg !== 'false' ? `${bareArg}.clone()` : bareArg;
            return `if let Value::Arr(__a) = &mut ${name} { std::sync::Arc::make_mut(__a).push(${bareValue}); }`;
        }
        if (name === undefined || parsedArg === undefined || node?.arguments?.length !== 1
            || node.arguments[0].kind === SyntaxKind.SpreadElement || node.parent?.kind !== SyntaxKind.ExpressionStatement
            || !this.arrLocal(recv, false) || name.trim() !== this.printNode(recv, 0).trim()) return undefined;
        // the argument is evaluated while `name` is mutably borrowed: it must not read it
        if (!this.rustVecPushShape(node, String(recv.text))) return undefined;
        // A `Value` local read straight out of a plain `IndexMap` local
        // carries no book-cache handle, so its push is the same guarded `Arc::make_mut`.
        const arg = parsedArg.trim();
        // `append_to_array` takes the value by move; ccxt's post-pass cloned a bare local there.
        const value = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(arg) && arg !== 'self' && arg !== 'true' && arg !== 'false' ? `${arg}.clone()` : arg;
        return `if let Value::Arr(__a) = &mut ${name} { std::sync::Arc::make_mut(__a).push(${value}); }`;
    }

    /** A `Value` local whose single declaration is an element read of a local typed as a
     *  plain `IndexMap<String, Value>`: plain data all the way down, never a book handle. */
    bearerReadLocal(ident: any): boolean {
        if (ident === undefined || !isIdentifier(ident)) return false;
        const declaration: any = this.rustSingleLocalDeclaration(ident);
        const init: any = this.rustSkipWrappers(declaration?.initializer);
        if (declaration === undefined || !isVariableDeclaration(declaration) || init === undefined) return false;
        if (!isElementAccessExpression(init)) return false;
        let root: any = init;
        while (isElementAccessExpression(root.expression)) root = root.expression;
        const base: any = this.rustStripWrappers(root.expression);
        return base !== undefined && isIdentifier(base) && this.rustDictBearerDeclaration(base) !== undefined;
    }

    // `startsWith/endsWith(..) === true|false` compares the runtime fn's bare bool
    // (is_equal of two Bool boxes is the payload compare); `a + b` on proven numeric kinds is the
    // `add` helper's Int/Float/Null dispatch, the same native match as `-`/`*`.
    boolCallEquality(left, right, op): string | undefined {
        const l: any = this.unwrapParensNode(left);
        const r: any = this.unwrapParensNode(right);
        const isBoolLit = (n: any) => n?.kind === SyntaxKind.TrueKeyword || n?.kind === SyntaxKind.FalseKeyword;
        if (isBoolLit(l) === isBoolLit(r)) return undefined;
        const literal: any = isBoolLit(l) ? l : r;
        const call: any = isBoolLit(l) ? r : l;
        if (!isCallExpression(call) || !isPropertyAccessExpression(call.expression)) return undefined;
        const name = String(call.expression.name.text);
        if ((name !== 'startsWith' && name !== 'endsWith') || call.arguments.length !== 1) return undefined;
        const text = this.printNode(call, 0).trim();
        const fn = name === 'startsWith' ? 'starts_with' : 'ends_with';
        const m = /^Value::Bool\((.*)\)$/s.exec(text);
        if (m === null || !m[1].startsWith(`${fn}(`) || !this.boolCallBalanced(m[1]) || text.includes('\n')) return undefined;
        const equals = op === SyntaxKind.EqualsEqualsToken || op === SyntaxKind.EqualsEqualsEqualsToken;
        return (literal.kind === SyntaxKind.TrueKeyword) === equals ? m[1] : `!${m[1]}`;
    }

    /** `fn(...)` whose first `(` closes at the very end (string literals skipped). */
    boolCallBalanced(text: string): boolean {
        let depth = 0;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (c === '"') { for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++; continue; }
            if (c === '(') depth++;
            else if (c === ')') { depth--; if (depth === 0 && i !== text.length - 1) return false; }
        }
        return depth === 0 && text.endsWith(')');
    }

    nativeNumericAdd(op, left, right, leftText: string, rightText: string): string | undefined {
        if (op !== SyntaxKind.PlusToken) return undefined;
        if (!this.printsValueExpression(this.rustStripWrappers(left)) || !this.printsValueExpression(this.rustStripWrappers(right))) return undefined;
        if (this.rustNumericKind(left) === undefined || this.rustNumericKind(right) === undefined) return undefined;
        return this.printNativeNumeric(op, leftText, rightText);
    }

    // `Object.keys/values` on a proven plain local in the base tier (the
    // helper's ws-tag filter is a no-op on a map built from literals), and native map reads
    // that are the receiver of a non-mutating string method (`currency['id'].toUpperCase ()`).

    /** Base-tier (`ts/src/base/**`) `Object.keys/values(x)` on a proven plain local. */
    baseEnum(node, parsedArg: string | undefined, kind: 'keys' | 'values'): string | undefined {
        const arg: any = this.rustStripWrappers(node?.arguments?.[0]);
        if (arg === undefined || parsedArg === undefined || !isIdentifier(arg)
            || !RustTranspiler.RUST_BASE_TIER_FILE.test(this.provenDictFieldPath(node))
            || this.rustPlainReceiver(arg) !== 'local') return undefined;
        const body = kind === 'keys' ? '__m.keys().map(|__k| Value::Str(__k.clone().into())).collect()' : '__m.values().cloned().collect()';
        return `Value::Array(${parsedArg.trim()}.as_map().map(|__m| ${body}).unwrap_or_default())`;
    }

    private static readonly RUST_PURE_STRING_METHODS = new Set([ 'toUpperCase', 'toLowerCase', 'trim', 'startsWith', 'endsWith', 'split' ]);

    /** `x['k'].m (…)` with `m` a non-mutating string method on a checker-`string` read: no
     *  ccxt pass rewrites that target (only `.push` / calls of the read itself). */
    pureStringMethodReceiver(node: any): boolean {
        const access: any = node?.parent;
        const call: any = access?.parent;
        if (!isElementAccessExpression(node) || access === undefined || !isPropertyAccessExpression(access) || access.expression !== node
            || call === undefined || !isCallExpression(call) || call.expression !== access
            || !RustTranspiler.RUST_PURE_STRING_METHODS.has(String(access.name.text))) return false;
        const type = this.typeOfNodeIfAny(node);
        return type !== undefined && (type.flags & TypeFlags.StringLike) !== 0;
    }

    /** Locals whose Arr-only proof is in progress (a self-referencing write proves nothing new). */
    private arrVisiting = new Set<any>();

    /** More always-`Value::Arr` sources for the Arr-only proof: base `arrayConcat` (Array on every
     *  arm), base `sortBy`/`sortBy2` of an Arr-only local (returns its input's variant), and a
     *  plain alias of a non-nullable Arr-only local (COW: the push never reaches the alias). */
    extraArrSource(n: any): boolean {
        if (isCallExpression(n) && isPropertyAccessExpression(n.expression) && n.expression.expression.kind === SyntaxKind.ThisKeyword) {
            const callee = String(n.expression.name.text);
            if (callee === 'arrayConcat') return n.arguments.length === 2 && this.rustCalleeIsBase(n);
            if (callee === 'sortBy' || callee === 'sortBy2') {
                const first: any = this.rustStripWrappers(n.arguments[0]);
                return first !== undefined && isIdentifier(first) && this.rustCalleeIsBase(n) && this.arrAlias(first);
            }
            return false;
        }
        return isIdentifier(n) && String(n.text) !== 'undefined' && this.arrAlias(n);
    }

    arrAlias(ident: any): boolean {
        const declaration: any = this.rustSingleLocalDeclaration(ident);
        if (declaration === undefined || !isVariableDeclaration(declaration)) return false;
        // the local under proof: its other writes decide
        if (this.arrVisiting.has(declaration)) return true;
        this.arrVisiting.add(declaration);
        try {
            return this.arrLocal(ident, false);
        } finally {
            this.arrVisiting.delete(declaration);
        }
    }

    // A numeric-kind local re-read inside its own write (`p = p + 4`) is the assumed kind.
    assumedNumericSelf(inner: any): string | undefined {
        if (!isIdentifier(inner)) return undefined;
        const declaration: any = this.rustSingleLocalDeclaration(inner);
        return declaration !== undefined && this.rustAssumed.has(declaration) ? 'number' : undefined;
    }

    private strVisiting = new Map<any, boolean>();

    /** Always `Value::Str`: string-helper shapes, a `+` chain with such an operand, or an always-Str local. */
    alwaysStrOperand(node: any): boolean {
        const inner: any = this.unwrapParensNode(node);
        if (inner === undefined) return false;
        if (this.alwaysStr(inner)) return true;
        if (isBinaryExpression(inner) && inner.operatorToken.kind === SyntaxKind.PlusToken) return this.alwaysStrOperand(inner.left) || this.alwaysStrOperand(inner.right);
        return isIdentifier(inner) && this.alwaysStrLocal(inner);
    }

    /** A plain `Value` local, never captured by a closure, whose every write is always-Str (`x += e`
     *  keeps it), or Str|Null (proven-Str source / nullish) when the checker narrows this read to `string`. */
    alwaysStrLocal(ident: any, allowNull = false): boolean {
        if (this.rustParamShadowOf(ident) !== undefined || this.rustStringLocalIdentifierIsTyped(ident) || this.rustVecLocalDeclarationOf(ident) !== undefined) return false;
        const declaration: any = this.rustSingleLocalDeclaration(ident);
        if (declaration === undefined || !isVariableDeclaration(declaration) || !isIdentifier(declaration.name) || declaration.initializer === undefined) return false;
        // inductive: a cycle back to a local under proof assumes that proof (strict covers lax)
        if (this.strVisiting.has(declaration)) return allowNull || this.strVisiting.get(declaration) === false;
        const fn = this.rustEnclosingFunction(declaration);
        if (fn === undefined) return false;
        const here: any = this.typeOfNodeIfAny(ident);
        const narrowed = allowNull || (here !== undefined && this.isStringLikeType(here));
        const nullish = (e: any) => { const n: any = this.unwrapParensNode(e); return n?.kind === SyntaxKind.NullKeyword || (isIdentifier(n) && String(n.text) === 'undefined'); };
        const local = (e: any) => { const n: any = this.unwrapParensNode(e); return isIdentifier(n) && (this.rustProvenStrIdentifier(n) || this.alwaysStrLocal(n, true)); };
        const source = (e: any) => this.alwaysStrOperand(e) || (narrowed && (nullish(e) || this.rustProvenStrSource(e) || local(e)));
        this.strVisiting.set(declaration, allowNull);
        try {
            if (!source(declaration.initializer)) return false;
            return this.rustLocalUsesAll(declaration, String(declaration.name.text), true, (n: any) => {
                if (this.rustEnclosingFunction(n) !== fn || this.rustWriteTarget(n)) return false;
                const parent: any = n.parent;
                if ((parent?.kind === SyntaxKind.PrefixUnaryExpression || parent?.kind === SyntaxKind.PostfixUnaryExpression) && parent.operator !== SyntaxKind.ExclamationToken) return false;
                if (!isBinaryExpression(parent) || parent.left !== n || !rustIsAssignmentOperator(parent.operatorToken.kind)) return true;
                const op = parent.operatorToken.kind;
                return op === SyntaxKind.PlusEqualsToken || (op === SyntaxKind.EqualsToken && source(parent.right));
            });
        } finally {
            this.strVisiting.delete(declaration);
        }
    }

    concatAnchor(node: any): boolean {
        const inner: any = this.unwrapParensNode(node);
        return inner !== undefined && this.printsValueExpression(inner) && this.alwaysStrOperand(inner);
    }

    strOrNullConcatIsAnchored(left, right, leftType, rightType): boolean {
        return (this.concatAnchor(left) && this.concatOperandSafe(right, rightType))
            || (this.concatAnchor(right) && this.concatOperandSafe(left, leftType));
    }

    /** `Option<&str>` text of an operand that is always `Value::Str` / `Value::Null`, else undefined. */
    strOrNullOperand(node: any): string | undefined {
        const inner: any = this.rustStripWrappers(node);
        if (inner === undefined) return undefined;
        if (isStringLiteral(inner)) return inner.text in this.StringLiteralReplacements ? undefined : `Some(${this.quotedStringLiteral(inner.text)})`;
        if (isIdentifier(inner) && this.alwaysStrLocal(inner, true)) {
            const text = this.printNode(inner, 0).trim();
            return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text) ? `${text}.as_str()` : undefined;
        }
        const operand = this.rustStrOperand(inner, true);
        return operand === undefined ? undefined : `${operand}.as_str()`;
    }

    // `a < b` (`<=`, `>`, `>=`) on Str|Null operands: the helper's f64 parse of both strings, else
    // `str` order; `<=`/`>=` OR in `is_equal` (string equality, Null == Null).
    strOrderedComparison(node, op, left, right): string | undefined {
        const operator = RustTranspiler.NATIVE_COMPARISON_OPERATORS[op];
        const a = this.strOrNullOperand(left);
        const b = a === undefined ? undefined : this.strOrNullOperand(right);
        if (operator === undefined || b === undefined) return undefined;
        const strict = operator.charAt(0);
        const orEqual = operator.length === 2;
        const order = `(match (__x.parse::<f64>(), __y.parse::<f64>()) { (Ok(__p), Ok(__q)) => __p ${strict} __q, _ => __x ${strict} __y })`;
        const text = `(match (${a}, ${b}) { (Some(__x), Some(__y)) => ${order}${orEqual ? ' || __x == __y' : ''}, ${orEqual ? '(None, None) => true, ' : ''}_ => false })`;
        return this.isBooleanPosition(node) ? text : `Value::Bool(${text})`;
    }

    // The plain-dict sources (`safeDict*(x, k, {})`, same-file builders, `extend|omit`)
    // also hold in the base tier and pro files, where a tagged handle can only arrive through a
    // parameter: base admits typed plain-dict parameters, pro admits no parameter at all.
    rustSourceTier(node: Node): 'rest' | 'base' | 'pro' | undefined {
        const path = this.provenDictFieldPath(node);
        if (RustTranspiler.RUST_REST_FILE.test(path) && /\/ts\/src\/[^/]+\.ts$/.test(path)) return 'rest';
        if (RustTranspiler.RUST_BASE_TIER_FILE.test(path) && !/\/base\/ws\//.test(path)) return 'base';
        if (/\/ts\/src\/pro\/[^/]+\.ts$/.test(path)) return 'pro';
        return undefined;
    }

    plainSourceTier(node: Node): boolean {
        return this.rustSourceTier(node) !== undefined;
    }

    /** A copied/read dict argument outside REST: in pro only `this.options` or a proven plain
     *  local; in base also a parameter annotated with a plain-dict type (no `any` caller handle). */
    tierSourceOk(arg: any): boolean {
        const tier = this.rustSourceTier(arg);
        if (tier === 'rest') return true;
        const node: any = this.rustStripWrappers(arg);
        if (node === undefined || !isIdentifier(node)) return true;
        const declaration: any = this.rustSingleLocalDeclaration(node);
        // pro: a local read source must itself be proven plain (its root may be a handler parameter)
        if (tier === 'pro') return declaration !== undefined && !isParameterDeclaration(declaration) && this.rustPlainReceiver(node) === 'local';
        if (declaration === undefined || !isParameterDeclaration(declaration)) return true;
        if (tier !== 'base' || declaration.type === undefined || declaration.dotDotDotToken !== undefined) return false;
        const type = this.getCheckedTypeOf(declaration.type);
        return type !== undefined && this.isProvenMapType(type) && !this.rustParameterIsClientHandle(declaration);
    }

    /** `this.extend (plain, …unshared)` / `this.omit|keysort (plain, …)` called directly
     *  (not only as a builder's return): the same fresh-copy proof as `rustPlainReturn`. */
    private copyVisiting = new Set<any>();

    freshCopy(node: any, depth: number): boolean {
        const callee = String(node.expression.name.text);
        // the write-history -> plain-source hop restarts `depth`: a copy reached again through its own local proves nothing
        if ((callee !== 'extend' && callee !== 'omit' && callee !== 'keysort') || this.copyVisiting.has(node)) return false;
        this.copyVisiting.add(node);
        try {
            return this.rustPlainReturn(node, depth);
        } finally {
            this.copyVisiting.delete(node);
        }
    }

    // `a - b` / `a * b` / `a / b` and `a < b` (`<=`, `>`, `>=`) on unproven `Value`s print the
    // helper's own dispatch inline (f64 coercion: Int/Float, Str parse, Bool 1/0; `<=`/`>=` OR in
    // `is_equal`); `a + b` on two Str|Null operands (fields of same-file object literals) is `format!`.
    looseF64(binding: string): string {
        return `(match ${binding} { Value::Int(__n) => Some(*__n as f64), Value::Float(__f) => Some(*__f), Value::Str(__s) => __s.parse::<f64>().ok(), Value::Bool(__b) => Some(if *__b { 1.0 } else { 0.0 }), _ => None })`;
    }

    plainValueOperand(node: any): boolean {
        const inner: any = this.rustStripWrappers(node);
        if (inner === undefined || !this.printsValueExpression(inner) || this.rustNativeStrCalleeKind(inner) === 'str') return false;
        if (isIdentifier(inner) && this.rustParamShadowOf(inner) !== undefined) return false;
        return !(isIdentifier(inner) && (this.rustStringLocalIdentifierIsTyped(inner) || this.rustVecLocalDeclarationOf(inner) !== undefined));
    }

    nativeCoercingArithmetic(op, left, right, leftText: string, rightText: string): string | undefined {
        if (op === SyntaxKind.PlusToken) return this.nativeStrOrNullConcat(left, right, leftText, rightText);
        if (op !== SyntaxKind.MinusToken && op !== SyntaxKind.AsteriskToken && op !== SyntaxKind.SlashToken) return undefined;
        if (!this.plainValueOperand(left) || !this.plainValueOperand(right)) return undefined;
        const a = this.rustNumericKind(left) !== undefined ? '__a.as_f64()' : this.looseF64('__a');
        const b = this.rustNumericKind(right) !== undefined ? '__b.as_f64()' : this.looseF64('__b');
        if (op === SyntaxKind.SlashToken) {
            return `(match (&(${leftText}), &(${rightText})) { (__a, __b) => match (${a}, ${b}) { (Some(__x), Some(__y)) if __y != 0.0 => Value::Float(__x / __y), _ => Value::Null } })`;
        }
        const sign = op === SyntaxKind.MinusToken ? '-' : '*';
        return `(match (&(${leftText}), &(${rightText})) { (Value::Int(__x), Value::Int(__y)) => Value::Int(__x ${sign} __y),` +
            ` (__a, __b) => match (${a}, ${b}) { (Some(__x), Some(__y)) => Value::Float(__x ${sign} __y), _ => Value::Null } })`;
    }

    // is_less_than / is_greater_than: f64 order when both coerce, else `str` order of two Str;
    // the `-or_equal` forms OR in is_equal (Null==Null, same-variant payload, Int exact, else f64).
    nativeLooseOrderedComparison(node, op, left, right): string | undefined {
        const operator = RustTranspiler.NATIVE_COMPARISON_OPERATORS[op];
        if (operator === undefined || !this.plainValueOperand(left) || !this.plainValueOperand(right)) return undefined;
        const strict = operator.charAt(0);
        const p = `(${this.looseF64('__a')}, ${this.looseF64('__b')})`;
        const order = `(match ${p} { (Some(__x), Some(__y)) => __x ${strict} __y, _ => matches!((__a, __b), (Value::Str(__x), Value::Str(__y)) if __x ${strict} __y) })`;
        const equal = ` || (match (__a, __b) { (Value::Null, Value::Null) => true, (Value::Bool(__x), Value::Bool(__y)) => __x == __y, (Value::Str(__x), Value::Str(__y)) => __x == __y,` +
            ` (Value::Int(__x), Value::Int(__y)) => __x == __y, (Value::Float(__x), Value::Float(__y)) => __x == __y, _ => matches!(${p}, (Some(__x), Some(__y)) if __x == __y) })`;
        const text = `(match (&(${this.printNode(left, 0)}), &(${this.printNode(right, 0)})) { (__a, __b) => ${order}${operator.length === 2 ? equal : ''} })`;
        return this.isBooleanPosition(node) ? text : `Value::Bool(${text})`;
    }

    // Str+Str / Str+Null take `string_concat` (Display, Null is "null"); Null+Null is Null.
    nativeStrOrNullConcat(left, right, leftText: string, rightText: string): string | undefined {
        if (!this.strOrNull(left, 0) || !this.strOrNull(right, 0)) return undefined;
        return `(match (&(${leftText}), &(${rightText})) { (Value::Null, Value::Null) => Value::Null, (__a, __b) => Value::Str(format!("{}{}", __a, __b).into()) })`;
    }

    strOrNull(node: any, depth: number): boolean {
        const inner: any = this.rustStripWrappers(node);
        if (inner === undefined || depth > 12 || !this.plainValueOperand(inner)) return false;
        if (isStringLiteral(inner) || this.alwaysStrOperand(inner)) return true;
        // `pad_start` / `pad_end` (helper or native form) answer Str or Null
        if (isCallExpression(inner) && isPropertyAccessExpression(inner.expression)
            && (String(inner.expression.name.text) === 'padStart' || String(inner.expression.name.text) === 'padEnd')) return true;
        if (!isElementAccessExpression(inner) || !isStringLiteral(inner.argumentExpression)) return false;
        return this.dictFieldStrOrNull(inner.expression, String(inner.argumentExpression.text), depth + 1);
    }

    /** Every dict `node` can evaluate to holds `key` as Str/Null or lacks it (a read of a missing key / non-dict is Null). */
    dictFieldStrOrNull(node: any, key: string, depth: number): boolean {
        const inner: any = this.rustStripWrappers(node);
        if (inner === undefined || depth > 12) return false;
        if (inner.kind === SyntaxKind.NullKeyword || (isIdentifier(inner) && String(inner.text) === 'undefined')) return true;
        if (isObjectLiteralExpression(inner)) {
            for (const p of inner.properties as any) {
                if (p.kind !== SyntaxKind.PropertyAssignment) return false;
                const name: any = p.name;
                const text = (isStringLiteral(name) || isIdentifier(name)) ? String(name.text) : undefined;
                if (text === undefined) return false;
                if (text === key && !this.strOrNull(p.initializer, depth + 1)) return false;
            }
            return true;
        }
        if (isCallExpression(inner)) return this.methodFieldStrOrNull(inner, key, depth + 1);
        if (!isIdentifier(inner)) return false;
        const declaration: any = this.rustSingleLocalDeclaration(inner);
        if (declaration === undefined || !isVariableDeclaration(declaration) || !isIdentifier(declaration.name)
            || declaration.initializer === undefined || (declaration.parent?.flags & NodeFlags.Const) === 0) return false;
        const fn = this.rustEnclosingFunction(declaration);
        if (fn === undefined) return false;
        // no element write / delete rooted at the local
        for (const m of this.rustScopeNameNodes(fn, String(declaration.name.text)) as any[]) {
            if (m === declaration.name || m.kind !== SyntaxKind.Identifier) continue;
            let top: any = m;
            while (isElementAccessExpression(top.parent) && top.parent.expression === top) top = top.parent;
            if (top === m) continue;
            const parent: any = top.parent;
            if (isDeleteExpression(parent) || (isBinaryExpression(parent) && parent.left === top && rustIsAssignmentOperator(parent.operatorToken.kind))) return false;
        }
        return this.dictFieldStrOrNull(declaration.initializer, key, depth + 1);
    }

    /** `this.m(..)` resolved to a same-file method with a body whose every return holds `key` as Str/Null. */
    methodFieldStrOrNull(call: any, key: string, depth: number): boolean {
        const callee = call.expression;
        if (!isPropertyAccessExpression(callee) || callee.expression.kind !== SyntaxKind.ThisKeyword) return false;
        let declaration: any;
        try {
            declaration = signatureDeclaration((this.getChecker() as any).getResolvedSignature(call));
        } catch (e) {
            return false;
        }
        if (declaration?.kind !== SyntaxKind.MethodDeclaration || declaration.body === undefined
            || declaration.getSourceFile() !== call.getSourceFile() || RustTranspiler.RUST_BASE_TIER_FILE.test(this.provenDictFieldPath(call))) return false;
        let ok = true;
        const visit = (n: any) => {
            if (!ok || (n !== declaration && isFunctionLike(n))) return;
            if (isReturnStatement(n) && n.expression !== undefined && !this.dictFieldStrOrNull(n.expression, key, depth + 1)) ok = false;
            n.forEachChild?.(visit);
        };
        declaration.body.forEachChild(visit);
        return ok;
    }

    // Tuple slot 1 of the base `handle*AndParams` / `handleParam*` helpers is their
    // params argument or an `omit` copy of it: plain when that argument is a plain source.
    private static readonly PARAMS_SLOT_ARG: { [name: string]: number } = {
        handleOptionAndParams: 0, handleOptionAndParams2: 0, handleOptionStringAndParams: 0, handleOptionStringAndParams2: 0,
        handleOptionBoolAndParams: 0, handleOptionBoolAndParams2: 0, handleOptionIntegerAndParams: 0, handleOptionIntegerAndParams2: 0,
        handleParamString: 0, handleParamString2: 0, handleParamInteger: 0, handleParamInteger2: 0, handleParamBool: 0, handleParamBool2: 0,
        handleNetworkCodeAndParams: 0, handleMarginModeAndParams: 1, handleMarketTypeAndParams: 2, handleSubTypeAndParams: 2,
        handleMaxEntriesPerRequestAndParams: 2,
    };

    paramsSlot(rhs: Node, selfName: string | undefined, depth: number): boolean {
        const call: any = this.rustStripWrappers(rhs);
        if (depth > 4 || call === undefined || !isCallExpression(call) || !isPropertyAccessExpression(call.expression)
            || call.expression.expression.kind !== SyntaxKind.ThisKeyword || this.rustSourceTier(call) === undefined) {
            return false;
        }
        const index = RustTranspiler.PARAMS_SLOT_ARG[String(call.expression.name.text)];
        if (index === undefined || !this.rustCalleeIsBase(call)) return false;
        const arg: any = this.rustStripWrappers(call.arguments[index]);
        // an omitted params argument takes the `{}` default
        if (arg === undefined) return call.arguments.length <= index;
        if (this.rustPlainDictLiteral(arg)) return true;
        if (!isIdentifier(arg)) return false;
        if (String(arg.text) === selfName) return true;
        const declaration: any = this.rustSingleLocalDeclaration(arg);
        if (declaration !== undefined && isParameterDeclaration(declaration)) {
            // REST parameters are caller data; base needs a typed non-Client dict; pro rejects
            return this.tierSourceOk(arg) && (this.rustSourceTier(arg) !== 'base' || this.rustParamStaysPlainDict(declaration));
        }
        try {
            return this.rustPlainReceiver(arg) === 'local';
        } catch (e) {
            return false;
        }
    }

    // `slice` / `indexOf` / `toUpperCase` / `toLowerCase` on unproven `Value`s print the
    // runtime helper's own dispatch inline (`runtime.rs` slice/get_index_of/to_upper/to_lower);
    // every operand is evaluated once, in the helper's argument order.
    looseI64(expr: string): string {
        return `(match &(${expr}) { Value::Int(__n) => Some(*__n), Value::Float(__f) => Some(*__f as i64), Value::Str(__s) => __s.parse::<i64>().ok(), Value::Bool(__b) => Some(if *__b { 1 } else { 0 }), _ => None })`;
    }

    // The start bound of a slice: an Int literal is its own i64, a Null literal is 0 (the helper's Int / Null arms).
    looseI64OrZero(expr: string): string {
        const lit = /^Value::Int\((-?[0-9]+)\)$/.exec(expr);
        if (lit !== null && Math.abs(Number(lit[1])) < 2 ** 53) return lit[1].startsWith('-') ? `(${lit[1]}i64)` : `${lit[1]}i64`;
        if (expr === 'Value::Null') return '0i64';
        return `${this.looseI64(expr)}.unwrap_or(0)`;
    }

    looseSliceArm(variant: string, len: string, take: string, empty: string): string {
        const bound = (b: string) => `if ${b} < 0 { (__l + ${b}).max(0) } else { ${b}.min(__l) }`;
        return `(${variant}, __b, __e) => match (${len}) { __l => match (${bound('__b')}, match __e { None => __l, Some(__k) => ${bound('__k')} }) { (__i, __j) => if __i <= __j { ${take} } else { ${empty} } } }`;
    }

    looseSlice(name: string, start: string, end: string): string {
        const str = this.looseSliceArm('Value::Str(__sv)', '__sv.chars().count() as i64',
            'Value::Str(__sv.chars().skip(__i as usize).take((__j - __i) as usize).collect::<String>().into())', 'Value::Str(String::new().into())');
        const arr = this.looseSliceArm('Value::Arr(__a)', '__a.len() as i64',
            'Value::Array(__a[__i as usize..__j as usize].to_vec())', 'Value::Array(vec![])');
        return `(match (&(${name}), ${this.looseI64OrZero(start)}, ${this.looseI64(end)}) { ${str}, ${arr}, _ => Value::Null })`;
    }

    looseIndexOf(name: string, needle: string): string {
        const eq = `match (__it, __nd) { (Value::Null, Value::Null) => true, (Value::Bool(__x), Value::Bool(__y)) => __x == __y, (Value::Str(__x), Value::Str(__y)) => __x == __y, (Value::Int(__x), Value::Int(__y)) => __x == __y, (Value::Float(__x), Value::Float(__y)) => __x == __y, (__p, __q) => match (${this.looseF64('__p')}, ${this.looseF64('__q')}) { (Some(__x), Some(__y)) => __x == __y, _ => false } }`;
        return `(match (&(${name}), &(${needle})) { (Value::Arr(__a), __nd) => Value::Int(__a.iter().position(|__it| ${eq}).map(|__i| __i as i64).unwrap_or(-1)), (Value::Str(__s), Value::Str(__nd)) => Value::Int(__s.find(&**__nd).map(|__i| __i as i64).unwrap_or(-1)), _ => Value::Int(-1) })`;
    }

    looseStrCase(name: string, method: string): string {
        // An unproven operand: the helper's own dispatch inline (a place without literals/newlines reads as `if let`).
        if (!name.includes('"') && !name.includes('\n')) {
            return `(if let Some(__s) = (${name}).as_str() { Value::Str(__s.${method}().into()) } else { Value::Null })`;
        }
        return `(match &(${name}) { Value::Str(__s) => Value::Str(__s.${method}().into()), _ => Value::Null })`;
    }
}
