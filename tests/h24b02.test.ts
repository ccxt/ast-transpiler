import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go safeDict local read from a Dict tuple slot with a params default', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n    options: Dict = {};\n'
        + '    safeDict (d: any, k: any, def: any = undefined): Dict { return d; }\n'
        + '    safeString (d: any, k: any, def: any = undefined): Str { return d; }\n'
        + '    extend (a: any, b: any = undefined): Dict { return a; }\n'
        + '    handlePublicAddress (m: string, params: Dict): [Str, Dict] { return [ undefined, params ]; }\n'
        + '    handleAny (m: string, params: Dict): any { return [ undefined, params ]; }\n'
        + '    handleTwo (m: string, params: Dict): [Str, Str] { return [ undefined, undefined ]; }\n';
    const print = (body: string, sub = 'pro'): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h24b02-'));
        try {
            const dir = path.join (tmp, 'ts', 'src', sub);
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'x.ts');
            fs.writeFileSync (file, HEAD + '    watch (symbol: Str = undefined, params = {}) {\n' + body + '\n    }\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    const BODY = "const v = this.safeDict (this.handlePublicAddress ('watch', params), 1, params);\nconst dex = this.safeString (v, 'dex');\nreturn this.extend ({ 'a': dex }, v);";
    test('a ws local prints map[string]any (fails on the base printer)', () => {
        const out = print (BODY);
        expect (out).toContain ('var v map[string]any = this.SafeDictMap(this.HandlePublicAddress("watch", params), 1, params)');
    });
    test('a rest local prints map[string]any', () => {
        expect (print (BODY, '')).toContain ('var v map[string]any = this.SafeDictMap(');
    });
    test('an untyped container keeps the box', () => {
        const out = print ("const v = this.safeDict (this.handleAny ('watch', params), 1, params);\nreturn this.extend ({}, v);");
        expect (out).toContain ('var v any = this.SafeDict(');
    });
    test('a non-Dict tuple slot keeps the box', () => {
        const out = print ("const v = this.safeDict (this.handleTwo ('watch', params), 1, params);\nreturn this.extend ({}, v);");
        expect (out).toContain ('var v any = this.SafeDict(');
    });
    test('a nil-able default (no default) with a non-nil-test consumer keeps the box', () => {
        const out = print ("const v = this.safeDict (this.handlePublicAddress ('watch', params), 1);\nreturn this.extend ({}, v);");
        expect (out).not.toContain ('var v map[string]any');
    });
    test('a rebound params default keeps the box', () => {
        const out = print ("params = this.extend (params, {});\nconst v = this.safeDict (this.handlePublicAddress ('watch', params), 1, params);\nreturn this.extend ({}, v);");
        expect (out).not.toContain ('var v map[string]any');
    });
});
