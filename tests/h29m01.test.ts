import fs from 'fs';
import path from 'path';
import * as os from 'os';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD =
    'type Str = string | undefined;\n' +
    'type Num = number | undefined;\n' +
    'type Bool = boolean | undefined;\n' +
    'type Dict = { [key: string]: any };\n' +
    'interface MinMax { min: Num; max: Num; }\n' +
    'interface Precision { amount: Num; price: Num; }\n' +
    'interface MarketInterface { id: Str; type: Str; symbol: string; base: string; spot: boolean; linear: Bool; contractSize: Num;\n' +
    '    precision: Precision; limits: { amount?: MinMax }; info: any; }\n' +
    'interface CurrencyInterface { id: string; code: string; precision: number; info: any; }\n' +
    'type Market = MarketInterface | undefined;\n' +
    'export class ex {\n' +
    '    market (symbol: string): MarketInterface { return undefined; }\n' +
    '    currency (code: string): CurrencyInterface { return undefined; }\n' +
    '    safeMarket (id: Str): MarketInterface { return undefined; }\n' +
    '    safeCurrency (id: Str): CurrencyInterface { return undefined; }\n' +
    '    parseX (x: any, market: Market = undefined): Dict { return {}; }\n' +
    '    safeString (x: any, k: any): Str { return undefined; }\n';
const print = (body: string, on: boolean = true): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h29m01-'));
    fs.mkdirSync (path.join (dir, 'ts', 'src'), { recursive: true });
    fs.writeFileSync (path.join (dir, 'ts', 'src', 'ex.ts'), HEAD + body + '}\n');
    const cwd = process.cwd ();
    try {
        process.chdir (dir);
        const go: any = { 'parser': { 'NUM_LINES_END_FILE': 0 } };
        if (on) {
            go['nativeStoreFields'] = { 'markets': { 'rowStructReads': true, 'mapStorage': true } };
        }
        const x = new Transpiler ({ 'verbose': false, 'go': go });
        installCcxtGoLocalTypes (x.goTranspiler);
        return x.transpileGoByPath ('ts/src/ex.ts').content;
    } finally {
        process.chdir (cwd);
        fs.rmSync (dir, { recursive: true, force: true });
    }
};
const fn = (params: string, lines: string): string =>
    '    f (' + params + ') {\n' + lines + '    }\n';

describe ('h29m01: typed-binder *string field as an entry of a local map literal', () => {
    test ('positive: entry prints nil and a guarded store follows the statement', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        const request: Dict = {\n            \'pair\': market[\'id\'],\n            \'size\': 1,\n        };\n        return request;\n'));
        expect (go).toContain ('var market MarketInterface = MarketInterfaceFromMap(this.Market(symbol))');
        expect (go).toMatch (/"pair": +nil,/);
        expect (go).toContain ('}\n\tif market.Id != nil {\n\t\trequest["pair"] = *market.Id\n\t}\n\treturn request');
        expect (go).not.toContain ('market["id"]');
        expect (go).not.toContain ('ToMap(');
    });
    test ('negative: a returned literal keeps the map binder', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        return {\n            \'pair\': market[\'id\'],\n        };\n'));
        expect (go).not.toContain ('var market MarketInterface');
        expect (go).not.toContain ('*market.Id');
    });
    test ('negative: a nil-tested binder is not typed (no dereference)', () => {
        const go = print (fn ('symbol: string', '        const market = this.safeMarket (symbol);\n        if (market === undefined) {\n            return undefined;\n        }\n        const request = {\n            \'pair\': market[\'id\'],\n        };\n        return request;\n'));
        expect (go).not.toContain ('var market MarketInterface');
        expect (go).not.toContain ('*market.Id');
    });
    test ('negative: a non-*string field (a *bool) keeps the map binder', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        const request = {\n            \'lin\': market[\'linear\'],\n        };\n        return request;\n'));
        expect (go).not.toContain ('var market MarketInterface');
    });
    test ('negative: rows off prints the map read', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        const request = {\n            \'pair\': market[\'id\'],\n        };\n        return request;\n'), false);
        expect (go).not.toContain ('MarketInterface');
        expect (go).not.toContain ('*market.Id');
    });
    test ('negative: a literal assigned to an any-typed local keeps the map binder', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        const request: any = {\n            \'pair\': market[\'id\'],\n        };\n        return request;\n'));
        expect (go).not.toContain ('*market.Id');
    });
});
