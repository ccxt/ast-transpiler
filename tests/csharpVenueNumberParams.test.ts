import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as path from 'path';

const WRAPPED_PARSER = { 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(', 'ELEMENT_ACCESS_WRAPPER_CLOSE': ')' };

describe ('csharp venue-private number parameters', () => {
    // a venue-private `int` / `number` parameter prints the numeric kind every caller of its
    // venue class chain passes; one boxed argument keeps it `object`
    const TMP = path.join(__dirname, 'files', 'tmp-csharp-venue-number-parameters');
    const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const A = path.join(TMP, 'ts', 'src', 'a.ts');
    const B = path.join(TMP, 'ts', 'src', 'b.ts');
    let a: string;
    let b: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(BASE), { recursive: true });
        fs.writeFileSync(BASE, 'export class Exchange {\n    parseTimeframe (t: string): number { return 60; }\n    safeInteger (o: any, k: any, d: any = undefined): number { return d; }\n}\n');
        fs.writeFileSync(A,
            "import { Exchange } from './base/Exchange';\n" +
            'export class A extends Exchange {\n' +
            "    f (x: any, limit: number = undefined) { const d = this.parseTimeframe ('1m'); const n = this.safeInteger (x, 'n', 1); return this.period (d, n) + this.boxed (x) + this.mixed (d, x) + this.optional (limit); }\n" +
            '    period (duration: number, count: number): string { if (duration < 3600) { return \'m\'; } return (count > 5) ? \'a\' : \'b\'; }\n' +
            '    boxed (v: number): string { return (v < 3) ? \'x\' : \'y\'; }\n' +
            '    mixed (u: number, w: number): string { return (u < w) ? \'x\' : \'y\'; }\n' +
            '    optional (q: number): string { return (q === undefined) ? \'x\' : \'y\'; }\n' +
            '}\n');
        fs.writeFileSync(B,
            "import { Exchange } from './base/Exchange';\n" +
            "import { A } from './a';\n" +
            'export class B extends Exchange {\n' +
            "    f (x: any) { return this.boxed (x); }\n" +
            '    boxed (v: number): string { return (v < 3) ? \'x\' : \'y\'; }\n' +
            '}\n' +
            'export const unusedA = A;\n');
        const transpiler = new Transpiler({ 'verbose': false, 'csharp': { 'parser': WRAPPED_PARSER } });
        (transpiler as any).setSharedProgram([ A, B ]);
        a = (transpiler as any).transpileCSharpByPath(A).content;
        b = (transpiler as any).transpileCSharpByPath(B).content;
        (transpiler as any).setSharedProgram([]);
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('a parameter every chain caller passes a typed integer prints Int64 / Int64? and takes operators', () => {
        expect(a).toContain('period(object duration, Int64? count)');
        expect(a).toContain('(count > 5)');
    });

    test('an object argument keeps the parameter object (nil / wrong kind stay on the helper)', () => {
        expect(a).toContain('boxed(object v)');
        expect(a).toContain('isLessThan(v, 3)');
        expect(a).toContain('mixed(object u, object w)');
    });

    test('a missing argument (optional caller value of unknown kind) keeps object', () => {
        expect(a).toContain('optional(object q)');
    });

    test('the other venue\'s same-named method keeps its own spelling', () => {
        expect(b).toContain('boxed(object v)');
    });
});

describe ('csharp venue-private string parameters', () => {
    // a required `string` / `Str` parameter prints `string` when every caller of its venue class
    // chain passes a non-null C# string; a boxed, nullable or omitted argument keeps `object`
    const TMP = path.join(__dirname, 'files', 'tmp-csharp-venue-string-parameters');
    const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const A = path.join(TMP, 'ts', 'src', 'a.ts');
    let a: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(BASE), { recursive: true });
        fs.writeFileSync(BASE, 'export class Exchange {\n    safeString (o: any, k: any, d: any = undefined): string { return d; }\n}\n');
        fs.writeFileSync(A,
            "import { Exchange } from './base/Exchange';\n" +
            'export class A extends Exchange {\n' +
            "    f (x: any) { const t: string = 'spot'; const s = this.safeString (x, 's'); return this.login (t) + this.login ('swap') + this.same (t, 'a') + this.boxed (x) + this.nullable (s) + this.rebound (t); }\n" +
            "    login (messageType: string): string { return messageType + '.login'; }\n" +
            "    same (u: Str, w: string): boolean { return u === w; }\n" +
            "    boxed (v: string): string { return v + '.x'; }\n" +
            "    nullable (n: Str): string { return n + '.x'; }\n" +
            "    rebound (r: string): string { r = r + 'y'; return r; }\n" +
            '}\n' +
            'type Str = string | undefined;\n');
        const transpiler = new Transpiler({ 'verbose': false, 'csharp': { 'parser': WRAPPED_PARSER } });
        (transpiler as any).setSharedProgram([ A ]);
        a = (transpiler as any).transpileCSharpByPath(A).content;
        (transpiler as any).setSharedProgram([]);
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('every caller passes a non-null string: the parameter prints string and + / == go native', () => {
        expect(a).toContain('login(string messageType)');
        expect(a).toContain('(messageType + ".login")');
        expect(a).toContain('same(string u, string w)');
        expect(a).toContain('(u == w)');
    });

    test('a boxed argument (wrong kind) keeps object and the helper', () => {
        expect(a).toContain('boxed(object v)');
    });

    test('a nullable argument (nil / missing key) keeps object', () => {
        expect(a).toContain('nullable(object n)');
    });

    test('a parameter the body writes keeps object', () => {
        expect(a).toContain('rebound(object r)');
    });
});

