import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go reads of exceptions ws entries use the ExceptionsWs view', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n'
        + '    exceptions: { [key: string]: Dict } = {};\n    options: Dict = {};\n'
        + '    throwExactlyMatchedException (d: any, k: any, f: any) { return d; }\n';
    const print = (body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h47g30-'));
        try {
            const dir = path.join (tmp, 'ts', 'src', 'pro');
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'x.ts');
            fs.writeFileSync (file, HEAD + '    handle (code: string, msg: string) {\n' + body + '\n    }\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    test('an exceptions ws entry reads natively (fails on the base printer)', () => {
        const out = print ("this.throwExactlyMatchedException (this.exceptions['ws']['exact'], code, msg);");
        expect (out).toContain ('this.ExceptionsWs["exact"]');
        expect (out).not.toMatch (/GetValue\(this\.Exceptions/);
    });
    test('a local bound from an exceptions ws entry reads natively', () => {
        const out = print ("const broad = this.exceptions['ws']['broad'];\nreturn broad;");
        expect (out).toContain ('this.ExceptionsWs["broad"]');
    });
    test('another exceptions entry keeps its shape', () => {
        const out = print ("this.throwExactlyMatchedException (this.exceptions['rest']['exact'], code, msg);");
        expect (out).not.toContain ('ExceptionsWs');
    });
    test('a write into the ws entry keeps the helper', () => {
        const out = print ("this.exceptions['ws']['exact'] = {};\nreturn 1;");
        expect (out).not.toContain ('ExceptionsWs');
    });
    test('a variable ws key is not the view', () => {
        const out = print ("const k = msg;\nthis.throwExactlyMatchedException (this.exceptions[k]['exact'], code, msg);");
        expect (out).not.toContain ('ExceptionsWs');
    });
});
