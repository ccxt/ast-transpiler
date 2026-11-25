import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go scalar-pointer store on a safeDict map local', () => {
    const TABLE = { 'balance': { 'type': 'map[string]any', 'freshMapCalls': [ 'extend' ], 'selfCalls': [ 'safeBalance' ], 'plainCalls': [ 'iso8601', 'safeBalance' ], 'emptyDefaultCalls': [ 'safeDict', 'safeList' ], 'userPathMethods': '^(?:setBalanceCache|cleanWsData)$' } };
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\ntype Int = number | undefined;\nclass Exchange {\n    balance: Dict = {};\n'
        + '    safeDict (d: any, k: any, def: any = undefined): Dict { return d; }\n'
        + '    safeInteger (d: any, k: any, def: any = undefined): Int { return d; }\n'
        + '    safeBalance (d: Dict): Dict { return d; }\n';
    const print = (body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'nativeStoreFields': TABLE, 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h20g09-'));
        try {
            const dir = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'x.ts');
            fs.writeFileSync (file, HEAD + '    handleBalance (message: Dict, account: string) {\n' + body + '\n    }\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    const BODY = "const balance = this.safeDict (this.balance, account, {});\nconst timestamp = this.safeInteger (message, 'ts');\n"
        + "balance['timestamp'] = timestamp;\nthis.balance[account] = this.safeBalance (balance);";
    test('a *int64 local stored on the never-nil local prints the deref branch (fails on the base printer)', () => {
        const out = print (BODY);
        expect (out).toMatch (/if timestamp != nil \{\n\s*balance\["timestamp"\] = \*timestamp\n\s*\} else \{\n\s*balance\["timestamp"\] = nil\n\s*\}/);
        expect (out).not.toContain ('AddElementToObject(balance, "timestamp"');
    });
    test('a local without the literal default may be nil: no native store', () => {
        const out = print (BODY.replace ('this.safeDict (this.balance, account, {})', 'this.safeDict (this.balance, account)'));
        expect (out).not.toContain ('balance["timestamp"] = *timestamp');
    });
    test('a rebound map local keeps the helper', () => {
        const out = print ('let balance = this.safeDict (this.balance, account, {});\nconst timestamp = this.safeInteger (message, \'ts\');\nif (timestamp === undefined) { balance = undefined; }\nbalance[\'timestamp\'] = timestamp;');
        expect (out).not.toContain ('balance["timestamp"] = *timestamp');
    });
    test('a nil-able Str key is not a proven key: the rule does not fire', () => {
        const out = print ("const balance = this.safeDict (this.balance, account, {});\nconst timestamp = this.safeInteger (message, 'ts');\nconst k: Str = message['k'];\nbalance[k] = timestamp;");
        expect (out).not.toMatch (/balance\[\*?k\] = \*timestamp/);
    });
});
