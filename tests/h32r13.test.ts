import { Transpiler, installCcxtGoHooks } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('go string element of a []string local or parameter', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h32r13-'));
    afterAll(() => { fs.rmSync(tmp, { 'recursive': true, 'force': true }); });
    const run = (sig: string, body: string): string => {
        const dir = path.join(tmp, 'ts', 'src');
        fs.mkdirSync(dir, { 'recursive': true });
        const file = path.join(dir, 'venue.ts');
        fs.writeFileSync(file, 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\ntype Strings = string[] | undefined;\nclass Exchange {\n    market (s: string): Dict { return {}; }\n    safeList (a: any, b: any, c: any = undefined): any[] { return a; }\n}\n'
            + 'class venue extends Exchange {\n    run (' + sig + ') {\n' + body + '    }\n}\n');
        const inst: any = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
        installCcxtGoHooks(inst.goTranspiler);
        return inst.transpileGoByPath(file).content;
    };
    const loop = "        if (symbols !== undefined) {\n        const ids = [];\n        for (let i = 0; i < symbols.length; i++) {\n            const symbol = symbols[i];\n            const market = this.market (symbol);\n            ids.push (market['id']);\n        }\n        return ids;\n        }\n        return undefined;\n";
    test('a defaulted Strings parameter', () => {
        const out = run('symbols: Strings = undefined, params: Dict = {}', loop);
        expect(out).toContain('var symbols []string = GetArgStringSlice(optionalArgs, 0, nil)');
        expect(out).toContain('var symbol string = symbols[i]');
        expect(out).not.toContain('SafeStringPtr(');
    });
    test('a string[] local', () => {
        const out = run('x: Dict', "        const symbols: string[] = [ 'a', 'b' ];\n" + loop);
        expect(out).toContain('var symbol string = symbols[i]');
    });
    test('an untyped defaulted parameter keeps the helper', () => {
        const out = run('symbols = undefined, params: Dict = {}', loop);
        expect(out).not.toContain('var symbol string = symbols[i]');
    });
    test('an index outside a length-bounded loop keeps the helper (out of range answers nil)', () => {
        const out = run('symbols: Strings = undefined', "        if (symbols !== undefined) {\n            const first = symbols[3];\n            return this.market (first);\n        }\n        return undefined;\n");
        expect(out).not.toContain('symbols[3]\n');
    });
    test('a parameter rebound to a mixed list in the loop keeps the helper', () => {
        const out = run('symbols: Strings = undefined', "        if (symbols !== undefined) {\n        for (let i = 0; i < symbols.length; i++) {\n            const symbol = symbols[i];\n            symbols.push ('x');\n            this.market (symbol);\n        }\n        }\n        return undefined;\n");
        expect(out).not.toContain('var symbol string = symbols[i]');
    });
});
