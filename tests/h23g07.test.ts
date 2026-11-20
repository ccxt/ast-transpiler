import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go scalar-pointer local stored into this.options', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\ntype Int = number | undefined;\nclass Exchange {\n    options: Dict = {};\n'
        + '    safeString (d: any, k: any, def: any = undefined): Str { return d; }\n'
        + '    safeInteger (d: any, k: any, def: any = undefined): Int { return d; }\n';
    const print = (body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h23g07-'));
        try {
            const dir = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'x.ts');
            fs.writeFileSync (file, HEAD + '    handle (response: Dict, key: string) {\n' + body + '\n    }\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    test('a *string local prints the guarded deref store (fails on the base printer)', () => {
        const out = print ("const token = this.safeString (response, 'jwt');\nthis.options['authToken'] = token;");
        expect (out).toMatch (/if token != nil \{\n\s*this\.Options\["authToken"\] = \*token\n\s*\} else \{\n\s*this\.Options\["authToken"\] = nil\n\s*\}/);
        expect (out).not.toContain ('DerefScalar(token)');
    });
    test('a *int64 local prints the guarded deref store', () => {
        const out = print ("const ts = this.safeInteger (response, 'ts');\nthis.options['ts'] = ts;");
        expect (out).toContain ('this.Options["ts"] = *ts');
    });
    test('an any local keeps DerefScalar', () => {
        const out = print ("let v = undefined;\nv = response['x'];\nthis.options['v'] = v;");
        expect (out).not.toContain ('= *v');
    });
    test('a string literal value is untouched', () => {
        const out = print ("this.options['k'] = 'x';");
        expect (out).toContain ('this.Options["k"] = "x"');
        expect (out).not.toContain ('!= nil');
    });
});
