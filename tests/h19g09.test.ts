import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go Balance writes keyed by an Object.keys loop variable', () => {
    const TABLE = { 'balance': { 'type': 'map[string]any', 'freshMapCalls': [ 'extend' ], 'selfCalls': [ 'safeBalance' ], 'plainCalls': [ 'iso8601', 'safeBalance' ], 'emptyDefaultCalls': [ 'safeDict', 'safeList' ], 'userPathMethods': '^(?:setBalanceCache|cleanWsData)$' } };
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n    balance: Dict = {};\n'
        + '    safeValue (d: any, k: any, def: any = undefined): any { return d; }\n'
        + '    safeString (d: any, k: any, def: any = undefined): string | undefined { return d; }\n'
        + '    safeBalance (d: Dict): Dict { return d; }\n'
        + '    inArray (a: any, b: any): boolean { return true; }\n'
        + '    parseTradingBalance (m: Dict): Dict { return m; }\n';
    const print = (body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'nativeStoreFields': TABLE, 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGo (HEAD + '    handleBalance (message: Dict) {\n' + body + '\n    }\n}\n').content;
    };
    const BODY = 'const balance = this.parseTradingBalance (message);\nif (this.balance === undefined) { this.balance = {}; }\n'
        + "const reserved = [ 'free', 'used', 'total' ];\nconst keys = Object.keys (balance);\n"
        + 'for (let i = 0; i < keys.length; i++) {\n    const key = keys[i];\n    if (this.inArray (key, reserved)) { continue; }\n'
        + '    this.balance[key] = this.safeValue (balance, key);\n}\nthis.balance = this.safeBalance (this.balance);';
    test('a safeValue read stored under a string loop key prints the native map store (fails on the base printer)', () => {
        const out = print (BODY);
        expect (out).toContain ('var key string = keys[i]');
        expect (out).toContain ('this.Balance[key] = this.SafeValue(balance, key)');
        expect (out).not.toContain ('AddElementToObject(this.Balance, key');
    });
    test('a value that can be a scalar pointer keeps the helper (derefScalar is not reproduced)', () => {
        const out = print (BODY.replace ('this.safeValue (balance, key)', "this.safeString (balance, key)"));
        expect (out).not.toContain ('this.Balance[key] = this.SafeString(balance, key)');
    });
    test('a field that may be nil keeps the helper (nil-map write would panic)', () => {
        const out = print (BODY + '\nthis.balance = undefined;');
        expect (out).not.toContain ('this.Balance[key] = ');
        expect (out).toContain ('AddElementToObject(this.Balance, key, this.SafeValue(balance, key))');
    });
    test('a nil-able Str key stores only behind its nil guard (the helper no-ops on a nil key)', () => {
        const out = print ("let k: Str = undefined;\nif (message['a'] !== undefined) { k = this.safeString (message, 'a'); }\nthis.balance[k] = this.safeValue (message, 'b');");
        expect (out).not.toContain ('this.Balance[k] = ');
        expect (out).toMatch (/if k != nil \{\n\s*this\.Balance\[\*k\] = this\.SafeValue\(message, "b"\)/);
    });
});
