import { Transpiler, installCcxtGoHooks } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('go guarded string-list read after an untested or out-of-range length check hoists typed', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h19g02-'));
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
    test('a length bound to a local but not tested on the path hoists typed', () => {
        const out = run('        let one = false;\n        if (opt !== undefined) {\n            const length = opt.length;\n            one = length === 1;\n            const market = this.market (opt[0]);\n            return market;\n        }\n        return one;\n');
        expect(out).toMatch(hoisted('opt', '\t\t'));
        expect(out).toContain('opt != nil');
    });
    test('a read under `length === 0` keeps the guard, hoisted typed', () => {
        const out = run('        if (opt !== undefined) {\n            const n = opt.length;\n            if (n === 0) {\n                const market = this.market (opt[0]);\n                return market;\n            }\n        }\n        return undefined;\n');
        expect(out).toMatch(hoisted('opt', '\t\t\t'));
    });
    test('a read under `length === 1` is left to the in-range proof', () => {
        const out = run('        if (opt !== undefined) {\n            const n = opt.length;\n            if (n === 1) {\n                const market = this.market (opt[0]);\n                return market;\n            }\n        }\n        return undefined;\n');
        expect(out).not.toMatch(/optElem\d+/);
    });
    test('a length tested by an earlier sibling if is left to the in-range proof', () => {
        const out = run("        const normalized = this.marketSymbols (symbols);\n        const n = normalized.length;\n        if (n === 0) {\n            throw new Error ('x');\n        }\n        const market = this.market (normalized[0]);\n        return market;\n");
        expect(out).not.toMatch(/normalizedElem\d+/);
    });
    test('an element write still keeps the boxed read', () => {
        const out = run("        if (opt !== undefined) {\n            const length = opt.length;\n            opt[0] = 'x';\n            const market = this.market (opt[0]);\n            return market;\n        }\n        return length;\n");
        expect(out).not.toMatch(/optElem\d+/);
    });
});
