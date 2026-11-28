import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as path from 'path';

const WRAPPED_PARSER = { 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(', 'ELEMENT_ACCESS_WRAPPER_CLOSE': ')' };

describe ('h55c33 csharp venue-private int parameter fed by a counter sum', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-h55c33');
    const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const A = path.join(TMP, 'ts', 'src', 'a.ts');
    const AU = path.join(TMP, 'ts', 'src', 'au.ts');
    const P = path.join(TMP, 'ts', 'src', 'pro', 'a.ts');
    const ABS = path.join(TMP, 'ts', 'src', 'abstract', 'au.ts');
    let p: string;
    let pn: string;

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
        p = (transpiler as any).transpileCSharpByPath(P).content;
        (transpiler as any).setSharedProgram([]);
        // the ccxt build layer prints `i + 1` on the Int64 counter as the native operator; stand in for it here
        const native = new Transpiler({ 'verbose': false, 'csharp': { 'parser': WRAPPED_PARSER } });
        const csharp: any = (native as any).csharpTranspiler;
        const upstream = csharp.printCustomBinaryExpressionIfAny.bind(csharp);
        csharp.printCustomBinaryExpressionIfAny = (node, identation) => {
            const text = node?.getText?.();
            return ((text === 'i + 1') || (text === 'i - 1')) ? '(' + text + 'L)' : upstream(node, identation);
        };
        // and it types the `for` counter's reads Int64
        csharp.csharpExpressionTypeResolver = (node) => ((node?.text === 'i') ? 'Int64' : undefined);
        (native as any).setSharedProgram([ A, ABS, AU, P ]);
        pn = (native as any).transpileCSharpByPath(P).content;
        (native as any).setSharedProgram([]);
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('a start slot fed only by a native counter sum prints Int64 and compares natively', () => {
        expect(pn).toContain('from(object channels, Int64 start, object parameters = null)');
        expect(pn).toContain('this.from(channels, (i + 1L), parameters)');
        expect(pn).not.toContain('isGreaterThanOrEqual(i, start)');
    });

    test('a sum that still prints the add helper keeps the slot object', () => {
        expect(p).toContain('add(i, 1)');
        expect(p).toContain('object start');
        expect(p).toContain('isGreaterThanOrEqual(i, start)');
    });
});