describe ('csharp venue-private string parameters fed by a build-layer string local', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-csharp-venue-string-resolved');
    const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const A = path.join(TMP, 'ts', 'src', 'a.ts');
    let a: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(BASE), { recursive: true });
        fs.writeFileSync(BASE, 'export class Exchange {\n    kind (x: any): string { return x; }\n}\n');
        fs.writeFileSync(A,
            "import { Exchange } from './base/Exchange';\n" +
            'export class A extends Exchange {\n' +
            "    f (x: any) { const m = this.kind (x); const o = this.kind (x); return this.auth (m) + this.other (o); }\n" +
            "    auth (messageType: string): string { return messageType + '.login'; }\n" +
            "    other (v: string): string { return v + '.x'; }\n" +
            '}\n');
        const transpiler = new Transpiler({ 'verbose': false, 'csharp': { 'parser': WRAPPED_PARSER } });
        // the embedding layer declares `m` a string and leaves `o` unanswered
        (transpiler as any).csharpTranspiler.csharpExpressionTypeResolver = (node) => ((node?.text === 'm') ? 'string' : undefined);
        (transpiler as any).setSharedProgram([ A ]);
        a = (transpiler as any).transpileCSharpByPath(A).content;
        (transpiler as any).setSharedProgram([]);
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('a local the build layer declares string types the parameter', () => {
        expect(a).toContain('auth(string messageType)');
        expect(a).toContain('(messageType + ".login")');
    });

    test('an unanswered local keeps object', () => {
        expect(a).toContain('other(object v)');
    });
});

describe ('csharp venue-private nullable number parameters', () => {
    // a sync venue-private `Num` / `= undefined` number parameter prints the nullable kind every
    // caller passes (typed locals, numeric literals, parameters the host types); a boxed argument keeps object
    const TMP = path.join(__dirname, 'files', 'tmp-csharp-venue-nullable-number-parameters');
    const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const A = path.join(TMP, 'ts', 'src', 'a.ts');
    let a: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(BASE), { recursive: true });
        fs.writeFileSync(BASE, 'export type Num = number | undefined;\nexport class Exchange {\n    safeNumber (o: any, k: any, d: any = undefined): Num { return d; }\n}\n');
        fs.writeFileSync(A,
            "import { Exchange } from './base/Exchange';\n" +
            "import type { Num } from './base/Exchange';\n" +
            'export class A extends Exchange {\n' +
            "    f (x: any) { const p = this.safeNumber (x, 'p'); const q = this.safeNumber (x, 'q'); return [ this.req (q, p), this.req (q), this.mixed (0), this.mixed (q), this.boxed (x), this.boxed (q) ]; }\n" +
            '    req (amount: Num, price: Num = undefined): string { return (price === undefined) ? \'m\' : \'l\'; }\n' +
            '    boxed (amount: Num): string { return (amount === undefined) ? \'m\' : \'l\'; }\n' +
            '    mixed (amount: Num): string { return (amount === undefined) ? \'m\' : \'l\'; }\n' +
            '}\n');
        const transpiler = new Transpiler({ 'verbose': false, 'csharp': { 'parser': WRAPPED_PARSER } });
        (transpiler as any).setSharedProgram([ A ]);
        a = (transpiler as any).transpileCSharpByPath(A).content;
        (transpiler as any).setSharedProgram([]);
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('typed nullable arguments and an omitted default print double?', () => {
        expect(a).toContain('req(double? amount, double? price = null)');
    });

    test('one object argument (nil / wrong kind unknown) keeps object', () => {
        expect(a).toContain('boxed(object amount)');
    });

    test('an integer literal next to a double argument (two kinds) keeps object', () => {
        expect(a).toContain('mixed(object amount)');
    });
});

