import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const config = { 'verbose': false, 'csharp': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
const print = (src: string) => new Transpiler(config).transpileCSharp(src).content;

describe('csharp boolean parameter census (hx11 RFM-C2-C)', () => {
    test('an un-annotated `= false` parameter every caller feeds a bool prints bool?', () => {
        const out = print('class T {\n    f (flag = false) {\n        if (flag) { return 1; }\n        return 0;\n    }\n    g () {\n        return this.f (true);\n    }\n}');
        expect(out).toContain('f(bool? flag = null)');
        expect(out).toContain('if (flag == true)');
        expect(out).not.toContain('isTrue(flag)');
    });
    test('an un-annotated default fed by an object keeps the parameter object', () => {
        const out = print('class T {\n    f (flag = false) {\n        if (flag) { return 1; }\n        return 0;\n    }\n    g (x: any) {\n        const box = x[\'k\'];\n        return this.f (box);\n    }\n}');
        expect(out).toContain('f(object flag = null)');
        expect(out).toContain('isTrue(flag)');
    });
    test('this.spawn (this.method, args) counts as a call of the method', () => {
        const out = print('class T {\n    spawn (f, ...args) { return 1; }\n    load (client: any, flag: boolean) {\n        if (flag) { return 1; }\n        return 0;\n    }\n    g () {\n        return this.spawn (this.load, 1, true);\n    }\n}');
        expect(out).toContain('load(object client, bool? flag)');
    });
    test('a spawned argument the census cannot prove keeps the parameter object', () => {
        const out = print('class T {\n    spawn (f, ...args) { return 1; }\n    load (client: any, flag: boolean) {\n        if (flag) { return 1; }\n        return 0;\n    }\n    g (x: any) {\n        const box = x[\'k\'];\n        return this.spawn (this.load, 1, box);\n    }\n}');
        expect(out).toContain('load(object client, object flag)');
    });
    test('a local the build layer declares bool? is a proven argument', () => {
        const transpiler = new Transpiler(config);
        (transpiler as any).csharpTranspiler.csharpExpressionTypeResolver = (node) => ((node?.text === 'flag') && (node.parent?.kind !== undefined) && (node.parent.kind === 214 || true)) ? 'bool?' : undefined;
        const out = transpiler.transpileCSharp('class T {\n    f (flag: boolean) {\n        if (flag) { return 1; }\n        return 0;\n    }\n    g (params: any) {\n        const [ flag, rest ] = this.h (params);\n        return this.f (flag);\n    }\n    h (params: any): [boolean | undefined, any] {\n        return [ undefined, params ];\n    }\n}').content;
        expect(out).toContain('f(bool? flag)');
    });
});

describe('csharp bool-declared call typed in a subclass (hx11 RFM-C2-C)', () => {
    test('a local fed by an inherited bool-returning method is bool', () => {
        const out = print('class R {\n}\nclass A extends R {\n    isOk (): boolean {\n        return true;\n    }\n}\nclass B extends A {\n    f () {\n        const ok = this.isOk ();\n        if (ok) { return 1; }\n        return 0;\n    }\n}');
        expect(out).toContain('bool ok = this.isOk()');
        expect(out).toContain('if (ok)');
    });
});

describe('csharp bool-declared call on a root class (hx11 RFM-C2-C)', () => {
    test('a method inherited from a class with no parent keeps the object box', () => {
        const out = print('class A {\n    isOk (): boolean {\n        return true;\n    }\n}\nclass B extends A {\n    f () {\n        const ok = this.isOk ();\n        if (ok) { return 1; }\n        return 0;\n    }\n}');
        expect(out).toContain('object ok = this.isOk()');
    });
});
