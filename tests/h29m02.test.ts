import fs from 'fs';
import path from 'path';
import * as os from 'os';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD =
    'type Str = string | undefined;\n' +
    'type Dict = { [key: string]: any };\n' +
    'interface MarketInterface { id: Str; symbol: string; base: string; quote: string; spot: boolean; info: any; }\n' +
    'export class ex {\n' +
    '    market (symbol: string): MarketInterface { return undefined; }\n' +
    '    safeMarket (id: Str): MarketInterface { return undefined; }\n' +
    '    take (x: any): Dict { return {}; }\n    safeString (o: any, k: any, d: any = undefined): Str { return undefined; }\n';
const print = (body: string, on: boolean = true): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h29m02-'));
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
const fn = (lines: string): string => '    f (symbol: string) {\n' + lines + '    }\n';

describe ('h29m02: a this.market row base/quote that escapes is a nil-guarded field address', () => {
    test ('positive: a this.market row quote that escapes keeps nil for an absent quote', () => {
        const go = print (fn ('        const market = this.market (symbol);\n        const q = market["quote"];\n        return this.take ({ "c": q });\n'));
        expect (go).toContain ('q = &market.QuoteCurrency');
        expect (go).not.toContain ('SafeStringPtr(');
    });
    test ('negative: a safeMarket row quote annotated string keeps the map read, no unguarded address', () => {
        const go = print (fn ('        const market = this.safeMarket (symbol);\n        const q: string = market["quote"];\n        return this.take ({ "c": q });\n'));
        expect (go).not.toContain ('= &market.QuoteCurrency\n');
    });
    test ('negative: rows switched off keep the map read', () => {
        const go = print (fn ('        const market = this.market (symbol);\n        const q = market["quote"];\n        return this.take ({ "c": q });\n'), false);
        expect (go).not.toContain ('market.QuoteCurrency');
    });
    test ('positive: safeString of a safeMarket row symbol is the nil-guarded field address', () => {
        const go = print (fn ('        const m = this.safeMarket (symbol);\n        const s = this.safeString (m, "symbol");\n        return this.take (s);\n'));
        expect (go).toContain ('var s *string\n');
        expect (go).toContain ('if m.Symbol != "" {');
        expect (go).not.toContain ('var s *string = m.Symbol');
    });
    test ('negative: safeString of the symbol outside a declaration never prints the bare value field', () => {
        const go = print (fn ('        const m = this.safeMarket (symbol);\n        return this.take (this.safeString (m, "symbol"));\n'));
        expect (go).not.toContain ('Take(m.Symbol)');
    });
});
