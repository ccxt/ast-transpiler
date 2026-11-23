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
