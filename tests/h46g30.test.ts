import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go const locals of urls api read the UrlsApi view', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n'
        + '    urls!: { api: Dict; test: Dict; [key: string]: any };\n    options: Dict = {};\n'
        + '    safeString (d: any, k: any, def: any = undefined): Str { return d; }\n';
    const print = (body: string, sub = 'prediction'): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h46g30-'));
        try {
            const dir = path.join (tmp, 'ts', 'src', sub);
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'x.ts');
            fs.writeFileSync (file, HEAD + '    sign (group: string, params = {}) {\n' + body + '\n    }\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    test('an asserted urls api local reads natively (fails on the base printer)', () => {
        const out = print ("const baseUrls = this.urls['api'] as Dict;\nconst baseUrl = this.safeString (baseUrls, group, baseUrls['gamma']);\nreturn baseUrl;");
        expect (out).toContain ('var baseUrls map[string]any = this.UrlsApi');
        expect (out).not.toMatch (/GetValue\(baseUrls/);
    });
    test('a bare urls api local reads natively', () => {
        const out = print ("const baseUrls = this.urls['api'];\nreturn this.safeString (baseUrls, group, '');");
        expect (out).toContain ('var baseUrls map[string]any = this.UrlsApi');
    });
    test('a written urls api local keeps the box', () => {
        const out = print ("const baseUrls = this.urls['api'] as Dict;\nbaseUrls['x'] = 1;\nreturn this.json (baseUrls);");
        expect (out).not.toContain ('= this.UrlsApi\n');
    });
    test('another urls entry keeps the box', () => {
        const out = print ("const t = this.urls['test'] as Dict;\nreturn this.safeString (t, group, t['gamma']);");
        expect (out).not.toContain ('UrlsApi');
    });
    test('a let local keeps the box', () => {
        const out = print ("let u = this.urls['api'] as Dict;\nreturn this.safeString (u, group, u['gamma']);");
        expect (out).not.toContain ('u map[string]any = this.UrlsApi');
    });
});
