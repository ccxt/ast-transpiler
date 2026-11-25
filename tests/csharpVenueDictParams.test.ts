import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as path from 'path';

const WRAPPED_PARSER = { 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(', 'ELEMENT_ACCESS_WRAPPER_CLOSE': ')' };

describe ('csharp venue-private params bag', () => {
    // the trailing `params: Dict = {}` of a venue-private method prints IDictionary when every caller
    // of its venue chain passes nothing or a value already printed as a dictionary
    const TMP = path.join(__dirname, 'files', 'tmp-csharp-venue-dict-params');
    const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const A = path.join(TMP, 'ts', 'src', 'a.ts');
    let a: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(BASE), { recursive: true });
        fs.writeFileSync(BASE, 'export class Exchange {\n    extend (a: any, b: any = undefined): any { return a; }\n    omit (a: any, k: any): any { return a; }\n}\n');
        fs.writeFileSync(A,
            "import { Exchange } from './base/Exchange';\n" +
            'export class A extends Exchange {\n' +
            "    f (x: any, params = {}) { const q = this.extend (params, { 'a': 1 }); return [ this.typed ('s', q), this.typed ('t'), this.boxed (x), this.written ('u', q), this.typed ('v', {}) ]; }\n" +
            "    typed (s: string, params = {}) { return this.omit (params, 'k'); }\n" +
            "    boxed (params = {}) { return this.omit (params, 'k'); }\n" +
            "    written (s: string, params = {}) { params = this.omit (params, 'k'); return params; }\n" +
            '}\n');
        const transpiler = new Transpiler({ 'verbose': false, 'csharp': { 'parser': WRAPPED_PARSER } });
        (transpiler as any).setSharedProgram([ A ]);
        a = (transpiler as any).transpileCSharpByPath(A).content;
        (transpiler as any).setSharedProgram([]);
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('every caller passes a dictionary or nothing: the bag prints IDictionary', () => {
        expect(a).toContain('typed(string s, IDictionary<string, object>? parameters = null)');
    });

    test('a boxed argument keeps object (nil / wrong kind stay what they are)', () => {
        expect(a).toContain('boxed(object parameters = null)');
    });

    test('a body that rebinds the bag keeps object', () => {
        expect(a).toContain('written(string s, object parameters = null)');
    });
});

describe ('csharp venue-private params bag seen from the pro file', () => {
    // the pro subclass is printed in another batch: its `this.` calls join the census when they pass
    // nothing, a literal, an extend call or the caller's own typed and unwritten bag
    const TMP = path.join(__dirname, 'files', 'tmp-csharp-venue-pro-dict-params');
    const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const A = path.join(TMP, 'ts', 'src', 'a.ts');
    const PRO = path.join(TMP, 'ts', 'src', 'pro', 'a.ts');
    let a: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(PRO), { recursive: true });
        fs.mkdirSync(path.dirname(BASE), { recursive: true });
        fs.writeFileSync(BASE, 'export class Exchange {\n    extend (a: any, b: any = undefined): any { return a; }\n    omit (a: any, k: any): any { return a; }\n}\n');
        fs.writeFileSync(A,
            "import { Exchange } from './base/Exchange';\n" +
            'export class A extends Exchange {\n' +
            "    f (s: string) { return [ this.req (s, {}), this.ext (s), this.boxed (s), this.written (s), this.untypedCaller (s) ]; }\n" +
            "    req (s: string, params = {}) { return this.omit (params, 'k'); }\n" +
            "    ext (s: string, params = {}) { return this.omit (params, 'k'); }\n" +
            "    boxed (s: string, params = {}) { return this.omit (params, 'k'); }\n" +
            "    written (s: string, params = {}) { return this.omit (params, 'k'); }\n" +
            "    untypedCaller (s: string, params = {}) { return this.omit (params, 'k'); }\n" +
            '}\n');
        fs.writeFileSync(PRO,
            "import { A } from '../a';\n" +
            'export class B extends A {\n' +
            "    createOrderWs (symbol: string, params = {}) { return this.req (symbol, params); }\n" +
            "    watchTicker (symbol: string, params = {}) { return this.ext (symbol, this.extend (params, { 'a': 1 })); }\n" +
            "    watchTrades (symbol: string, params = {}) { const q = this.omit (params, 'x'); return this.boxed (symbol, q); }\n" +
            "    watchOrders (symbol: string, params = {}) { params = this.omit (params, 'x'); return this.written (symbol, params); }\n" +
            "    helper (symbol: string, params = {}) { return this.untypedCaller (symbol, params); }\n" +
            '}\n');
        const config = { 'parser': WRAPPED_PARSER, 'dictParamsMethods': [ 'CreateOrderWs', 'WatchTicker', 'WatchTrades', 'WatchOrders' ] };
        const transpiler = new Transpiler({ 'verbose': false, 'csharp': config });
        (transpiler as any).setSharedProgram([ A ]);
        a = (transpiler as any).transpileCSharpByPath(A).content;
        (transpiler as any).setSharedProgram([]);
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('a pro call passing its own typed bag or an extend call prints IDictionary', () => {
        expect(a).toContain('req(object s, IDictionary<string, object>? parameters = null)');
        expect(a).toContain('ext(object s, IDictionary<string, object>? parameters = null)');
    });

    test('a pro call passing an untyped local keeps object', () => {
        expect(a).toContain('boxed(object s, object parameters = null)');
    });

    test('a pro caller that rebinds its bag keeps object', () => {
        expect(a).toContain('written(object s, object parameters = null)');
    });

    test('a pro caller whose bag the host does not type keeps object', () => {
        expect(a).toContain('untypedCaller(object s, object parameters = null)');
    });
});

