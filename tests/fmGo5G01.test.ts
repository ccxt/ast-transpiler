import { Transpiler, installFmGo5G01, installCcxtGoLocalTypes } from '../src/transpiler';

// FM-GO5 G01: the ws client's subscriptions table (a map owned by one goroutine) hands every operation to
// the owner, keyed on the checker-resolved `Client.subscriptions` declaration (no regex over printed Go).
const t = (install = true) => {
    const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    installCcxtGoLocalTypes (x.goTranspiler);
    if (install) { installFmGo5G01 (x.goTranspiler); }
    return x;
};
const SRC = [
    'type Dict = { [key: string]: any };',
    'class Client {',
    '    subscriptions: Record<string, any> = {};',
    '}',
    'class Other {',
    '    subscriptions: Record<string, any> = {};',
    '}',
    'class Ex {',
    '    safeString (a: any, b: any, c: any = undefined) { return undefined; }',
    '    safeValue (a: any, b: any, c: any = undefined) { return undefined; }',
    '    safeDict (a: any, b: any, c: any = undefined) { return undefined; }',
    '    m (client: Client, other: Other, h: string, v: any) {',
    '        if (h in client.subscriptions) {',
    '            delete client.subscriptions[h];',
    '        }',
    '        client.subscriptions[h] = v;',
    '        const keys = Object.keys (client.subscriptions);',
    '        const values = Object.values (client.subscriptions);',
    '        const s = this.safeString (client.subscriptions[h], \'id\');',
    '        const snap = this.safeString (client.subscriptions, h);',
    '        const nested = client.subscriptions[h][\'x\'];',
    '        const known = client.subscriptions[h];',
    '        const d = this.safeDict (client.subscriptions, h);',
    '        if (d === undefined) { return undefined; }',
    '        client.subscriptions[h][\'checksum\'] = true;',
    '        const typed = this.safeDict (client.subscriptions, h, {}) as Dict;',
    '        const u = other.subscriptions[h];',
    '        delete other.subscriptions[h];',
    '        return [ keys, values, s, snap, nested, known, u ];',
    '    }',
    '}',
    '',
].join ('\n');

describe('FM-GO5 G01 client subscriptions hand-off', () => {
    test('every access on Client.subscriptions calls the owner', () => {
        const out = t ().transpileGo (SRC).content;
        expect (out).toContain ('client.SubscriptionHas(h)');
        expect (out).toContain ('client.SubscriptionDel(h)');
        expect (out).toContain ('client.SubscriptionSet(h, v)');
        expect (out).toContain ('var keys []string = client.SubscriptionKeys()');
        expect (out).toContain ('var values []any = client.SubscriptionValues()');
        expect (out).toContain ('this.SafeString(client.SubscriptionGet(h), "id")');
        expect (out).toContain ('this.SafeString(client.SubscriptionsSnapshot(), h)');
        expect (out).toContain ('GetValue(client.SubscriptionGet(h), "x")');
        expect (out).toContain ('AddElementToObject(client.SubscriptionGet(h), "checksum", true)');
        expect (out).toContain ('var typed map[string]any = client.SubscriptionDict(h)');
    });
    test('an any-typed local keeps the dereferencing base read of the snapshot', () => {
        const out = t ().transpileGo (SRC).content;
        expect (out).toContain ('var known any = GetValue(client.SubscriptionsSnapshot(), h)');
    });
    test('fails without the hook (base printer keeps the helpers)', () => {
        const out = t (false).transpileGo (SRC).content;
        expect (out).not.toContain ('SubscriptionHas');
        expect (out).toContain ('InOp(client.Subscriptions, h)');
    });
    test('the same field name on another class is untouched', () => {
        const out = t ().transpileGo (SRC).content;
        expect (out).toContain ('GetValue(other.Subscriptions, h)');
        expect (out).toContain ('Remove(other.Subscriptions, h)');
    });
});
