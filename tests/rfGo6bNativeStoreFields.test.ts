import { Transpiler } from '../src/transpiler';

// RF-go-6-B: element write on a hand-written BaseExchange map field (type table passed by the embedder)
const TABLE = {
    'balance': {
        'type': 'map[string]any',
        'freshMapCalls': [ 'extend', 'createSafeDictionary' ],
        'selfCalls': [ 'safeBalance' ],
        'plainCalls': [ 'iso8601' ],
        'emptyDefaultCalls': [ 'safeDict', 'safeList' ],
        'userPathMethods': '^(?:setBalanceCache|cleanWsData)$',
    },
};
const HEAD = 'type Dict = { [key: string]: any };\n'
    + 'class Exchange {\n'
    + '    balance: Dict = {};\n'
    + '    iso8601 (x: any): string | undefined { return undefined; }\n'
    + '    safeString (d: any, k: any, def: any = undefined): string | undefined { return d; }\n'
    + '    safeCurrencyCode (c: any): string | undefined { return c; }\n'
    + '    safeDict (d: any, k: any, def: any = undefined): Dict | undefined { return d; }\n'
    + '    safeList (d: any, k: any, def: any = undefined): any[] | undefined { return d; }\n'
    + '    safeBalance (b: any): any { return b; }\n'
    + '    extend (a: any, b: any): Dict { return a; }\n'
    + '    spawn (f: any, ...a: any[]): void {}\n'
    + '    async fetchSomething (): Promise<any> { return {}; }\n'
    + '    reset (): void { this.balance = {}; this.balance = this.safeBalance (this.balance); }\n';
const print = (body: string, table: any = TABLE, extra = ''): string => {
    const t = new Transpiler ({ 'verbose': false, 'go': { 'nativeStoreFields': table, 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    return t.transpileGo (HEAD + extra + '    handle (message: Dict, timestamp: number) {\n' + body + '\n    }\n}\n').content;
};

describe('RF-go-6-B native store on a tabled map field', () => {
    test('a literal key and a plain value store natively (fails on the base printer: no table)', () => {
        const withTable = print ("this.balance['info'] = { 'a': 1 }; this.balance['datetime'] = 'x';");
        expect (withTable).toContain ('this.Balance["datetime"] = "x"');
        expect (print ("this.balance['datetime'] = 'x';", {})).toContain ('AddElementToObject(this.Balance, "datetime", "x")');
    });
    test('a pointer value and an unproven any value keep the helper', () => {
        expect (print ("this.balance['datetime'] = this.safeString (message, 'd');")).toContain ('AddElementToObject(this.Balance, "datetime"');
        expect (print ("const ts = this.safeString (message, 'd'); this.balance['datetime'] = ts;")).toContain ('AddElementToObject(this.Balance, "datetime"');
    });
    test('an empty-default accessor call is a plain value', () => {
        expect (print ("this.balance['info'] = this.safeList (message, 'data', []);")).toContain ('this.Balance["info"] = this.SafeList(message, "data", []any{})');
        expect (print ("this.balance['info'] = this.safeList (message, 'data');")).toContain ('AddElementToObject(this.Balance, "info"');
    });
    test('a *string key writes [*k] behind its nil guard, born expanded when unguarded', () => {
        const guarded = print ("const code = this.safeString (message, 'c'); if (code !== undefined) { this.balance[code] = {}; }");
        expect (guarded).toContain ('this.Balance[*code] = map[string]any{}');
        expect (guarded).not.toContain ('if code != nil {\n\t\tif code != nil');
        const open = print ("const code = this.safeString (message, 'c'); this.balance[code] = {};");
        expect (open).toContain ('if code != nil {\n\t\tthis.Balance[*code] = map[string]any{}\n\t}');
    });
    test('a field written with a non-fresh value anywhere in the file keeps the helper', () => {
        const out = print ("this.balance['info'] = message;", TABLE, '    other (b: any) { this.balance = b; }\n');
        expect (out).toContain ('AddElementToObject(this.Balance, "info", message)');
    });
    test('user-path methods, spawners and async bodies keep the helper', () => {
        const user = print ('', TABLE, "    setBalanceCache (message: Dict) { this.balance['info'] = message; }\n");
        expect (user).toContain ('AddElementToObject(this.Balance, "info", message)');
        const spawner = print ('', TABLE, "    loader (message: Dict) { this.balance['info'] = message; this.spawn (this.fetchSomething); }\n");
        expect (spawner).toContain ('AddElementToObject(this.Balance, "info", message)');
        const asyncBody = print ('', TABLE, "    async loadIt (message: Dict) { this.balance['info'] = message; }\n");
        expect (asyncBody).toContain ('AddElementToObject(this.Balance, "info", message)');
    });
    test('an untabled field and an entry store keep the helper', () => {
        const other = print ("this.balance['info'] = message;", { 'positions': TABLE['balance'] });
        expect (other).toContain ('AddElementToObject(this.Balance, "info", message)');
        const entry = print ("this.balance['spot']['info'] = message;");
        expect (entry).not.toContain ('this.Balance["spot"]["info"] =');
    });
});