describe ('csharp venue-private params bag fed by an omit or a destructured slot', () => {
    // `this.omit (<dictionary local>, 'k')` binds the omit(IDictionary, string) overload (a fresh
    // Dictionary); a destructured slot counts only when the host layer names its printed type
    const TMP = path.join(__dirname, 'files', 'tmp-csharp-venue-omit-dict-params');
    const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const A = path.join(TMP, 'ts', 'src', 'a.ts');
    let a: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(BASE), { recursive: true });
        fs.writeFileSync(BASE, 'export class Exchange {\n    omit (a: any, k: any): any { return a; }\n    pair (a: any): any[] { return [ 1, a ]; }\n}\n');
        fs.writeFileSync(A,
            "import { Exchange } from './base/Exchange';\n" +
            'export class A extends Exchange {\n' +
            "    f (x: any) { const q: Dict = {}; const [ n, p ] = this.pair (q); const [ m, r ] = this.pair (q); return [ this.omitted ('s', this.omit (q, 'k')), this.boxedOmit ('s', this.omit (x, 'k')), this.slot ('s', p), this.otherSlot ('s', r), n, m ]; }\n" +
            "    omitted (s: string, params: Dict = {}) { return this.omit (params, 'k'); }\n" +
            "    boxedOmit (s: string, params: Dict = {}) { return this.omit (params, 'k'); }\n" +
            "    slot (s: string, params: Dict = {}) { return this.omit (params, 'k'); }\n" +
            "    otherSlot (s: string, params: Dict = {}) { return this.omit (params, 'k'); }\n" +
            '}\n');
        const transpiler = new Transpiler({ 'verbose': false, 'csharp': { 'parser': WRAPPED_PARSER } });
        const csharp = (transpiler as any).csharpTranspiler;
        csharp.csharpDestructuredDictSlotType = (element) => ((element.name?.text === 'p') ? 'IDictionary<string, object>' : undefined);
        // the host layer declares `q` a dictionary (ccxt: build/csharp-local-types.js)
        csharp.csharpExpressionTypeResolver = (node) => ((node.text === 'q') ? 'IDictionary<string, object>' : undefined);
        (transpiler as any).setSharedProgram([ A ]);
        a = (transpiler as any).transpileCSharpByPath(A).content;
        (transpiler as any).setSharedProgram([]);
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('an omit of a dictionary local prints IDictionary', () => {
        expect(a).toContain('omitted(string s, IDictionary<string, object>? parameters = null)');
    });

    test('an omit of a boxed value keeps object', () => {
        expect(a).toContain('boxedOmit(string s, object parameters = null)');
    });

    test('a destructured slot the host types prints IDictionary', () => {
        expect(a).toContain('slot(string s, IDictionary<string, object>? parameters = null)');
    });

    test('a destructured slot the host does not type keeps object', () => {
        expect(a).toContain('otherSlot(string s, object parameters = null)');
    });
});

describe ('csharp venue-private dictionary row parameter', () => {
    // a required `row: Dict` of a venue-private method prints IDictionary when every caller of its
    // venue chain passes a value already printed as a dictionary
    const TMP = path.join(__dirname, 'files', 'tmp-csharp-venue-dict-row');
    const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const A = path.join(TMP, 'ts', 'src', 'a.ts');
    let a: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(BASE), { recursive: true });
        fs.writeFileSync(BASE, 'export class Exchange {\n    extend (a: any, b: any = undefined): any { return a; }\n    safeString (a: any, k: any): any { return a; }\n}\n');
        fs.writeFileSync(A,
            "import { Exchange } from './base/Exchange';\n" +
            'export class A extends Exchange {\n' +
            "    f (x: any, rows: any) { return [ this.typedRow (this.extend (x, { 'a': 1 })), this.boxedRow (x), this.writtenRow ({}), this.optionalRow () ]; }\n" +
            "    typedRow (row: Dict) { return this.safeString (row, 'k'); }\n" +
            "    boxedRow (row: Dict) { return this.safeString (row, 'k'); }\n" +
            "    writtenRow (row: Dict) { row = this.extend (row, {}); return this.safeString (row, 'k'); }\n" +
            "    optionalRow (row: Dict = undefined) { return this.safeString (row, 'k'); }\n" +
            '}\n');
        const transpiler = new Transpiler({ 'verbose': false, 'csharp': { 'parser': WRAPPED_PARSER } });
        (transpiler as any).setSharedProgram([ A ]);
        a = (transpiler as any).transpileCSharpByPath(A).content;
        (transpiler as any).setSharedProgram([]);
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('every caller passes a dictionary: the row prints IDictionary', () => {
        expect(a).toContain('typedRow(IDictionary<string, object> row)');
    });

    test('a boxed argument keeps object (nil / wrong kind stay what they are)', () => {
        expect(a).toContain('boxedRow(object row)');
    });

    test('a body that rebinds the row keeps object', () => {
        expect(a).toContain('writtenRow(object row)');
    });

    test('an optional row keeps object', () => {
        expect(a).toContain('optionalRow(object row = null)');
    });
});

