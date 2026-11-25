import { Transpiler, installCcxtGoHooks } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('go guarded string-list read as the symbol argument hoists into a typed *string local', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h18g02-'));
    afterAll(() => { fs.rmSync(tmp, { 'recursive': true, 'force': true }); });
    const run = (body: string): string => {
        const dir = path.join(tmp, 'ts', 'src');
        fs.mkdirSync(dir, { 'recursive': true });
        const file = path.join(dir, 'venue.ts');
        fs.writeFileSync(file, 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\ntype Strings = string[] | undefined;\nclass Exchange {\n'
            + '    marketSymbols (s: any, t: any = undefined, e: any = true): string[] { return s; }\n    market (symbol: Str): Dict { return {}; }\n'
            + '    getTypeByMarket (m: Dict): string { return "a"; }\n    safeString (a: any, b: any, c: any = undefined): Str { return a; }\n}\n'
            + 'class venue extends Exchange {\n    run (symbols: string[], opt: Strings = undefined) {\n' + body + '    }\n}\n');
        const inst: any = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
        installCcxtGoHooks(inst.goTranspiler);
        return inst.transpileGoByPath(file).content;
    };
    const hoisted = (list: string, iden = '\t') => new RegExp(iden.replace(/\t/g, '\\t') + 'var ' + list + 'Elem\\d+ \\*string = nil\\n' + iden.replace(/\t/g, '\\t')
        + 'if 0 >= 0 && 0 < len\\(' + list + '\\) \\{\\n\\t*' + list + 'Elem\\d+ = &' + list + '\\[0\\]\\n\\t*\\}\\n\\t*var market map\\[string\\]any = this\\.Market\\(' + list + 'Elem\\d+\\)');
    test('a marketSymbols list read passed to market() hoists typed', () => {
        const out = run('        const normalized = this.marketSymbols (symbols);\n        const market = this.market (normalized[0]);\n        return this.getTypeByMarket (market);\n');
        expect(out).toMatch(hoisted('normalized'));
        expect(out).not.toContain('GetValue(normalized, 0)');
    });
    test('an optional string[] parameter read hoists typed and keeps the nil answer', () => {
        const out = run('        if (opt !== undefined) {\n            const market = this.market (opt[0]);\n            return market;\n        }\n        return undefined;\n');
        expect(out).toMatch(hoisted('opt', '\t\t'));
        expect(out).toContain('opt != nil');
    });
    test('a list whose element is written keeps the boxed read', () => {
        const out = run("        const normalized = this.marketSymbols (symbols);\n        normalized[0] = 'x';\n        const market = this.market (normalized[0]);\n        return market;\n");
        expect(out).not.toMatch(/normalizedElem\d+/);
    });
    test('a read after a length test is left to the in-range proof', () => {
        const out = run('        const normalized = this.marketSymbols (symbols);\n        if (normalized.length > 0) {\n            const market = this.market (normalized[0]);\n            return market;\n        }\n        return undefined;\n');
        expect(out).not.toMatch(/normalizedElem\d+/);
    });
    test('a non-market callee and a non-pure later argument are left alone', () => {
        const out = run("        const normalized = this.marketSymbols (symbols);\n        const s = this.safeString (normalized[0], 'id');\n        return s;\n");
        expect(out).not.toMatch(/normalizedElem\d+/);
    });
});
