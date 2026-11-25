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
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h29parent-'));
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
const M = 'market: MarketInterface';


// the value-string market fields (h27-M02: symbol / base / quote are Go `string`) never take the nil-guarded pointer
// store and compare forms of h28-M01, h29-M01 and h29-M05
describe ('h29-parent: value-string market fields keep out of the pointer row forms', () => {
    const bad = (go: string) => {
        expect (go).not.toMatch (/market\.(Symbol|BaseCurrency) != nil/);
        expect (go).not.toMatch (/market\.(Symbol|BaseCurrency) == nil/);
        expect (go).not.toMatch (/\*market\.(Symbol|BaseCurrency)/);
    };
    test ('statement store of market symbol into a request map', () => {
        const go = print (fn ('symbol: string', '        const request = {};\n        const market = this.market (symbol);\n        request["symbol"] = market["symbol"];\n        return request;\n'));
        bad (go);
    });
    test ('map-literal entry reading market symbol and base', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        const request: Dict = { "s": market["symbol"], "b": market["base"] };\n        return request;\n'));
        bad (go);
    });
    test ('market symbol compared with a literal', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        if (market["symbol"] === "BTC/USDT") {\n            return 1;\n        }\n        return 2;\n'));
        bad (go);
    });
    test ('a pointer field of the same row still takes the guarded store', () => {
        const go = print (fn ('symbol: string', '        const request = {};\n        const market = this.market (symbol);\n        request["symbol"] = market["id"];\n        return request;\n'));
        expect (go).toContain ('if market.Id != nil {');
        expect (go).toContain ('request["symbol"] = *market.Id');
    });
});
