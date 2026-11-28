import { Transpiler } from '../src/transpiler';

describe('go Balance store of a scalar pointer value', () => {
    const TABLE = {
        'balance': {
            'type': 'map[string]any',
            'freshMapCalls': [ 'extend' ],
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
        + '    safeInteger (d: any, k: any, def: any = undefined): number | undefined { return d; }\n'
        + '    safeBalance (b: any): any { return b; }\n'
        + '    reset (): void { this.balance = {}; this.balance = this.safeBalance (this.balance); }\n';
    const print = (body: string, table: any = TABLE): string => {
        const t = new Transpiler ({ 'verbose': false, 'go': { 'nativeStoreFields': table, 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        return t.transpileGo (HEAD + '    handle (message: Dict) {\n' + body + '\n    }\n}\n').content;
    };

    test('an entry store of a *int64 local and an Iso8601 call print the nil-checked deref (fails on the base printer)', () => {
        const out = print ("const t = 'spot'; const timestamp = this.safeInteger (message, 'E'); this.balance[t]['timestamp'] = timestamp; this.balance[t]['datetime'] = this.iso8601 (timestamp);");
        expect (out).not.toContain ('AddElementToObject(this.Balance');
        expect (out).toContain ('if timestamp != nil {');
        expect (out).toContain ('entry["timestamp"] = *timestamp');
        expect (out).toContain ('entry["timestamp"] = nil');
        expect (out).toContain ('if ptrValue := this.Iso8601(timestamp); ptrValue != nil {');
        expect (out).toContain ('entry["datetime"] = *ptrValue');
    });
    test('a flat store of a *int64 local prints the nil-checked deref', () => {
        const out = print ("const timestamp = this.safeInteger (message, 'E'); this.balance['timestamp'] = timestamp;");
        expect (out).toContain ('this.Balance["timestamp"] = *timestamp');
        expect (out).toContain ('this.Balance["timestamp"] = nil');
    });
    test('an untabled field and an any value keep the helper', () => {
        expect (print ("const timestamp = this.safeInteger (message, 'E'); this.balance['timestamp'] = timestamp;", {})).toContain ('AddElementToObject(this.Balance, "timestamp"');
        expect (print ("const v: any = message['x']; this.balance['spot']['x'] = v;")).not.toContain ('entry["x"] = *v');
    });
});
