import { Transpiler, installCcxtGoHooks } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('venue Str returns with a nil path print *string when every caller keeps the nil', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h16g04-'));
    afterAll(() => { fs.rmSync(tmp, { 'recursive': true, 'force': true }); });
    let n = 0;
    const run = (methods: string): string => {
        const dir = path.join(tmp, String(n++), 'ts', 'src');
        fs.mkdirSync(dir, { 'recursive': true });
        const file = path.join(dir, 'venue.ts');
        fs.writeFileSync(file, 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\ntype Market = Dict;\n'
            + 'class Exchange {\n    options: Dict = {};\n    safeString (a: any, b: any, c: any = undefined): Str { return a; }\n    market (s: string): Market { return {}; }\n}\n'
            + 'class venue extends Exchange {\n' + methods + '}\n');
        const inst: any = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
        installCcxtGoHooks(inst.goTranspiler);
        return inst.transpileGoByPath(file).content;
    };
    const producer = "    getDex (market: Market): Str {\n        const baseName = this.safeString (market, 'baseName', '');\n        const part = baseName.split (':');\n"
        + "        if (part.length > 1) {\n            return this.safeString (part, 0);\n        }\n        return undefined;\n    }\n";
    const chain = "    fromSymbols (symbols: string[]): Str {\n        const dexName = this.getDex (this.market (symbols[0]));\n"
        + "        for (let i = 1; i < symbols.length; i++) {\n            const currentDexName = this.getDex (this.market (symbols[i]));\n"
        + "            if (currentDexName !== dexName) {\n                throw new Error ('x');\n            }\n        }\n        return dexName;\n    }\n";
    const guardedStore = (callee: string) => "    useIt (symbol: string) {\n        const request: Dict = {};\n        const dexName = this." + callee + " ([ symbol ]);\n"
        + "        if (dexName !== undefined) {\n            request['dex'] = dexName;\n        }\n        return request;\n    }\n";
    test('nil-guarded stores, a pointer compare and a Str pass-through type the producer and every caller local', () => {
        const out = run(producer + chain + guardedStore('fromSymbols'));
        expect(out).toMatch(/GetDex\(market [^)]*\) \*string {/);
        expect(out).toMatch(/FromSymbols\(symbols [^)]*\) \*string {/);
        expect(out).toContain('var dexName *string = this.GetDex(');
        expect(out).toContain('var currentDexName *string = this.GetDex(');
        expect(out).toContain('var dexName *string = this.FromSymbols(');
        expect(out).toContain('*currentDexName != *dexName');
    });
    test('a caller that boxes the value into a concat keeps the any signature', () => {
        const out = run(producer + "    url (m: Market) {\n        return 'a/' + this.getDex (m);\n    }\n");
        expect(out).toMatch(/GetDex\(market [^)]*\) any {/);
    });
    test('a caller that hands the possibly nil value to an any parameter keeps the any signature', () => {
        const out = run(producer + "    takes (x) {\n        return (x === undefined) ? 1 : 2;\n    }\n    use (m: Market) {\n        return this.takes (this.getDex (m));\n    }\n");
        expect(out).toMatch(/GetDex\(market [^)]*\) any {/);
    });
    test('an unguarded store of the possibly nil value keeps the any signature', () => {
        const out = run(producer + "    use (m: Market) {\n        const request: Dict = {};\n        const d = this.getDex (m);\n        request['dex'] = d;\n        return request;\n    }\n");
        expect(out).toMatch(/GetDex\(market [^)]*\) any {/);
        expect(out).not.toContain('var d *string');
    });
    test('a reassigned (let) caller local keeps the any signature', () => {
        const out = run(producer + "    use (m: Market) {\n        let d = this.getDex (m);\n        if (d === undefined) {\n            d = 'x';\n        }\n        return d;\n    }\n");
        expect(out).toMatch(/GetDex\(market [^)]*\) any {/);
    });
});
