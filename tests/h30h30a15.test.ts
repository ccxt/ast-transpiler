import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// h30a15: a read-only `this.indexBy (xs, 'lit')` result holds only the map rows IndexBy copied into a fresh map,
// whatever xs is, so a safeDict of it prints the comma-ok read; written or escaping results keep the wrap
describe('h30a15: string-key indexBy result is a JSON-shaped container', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\ntype List = any[];\nclass Exchange {\n    options: Dict = {};\n'
        + '    safeString (d: any, k: any, def: any = undefined): Str { return d; }\n'
        + '    safeDict (d: any, k: any, def: any = undefined): Dict { return d; }\n'
        + '    safeList (d: any, k: any, def: any = undefined): List { return d; }\n'
        + '    indexBy (a: any, k: any): Dict { return {}; }\n'
        + '    keep (a: any): any { return a; }\n';
    const print = (body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h30a15-'));
        try {
            const dir = path.join (tmp, 'ts', 'src', 'base');
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'Exchange.ts');
            fs.writeFileSync (file, HEAD + '    parseThing (market: Dict): Str {\n' + body + '\n    }\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    const BODY = "const filters = this.safeList (market, 'filters', []);\nconst byType = this.indexBy (filters, 'filterType');\nEXTRA\n"
        + "const price = this.safeDict (byType, 'PRICE_FILTER');\nreturn this.safeString (price, 'tickSize');";
    test('positive: a row of an unproven parameter list, indexed by a string key, reads by comma-ok (fails on the base printer)', () => {
        const out = print (BODY.replace ('EXTRA', ''));
        expect (out).toContain ('var price, _ = byType["PRICE_FILTER"].(map[string]any)');
        expect (out).not.toContain ('SafeMapTyped(byType');
    });
    test('positive: an `in` test and a nil test on the read keep their form', () => {
        const out = print (BODY.replace ('EXTRA', "if (!('PRICE_FILTER' in byType)) {\n    return undefined;\n}")
            .replace ("return this.safeString (price, 'tickSize');", "if (price === undefined) {\n    return undefined;\n}\nreturn this.safeString (price, 'tickSize');"));
        expect (out).toContain ('var price, _ = byType["PRICE_FILTER"].(map[string]any)');
        expect (out).toContain ('price == nil');
    });
    test('negative: a result written through prints no assertion', () => {
        const out = print (BODY.replace ('EXTRA', "byType['X'] = market;"));
        expect (out).not.toContain ('byType["PRICE_FILTER"].(');
    });
    test('negative: a result handed to a callee that may write it prints no assertion', () => {
        const out = print (BODY.replace ('EXTRA', 'this.keep (byType);'));
        expect (out).not.toContain ('byType["PRICE_FILTER"].(');
    });
    test('negative: a variable key read keeps the wrap', () => {
        const out = print (BODY.replace ("this.safeDict (byType, 'PRICE_FILTER')", "this.safeDict (byType, this.safeString (market, 'k'))").replace ('EXTRA', ''));
        expect (out).not.toMatch (/var price, _ = byType\[/);
    });
    test('negative: an index-keyed indexBy (list rows stored) prints no assertion', () => {
        const out = print (BODY.replace ("this.indexBy (filters, 'filterType')", 'this.indexBy (filters, 0)').replace ('EXTRA', ''));
        expect (out).not.toContain ('byType["PRICE_FILTER"].(');
    });
});
