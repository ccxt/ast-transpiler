import { Transpiler } from '../src/transpiler';

// FOLD-1F hx10w6-G01: BaseExchange.balance, the map owned by the ws dispatch loop (config ownedBalance)
const OWNED = {
    'field': 'balance',
    'declaredIn': 'BaseExchange',
    'entryRead': 'WsBalanceEntry',
    'entryWrite': 'WsBalanceEntryForWrite',
    'replace': 'WsBalanceReplace',
    'userPath': '^(?:setBalanceCache|cleanWsData)$',
    'asyncUserPath': '^(?:(?:watch|fetch|seed)\\w*|loadBalanceSnapshot)$',
    'boxedKeys': [ 'info', 'timestamp', 'datetime', 'free', 'used', 'total' ],
};
const HEAD = 'type Dict = { [key: string]: any };\n'
    + 'class BaseExchange {\n'
    + '    balance: Dict = {};\n'
    + '    safeString (d: any, k: any, def: any = undefined): string | undefined { return d; }\n'
    + '    safeDict (d: any, k: any, def: any = undefined): Dict | undefined { return d; }\n'
    + '    safeBalance (b: any): Dict { return b; }\n'
    + '    iso8601 (x: any): string | undefined { return undefined; }\n'
    + '    account (): Dict { return {}; }\n';
const print = (body: string, config: any = OWNED, method = 'handleBalance (message: Dict)', modifier = ''): string => {
    const t = new Transpiler ({ 'verbose': false, 'go': { 'ownedBalance': config ?? undefined, 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    return t.transpileGo (HEAD + '    ' + modifier + method + ' {\n' + body + '\n    }\n}\n').content;
};

describe('FOLD-1F owned balance map', () => {
    test('loop-side reads, writes, membership-free deletes and whole-map replaces are native (fail on the base printer: no config)', () => {
        const out = print ("const type = 'spot'; this.balance[type] = this.safeBalance (this.balance[type]); delete this.balance['swap']; this.balance = this.safeBalance (this.balance);");
        expect (out).toContain ('this.Balance[typeVar] = this.SafeBalance(this.Balance[typeVar])');
        expect (out).toContain ('delete(this.Balance, "swap")');
        expect (out).toContain ('this.WsBalanceReplace(this.SafeBalance(this.Balance))');
        const base = print ("const type = 'spot'; this.balance[type] = this.safeBalance (this.balance[type]);", null);
        expect (base).toContain ('AddElementToObject(this.Balance, typeVar');
    });
    test('entry stores and entry reads go through the owner views', () => {
        const out = print ("const type = 'spot'; const code = this.safeString (message, 'c'); const account = {}; this.balance[type]['info'] = this.safeDict (message, 'i', {}); if (code !== undefined) { this.balance[type][code] = account; const old = this.safeString (this.balance[type][code], 'free'); }");
        expect (out).toContain ('this.WsBalanceEntryForWrite(typeVar)["info"] = this.SafeDict(message, "i", map[string]any{})');
        expect (out).toContain ('this.WsBalanceEntryForWrite(typeVar)[*code] = account');
        expect (out).toContain ('this.WsBalanceEntry(typeVar)[*code]');
    });
    test('a bookkeeping key read, an unguarded pointer key, a scalar into a bookkeeping slot and an any value keep the helper', () => {
        expect (print ("const t = this.balance['timestamp'];")).toContain ('GetValue(this.Balance, "timestamp")');
        expect (print ("const code = this.safeString (message, 'c'); this.balance[code] = {};")).toContain ('AddElementToObject(this.Balance, code');
        expect (print ("const type = 'spot'; this.balance[type]['timestamp'] = this.safeString (message, 'c');")).toContain ('AddElementToObject(');
        expect (print ("const type = 'spot'; this.balance[type]['free'] = message['x'];")).toContain ('AddElementToObject(');
    });
    test('user-path methods keep the helper calls', () => {
        expect (print ("const type = 'spot'; this.balance[type] = {};", OWNED, 'setBalanceCache (client: any, type: string)')).toContain ('AddElementToObject(this.Balance');
        expect (print ("const type = 'spot'; const x = this.balance[type];", OWNED, 'watchBalance (params: Dict)', 'async ')).toContain ('GetValue(this.Balance');
    });
});
