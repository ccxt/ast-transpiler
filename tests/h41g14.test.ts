import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

const BASE = 'type Dict = { [key: string]: any };\n'
    + 'class Base {\n'
    + '    urls!: { logo?: string; api: Dict; test: Dict; [key: string]: any };\n'
    + '    options: Dict = {};\n'
    + '    safeString (d: any, k: any, def?: string): string | undefined { return undefined; }\n'
    + '    safeBool (d: any, k: any, def?: boolean): boolean | undefined { return undefined; }\n'
    + '}\n';
const DESCRIBE = "describe () { return { 'urls': { 'api': { 'ws': { 'public': 'wss://a', 'utaPublic': 'wss://b', 'list': [ 'x' ] }, 'demo': { 'public': 'wss://c', 'utaPublic': 'wss://d' } } } }; }\n";

describe('go url ternary reassigned from a url leaf', () => {
    let transpiler: Transpiler;
    beforeAll(() => {
        transpiler = new Transpiler({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    });
    const venue = (stmts: string): string => {
        installCcxtGoHooks(transpiler.goTranspiler);
        return transpiler.transpileGo(BASE + 'class Test extends Base {\n    ' + DESCRIBE
            + '    client (url: string): any { return url; }\n'
            + '    f (uta: boolean): any { ' + stmts + ' }\n}\n').content;
    };
    const SEED = "let url = (uta === true) ? this.urls['api']['ws']['utaPublic'] : this.urls['api']['ws']['public']; ";
    const SANDBOX = "const sandbox = this.safeBool (this.options, 'sandbox', false); if (sandbox) { ";
    test('a rebind from more string leaves keeps the *string local and reads the typed view', () => {
        const out = venue(SEED + SANDBOX + "if (uta === true) { url = this.urls['api']['demo']['utaPublic']; } else { url = this.urls['api']['demo']['public']; } } return this.client (url);");
        expect(out).toContain('var url *string\n');
        expect(out).toContain('url = this.UrlsApiSectionStrings["demo"]["utaPublic"]');
        expect(out).toContain('url = this.UrlsApiSectionStrings["demo"]["public"]');
        expect(out).not.toContain('var url any');
        expect(out).not.toContain('UrlsApiSections[');
    });
    test('a ternary rebind of two string leaves keeps the *string local', () => {
        const out = venue(SEED + SANDBOX + "url = (uta === true) ? this.urls['api']['demo']['utaPublic'] : this.urls['api']['demo']['public']; } return this.client (url);");
        expect(out).toContain('var url *string\n');
        expect(out).not.toContain('UrlsApiSections[');
    });
    test('a ternary rebind with one non-string arm keeps the box', () => {
        const out = venue(SEED + SANDBOX + "url = (uta === true) ? this.urls['api']['demo']['utaPublic'] : this.urls['api']['ws']['list']; } return this.client (url);");
        expect(out).not.toContain('var url *string');
    });
    test('a rebind from a leaf the literal does not hold as a string keeps the box', () => {
        const out = venue(SEED + SANDBOX + "url = this.urls['api']['ws']['list']; } return this.client (url);");
        expect(out).not.toContain('var url *string');
        expect(out).not.toContain('UrlsApiSectionStrings');
    });
    test('a rebind from a missing leaf keeps the box', () => {
        const out = venue(SEED + SANDBOX + "url = this.urls['api']['demo']['none']; } return this.client (url);");
        expect(out).not.toContain('var url *string');
    });
    test('a rebind from a dynamic key keeps the box', () => {
        const out = venue(SEED + "const k = 'public'; " + SANDBOX + "url = this.urls['api']['demo'][k]; } return this.client (url);");
        expect(out).not.toContain('var url *string');
    });
    test('a lone url leaf read outside a write is unchanged', () => {
        const out = venue("return this.client (this.urls['api']['demo']['public']);");
        expect(out).not.toContain('UrlsApiSectionStrings');
    });
});
