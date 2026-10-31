import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// RFM-G1 G01 (was ccxt build/hx10w5-G01.ts): urls views. The TS base declares `urls: { api: Dict; ... }`, and
// go/v4/exchange.go keeps `urls` a map[string]any plus two views re-derived by RefreshUrlsViews after every write:
// UrlsApi (urls["api"]) and UrlsApiSections (its dictionary entries). A read keyed on that declared type prints as
// the view's own map index; a write of urls is followed by the refresh.
let transpiler: Transpiler;
beforeAll(() => {
    transpiler = new Transpiler({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
});
const go = (ts: string, hooked = true): string => {
    if (hooked) { installCcxtGoHooks(transpiler.goTranspiler); }
    return transpiler.transpileGo(ts).content;
};

const BASE = 'type Dict = { [key: string]: any };\n'
    + 'class Base {\n'
    + '    urls!: { logo?: string; api: Dict; test: Dict; [key: string]: any };\n'
    + '    safeString (d: any, k: any, def?: string): string | undefined { return undefined; }\n'
    + '    clone (x: any): any { return x; }\n'
    + '}\n';
const run = (stmts: string, params = ''): string => go(BASE + 'class Test extends Base {\n    f (' + params + '): any { ' + stmts + ' }\n}\n');

describe('RFM-G1 G01 urls views', () => {
    test('a literal key on urls["api"] reads UrlsApi', () => {
        const out = run("return this.safeString (this.urls['api']['ws'], 'spot');");
        expect(out).toContain('this.SafeString(this.UrlsApi["ws"], "spot")');
        expect(out).not.toContain('GetValue(');
    });
    test('the second level reads UrlsApiSections', () => {
        const out = run("return this.urls['api']['ws']['public'];");
        expect(out).toContain('return this.UrlsApiSections["ws"]["public"]');
    });
    test('deeper levels keep the helper for the steps below the second', () => {
        const out = run("return this.urls['api']['ws']['ws-api']['spot'];");
        expect(out).toContain('GetValue(this.UrlsApiSections["ws"]["ws-api"], "spot")');
    });
    test('a string-typed key is a valid index, an any key keeps the helper', () => {
        expect(run("const section: string = 'ws'; return this.urls['api'][section];")).toContain('this.UrlsApi[section]');
        const boxed = run("return this.urls['api'][section];", 'section: any');
        expect(boxed).toContain('GetValue(this.Urls["api"], section)');
        expect(boxed).not.toContain('UrlsApi[');
    });
    test('an `as Dict` assertion prints as its operand; a bare parenthesis keeps the helper', () => {
        expect(run("return (this.urls['api'] as Dict)['ws']['privateV2'];")).toContain('this.UrlsApiSections["ws"]["privateV2"]');
        const bare = run("return (this.urls['api'])['ws']['public'];");
        expect(bare).not.toContain('UrlsApi');
    });
    test('a non-literal top key is not a view', () => {
        const out = run("const urlKey: string = 'api'; return this.urls[urlKey]['ws'];");
        expect(out).not.toContain('UrlsApi');
    });
    test('an entry the base does not declare a Dict keeps the helper', () => {
        const out = run("return this.urls['test']['ws'];");
        expect(out).not.toContain('UrlsApi');
    });
    test('other fields are untouched', () => {
        const out = run("return this.options['ws'];");
        expect(out).not.toContain('UrlsApi');
    });
    test('every write of urls or one of its entries refreshes the views, once', () => {
        const out = run("this.urls['api'] = this.urls['test']; this.urls = u; const n = 1; return n;", 'u: any');
        expect(out).toContain('this.Urls["api"] = this.Urls["test"]\n\tthis.RefreshUrlsViews()');
        expect(out).toContain('this.Urls = u\n\tthis.RefreshUrlsViews()');
        expect(out.split('RefreshUrlsViews').length - 1).toBe(2);
    });
    test('a comparison and a write of another field are not urls writes', () => {
        const out = run("if (this.urls['api'] === u) { this.options['x'] = 1; } return 1;", 'u: any');
        expect(out).not.toContain('RefreshUrlsViews');
    });
});
