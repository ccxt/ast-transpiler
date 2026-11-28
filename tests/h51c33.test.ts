import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as path from 'path';

const WRAPPED_PARSER = { 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(', 'ELEMENT_ACCESS_WRAPPER_CLOSE': ')' };

describe ('h51c33 csharp venue-private int parameters compared natively', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-h51c33');
    const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const A = path.join(TMP, 'ts', 'src', 'a.ts');
    const AU = path.join(TMP, 'ts', 'src', 'au.ts');
    const P = path.join(TMP, 'ts', 'src', 'pro', 'a.ts');
    const ABS = path.join(TMP, 'ts', 'src', 'abstract', 'au.ts');
    let a: string;
    let au: string;
    let p: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(P), { recursive: true });
        fs.mkdirSync(path.dirname(BASE), { recursive: true });
        fs.mkdirSync(path.dirname(ABS), { recursive: true });
        fs.writeFileSync(ABS, "import _a from '../a';\nabstract class a extends _a {\n}\nexport default a;\n");
        fs.writeFileSync(BASE, 'export class Exchange {\n    async transfer (code: string, amount: number, params = {}): Promise<any> { return {}; }\n}\n');
        fs.writeFileSync(A,
            "import { Exchange } from './base/Exchange';\n" +
            'export class A extends Exchange {\n' +
            '    async futuresTransfer (code: string, amount: number, type: number, params = {}): Promise<any> {\n' +
            '        if ((type < 1) || (type > 4)) {\n' +
            "            throw new Error ('x');\n" +
            '        }\n' +
            '        return {};\n' +
            '    }\n' +
            '    g (kind: number): string {\n' +
            "        return (kind < 1) ? 'x' : 'y';\n" +
            '    }\n' +
            '}\n');
        fs.writeFileSync(AU,
            "import a from './abstract/au';\n" +
            'export class AU extends a {\n' +
            '    async transferIn (code: string, amount: number, params = {}): Promise<any> {\n' +
            '        return await this.futuresTransfer (code, amount, 1, params);\n' +
            '    }\n' +
            '    h (x: any): string {\n' +
            '        return this.g (x);\n' +
            '    }\n' +
            '}\n');
        fs.writeFileSync(P,
            "import ARest from '../a';\n" +
            'export class AP extends ARest {\n' +
            '    async many (channels: string[], params = {}): Promise<any> {\n' +
            '        for (let i = 0; i < channels.length; i++) {\n' +
            '            await this.from (channels, i + 1, params);\n' +
            '        }\n' +
            '        return true;\n' +
            '    }\n' +
            '    async from (channels: string[], start: number, params = {}): Promise<any> {\n' +
            '        let refused = 0;\n' +
            '        for (let i = 0; i < channels.length; i++) {\n' +
            '            if (i >= start) {\n' +
            '                refused = refused + 1;\n' +
            '            }\n' +
            '        }\n' +
            '        return refused;\n' +
            '    }\n' +
            '}\n');
        fs.appendFileSync(A, 'export default A;\n');
        const transpiler = new Transpiler({ 'verbose': false, 'csharp': { 'parser': WRAPPED_PARSER } });
        (transpiler as any).setSharedProgram([ A, ABS, AU, P ]);
        a = (transpiler as any).transpileCSharpByPath(A).content;
        au = (transpiler as any).transpileCSharpByPath(AU).content;
        p = (transpiler as any).transpileCSharpByPath(P).content;
        (transpiler as any).setSharedProgram([]);
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('a parameter only subclasses of its venue chain pass integer literals to prints Int64 and compares natively', () => {
        expect(a).toContain('futuresTransfer(object code, object amount, Int64 type, object parameters = null)');
        expect(a).toContain('if (((type < 1)) || ((type > 4)))');
        expect(au).toContain('this.futuresTransfer(code, amount, 1, parameters)');
    });

    test('a subclass call with a boxed argument keeps the parameter object and the helper', () => {
        expect(a).toContain('g(object kind)');
        expect(a).toContain('isLessThan(kind, 1)');
    });

    test('the pro file is unchanged by the subclass rule', () => {
        expect(p).toContain('isGreaterThanOrEqual(i, start)');
    });
});
