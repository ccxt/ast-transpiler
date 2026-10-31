import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

// hx11 RD-CS-1 (folds ccxt hx10w3-C02 and hx10w4-BF01): a declared typed view of a hand-written base member
// answers the member's reads natively, and a string-typed `object` local concatenates natively.

const config = {
    'verbose': false,
    'csharp': { 'parser': { 'NUM_LINES_END_FILE': 0, 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(', 'ELEMENT_ACCESS_WRAPPER_CLOSE': ')' } }
};

const THIS: { [name: string]: any } = {
    'urls': { type: 'IDictionary<string, object>', initializer: 'new dict()', views: { api: { view: 'urlsApi' } } },
    'urlsApi': { type: 'IDictionary<string, object>' },
    'currencies': { type: 'object', initializer: 'new dict()', dictView: 'currenciesDict' },
    'currenciesDict': { type: 'IDictionary<string, object>' },
    'currencies_by_id': { type: 'IDictionary<string, object>' },
};

function printed(source: string, hooked: boolean, members: any = THIS): string {
    const transpiler = new Transpiler(config);
    const csharp: any = (transpiler as any).csharpTranspiler;
    if (hooked) {
        csharp.csharpDeclaredMemberType = (owner: string, name: string) => (owner === 'this' ? members[name] : undefined);
    }
    return transpiler.transpileCSharp(source).content;
}

const BASE = 'class BaseExchange {\n'
    + '    urls!: { api: any, [key: string]: any };\n'
    + '    currencies: any;\n'
    + '    currencies_by_id: any;\n'
    + '    safeString (a: any, b: any): string | undefined { return undefined; }\n';

describe('RD-CS-1: declared member views and string-typed object concatenation', () => {
    test('urls["api"][key] reads through the declared urlsApi view', () => {
        const ts = BASE + '    f (type: string, other: any) { const a = this.urls["api"]["ws"]; const b = this.urls["api"][type]; const k = this.safeString (other, "k"); const d = this.urls["api"][k]; const c = this.urls["api"][other]; return [a, b, c, d]; }\n}';
        const out = printed(ts, true);
        expect(out).toContain('(this.urlsApi != null && this.urlsApi.ContainsKey("ws") ? this.urlsApi["ws"] : null)');
        expect(out).toContain('(this.urlsApi != null && type != null && this.urlsApi.ContainsKey((string)type) ? this.urlsApi[(string)type] : null)');
        expect(out).toContain('(this.urlsApi != null && k != null && this.urlsApi.ContainsKey(k) ? this.urlsApi[k] : null)');
        expect(out).toContain('getValue((this.urls != null && this.urls.ContainsKey("api") ? this.urls["api"] : null), other)');
        expect(printed(ts, false)).not.toContain('urlsApi');
    });

    test('an object member with a declared dictionary view reads and tests through the view', () => {
        const ts = BASE + '    f (code: string) { const a = this.currencies[code]; if (code in this.currencies) { return Object.keys (this.currencies); } return a; }\n}';
        const out = printed(ts, true);
        expect(out).toContain('(this.currenciesDict != null && code != null && this.currenciesDict.ContainsKey((string)code) ? this.currenciesDict[(string)code] : null)');
        expect(out).toMatch(/\(this\.currenciesDict != null && code is string inOpKey\d+ && this\.currenciesDict\.ContainsKey\(inOpKey\d+\)\)/);
        expect(out).toContain('this.currenciesDict.Keys');
        const bare = printed(ts, true, { ...THIS, currencies: { type: 'object', initializer: 'new dict()' } });
        expect(bare).not.toContain('currenciesDict');
    });

    test('a const alias of a member declared the dictionary interface is declared with it', () => {
        const ts = BASE + '    f (code: string) { const byId = this.currencies_by_id; if (code in byId) { return byId[code]; } return undefined; }\n}';
        const out = printed(ts, true);
        expect(out).toContain('IDictionary<string, object> byId = this.currencies_by_id;');
        expect(printed(ts, false)).toContain('object byId = this.currencies_by_id;');
    });

    test('a string-typed object local concatenates with the null test and an object right casts like the helper', () => {
        const ts = BASE + '    f (a: any, b: any) { const id = this.safeString (a, "id"); const key = id + "-" + b; let auth = this.safeString (a, "x"); auth += "?"; return [key, auth]; }\n}';
        const out = printed(ts, false);
        expect(out).toContain('((object)(id == null ? null : id + "-" + (string)(object)(b)))');
        expect(out).toContain('auth = ((object)(auth == null ? null : auth + "?"))');
    });

    test('a copy of a string-typed local keeps the helper', () => {
        const ts = BASE + '    f (a: any) { const s = this.safeString (a, "s"); let m = s; m = m + "x"; return m; }\n}';
        expect(printed(ts, false)).not.toContain('m == null');
    });

    test('a right operand with effects and a non-string left keep the helper', () => {
        const ts = BASE + '    f (a: any, n: number, m: any) { const id = this.safeString (a, "id"); const x = id + (n++); const y = n + 1; const z = m + "s"; return [x, y, z]; }\n}';
        const out = printed(ts, false);
        expect(out).toContain('add(id, ');
        expect(out).not.toContain('id == null');
        expect(out).toContain('add(m, "s")');
    });
});