describe ('csharp venue-private nullable number parameters seen from the pro file', () => {
    // the venue's pro file is printed in another batch: its calls join the census (an unwritten
    // parameter the core table prints double), a boxed argument or an override keeps object
    const TMP = path.join(__dirname, 'files', 'tmp-csharp-venue-pro-number-parameters');
    const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const A = path.join(TMP, 'ts', 'src', 'a.ts');
    const PRO = path.join(TMP, 'ts', 'src', 'pro', 'a.ts');
    let a: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(BASE), { recursive: true });
        fs.mkdirSync(path.dirname(PRO), { recursive: true });
        fs.writeFileSync(BASE, 'export type Num = number | undefined;\nexport type int = number;\nexport class Exchange {\n    safeNumber (o: any, k: any, d: any = undefined): Num { return d; }\n    seconds (): int { return 1; }\n    any (): any { return 1; }\n}\n');
        fs.writeFileSync(A,
            "import { Exchange } from './base/Exchange';\n" +
            "import type { Num } from './base/Exchange';\n" +
            'export class A extends Exchange {\n' +
            "    f (x: any) { const p = this.safeNumber (x, 'p'); const q = this.safeNumber (x, 'q'); return [ this.req (q, p), this.boxedPro (q), this.override (q), this.written (q) ]; }\n" +
            '    req (amount: Num, price: Num = undefined): string { return (price === undefined) ? \'m\' : \'l\'; }\n' +
            '    boxedPro (amount: Num): string { return (amount === undefined) ? \'m\' : \'l\'; }\n' +
            '    override (amount: Num): string { return (amount === undefined) ? \'m\' : \'l\'; }\n' +
            '    written (amount: Num): string { return (amount === undefined) ? \'m\' : \'l\'; }\n' +
            '    required (amount: number): string { return (amount < 1) ? \'m\' : \'l\'; }\n' +
            '    g () { return this.required (2.5); }\n' +
            '    stamp (seconds: number): string { return (seconds < 1) ? \'m\' : \'l\'; }\n' +
            '    h () { const s = this.seconds (); return this.stamp (s); }\n' +
            '    loose (seconds: number): string { return (seconds < 1) ? \'m\' : \'l\'; }\n' +
            '    k () { const s = this.seconds (); return this.loose (s); }\n' +
            '}\n');
        fs.writeFileSync(PRO,
            "import { A } from '../a';\n" +
            'export class B extends A {\n' +
            '    createOrderWs (symbol: string, type: string, side: string, amount: number, price: Num = undefined, params = {}) { return this.req (amount, price); }\n' +
            '    editOrderWs (id: string, symbol: string, type: string, side: string, amount: Num = undefined, price: Num = undefined, params = {}) { return this.boxedPro (params); }\n' +
            '    override (amount: Num): string { return \'o\'; }\n' +
            '    createOrder (symbol: string, type: string, side: string, amount: number, price: Num = undefined) { amount = 1; return this.written (amount); }\n' +
            '    withdrawWs (code: string, amount: number) { return this.required (amount); }\n' +
            '    authWs () { const s = this.seconds (); return this.stamp (s); }\n' +
            '    authLoose () { const s = this.any (); return this.loose (s); }\n' +
            '}\n');
        const config = { 'parser': WRAPPED_PARSER, 'coreArgTypes': { 'createOrderWs': { 3: 'double', 4: 'double?' }, 'editOrderWs': { 4: 'double?', 5: 'double?' }, 'createOrder': { 3: 'double', 4: 'double?' } } };
        const transpiler = new Transpiler({ 'verbose': false, 'csharp': config });
        (transpiler as any).setSharedProgram([ A ]);
        a = (transpiler as any).transpileCSharpByPath(A).content;
        (transpiler as any).setSharedProgram([]);
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('a pro call passing the core-typed double / double? parameters keeps the nullable kind', () => {
        expect(a).toContain('req(double? amount, double? price = null)');
    });

    test('a pro call passing a boxed value keeps object', () => {
        expect(a).toContain('boxedPro(object amount)');
    });

    test('a pro override keeps object', () => {
        expect(a).toContain('override(object amount)');
    });

    test('a pro call passing a written parameter keeps object', () => {
        expect(a).toContain('written(object amount)');
    });

    test('a pro call passing a const local of an int-declared method keeps Int64', () => {
        expect(a).toContain('stamp(Int64 seconds)');
    });

    test('a pro call passing a const local of an any-declared method keeps object', () => {
        expect(a).toContain('loose(object seconds)');
    });

    test('a required number parameter a pro call feeds an untyped parameter keeps object', () => {
        expect(a).toContain('required(object amount)');
    });
});
