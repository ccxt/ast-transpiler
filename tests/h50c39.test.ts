import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as path from 'path';

const WRAPPED_PARSER = { 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(', 'ELEMENT_ACCESS_WRAPPER_CLOSE': ')' };

describe ('csharp venue-private number parameters with an integer literal default', () => {
    // `multiplier: int = 1` prints `Int64? multiplier = null` when every caller passes a typed integer or omits it;
    // the `multiplier ??= 1;` prologue keeps the default
    const TMP = path.join(__dirname, 'files', 'tmp-h50c39-literal-default');
    const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const A = path.join(TMP, 'ts', 'src', 'a.ts');
    let a: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(BASE), { recursive: true });
        fs.writeFileSync(BASE, 'export class Exchange {\n    safeInteger (o: any, k: any, d: any = undefined): number { return d; }\n}\n');
        fs.writeFileSync(A,
            "import { Exchange } from './base/Exchange';\n" +
            'export class A extends Exchange {\n' +
            "    f (x: any) { return this.scaled (x, 1000) + this.scaled (x) + this.boxed (x, x) + this.fractional (x, 2) + this.later (x, 3); }\n" +
            "    scaled (x: any, multiplier: int = 1): number { const n = this.safeInteger (x, 'n'); return (multiplier > 2) ? n : 0; }\n" +
            "    boxed (x: any, m: int = 1): number { return (m > 2) ? 1 : 0; }\n" +
            "    fractional (x: any, m: number = 0.5): number { return (m > 2) ? 1 : 0; }\n" +
            "    async later (x: any, m: int = 1) { return (m > 2) ? 1 : 0; }\n" +
            '}\n' +
            'type int = number;\n');
        const transpiler = new Transpiler({ 'verbose': false, 'csharp': { 'parser': WRAPPED_PARSER } });
        (transpiler as any).setSharedProgram([ A ]);
        a = (transpiler as any).transpileCSharpByPath(A).content;
        (transpiler as any).setSharedProgram([]);
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('typed integer or omitted at every call: Int64? with the default kept', () => {
        expect(a).toContain('scaled(object x, Int64? multiplier = null)');
        expect(a).toContain('multiplier ??= 1;');
    });

    test('a boxed argument (nil / wrong kind) keeps object', () => {
        expect(a).toContain('boxed(object x, object m = null)');
    });

    test('a non-integer literal default keeps object', () => {
        expect(a).not.toContain('Int64? m = 0.5');
        expect(a).not.toContain('double? m');
    });

    test('an async method keeps its signature', () => {
        expect(a).not.toMatch(/later\(object x, Int64\?/);
    });
});
