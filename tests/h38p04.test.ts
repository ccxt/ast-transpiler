import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a JSON-origin local handed whole to a parse method that only reads its row keeps the comma-ok reads
describe ('h38p04: a read-only parse callee keeps a JSON local native', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
        + '    safeString (o: any, k: any, d: string = undefined): string { return d; }\n    keep (o: any): any { return o; }\n}\nexport default BaseExchange;\n';
    const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ninterface Exchange {\n'
        + '    privateGetA (params?: {}): Promise<Dict>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
    const print = (body: string, other = ''): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h38p04-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'abstract'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'abstract', 'x.ts'), ABSTRACT);
            fs.writeFileSync (path.join (dir, 'go', 'v4', 'x_api.go'), 'func (this *x) PrivateGetA(args ...any) <-chan EndpointResult[map[string]any] {\n');
            if (other !== '') {
                fs.writeFileSync (path.join (dir, 'ts', 'src', 'y.ts'), 'import x from \'./x.js\';\nclass y extends x {\n' + other + '}\nexport default y;\n');
            }
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (file, 'import Exchange from \'./abstract/x.js\';\nclass x extends Exchange {\n' + body + '}\nexport default x;\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const fn = (parse: string) => '    async f (params = {}) {\n        const response = await this.privateGetA (params);\n'
        + '        const p = this.parseRow (response);\n        const rows = this.safeList (response, \'rows\', []);\n        return [ rows.length, p ];\n    }\n'
        + '    parseRow (row: Dict) {\n' + parse + '    }\n';
    const native = 'response["rows"].([]any)';
    test ('callee only reads the row: comma-ok read', () => {
        const out = print (fn ('        return { \'id\': this.safeString (row, \'id\'), \'info\': row };\n'));
        expect (out).toContain (native);
        expect (out).not.toContain ('SafeListTyped(response');
    });
    test ('callee writes a key: wrap stays', () => {
        expect (print (fn ('        row[\'id\'] = 1;\n        return row;\n'))).not.toContain (native);
    });
    test ('callee stores the row: wrap stays', () => {
        expect (print (fn ('        this.keep (row);\n        return 1;\n'))).not.toContain (native);
    });
    test ('callee overridden in a subclass file: wrap stays', () => {
        const out = print (fn ('        return this.safeString (row, \'id\');\n'), '    parseRow (row: any) {\n        row[\'id\'] = 1;\n        return row;\n    }\n');
        expect (out).not.toContain (native);
    });
    test ('callee rebinds the parameter: wrap stays', () => {
        expect (print (fn ('        row = {};\n        return row;\n'))).not.toContain (native);
    });
});
