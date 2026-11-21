import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('h28a22: indexBy / groupBy of a JSON-origin list is a JSON-origin container', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\ntype List = any[];\nclass Exchange {\n    options: Dict = {};\n'
        + '    safeString (d: any, k: any, def: any = undefined): Str { return d; }\n'
        + '    safeDict (d: any, k: any, def: any = undefined): Dict { return d; }\n'
        + '    safeList (d: any, k: any, def: any = undefined): List { return d; }\n'
        + '    indexBy (a: any, k: any): Dict { return {}; }\n    groupBy (a: any, k: any): Dict { return {}; }\n'
        + '    async request (path: any, params: Dict = {}): Promise<any> { return {}; }\n'
        + '    async publicGetX (p: Dict = {}): Promise<any> { return this.request ("x", p); }\n';
    const print = (sig: string, body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h28a22-'));
        try {
            const dir = path.join (tmp, 'ts', 'src', 'base');
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'Exchange.ts');
            fs.writeFileSync (file, HEAD + '    ' + sig + ' {\n' + body + '\n    }\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    const BODY = "const response = await this.publicGetX ({});\nconst rows = this.safeList (response, 'data', []);\nconst byId = this.PRODUCER (rows, 'id');\nEXTRA\nconst entry = this.safeDict (byId, 'BTC');\nreturn this.safeString (entry, 'x');";
    const LIST = BODY.replace ("const entry = this.safeDict (byId, 'BTC');\nreturn this.safeString (entry, 'x');", "const group = this.safeList (byId, 'BTC');\nreturn group.length;");
    test('indexBy of a decoded list reads a row with the comma-ok assertion (fails on the base printer)', () => {
        const out = print ('async handle ()', BODY.replace ('PRODUCER', 'indexBy').replace ('EXTRA', ''));
        expect (out).toContain ('var entry, _ = byId["BTC"].(map[string]any)');
        expect (out).not.toContain ('SafeMapTyped(byId');
    });
    test('groupBy of a decoded list reads a group with the comma-ok list assertion', () => {
        const out = print ('async handle ()', LIST.replace ('PRODUCER', 'groupBy').replace ('EXTRA', ''));
        expect (out).toContain ('group, _ = byId["BTC"].([]any)');
        expect (out).not.toContain ('SafeListTyped(byId');
    });
    test('indexBy of an awaited endpoint list held directly is JSON-origin', () => {
        const out = print ('async handle ()', "const rows = await this.publicGetX ({});\nconst byId = this.indexBy (rows, 'id');\nconst entry = this.safeDict (byId, 'BTC');\nreturn this.safeString (entry, 'x');");
        expect (out).toContain ('var entry, _ = byId["BTC"].(map[string]any)');
    });
    test('an index written through is not JSON-origin', () => {
        const out = print ('async handle ()', BODY.replace ('PRODUCER', 'indexBy').replace ('EXTRA', "byId['BTC'] = 1;"));
        expect (out).not.toContain ('byId["BTC"].(map[string]any)');
    });
    test('an index of a parameter list holds only map rows (h30a15: IndexBy copies map elements only)', () => {
        const out = print ('async handle (rows: List)', "const byId = this.indexBy (rows, 'id');\nconst entry = this.safeDict (byId, 'BTC');\nreturn this.safeString (entry, 'x');");
        expect (out).toContain ('var entry, _ = byId["BTC"].(map[string]any)');
    });
    test('a source list written through still indexes map rows only (h30a15)', () => {
        const out = print ('async handle ()', BODY.replace ('PRODUCER', 'indexBy').replace ('EXTRA', "rows.push ({});"));
        expect (out).toContain ('var entry, _ = byId["BTC"].(map[string]any)');
    });
    test('a nil test on the read row keeps the nil answer (typed nil map compares nil)', () => {
        const out = print ('async handle ()', BODY.replace ('PRODUCER', 'indexBy').replace ('EXTRA', '').replace ("return this.safeString (entry, 'x');", "if (entry === undefined) {\n    return 'none';\n}\nreturn this.safeString (entry, 'x');"));
        expect (out).toContain ('var entry, _ = byId["BTC"].(map[string]any)');
        expect (out).toMatch (/IsEqual\(entry, nil\)|entry == nil/);
    });
});