describe ('csharp venue-private params bag followed by defaulted parameters', () => {
    // a `params = {}` bag with only defaulted parameters after it is typed by the same caller census
    const TMP = path.join(__dirname, 'files', 'tmp-csharp-venue-dict-params-mid');
    const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const A = path.join(TMP, 'ts', 'src', 'a.ts');
    let a: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(BASE), { recursive: true });
        fs.writeFileSync(BASE, 'export class Exchange {\n    extend (a: any, b: any = undefined): any { return a; }\n    omit (a: any, k: any): any { return a; }\n}\n');
        fs.writeFileSync(A,
            "import { Exchange } from './base/Exchange';\n" +
            'export class A extends Exchange {\n' +
            "    f (x: any, params = {}) { const q = this.extend (params, { 'a': 1 }); return [ this.mid ('s', q), this.mid ('t', {}, true), this.midBoxed (x, true), this.midRequired ('u', q, 1) ]; }\n" +
            "    mid (s: string, params: Dict = {}, unwatch: boolean = false) { return this.omit (params, 'k'); }\n" +
            "    midBoxed (params: Dict = {}, unwatch: boolean = false) { return this.omit (params, 'k'); }\n" +
            "    midRequired (s: string, params: Dict = {}, n: number) { return this.omit (params, 'k'); }\n" +
            '}\n');
        const transpiler = new Transpiler({ 'verbose': false, 'csharp': { 'parser': WRAPPED_PARSER } });
        (transpiler as any).setSharedProgram([ A ]);
        a = (transpiler as any).transpileCSharpByPath(A).content;
        (transpiler as any).setSharedProgram([]);
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('a bag followed by a defaulted flag prints IDictionary', () => {
        expect(a).toMatch(/mid\(string s, IDictionary<string, object>\? parameters = null, /);
    });

    test('a boxed argument keeps object', () => {
        expect(a).toMatch(/midBoxed\(object parameters = null, /);
    });

    test('a required parameter after the bag keeps object', () => {
        expect(a).toMatch(/midRequired\(string s, object parameters/);
    });
});

describe ('csharp venue-private dictionary row parameter fed by a typed row parameter', () => {
    // a row argument that is another venue-private method's census-typed row parameter is a
    // dictionary too, whichever of the two methods the census reaches first
    const TMP = path.join(__dirname, 'files', 'tmp-csharp-venue-dict-row-chain');
    const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const A = path.join(TMP, 'ts', 'src', 'a.ts');
    let a: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(BASE), { recursive: true });
        fs.writeFileSync(BASE, 'export class Exchange {\n    extend (a: any, b: any = undefined): any { return a; }\n    safeString (a: any, k: any): any { return a; }\n}\n');
        fs.writeFileSync(A,
            "import { Exchange } from './base/Exchange';\n" +
            'export class A extends Exchange {\n' +
            "    f (x: any) { return [ this.outer (this.extend (x, { 'a': 1 })), this.outerBoxed (x) ]; }\n" +
            "    parseRow (row: Dict) { return this.safeString (row, 'k'); }\n" +
            "    parseBoxedRow (row: Dict) { return this.safeString (row, 'k'); }\n" +
            "    outer (message: Dict) { return this.parseRow (message); }\n" +
            "    outerBoxed (message: Dict) { return this.parseBoxedRow (message); }\n" +
            '}\n');
        const transpiler = new Transpiler({ 'verbose': false, 'csharp': { 'parser': WRAPPED_PARSER } });
        (transpiler as any).setSharedProgram([ A ]);
        a = (transpiler as any).transpileCSharpByPath(A).content;
        (transpiler as any).setSharedProgram([]);
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('a caller passing its own typed row parameter types the row', () => {
        expect(a).toContain('outer(IDictionary<string, object> message)');
        expect(a).toContain('parseRow(IDictionary<string, object> row)');
    });

    test('a caller passing a boxed parameter keeps object on both', () => {
        expect(a).toContain('outerBoxed(object message)');
        expect(a).toContain('parseBoxedRow(object row)');
    });
});
