import { Transpiler, installCcxtGoHooks, installCcxtGoLocalTypes } from '../src/transpiler';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

// PredictionExchange.rlpEncodeList / intToRlpHex return a Go string (CCXT_GO_HELPER_RETURN_TYPES rows)
describe('RlpEncodeList / IntToRlpHex return a Go string', () => {
    const run = (body: string) => {
        const t = new Transpiler({ verbose: false, go: {} } as any);
        installCcxtGoHooks((t as any).goTranspiler);
        installCcxtGoLocalTypes((t as any).goTranspiler);
        return t.transpileGo("class PredictionExchange {\n    rlpEncodeList (items: string[]): string { return ''; }\n    intToRlpHex (value: Int): string { return ''; }\n    rlpOther (items: string[]): string { return ''; }\n" + body + "}\n").content;
    };
    test('the encoded list is a string: native local and concat', () => {
        const out = run("    m (fields: string[]) {\n        const accessList = this.rlpEncodeList ([]);\n        const payload = '02' + this.rlpEncodeList (fields);\n        return '0x02' + accessList + payload;\n    }\n");
        expect(out).toContain('var accessList string = this.RlpEncodeList(');
        expect(out).not.toContain('Add(');
    });
    test('intToRlpHex local is a string', () => {
        const out = run("    m (v: Int) {\n        const h = this.intToRlpHex (v);\n        return h + '00';\n    }\n");
        expect(out).toContain('var h string = this.IntToRlpHex(');
        expect(out).not.toContain('Add(h');
    });
    test('negative: another method of the same shape stays any', () => {
        const out = run("    m (fields: string[]) {\n        const x = this.rlpOther (fields);\n        return '02' + x;\n    }\n");
        expect(out).toContain('var x any = this.RlpOther(');
        expect(out).toContain('Add("02", x)');
    });
    test('negative: a local later set to nil and tested against nil keeps the box', () => {
        const out = run("    m (fields: string[]) {\n        let x = this.rlpEncodeList (fields);\n        if (fields.length === 0) { x = undefined; }\n        if (x === undefined) { return 0; }\n        return x;\n    }\n");
        expect(out).toContain('var x any = this.RlpEncodeList(');
        expect(out).toContain('x = nil');
    });
});
