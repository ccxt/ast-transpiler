// @ts-nocheck
// ===== hx10 w2 G08: destructured tuple slots read natively when the producer proves what the slot holds =====
// `const [ a, b ] = this.m (..)` prints `a := GetValue(h, 0)`. When every `return [ .. ]` of `m` stores a
// value that GetValue(h, i) would hand back unchanged, the slot is `plain` and reads as `h[i]`; a slot that
// is always a map[string]any (typed nil included) turns MapTyped(h[i]) into the assertion `h[i].(map[string]any)`
// and a bool literal slot GetValueBool(h, 0, false) into `h[0].(bool)`. Anything unproven keeps the helper.
// Installed last, so it sees the statement every other hook printed.

import { ts } from './tsApi.js';

const SK = ts.SyntaxKind;

// producers whose Go twin is a hand-written pair (a, b): slot 1 is their map result
const G08_PAIR_MAP_PRODUCERS = [ 'handleMarketTypeAndParams', 'handleSubTypeAndParams' ];

// pair twins (printed or hand-written Go `(T, map[string]any)`, or the `[]any` Nullable overloads) whose element 1 is the
// params value they were given, omitted or extended: GetValue(h, 1) and h[1] read the same, but nothing proves a map
// (the base handleOptionAndParams/2 return `[]any` and are read through a `var h []any` holder, so their slot 1 reads by index too)
const G08_PAIR_PLAIN_PRODUCERS = [ 'handleOptionAndParams', 'handleOptionAndParams2', 'handleOptionStringAndParams', 'handleOptionStringAndParams2', 'handleMarginModeAndParams',
    'handleOptionBoolAndParams', 'handleOptionBoolAndParams2', 'handleOptionIntegerAndParams', 'handleOptionIntegerAndParams2',
    'handleParamString', 'handleParamString2', 'handleNetworkCodeAndParams', 'handleParamBool', 'handleParamBool2',
    'handleParamInteger', 'handleParamInteger2' ];

// base tuple helpers the Go base declares with a `[]any` return (the rest of the base prints `any`)
const G08_BASE_SLICE_PRODUCERS = [
    'handleOptionAndParams', 'handleOptionAndParams2', 'handleWithdrawTagAndParams', 'handlePostOnly',
    'handleTriggerPricesAndParams', 'handleTriggerDirectionAndParams',
];
const G08_BASE_FILE = /[\/]base[\/]Exchange(\.nooverloads\.\d+)?\.ts$/;

const FUNCTION_LIKE = [
    SK.FunctionDeclaration, SK.FunctionExpression, SK.ArrowFunction, SK.MethodDeclaration, SK.Constructor,
    SK.GetAccessor, SK.SetAccessor, SK.ClassDeclaration, SK.ClassExpression,
];

