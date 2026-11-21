import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go urls api dict locals read the urls views', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n'
        + '    urls!: { api: Dict; test: Dict; [key: string]: any };\n    options: Dict = {};\n'
        + '    safeDict (d: any, k: any, def: any = undefined): Dict { return d; }\n'
        + '    safeString (d: any, k: any, def: any = undefined): Str { return d; }\n';
    const print = (body: string, sub = 'pro'): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h25g05-'));
        try {
            const dir = path.join (tmp, 'ts', 'src', sub);
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'x.ts');
            fs.writeFileSync (file, HEAD + '    watch (key: string, params = {}) {\n' + body + '\n    }\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    test('api and ws dict locals read UrlsApi / UrlsApiSections (fails on the base printer)', () => {
        const out = print ("const apiUrls = this.safeDict (this.urls, 'api', {});\nconst wsUrls = this.safeDict (apiUrls, 'ws', {});\nreturn this.safeString (wsUrls, 'public') + this.safeString (apiUrls, 'rest');");
        expect (out).toContain ('var apiUrls map[string]any = this.UrlsApi');
        expect (out).toContain ('var wsUrls map[string]any = this.UrlsApiSections["ws"]');
        expect (out).not.toContain ('SafeMapTyped');
    });
    test('a nested safeDict of urls api reads the section view', () => {
        const out = print ("const wsUrls = this.safeDict (this.safeDict (this.urls, 'api', {}), 'ws', {});\nreturn this.safeString (wsUrls, 'public');", '');
        expect (out).toContain ('var wsUrls map[string]any = this.UrlsApiSections["ws"]');
    });
    test('a urls api local used only for its ws entry keeps that read (no unused Go local)', () => {
        const out = print ("const apiUrls = this.safeDict (this.urls, 'api', {});\nconst wsUrls = this.safeDict (apiUrls, 'ws', {});\nreturn this.safeString (wsUrls, 'public');");
        expect (out).toContain ('var apiUrls map[string]any = this.UrlsApi');
        expect (out).toContain ('var wsUrls, _ = apiUrls["ws"].(map[string]any)');
    });
    test('another urls entry keeps SafeMapTyped', () => {
        const out = print ("const t = this.safeDict (this.urls, 'test', {});\nreturn this.safeString (t, 'public');");
        expect (out).toContain ('var t, _ = this.Urls["test"].(map[string]any)');
    });
    test('a non-urls container keeps SafeMapTyped', () => {
        const out = print ("const a = this.safeDict (this.options, 'api', {});\nconst w = this.safeDict (a, 'ws', {});\nreturn this.safeString (w, 'public');");
        expect (out).not.toContain ('UrlsApi');
    });
    test('a dynamic urls key keeps SafeMapTyped', () => {
        const out = print ("const a = this.safeDict (this.urls, key, {});\nreturn this.safeString (a, 'public');");
        expect (out).not.toContain ('UrlsApi');
    });
});
