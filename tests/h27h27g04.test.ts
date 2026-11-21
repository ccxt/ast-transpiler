import { Transpiler, installCcxtGoHooks, installCcxtGoLocalTypes } from '../src/transpiler';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

// `this.hash (x, h)` takes the declared default digest 'hex': a Go string, printed with the digest explicit
describe('two-argument hash is the hex text digest', () => {
    const run = (body: string) => {
        const t = new Transpiler({ verbose: false, go: {} } as any);
        installCcxtGoHooks((t as any).goTranspiler);
        installCcxtGoLocalTypes((t as any).goTranspiler);
        return t.transpileGo('class Exchange {\n' + body + '}\n').content;
    };
    test('positive: the local is a string and toUpperCase is native', () => {
        const out = run("    m (auth: string) {\n        const h = this.hash (this.encode (auth), sha512);\n        const u = this.hash (auth, md5).toUpperCase ();\n        return h + u;\n    }\n");
        expect(out).toContain('var h string = this.Hash(');
        expect(out).toContain('sha512, "hex")');
        expect(out).toContain('strings.ToUpper(this.Hash(');
        expect(out).not.toContain('Add(');
    });
    test('negative: a binary digest keeps the box', () => {
        const out = run("    m (auth: string) {\n        const b = this.hash (auth, sha256, 'binary');\n        return b;\n    }\n");
        expect(out).toContain('var b any = ');
        expect(out).not.toContain('"hex")');
    });
    test('negative: a local later set to undefined and nil-tested keeps the box', () => {
        const out = run("    m (auth: string) {\n        let h = this.hash (auth, md5);\n        if (auth === '') { h = undefined; }\n        if (h === undefined) { return 0; }\n        return h;\n    }\n");
        expect(out).toContain('var h any = ');
        expect(out).toContain('h = nil');
    });
});