// text with comments and string/char/raw literals blanked, same length
function g08Mask (text: string): string {
    const out = text.split ('');
    const n = text.length;
    let i = 0;
    while (i < n) {
        const c = text[i];
        if ((c === '/') && (text[i + 1] === '/')) {
            while ((i < n) && (text[i] !== '\n')) { out[i] = ' '; i += 1; }
        } else if ((c === '"') || (c === '\'')) {
            out[i] = ' '; i += 1;
            while (i < n) {
                if ((text[i] === '\\') && (i + 1 < n)) { out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
                if (text[i] === c) { out[i] = ' '; i += 1; break; }
                if (text[i] !== '\n') { out[i] = ' '; }
                i += 1;
            }
        } else if (c === '`') {
            out[i] = ' '; i += 1;
            while ((i < n) && (text[i] !== '`')) { if (text[i] !== '\n') { out[i] = ' '; } i += 1; }
            if (i < n) { out[i] = ' '; i += 1; }
        } else {
            i += 1;
        }
    }
    return out.join ('');
}

function g08CallClass (masked: string): string | undefined {
    if (/^(?:ccxt\.)?(?:GetValue|GetArg|ParseToInt|ParseInt|SafeMapToMap)\(/.test (masked)) { return 'plain'; }
    if (/^(?:this\.|ccxt\.)?(?:OmitDict|Extend|DeepExtend)\(/.test (masked)) { return 'plain:map'; }
    if (/^(?:this\.)?(?:Omit|OmitN|OmitMap)\(/.test (masked)) { return 'plain'; }
    if (/^(?:ccxt\.)?(?:MapTyped|SafeMapTyped)\(/.test (masked)) { return 'typedmap'; }
    if (/^GetArgMap\(/.test (masked)) { return 'typedmap'; }
    if (/^(?:ccxt\.)?ListTyped\(/.test (masked)) { return 'typedslice'; }
    if (/^(?:this\.)?SafeDict2?\(/.test (masked)) { return 'deref:map'; }
    return undefined;
}

// the weakest class every return path agrees on: any `no` wins, else a deref class covers a plain one
function g08Combine (classes: string[]): string {
    if ((classes.length === 0) || classes.includes ('no')) { return 'no'; }
    const unique = [ ...new Set (classes) ];
    if (unique.length === 1) { return unique[0]; }
    const kind = (list: string[]) => (list.some ((c) => c.endsWith ('map')) ? 'map' : (list.some ((c) => c.endsWith ('slice')) ? 'slice' : ''));
    if (unique.every ((c) => c.startsWith ('plain'))) { return 'plain:' + kind (unique); }
    if (unique.every ((c) => c.startsWith ('plain') || (c === 'typedmap') || (c === 'typedslice'))) {
        return (kind (unique) === 'slice') ? 'typedslice' : 'typedmap';
    }
    return 'deref:' + kind (unique);
}

function g08Balanced (masked: string, start: number): number {
    let depth = 0;
    for (let i = start; i < masked.length; i++) {
        if ('({['.includes (masked[i])) { depth += 1; continue; }
        if (')}]'.includes (masked[i])) {
            depth -= 1;
            if (depth === 0) { return i; }
        }
    }
    return -1;
}

function g08SplitTop (masked: string, raw: string): string[][] | undefined {
    const out: string[][] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i <= masked.length; i++) {
        const c = masked[i];
        if ((i === masked.length) || ((c === ',') && (depth === 0))) {
            out.push ([ masked.substring (start, i).trim (), raw.substring (start, i).trim () ]);
            start = i + 1;
            continue;
        }
        depth += '({['.includes (c) ? 1 : (')}]'.includes (c) ? -1 : 0);
        if (depth < 0) { return undefined; }
    }
    return (depth === 0) ? out : undefined;
}

function g08Unwrap (node: any): any {
    let current = node;
    while (current?.kind === SK.ParenthesizedExpression) { current = current.expression; }
    return current;
}

function g08Walk (scope: any, visit: (n: any) => boolean | void): void {
    const go = (n: any) => {
        if (n === undefined) { return; }
        if (visit (n) === false) { return; }
        n.forEachChild (go);
    };
    scope?.forEachChild (go);
}

class TupleSlots {
    go: any;
    producers = new WeakMap<object, any> ();
    declLines = new WeakMap<object, any> ();
    writeCounts = new WeakMap<object, Map<string, number>> ();

    constructor (go: any) { this.go = go; }

    resolve (node: any): any {
        try {
            return this.go.getChecker ().getSymbolAtLocation (node)?.valueDeclaration?.resolve ();
        } catch (e) {
            return undefined;
        }
    }

    // the implementation (with a body) of the method `this.m (..)` calls
    producerDeclaration (call: any): any {
        const callee = call?.expression;
        if ((call?.kind !== SK.CallExpression) || (callee?.kind !== SK.PropertyAccessExpression)
            || (callee.expression?.kind !== SK.ThisKeyword) || (call.questionDotToken !== undefined)) {
            return undefined;
        }
        let declaration: any;
        try {
            declaration = this.go.getChecker ().getResolvedSignature (call)?.declaration?.resolve ();
        } catch (e) {
            return undefined;
        }
        if (declaration?.kind !== SK.MethodDeclaration) { return undefined; }
        const name = declaration.name?.text;
        let method = declaration;
        if (method.body === undefined) {
            method = (declaration.parent?.members ?? []).find ((m: any) => (m.kind === SK.MethodDeclaration) && (m.name?.text === name) && (m.body !== undefined));
        }
        if ((method === undefined) || (method.body === undefined) || (method.type?.kind !== SK.TupleType)) { return undefined; }
        if ((method.modifiers ?? []).some ((m: any) => (m.kind === SK.AsyncKeyword) || (m.kind === SK.StaticKeyword))) { return undefined; }
        return this.printsSlice (method) ? method : undefined;
    }

    // { arity, slots } of the tuple a producer returns, from every own `return [ .. ]`
    producerInfo (call: any): any {
        const callee = call?.expression;
        if (G08_PAIR_MAP_PRODUCERS.includes (callee?.name?.text) && (callee.expression?.kind === SK.ThisKeyword)) {
            return this.go.getChecker () !== undefined ? { 'arity': 2, 'slots': { 1: 'plain:map' }, 'pair': true } : undefined;
        }
        if (G08_PAIR_PLAIN_PRODUCERS.includes (callee?.name?.text) && (callee.expression?.kind === SK.ThisKeyword)) {
            return this.go.getChecker () !== undefined ? { 'arity': 2, 'slots': { 1: 'plain' }, 'pair': true } : undefined;
        }
        const method = this.producerDeclaration (call);
        if (method === undefined) { return undefined; }
        if (this.producers.has (method)) { return this.producers.get (method); }
        this.producers.set (method, undefined);
        const info = this.analyse (method);
        this.producers.set (method, info);
        return info;
    }

    analyse (method: any): any {
        const rows: any[][] = [];
        let ok = true;
        g08Walk (method.body, (n) => {
            if (!ok || FUNCTION_LIKE.includes (n.kind)) { return false; }
            if (n.kind !== SK.ReturnStatement) { return true; }
            const array = n.expression;
            if ((array?.kind !== SK.ArrayLiteralExpression) || array.elements.some ((e: any) => e.kind === SK.SpreadElement)) {
                ok = false;
                return false;
            }
            rows.push (array.elements.slice ());
            return false;
        });
        if (!ok || (rows.length === 0)) { return undefined; }
        const arity = Math.min (...rows.map ((row) => row.length));
        const slots: any = {};
        for (let i = 0; i < arity; i++) {
            const combined = g08Combine (rows.map ((row) => this.classOfNode (method, row[i], 0)));
            if (combined !== 'no') { slots[i] = combined; }
        }
        return (Object.keys (slots).length > 0) ? { arity, slots } : undefined;
    }

    // true when the printed Go method returns `[]any`: a tabled base helper, or an exchange-local
    // method (no base twin) whose every own return prints as one `return []any{..}` line
    printsSlice (method: any): boolean {
        const name = method.name?.text;
        if (G08_BASE_SLICE_PRODUCERS.includes (name)) { return true; }
        if (this.baseDeclares (method)) { return false; }
        let ok = true;
        let any = false;
        g08Walk (method.body, (n) => {
            if (!ok || FUNCTION_LIKE.includes (n.kind)) { return false; }
            if (n.kind !== SK.ReturnStatement) { return true; }
            const text = this.printed (n);
            any = true;
            const code = (text ?? '').split ('\n').filter ((l) => !/^\s*\/\//.test (l)).join ('\n');
            ok = (text !== undefined) && /^return \[\]any\{.*\}$/.test (code.replace (/\s+\/\/.*$/, '').trim ());
            return false;
        });
        return ok && any;
    }

    // a method of the same name declared by the Exchange base class in the class chain above
    baseDeclares (method: any): boolean {
        if (G08_BASE_FILE.test (String (method.getSourceFile ().fileName ?? ''))) { return true; }
        const checker = this.go.getChecker ();
        let cls = method.parent;
        for (let depth = 0; (cls !== undefined) && (depth < 12); depth++) {
            const clause = (cls.heritageClauses ?? []).find ((c: any) => c.token === SK.ExtendsKeyword);
            if (clause === undefined) { return false; }
            let declaration: any;
            try {
                const symbol = checker.getTypeAtLocation (clause.types?.[0])?.getProperty?.(method.name.text);
                declaration = symbol?.valueDeclaration?.resolve?.() ?? symbol?.declarations?.map ((d: any) => d.resolve ())?.[0];
            } catch (e) {
                return false;
            }
            if (declaration === undefined) { return false; }
            if (G08_BASE_FILE.test (String (declaration.getSourceFile ().fileName ?? ''))) { return true; }
            cls = declaration.parent;
        }
        return false;
    }

    printed (node: any): string | undefined {
        try {
            const text = this.go.printNode (node, 0);
            return (typeof text === 'string') ? text.trim () : undefined;
        } catch (e) {
            return undefined;
        }
    }

    classOfNode (fn: any, node: any, depth: number): string {
        if (depth > 4) { return 'no'; }
        const raw = this.printed (node);
        if ((raw === undefined) || raw.includes ('\n')) { return 'no'; }
        return this.classOfText (fn, g08Unwrap (node), g08Mask (raw).trim (), raw, depth);
    }

    classOfText (fn: any, node: any, m: string, r: string, depth: number): string {
        if (/^(?:true|false)$/.test (m)) { return 'plain:bool'; }
        if (/^-?\d+(?:\.\d+)?$/.test (m)) { return 'plain:number'; }
        if ((m === '') && /^"(?:[^"\\]|\\.)*"$/.test (r)) { return 'plain:string'; }
        if (/^map\[string\]any\{/.test (m)) { return 'plain:map'; }
        if (/^\[\](?:any|string)\{/.test (m)) { return 'plain'; }
        if (/^\[\](?:any|string)$/.test (m)) { return 'deref:slice'; }
        if (/^GetArgMap\(\w+, \d+, map\[string\]any\{\}\)$/.test (m)) { return 'plain:map'; }
        const call = g08CallClass (m);
        if (call !== undefined) {
            // MapTyped of a proven non-nil map stays non-nil
            if ((call === 'deref:map') && /^(?:ccxt\.)?MapTyped\(/.test (m)) {
                const open = m.indexOf ('(');
                const close = g08Balanced (m, open);
                const arg = g08Unwrap (node)?.arguments?.[0];
                if ((close > 0) && (arg !== undefined) && (this.classOfNode (fn, arg, depth + 1) === 'plain:map')) { return 'plain:map'; }
            }
            return call;
        }
        if (/^func\s*\(/.test (m)) { return 'no'; }
        if ((node?.kind === SK.Identifier) && /^[A-Za-z_]\w*$/.test (m)) { return this.classOfIdent (fn, node, depth); }
        return 'no';
    }

    // writes of the name inside the function: `=`, destructuring targets and compound writes
    writesOf (fn: any, name: string): number {
        let counts = this.writeCounts.get (fn);
        if (counts === undefined) {
            counts = new Map ();
            this.writeCounts.set (fn, counts);
            const bump = (id: string) => counts.set (id, (counts.get (id) ?? 0) + 1);
            const targets = (t: any) => {
                const u = g08Unwrap (t);
                if (u?.kind === SK.Identifier) { bump (u.text); }
                if (u?.kind === SK.ArrayLiteralExpression) { u.elements.forEach (targets); }
            };
            g08Walk (fn.body, (n) => {
                if (((n.kind === SK.VariableDeclaration) || (n.kind === SK.BindingElement)) && (n.name?.kind === SK.Identifier)) {
                    bump (n.name.text);
                } else if (n.kind === SK.BinaryExpression) {
                    const op = n.operatorToken?.kind;
                    if ((op >= SK.FirstAssignment) && (op <= SK.LastAssignment)) { targets (n.left); }
                } else if (((n.kind === SK.PrefixUnaryExpression) || (n.kind === SK.PostfixUnaryExpression))
                    && ((n.operator === SK.PlusPlusToken) || (n.operator === SK.MinusMinusToken))) {
                    targets (n.operand);
                }
                return true;
            });
        }
        return counts.get (name) ?? 0;
    }

    // `var x T = init` / `x := init` / `a, b := call` as the printer wrote the declaration of an identifier
    declOf (node: any): any {
        const decl = this.resolve (node);
        if (decl === undefined) { return undefined; }
        if (this.declLines.has (decl)) { return this.declLines.get (decl); }
        this.declLines.set (decl, undefined);
        let result: any;
        if (decl.kind === SK.Parameter) {
            const bound = (decl.initializer !== undefined) || (decl.questionToken !== undefined);
            if (bound && (decl.dotDotDotToken === undefined) && (decl.parent?.body !== undefined)) {
                const type = this.go.goGetArgParameterType (decl);
                const emptyMap = (decl.initializer?.kind === SK.ObjectLiteralExpression) && (decl.initializer.properties.length === 0);
                result = (type !== undefined)
                    ? { 'kind': 'var', 'type': type, 'init': ((type === 'map[string]any') && emptyMap) ? 'GetArgMap(optionalArgs, 0, map[string]any{})' : 'GetArgX(optionalArgs, 0, nil)', 'fn': decl.parent, 'param': true }
                    : { 'kind': 'short', 'type': undefined, 'init': 'GetArg(optionalArgs, 0, nil)', 'fn': decl.parent, 'param': true };
            }
        } else if ((decl.kind === SK.VariableDeclaration) && (decl.name?.kind === SK.Identifier)) {
            result = this.printedDeclaration (decl);
        } else if ((decl.kind === SK.BindingElement) && (decl.name?.kind === SK.Identifier)) {
            result = this.printedBinding (decl);
        }
        this.declLines.set (decl, result);
        return result;
    }

    enclosingFunction (node: any): any {
        let current = node?.parent;
        while ((current !== undefined) && (current.kind !== SK.MethodDeclaration) && (current.kind !== SK.FunctionDeclaration)) { current = current.parent; }
        return current;
    }

    printedDeclaration (decl: any): any {
        const statement = decl.parent?.parent;
        if ((statement?.kind !== SK.VariableStatement) || (decl.parent.declarations.length !== 1)) { return undefined; }
        const text = this.printed (statement);
        if (text === undefined) { return undefined; }
        const name = decl.name.text;
        const fn = this.enclosingFunction (decl);
        for (const line of text.split ('\n')) {
            const typed = new RegExp ('^\\s*var ' + name + ' ([\\w\\[\\].*]+) = (.*)$').exec (line);
            if (typed !== null) { return { 'kind': 'var', 'type': typed[1], 'init': typed[2], fn }; }
            const bare = new RegExp ('^\\s*var ' + name + ' ([\\w\\[\\].*]+)\\s*$').exec (line);
            if (bare !== null) { return { 'kind': 'var', 'type': bare[1], 'init': null, fn }; }
            const short = new RegExp ('^\\s*' + name + ' := (.*)$').exec (line);
            if (short !== null) { return { 'kind': 'short', 'type': undefined, 'init': short[1], fn }; }
        }
        return undefined;
    }

    // a destructured element: the typed pair `a, b := this.m (..)`, or the holder read it printed
    printedBinding (element: any): any {
        const pattern = element.parent;
        const declaration = pattern?.parent;
        const statement = declaration?.parent?.parent;
        if ((pattern?.kind !== SK.ArrayBindingPattern) || (statement?.kind !== SK.VariableStatement)) { return undefined; }
        const text = this.printed (statement);
        if (text === undefined) { return undefined; }
        const name = element.name.text;
        const fn = this.enclosingFunction (element);
        for (const line of text.split ('\n')) {
            const pair = /^\s*([\w\[\].]*(?:\s*,\s*[\w\[\].]*)+)\s*:=\s*(.*)$/.exec (line);
            if ((pair !== null) && pair[1].split (',').some ((p) => p.trim () === name)) {
                return { 'kind': 'multi', 'type': undefined, 'init': null, 'index': pair[1].split (',').map ((p) => p.trim ()).indexOf (name), 'call': declaration.initializer, fn };
            }
            const typed = new RegExp ('^\\s*var ' + name + ' ([\\w\\[\\].*]+) = (.*)$').exec (line);
            if (typed !== null) { return { 'kind': 'var', 'type': typed[1], 'init': typed[2], fn }; }
            const short = new RegExp ('^\\s*' + name + ' := (.*)$').exec (line);
            if (short !== null) { return { 'kind': 'short', 'type': undefined, 'init': short[1], fn }; }
        }
        return undefined;
    }

    // `this.omit (m, ..)` of a map-typed identifier is a fresh map[string]any (the Go OmitDict twin)
    omitClass (fn: any, init: any, depth: number): string {
        const call = g08Unwrap (init);
        const callee = call?.expression;
        if ((call?.kind !== SK.CallExpression) || (callee?.kind !== SK.PropertyAccessExpression) || (callee.expression?.kind !== SK.ThisKeyword)
            || (callee.name?.text !== 'omit') || (call.arguments?.length < 2) || (call.arguments[0]?.kind !== SK.Identifier)) {
            return 'no';
        }
        const arg = this.classOfIdent (fn, call.arguments[0], depth + 1);
        return ((arg === 'typedmap') || (arg === 'plain:map')) ? 'plain:map' : 'no';
    }

    classOfIdent (fn: any, node: any, depth: number): string {
        if (depth > 4) { return 'no'; }
        const decl = this.declOf (node);
        if ((decl === undefined) || (decl.fn !== fn)) { return 'no'; }
        const name = node.text;
        if (decl.kind === 'multi') {
            const info = (decl.call === undefined) ? undefined : this.producerInfo (decl.call);
            return info?.slots?.[decl.index] ?? 'no';
        }
        // a parameter's own binding line counts as its one write
        const writes = this.writesOf (fn, name) + ((decl.param === true) ? 1 : 0);
        const tsInit = this.resolve (node)?.initializer;
        const initClass = (init: string) => {
            const c = this.classOfText (fn, undefined, g08Mask (init).trim (), init.trim (), depth + 1);
            if (c.startsWith ('plain')) { return c; }
            const omitted = this.omitClass (fn, tsInit, depth);
            return (omitted === 'no') ? c : omitted;
        };
        if (decl.kind === 'short') {
            if (writes > 1) { return 'no'; }
            if (/^(?:this\.|ccxt\.)\w+\(/.test (g08Mask (decl.init))) { return 'no'; }
            return initClass (decl.init);
        }
        const type = decl.type ?? '';
        if (type === 'bool') { return 'plain:bool'; }
        if (type === 'string') { return 'plain:string'; }
        if ([ 'int64', 'float64', 'int', 'uint64' ].includes (type)) { return 'plain:number'; }
        if (type === 'any') {
            if (writes !== 1) { return 'no'; }
            if ((decl.init === null) || (decl.init === undefined)) { return 'no'; }
            if (decl.init.trim () === 'nil') { return 'deref'; }
            return initClass (decl.init);
        }
        if ((type === 'map[string]any') || (type === '[]any') || (type === '[]string')) {
            if ((decl.init !== null) && (decl.init !== undefined) && (decl.init.trim () !== 'nil')) {
                const init = initClass (decl.init);
                if (init.startsWith ('plain') && (writes === 1)) { return init; }
            }
            return (type === 'map[string]any') ? 'typedmap' : 'typedslice';
        }
        return 'no';
    }

    // two destructurings of one function that print the same holder name leave both reads boxed
    holderIsUnique (statement: any, holder: string): boolean {
        const fn = this.enclosingFunction (statement);
        if (fn === undefined) { return false; }
        let count = 0;
        const join = (elements: any[], pattern: boolean) => elements.map ((e: any) => this.printed (pattern ? e.name : e)).join ('') + 'Variable';
        g08Walk (fn.body, (n) => {
            if ((n.kind === SK.VariableDeclaration) && (n.name?.kind === SK.ArrayBindingPattern)) {
                if (join (n.name.elements, true) === holder) { count += 1; }
            } else if ((n.kind === SK.BinaryExpression) && (n.operatorToken?.kind === SK.EqualsToken) && (n.left?.kind === SK.ArrayLiteralExpression)) {
                if (join (n.left.elements, false) === holder) { count += 1; }
            }
            return true;
        });
        return count === 1;
    }

    // rewrite the slot reads of one printed destructuring statement
    rewrite (printed: string, holder: string, call: any, statement: any): string {
        if (!/GetValue/.test (printed) || (call?.kind !== SK.CallExpression)) { return printed; }
        const info = this.producerInfo (call);
        if (info === undefined) { return printed; }
        // a pair twin only holds a slice through TupleSlice(..); any other holder is a `[]any` the printer declared
        const first = printed.split ('\n')[0].trim ();
        const sliceHolder = new RegExp ('^(?:var ' + holder + ' \\[\\]any = |' + holder + ' :?= (?:ccxt\\.)?TupleSlice\\()').test (first)
            || ((info.pair !== true) && new RegExp ('^' + holder + ' :?= (?:ccxt\\.)?this\\.').test (first));
        if (!sliceHolder) { return printed; }
        const classes = info.slots;
        const slotClass = (text: string) => {
            const i = Number (text);
            return (i < info.arity) ? classes[i] : undefined;
        };
        let changed = false;
        const h = holder.replace (/[.*+?^${}()|[\]\\]/g, '\\$&');
        const lines = printed.split ('\n').map ((line) => {
            let m = new RegExp ('^(\\s*(?:var \\w+ map\\[string\\]any = |\\w+ = ))(?:ccxt\\.)?MapTyped\\((?:ccxt\\.)?GetValue\\(' + h + ', (\\d+)\\)\\)$').exec (line);
            if (m !== null) {
                const cls = slotClass (m[2]);
                if ((cls === 'typedmap') || (cls === 'plain:map')) { changed = true; return m[1] + holder + '[' + m[2] + '].(map[string]any)'; }
                // MapTyped derefs its own argument, so it reads the slice element the same as GetValue does
                if (cls !== undefined) { changed = true; return line.replace (new RegExp ('GetValue\\(' + h + ', (\\d+)\\)'), holder + '[$1]'); }
                return line;
            }
            m = new RegExp ('^(.*?\\b(?:ccxt\\.)?(?:SafeStringPtr|SafeBoolPtr|SafeIntegerPtr)\\()(?:ccxt\\.)?GetValue\\(' + h + ', (\\d+)\\)(\\))$').exec (line);
            if ((m !== null) && (slotClass (m[2]) !== undefined)) {
                changed = true;
                return m[1] + holder + '[' + m[2] + ']' + m[3];
            }
            m = new RegExp ('^(\\s*(?:var \\w+ bool = |\\w+ = ))(?:ccxt\\.)?GetValueBool\\(' + h + ', (\\d+), false\\)$').exec (line);
            if (m !== null) {
                if (slotClass (m[2]) === 'plain:bool') { changed = true; return m[1] + holder + '[' + m[2] + '].(bool)'; }
                return line;
            }
            m = new RegExp ('^(\\s*\\w+ :?= )(?:ccxt\\.)?GetValue\\(' + h + ', (\\d+)\\)$').exec (line);
            if (m !== null) {
                if (slotClass (m[2])?.startsWith ('plain')) { changed = true; return m[1] + holder + '[' + m[2] + ']'; }
            }
            return line;
        });
        return changed ? lines.join ('\n') : printed;
    }
}

export function installCcxtGoTupleSlotReads (goTranspiler: any): void {
    if ((goTranspiler === undefined) || goTranspiler.__ccxtGoTupleSlotReadsInstalled
        || (typeof goTranspiler.printVariableDeclarationList !== 'function')) {
        return;
    }
    const slots = new TupleSlots (goTranspiler);
    const printDeclaration = goTranspiler.printVariableDeclarationList;
    goTranspiler.printVariableDeclarationList = function (node: any, identation: number) {
        const printed = printDeclaration.call (this, node, identation);
        const declaration = node?.declarations?.[0];
        if ((typeof printed !== 'string') || (declaration?.name?.kind !== SK.ArrayBindingPattern)
            || (declaration.initializer?.kind !== SK.CallExpression) || !printed.includes ('GetValue')) {
            return printed;
        }
        const holder = declaration.name.elements.map ((e: any) => this.printNode (e.name, 0)).join ('') + 'Variable';
        if (!slots.holderIsUnique (node.parent ?? node, holder)) { return printed; }
        return slots.rewrite (printed, holder, declaration.initializer, node);
    };
    const printBinary = goTranspiler.printCustomBinaryExpressionIfAny;
    if (typeof printBinary === 'function') {
        goTranspiler.printCustomBinaryExpressionIfAny = function (node: any, identation: number) {
            const printed = printBinary.call (this, node, identation);
            if ((typeof printed !== 'string') || (node?.operatorToken?.kind !== SK.EqualsToken)
                || (node.left?.kind !== SK.ArrayLiteralExpression) || (node.right?.kind !== SK.CallExpression)
                || !printed.includes ('GetValue')) {
                return printed;
            }
            const holder = node.left.elements.map ((e: any) => this.printNode (e, 0)).join ('') + 'Variable';
            if (!slots.holderIsUnique (node, holder)) { return printed; }
            return slots.rewrite (printed, holder, node.right, node);
        };
    }
    goTranspiler.__ccxtGoTupleSlotReadsInstalled = true;
}
