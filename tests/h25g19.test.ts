import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go scalar-pointer store into a non-nil map local', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\ntype Int = number | undefined;\ntype Num = number | undefined;\nclass Exchange {\n    options: Dict = {};\n'
        + '    safeString (d: any, k: any, def: any = undefined): Str { return d; }\n'
        + '    safeInteger (d: any, k: any, def: any = undefined): Int { return d; }\n'
        + '    safeDict (d: any, k: any, def: any = undefined): Dict { return d; }\n'
        + '    parseNumber (v: any, def: any = undefined): Num { return v; }\n';
    const print = (body: string, base = false): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h25g19-'));
        try {
            const dir = base ? path.join (tmp, 'ts', 'src', 'base') : path.join (tmp, 'ts', 'src');
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, base ? 'Exchange.ts' : 'x.ts');
            fs.writeFileSync (file, HEAD + '    handle (response: Dict, key: string) {\n' + body + '\n    }\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    test('a *string local into an object-literal map prints the guarded deref store (fails on the base printer)', () => {
        const out = print ("const p = this.safeString (response, 'p');\nconst side: string = 'below';\nconst req: Dict = {};\nreq['oracle_' + side] = p;\nreturn req;");
        expect (out).toMatch (/if p != nil \{\n\s*req\["oracle_" \+ side\] = \*p\n\s*\} else \{\n\s*req\["oracle_" \+ side\] = nil\n\s*\}/);
        expect (out).not.toContain ('AddElementToObject(req');
    });
    test('a *int64 local into a safeDict-with-default local prints the guarded deref store', () => {
        const out = print ("const d = this.safeDict (this.options, 'x', {});\nconst ts = this.safeInteger (response, 'ts');\nd['ts'] = ts;\nreturn d;");
        expect (out).toContain ('d["ts"] = *ts');
        expect (out).not.toContain ('AddElementToObject(d');
    });
    test('a *float64 base call with a nil-guarded *string key binds the call once', () => {
        const out = print ("const code = this.safeString (response, 'c');\nconst fee = this.safeString (response, 'f');\nif (code !== undefined) {\n    const fees: Dict = {};\n    fees[code] = this.parseNumber (fee);\n    return fees;\n}\nreturn undefined;", true);
        expect (out).toMatch (/if ptrValue := this\.ParseNumber\(fee\); ptrValue != nil \{\n\s*fees\[\*code\] = \*ptrValue/);
    });
    test('a nil-guarded *string value under a guarded key stores the plain deref', () => {
        const out = print ("const c = this.safeString (response, 'c');\nconst n = this.safeString (response, 'n');\nif ((c !== undefined) && (n !== undefined)) {\n    const m: Dict = {};\n    m[n] = this.parseNumber (c);\n    return m;\n}\nreturn undefined;", true);
        expect (out).toContain ('m[*n] = *ptrValue');
    });
    test('a value pointer under its own nil guard stores the plain deref, no second guard', () => {
        const out = print ("const ts = this.safeInteger (response, 'ts');\nconst req: Dict = {};\nif (ts !== undefined) {\n    req['size'] = ts;\n}\nreturn req;");
        expect (out).not.toMatch (/if ts != nil \{\n\s*if ts != nil/);
        expect (out).not.toContain ('req["size"] = nil');
    });
    test('negative: an any value keeps the helper', () => {
        const out = print ("let v = undefined;\nv = response['x'];\nconst req: Dict = {};\nreq['oracle_' + key] = v;\nreturn req;");
        expect (out).not.toContain ('= *v');
    });
    test('negative: a safeDict local without a default (may be nil) is not stored unguarded', () => {
        const out = print ("const d = this.safeDict (response, 'x');\nconst ts = this.safeInteger (response, 'ts');\nd['ts'] = ts;\nreturn d;");
        expect (out).not.toMatch (/if ts != nil \{\n\s*d\["ts"\] = \*ts/);
    });
    test('negative: an unguarded *string key is not dereferenced', () => {
        const out = print ("const code = this.safeString (response, 'c');\nconst ts = this.safeInteger (response, 'ts');\nconst m: Dict = {};\nm[code] = ts;\nreturn m;");
        expect (out).not.toContain ('m[*code] = *ts');
    });
});
