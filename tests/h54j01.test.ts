import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// a parameter that is only compared (never written) passes its typed Double slot uncast
describe('java compared-only amount parameter', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-h54j01-compared-amount');
    let out: string;
    beforeAll(() => {
        fs.mkdirSync(path.join(TMP, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'types.ts'),
            'export interface Dictionary<T> { [key: string]: T; }\nexport type Dict = Dictionary<any>;\nexport type Num = number | undefined;\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts'),
            "import type { Dict } from './types';\n" +
            'export default class Exchange {\n' +
            '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
            '    async transfer (code: string, amount: number, fromAccount: string, toAccount: string, params: Dict = {}): Promise<{}> { return {}; }\n' +
            '}\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'probe.ts'),
            "import type { Dict } from './base/types';\nimport Exchange from './base/Exchange';\n" +
            'class Venue extends Exchange {\n' +
            "    async transferOut (code: string, amount: number, params: Dict = {}): Promise<{}> {\n" +
            "        if (amount === undefined) {\n            throw new Error ('amount');\n        }\n" +
            "        return await this.transfer (code, amount, 'a', 'b', params);\n    }\n" +
            '}\n');
        out = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } })
            .transpileJavaByPath(path.join(TMP, 'ts', 'src', 'probe.ts')).content;
    });
    afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

    test('a comparison is not a write: no checkcast at the call', () => {
        expect(out).toMatch(/transferOut\(\w+ code, Double amount, /);
        expect(out).not.toContain('(Double) (amount)');
    });
});

// `key.indexOf ((t as string))`: the cast hides a nullable target, null answers -1 like Helpers.getIndexOf
describe('java indexOf of an as-string target keeps the helper answer for null', () => {
    const transpiler = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
    const print = (body: string, declared = 't') => {
        const printer: any = (transpiler as any).javaTranspiler;
        const previous = printer.javaDeclaredLocalTypeResolver;
        printer.javaDeclaredLocalTypeResolver = (d: any) => (d?.name?.text === declared ? 'String' : undefined);
        try {
            return transpiler.transpileJava(
                'class T {\n' +
                '    f (key: string, parts: any[], u: string): number {\n' +
                '        const t = this.safeString (parts, 1);\n' +
                body +
                '    }\n' +
                '    safeString (x: any, k: any): any { return x; }\n' +
                '}\n').content;
        } finally {
            printer.javaDeclaredLocalTypeResolver = previous;
        }
    };

    test('the as-string target is null-guarded', () => {
        const out = print('        return key.indexOf ((t as string));\n');
        expect(out).toMatch(/\(t == null \? -1 : \(?\(?(String\))?key\)?\.indexOf\(t\)\)/);
        expect(out).not.toContain('Helpers.getIndexOf');
    });
    test('a plain string parameter target takes no guard', () => {
        const out = print('        return key.indexOf (u);\n');
        expect(out).not.toContain('u == null');
    });
});
