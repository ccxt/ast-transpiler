import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go Balance writes keyed by a nil-seeded Str local', () => {
    const TABLE = { 'balance': { 'type': 'map[string]any', 'freshMapCalls': [ 'extend' ], 'selfCalls': [ 'safeBalance' ], 'plainCalls': [ 'iso8601', 'safeBalance' ], 'emptyDefaultCalls': [ 'safeDict', 'safeList' ], 'userPathMethods': '^(?:setBalanceCache|cleanWsData)$' } };
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n    balance: Dict = {};\n'
        + '    safeDict (d: any, k: any, def: any = undefined): Dict | undefined { return d; }\n'
        + '    safeValue (d: any, k: any, def: any = undefined): any { return d; }\n'
        + '    safeString (d: any, k: any, def: any = undefined): string | undefined { return d; }\n'
        + '    safeStringLower (d: any, k: any, def: any = undefined): string | undefined { return d; }\n'
        + '    safeBalance (d: Dict): Dict { return d; }\n'
        + '    iso8601 (d: any): string | undefined { return d; }\n'
        + '    reset (): void { this.balance = {}; }\n'
        + '    parseWsBalance (message: Dict, accountType: Str = undefined) { if (accountType !== undefined) { this.balance[accountType] = {}; } }\n';
    const print = (body: string, table: any = TABLE): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'nativeStoreFields': table, 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGo (HEAD + '    handleBalance (message: Dict) {\n' + body + '\n    }\n}\n').content;
    };
    const BODY = "const topic = this.safeString (message, 'topic'); const info = {}; let account: Str = undefined;\n"
        + "if (topic === 'a') { account = 'spot'; }\n"
        + "if (topic === 'b') { account = this.safeStringLower (message, 'accountType'); }\n"
        + "this.parseWsBalance (message, account);\n"
        + "if (account !== undefined) { if (this.safeDict (this.balance, account) === undefined) { this.balance[account] = {}; }\n"
        + "this.balance[account]['info'] = info; this.balance[account]['datetime'] = this.iso8601 (1);\n"
        + "this.balance[account] = this.safeBalance (this.balance[account]); const h = 'balances:' + account; }";
    test('a nil-guarded nil-seeded Str key prints native Balance stores (fails on the base printer)', () => {
        const out = print (BODY);
        expect (out).toContain ('var account *string = nil');
        expect (out).toContain ('this.Balance[*account] = map[string]any{}');
        expect (out).toContain ('if entry, ok := this.Balance[*account].(map[string]any); ok && (entry != nil) {');
        expect (out).toContain ('this.Balance[*account] = this.SafeBalance(this.Balance[*account])');
        expect (out).not.toContain ('AddElementToObject(');
        expect (out).not.toContain ('GetValue(this.Balance');
    });
    test('a write that is not a string keeps the box', () => {
        const out = print (BODY.replace ("account = 'spot';", 'account = 5 as any;'));
        expect (out).toContain ('var account any = nil');
        expect (out).toContain ('AddElementToObject(this.Balance, account, map[string]any{})');
    });
    test('a key stored into a list (a typed nil would box as non-nil) keeps the box', () => {
        const out = print (BODY + '\nconst keys = [ account ];');
        expect (out).toContain ('var account any = nil');
        expect (out).not.toContain ('this.Balance[*account]');
    });
    test('a guard whose body rebinds the key keeps the helper', () => {
        const out = print (BODY.replace ("this.balance[account]['info'] = info;", "this.balance[account]['info'] = info; account = this.safeString (message, 'x');"));
        expect (out).not.toContain ('this.Balance[*account] = map[string]any{}');
    });
});
