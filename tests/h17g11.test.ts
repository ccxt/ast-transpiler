import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go Balance per-account row write keyed by a nil-guarded optional Str parameter', () => {
    const TABLE = { 'balance': { 'type': 'map[string]any', 'freshMapCalls': [ 'extend' ], 'selfCalls': [ 'safeBalance' ], 'plainCalls': [ 'iso8601', 'safeBalance' ], 'emptyDefaultCalls': [ 'safeDict', 'safeList' ], 'userPathMethods': '^(?:setBalanceCache|cleanWsData)$' } };
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n    balance: Dict = {};\n'
        + '    safeDict (d: any, k: any, def: any = undefined): Dict | undefined { return d; }\n'
        + '    safeValue (d: any, k: any, def: any = undefined): any { return d; }\n'
        + '    safeString (d: any, k: any, def: any = undefined): string | undefined { return d; }\n'
        + '    account (): Dict { return {}; }\n'
        + '    reset (): void { this.balance = {}; }\n'
        + '    caller (message: Dict) { const a = \'spot\'; this.parseWsBalance (message, a); }\n';
    const print = (body: string, table: any = TABLE): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'nativeStoreFields': table, 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGo (HEAD + '    parseWsBalance (message: Dict, accountType: Str = undefined) {\n' + body + '\n    }\n}\n').content;
    };
    const GUARDED = "const code = this.safeString (message, 'c'); const account = this.account ();\n"
        + 'if (accountType !== undefined) { if (this.safeValue (this.balance, accountType) === undefined) { this.balance[accountType] = {}; } '
        + 'if ((accountType !== undefined) && (code !== undefined)) { this.balance[accountType][code] = account; } }';

    test('the row create and the two-level write print native map stores (fails on the base printer)', () => {
        const out = print (GUARDED);
        expect (out).toContain ('var accountType *string = GetArgStringPtr(optionalArgs, 0, nil)');
        expect (out).toContain ('this.Balance[*accountType] = map[string]any{}');
        expect (out).toContain ('if entry, ok := this.Balance[*accountType].(map[string]any); ok && (entry != nil) {');
        expect (out).toContain ('entry[*code] = account');
        expect (out).not.toContain ('AddElementToObject(');
    });
    test('an unguarded key keeps the box and the helper', () => {
        const out = print ("const account = this.account (); this.balance[accountType] = account;");
        expect (out).toContain ('accountType := GetArg(optionalArgs, 0, nil)');
        expect (out).toContain ('AddElementToObject(this.Balance, accountType, account)');
    });
    test('a parameter placed into a list (a typed nil would box as non-nil) keeps the box', () => {
        const out = print (GUARDED + '\nconst keys = [ accountType ];');
        expect (out).toContain ('accountType := GetArg(optionalArgs, 0, nil)');
        expect (out).not.toContain ('this.Balance[*accountType]');
    });
    test('an untabled Balance field keeps the helper', () => {
        const out = print (GUARDED, {});
        expect (out).toContain ('AddElementToObject(GetValue(this.Balance, accountType), code, account)');
    });
});
