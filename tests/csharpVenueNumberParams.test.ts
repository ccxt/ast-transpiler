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
