import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go scalar accessor result stored into this.options', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\ntype Int = number | undefined;\nclass Exchange {\n    options: Dict = {};\n'
        + '    safeString (d: any, k: any, def: any = undefined): Str { return d; }\n'
        + '    safeInteger (d: any, k: any, def: any = undefined): Int { return d; }\n'
        + '    safeValue (d: any, k: any, def: any = undefined): any { return d; }\n';
    const print = (body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h24b05-'));
        try {
            const dir = path.join (tmp, 'ts', 'src', 'base');
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'Exchange.ts');
            fs.writeFileSync (file, HEAD + '    handle (response: Dict, key: string) {\n' + body + '\n    }\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    const printVenue = (body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h24b05-'));
        try {
            const dir = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'venue.ts');
            fs.writeFileSync (file, HEAD + '    handle (response: Dict, key: string) {\n' + body + '\n    }\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    test('a safeString result prints the guarded store bound in the if header (fails on the base printer)', () => {
        const out = print ("this.options['authorizer'] = this.safeString (response, 'authorizer');");
        expect (out).toMatch (/if accessed := this\.SafeString\(response, "authorizer"\); accessed != nil \{\n\s*this\.Options\["authorizer"\] = \*accessed\n\s*\} else \{\n\s*this\.Options\["authorizer"\] = nil\n\s*\}/);
        expect (out).not.toContain ('DerefScalar(');
    });
    test('a safeInteger result with a default prints the guarded store', () => {
        const out = print ("this.options['status'] = this.safeInteger (response, 'status', 6);");
        expect (out).toContain ('this.Options["status"] = *accessed');
        expect (out).not.toContain ('DerefScalar(');
    });
    test('a safeValue result (any) keeps the plain store', () => {
        const out = print ("this.options['v'] = this.safeValue (response, 'v');");
        expect (out).not.toContain ('accessed');
    });
    test('a safeString stored into a non-plain field target is untouched', () => {
        const out = print ("const m: Dict = {};\nm['a'] = this.safeString (response, 'a');");
        expect (out).not.toContain ('accessed');
    });
    test('a venue method of the same name keeps the plain store', () => {
        const out = printVenue ("this.options['a'] = this.safeString (response, 'a');");
        expect (out).not.toContain ('accessed');
    });
    test('a name clash picks a fresh binding', () => {
        const out = print ("const accessed = 'x';\nthis.options[accessed] = this.safeString (response, accessed);");
        expect (out).toContain ('accessedValue := this.SafeString');
    });
});
