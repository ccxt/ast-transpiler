import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

const root = path.join (__dirname, 'files', 'tmp-h51g47', 'ts', 'src');
const BASE = 'export type Dict = { [key: string]: any };\n' +
    'export class BaseExchange {\n' +
    '    options: Dict;\n' +
    '    markets: Dict = undefined;\n' +
    '    currencies: Dict = {};\n' +
    '    safeDict (o: any, k: any, d: any = undefined): any { return d; }\n' +
    '    safeString (o: any, k: any, d: any = undefined): string { return d; }\n' +
    '}\nexport class Exchange extends BaseExchange {}\nexport class PredictionExchange extends Exchange {\n' +
    '    outcomes_by_id: Dict = undefined;\n}\nexport default Exchange;\n';
const print = (body: string, base = 'Exchange'): string => {
    fs.mkdirSync (path.join (root, 'base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
    fs.writeFileSync (path.join (root, 'ex.ts'), `import { ${base}, Dict } from './base/Exchange';\nexport default class ex extends ${base} {\n` +
        '    markets_like: Dict = {};\n' +
        '    f (code: string, other: Dict, k: any): any {\n' +
        "        const s: string = 'x' + this.safeString (other, 'c', 'y');\n        const p = this.safeString (other, 'p');\n" + body + '    }\n}\n');
    const t = new Transpiler ({ verbose: false, go: { predictionMapFields: [ 'Outcomes', 'Outcomes_by_id' ] } });
    return t.transpileGoByPath (path.join (root, 'ex.ts')).content;
};

describe ('h51g47: safeDict reads of the typed market tables and outcome caches', () => {
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h51g47'), { recursive: true, force: true }));
    test ('a string key on this.currencies prints the comma-ok read', () => {
        const out = print ('        const c = this.safeDict (this.currencies, s);\n        return this.safeString (c, code);\n');
        expect (out).toContain ('\tvar c, _ = this.Currencies[s].(map[string]any)\n');
        expect (out).not.toContain ('SafeMapTyped(this.Currencies');
    });
    test ('a string key on this.markets with a read-only {} default prints the comma-ok read', () => {
        const out = print ('        const m: Dict = this.safeDict (this.markets, s, {});\n        return this.safeString (m, code);\n');
        expect (out).toContain ('\tvar m, _ = this.Markets[s].(map[string]any)\n');
    });
    test ('a string key on the prediction outcome cache prints the comma-ok read', () => {
        const out = print ('        const o = this.safeDict (this.outcomes_by_id, s);\n        return this.safeString (o, code);\n', 'PredictionExchange');
        expect (out).toContain ('\tvar o, _ = this.Outcomes_by_id[s].(map[string]any)\n');
    });
    test ('a nil-able string key reads under a nil test (nil key: nil map)', () => {
        const out = print ('        const c = this.safeDict (this.currencies, p);\n        return this.safeString (c, code);\n');
        expect (out).toContain ('\tvar c map[string]any\n\tif p != nil {\n\t\tc, _ = this.Currencies[*p].(map[string]any)\n\t}\n');
    });
    test ('an any key on a market table keeps the helper (nil key)', () => {
        const out = print ('        const c = this.safeDict (this.currencies, k);\n        return this.safeString (c, code);\n');
        expect (out).not.toContain ('this.Currencies[k].(map[string]any)');
    });
    test ('a field that is not a market table keeps the helper (wrong receiver)', () => {
        const out = print ('        const c = this.safeDict (this.markets_like, s);\n        return this.safeString (c, code);\n');
        expect (out).not.toContain ('this.Markets_like[s].(map[string]any)');
    });
});
