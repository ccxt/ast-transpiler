import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe('go map read with a guard-proven *string key', () => {
    const TABLE = { 'balance': { 'type': 'map[string]any', 'freshMapCalls': [ 'extend' ], 'selfCalls': [ 'safeBalance' ], 'plainCalls': [ 'iso8601', 'safeBalance' ], 'emptyDefaultCalls': [ 'safeDict', 'safeList' ], 'userPathMethods': '^(?:setBalanceCache|cleanWsData)$' } };
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n    balance: Dict = {};\n'
        + '    safeDict (d: any, k: any, def: any = undefined): Dict { return d; }\n'
        + '    safeString (d: any, k: any, def: any = undefined): Str { return d; }\n'
        + '    safeValue (d: any, k: any, def: any = undefined): any { return d; }\n'
        + '    safeCurrencyCode (id: Str): Str { return id; }\n'
        + '    safeBalance (d: Dict): Dict { return d; }\n';
    const print = (body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'nativeStoreFields': TABLE, 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h22g07-'));
        try {
            const dir = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'x.ts');
            fs.writeFileSync (file, HEAD + '    handleBalance (message: Dict, accountType: string) {\n' + body + '\n    }\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    const HEADBODY = "const balance = this.safeDict (this.balance, accountType, {});\nconst currencyId = this.safeString (message, 'a');\nconst code = this.safeCurrencyCode (currencyId);\n";
    test('a key proven by `code !== undefined` reads the map natively (fails on the base printer)', () => {
        const out = print (HEADBODY + "if ((code !== undefined) && (code in balance)) {\n    const previousValue = this.safeValue (balance[code], 'free');\n    message['x'] = previousValue;\n}");
        expect (out).toContain ('this.SafeValue(balance[*code], "free")');
        expect (out).not.toContain ('func() any');
    });
    test('an unguarded key keeps the nil-guarded read', () => {
        const out = print (HEADBODY + "const previousValue = this.safeValue (balance[code], 'free');\nmessage['x'] = previousValue;");
        expect (out).not.toContain ('balance[*code], "free")');
    });
    test('a rebound key keeps the nil-guarded read', () => {
        const out = print ("const balance = this.safeDict (this.balance, accountType, {});\nlet code = this.safeCurrencyCode (this.safeString (message, 'a'));\nif (code !== undefined) {\n    code = this.safeString (message, 'b');\n    const previousValue = this.safeValue (balance[code], 'free');\n    message['x'] = previousValue;\n}");
        expect (out).not.toContain ('balance[*code], "free")');
    });
    test('a push receiver (`m[k].push`) on a proven key reads natively', () => {
        const out = print ("const groups: Dict = {};\nconst rows = this.safeValue (message, 'r');\nfor (let i = 0; i < rows.length; i++) {\nconst code = this.safeString (rows[i], 'a');\nif (code !== undefined) {\n    if (!(code in groups)) { groups[code] = []; }\n    groups[code].push (message);\n}\n}");
        expect (out).toMatch (/, _ = groups\[\*code\]\.\(\[\]any\)\n/);
        expect (out).not.toContain ('if code == nil');
    });
    test('a push receiver on an unproven key keeps the guarded read', () => {
        const out = print ("const groups: Dict = {};\nconst code = this.safeString (message, 'a');\ngroups[code].push (message);");
        expect (out).not.toMatch (/:= groups\[\*code\]\n/);
    });
    test('a guard in an `||` does not prove the key', () => {
        const out = print (HEADBODY + "if ((code !== undefined) || (accountType === 'x')) {\n    const previousValue = this.safeValue (balance[code], 'free');\n    message['x'] = previousValue;\n}");
        expect (out).not.toContain ('balance[*code], "free")');
    });
});

describe('rust book-meta key insert on a plain-field row local', () => {
    const BASE = [
        'export interface Dict { [key: string]: any }',
        'export type Int = number | undefined;',
        'export default class Exchange {',
        '    balance: Dict = {};',
        '    other: Dict = {};',
        '    safeDict (d: any, k: any, def: any = undefined): any { return d[k] ?? def; }',
        '    safeInteger (d: any, k: any, def: Int = undefined): Int { return d[k] ?? def; }',
        '    safeBalance (d: Dict): Dict { return d; }',
        '}',
        '',
    ].join('\n');
    const src = (decl: string, extra: string) => [
        "import Exchange, { Dict } from '../base/Exchange.js';",
        'export default class venue extends Exchange {',
        '    handleBalance (message: Dict, accountType: string) {',
        `        ${decl}`,
        "        const timestamp = this.safeInteger (message, 'E');",
        `        ${extra}`,
        "        balance['timestamp'] = timestamp;",
        '        this.balance[accountType] = this.safeBalance (balance);',
        '    }',
        '}',
        '',
    ].join('\n');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h22g07r-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'pro'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
    const run = (name: string, text: string) => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const file = path.join(tmp, 'ts', 'src', 'pro', name + '.ts');
        fs.writeFileSync(file, text);
        return t.transpileRustByPath(file).content;
    };
    test('safeDict (this.balance, k, {}) row: timestamp inserts natively (fails on the base printer)', () => {
        const out = run('venueA', src('const balance = this.safeDict (this.balance, accountType, {});', ''));
        expect(out).not.toContain('add_element_to_object(&mut balance');
        expect(out).toMatch(/insert\("timestamp"\.into\(\), Value::from\(timestamp\)\)/);
    });
    test('negative: a row of a field outside the plain table keeps the helper', () => {
        const out = run('venueB', src('const balance = this.safeDict (this.other, accountType, {});', ''));
        expect(out).toContain('add_element_to_object(&mut balance');
    });
    test('negative: a rebound row local keeps the helper', () => {
        const out = run('venueC', src('let balance = this.safeDict (this.balance, accountType, {});', "if (timestamp === undefined) { balance = this.safeDict (message, 'x', {}); }"));
        expect(out).toContain('add_element_to_object(&mut balance');
    });
});
