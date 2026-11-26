import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const WRAPPED_PARSER = { 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(', 'ELEMENT_ACCESS_WRAPPER_CLOSE': ')' };

describe ('csharp venue string-list parameter', () => {
    // a venue `Strings` parameter whose callers pass a list prints IList<object>: the toArray goes
    const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'h55c35-'));
    const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const A = path.join(TMP, 'ts', 'src', 'a.ts');
    let a: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(BASE), { recursive: true });
        fs.writeFileSync(BASE,
            'export type Strings = string[] | undefined;\n' +
            'export class Exchange {\n    toArray (x: any): any { return x; }\n    fetchThing (x: any): any { return x; }\n}\n');
        fs.writeFileSync(A,
            "import { Exchange, Strings } from './base/Exchange';\n" +
            'export class A extends Exchange {\n' +
            "    f (): any { return this.priv ([ 'BTC' ]); }\n" +
            '    priv (codes: Strings = undefined): any { return this.toArray (codes); }\n' +
            '    g (x: any): any { const boxed = this.fetchThing (x); return this.boxedPriv (boxed); }\n' +
            '    boxedPriv (codes: Strings = undefined): any { return this.toArray (codes); }\n' +
            '    h (): any { return this.nums ([ 1 ]); }\n' +
            '    nums (xs: number[]): any { return this.toArray (xs); }\n' +
            '}\n');
        const transpiler = new Transpiler({ 'verbose': false, 'csharp': { 'parser': WRAPPED_PARSER } });
        (transpiler as any).setSharedProgram([ A ]);
        a = (transpiler as any).transpileCSharpByPath(A).content;
        (transpiler as any).setSharedProgram([]);
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('a Strings parameter whose callers pass a list prints IList<object>', () => {
        expect(a).toMatch(/priv\(IList<object>\?? codes = null\)/);
    });

    test('an object argument keeps the parameter object', () => {
        expect(a).toContain('boxedPriv(object codes = null)');
    });

    test('a number[] parameter keeps object', () => {
        expect(a).toContain('nums(object xs)');
    });
});
