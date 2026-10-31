import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

// hx11 RF-cs-2: the native dictionary / list operations on the hand-written base members and the ws
// client maps are keyed on the member's DECLARED C# type (csharpDeclaredMemberType), which the embedding
// build layer reads from cs/ccxt/base/Exchange.Options.cs and cs/ccxt/ws/Client.cs. The fixture below
// declares the same members; the baseline run installs no hook and keeps every helper call.

const config = {
    'verbose': false,
    'csharp': { 'parser': { 'NUM_LINES_END_FILE': 0, 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(', 'ELEMENT_ACCESS_WRAPPER_CLOSE': ')' } }
};

const THIS: { [name: string]: any } = {
    'urls': { type: 'IDictionary<string, object>', initializer: 'new dict()', views: { api: { view: 'urlsApi', sections: 'urlsApiSections' } }, refresh: 'RefreshUrlsViews' },
    'headers': { type: 'IDictionary<string, object>', initializer: 'new dict()' },
    'fees': { type: 'IDictionary<string, object>', initializer: 'new dict()' },
    'accounts': { type: 'List<object>', initializer: 'new List<object>()' },
    'positions': { type: 'object' },
    'currencies': { type: 'object', initializer: 'new dict()' },
};
const CLIENT: { [name: string]: any } = {
    'subscriptions': { type: 'OwnedTable<object>' },
};

function printed(source: string, hooked: boolean, members: any = THIS): string {
    const transpiler = new Transpiler(config);
    const csharp: any = (transpiler as any).csharpTranspiler;
    if (hooked) {
        csharp.csharpDeclaredMemberType = (owner: string, name: string) => (owner === 'this' ? members : CLIENT)[name];
        csharp.csharpDeclaredMethodReturnType = (name: string) => (name === 'isDictionary' ? 'bool' : undefined);
    }
    return transpiler.transpileCSharp(source).content;
}

const BASE = 'class BaseExchange {\n'
    + '    urls!: { api: any, [key: string]: any };\n'
    + '    headers: any; fees: any; accounts!: any[]; positions: any; currencies: any;\n'
    + '    isDictionary (value: any): boolean { return true; }\n';
const CLIENT_CLASS = 'class Client { subscriptions: any; }\n';

describe('csharp declared hand-written members (RF-cs-2)', () => {
    test('a dictionary member reads, tests and sizes through its own declared type', () => {
        const ts = BASE + '    f (k: string) { const a = this.urls["x"]; if ("test" in this.headers) { return 1; } const b = this.fees[k]; return [a, b]; }\n}';
        const out = printed(ts, true);
        expect(out).toContain('object a = (this.urls != null && this.urls.ContainsKey("x") ? this.urls["x"] : null);');
        expect(out).toContain('if ((this.headers != null && this.headers.ContainsKey("test")))');
        expect(out).toContain('this.fees.ContainsKey((string)k) ? this.fees[(string)k] : null);');
        expect(printed(ts, false)).toContain('getValue(this.fees, k)');
    });

    test('a list member reads by index and length with the helper null branches', () => {
        const ts = BASE + '    f () { for (let i = 0; i < this.accounts.length; i++) { const a = this.accounts[i]; } return this.accounts[0]; }\n}';
        const out = printed(ts, true);
        expect(out).toContain('(this.accounts?.Count ?? 0)');
        expect(out).toContain('(this.accounts != null && 0 < this.accounts.Count ? this.accounts[0] : null)');
        expect(printed(ts, false)).toContain('getArrayLength(this.accounts)');
        expect(printed(ts, false)).toContain('getValue(this.accounts, 0)');
    });

    test('an object member whose every write stores a dictionary takes the dictionary form behind one cast', () => {
        const ts = BASE + '    f (type: string) { if (this.positions === undefined) { this.positions = {}; } if (type in this.positions) { return 1; } return 0; }\n}';
        const out = printed(ts, true);
        expect(out).toContain('(((IDictionary<string,object>)this.positions) != null && type is string inOpKey0 && ((IDictionary<string,object>)this.positions).ContainsKey(inOpKey0))');
        expect(printed(ts, false)).toContain('inOp(this.positions, type)');
    });

    test('an object member written with a non-dictionary box keeps the helper', () => {
        const ts = BASE + '    f (type: string) { this.currencies = new ArrayCache (); if (type in this.currencies) { return 1; } return 0; }\n}\nclass ArrayCache {}';
        expect(printed(ts, true)).toContain('inOp(this.currencies, type)');
    });

    test('the cast around a member declared as the dictionary interface is an identity and is not printed', () => {
        const ts = BASE + '    f () { const a = this.urls["x"]; this.urls["y"] = a; delete this.urls["z"]; }\n}';
        const out = printed(ts, true);
        expect(out).not.toContain('(IDictionary<string,object>)this.urls');
        expect(out).toContain('this.urls["y"] = a;');
        expect(printed(ts, false)).toContain('((IDictionary<string,object>)this.urls)["y"] = a;');
    });

    test('a ws client map read goes through the declared map type', () => {
        const ts = CLIENT_CLASS + BASE + '    f (client: Client, hash: string) { if (hash in client.subscriptions) { return 1; } return 0; }\n}';
        const out = printed(ts, true);
        expect(out).toContain('(client.subscriptions != null && hash is string inOpKey0 && client.subscriptions.ContainsKey(inOpKey0))');
        expect(printed(ts, false)).toContain('inOp(client.subscriptions, hash)');
    });

    test('a call to a hand-written bool callee loses the isTrue wrapper only when the declared return is bool', () => {
        const ts = BASE + '    f (v: any) { if (this.isDictionary(v)) { return 1; } return 0; }\n}';
        expect(printed(ts, true)).toContain('if (this.isDictionary(v))');
        const transpiler = new Transpiler(config);
        const csharp: any = (transpiler as any).csharpTranspiler;
        csharp.csharpDeclaredMethodReturnType = (name: string) => (name === 'isDictionary' ? 'object' : undefined);
        expect(transpiler.transpileCSharp(ts).content).toContain('if (isTrue(this.isDictionary(v)))');
    });

    test('a section read through the declared views uses the typed sections and a write refreshes them', () => {
        const ts = BASE + '    f (type: string) { const u = this.urls["api"]["ws"]["public"]; this.urls["api"] = u; return u; }\n}';
        const out = printed(ts, true);
        expect(out).toContain('(this.urlsApiSections.ContainsKey("ws") && this.urlsApiSections["ws"].ContainsKey("public") ? this.urlsApiSections["ws"]["public"] : null)');
        expect(out).toContain('this.urls["api"] = u;\n        this.RefreshUrlsViews();');
        const base = printed(ts, false);
        expect(base).not.toContain('urlsApiSections');
        expect(base).not.toContain('RefreshUrlsViews');
        const noViews = printed(ts, true, { ...THIS, urls: { type: 'IDictionary<string, object>', initializer: 'new dict()' } });
        expect(noViews).not.toContain('urlsApiSections');
        expect(noViews).not.toContain('RefreshUrlsViews');
    });

    test('a nested write below an entry owes no refresh and a comparison is no write', () => {
        const ts = BASE + '    f () { this.urls["api"]["ws"] = 1; if (this.urls === undefined) { return 1; } return 0; }\n}';
        const out = printed(ts, true);
        expect(out).not.toContain('RefreshUrlsViews');
    });
    test('a const omit of a declared dictionary member names the dictionary and a nullable-string key is tested', () => {
        const ts = BASE + '    f (k: string | undefined) { const rest = this.omit (this.urls, \'x\'); this.urls = rest; if (k in this.headers) { return 1; } return 0; }\n    omit (a: any, b: any): any { return a; }\n}';
        const out = printed(ts, true);
        expect(out).toContain('Dictionary<string, object> rest = this.omit(this.urls, "x");');
        expect(printed(ts, false)).toContain('object rest = this.omit(this.urls, "x");');
        const noHook = printed(ts, true, { ...THIS, urls: { type: 'object', initializer: 'new dict()' } });
        expect(noHook).toContain('object rest = this.omit(this.urls, "x");');
    });
});
