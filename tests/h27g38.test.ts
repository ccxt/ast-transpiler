import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go any[] venue parameter fed only JSON lists reads its elements without DerefScalar', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\ntype List = any[];\nclass Exchange {\n'
        + '    safeString (d: any, k: any, def: any = undefined): Str { return d; }\n'
        + '    safeDict (d: any, k: any, def: any = undefined): Dict { return d; }\n'
        + '    safeList (d: any, k: any, def: any = undefined): any[] { return d; }\n'
        + '    parseRow (r: Dict): Dict { return r; }\n'
        + '    async request (path: any, api: any = undefined, method: any = undefined, params: any = undefined): Promise<any> { return {}; }\n'
        + '}\nclass Base extends Exchange {\n    publicGetX (params = {}) {\n        return this.request (\'x\', \'public\', \'GET\', params);\n    }\n}\n';
    const print = (body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h27g38-'));
        try {
            const dir = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'venue.ts');
            fs.writeFileSync (file, HEAD + 'class Venue extends Base {\n' + body + '\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    const PARSE = '    parseRows (rows: any[]): List {\n        const result = [];\n        for (let i = 0; i < rows.length; i++) {\n            result.push (this.parseRow (rows[i]));\n        }\n        return result;\n    }\n';
    const caller = (list: string): string => '    async fetchRows (): Promise<List> {\n        const response = await this.publicGetX ();\n        const data = this.safeDict (response, \'data\', {});\n'
        + list + '        return this.parseRows (rows);\n    }\n';
    test('the parameter of a JSON safeList caller reads bare (fails on the base printer)', () => {
        const out = print (PARSE + caller ('        const rows = this.safeList (data, \'list\', []);\n'));
        expect (out).toContain ('this.ParseRow(rows[i])');
        expect (out).not.toContain ('DerefScalar(rows[i])');
    });
    test('a caller handing a list that holds string pointers keeps DerefScalar', () => {
        const out = print (PARSE + caller ('        const rows = [];\n        rows.push (this.safeString (data, \'a\'));\n'));
        expect (out).toContain ('DerefScalar(rows[i])');
    });
    test('a caller whose list is written after the safeList keeps DerefScalar', () => {
        const out = print (PARSE + caller ('        const rows = this.safeList (data, \'list\', []);\n        rows.push (this.safeString (data, \'a\'));\n'));
        expect (out).not.toContain ('this.ParseRow(rows[i])');
    });
    test('a parameter written in the body keeps DerefScalar', () => {
        const body = '    parseRows (rows: any[]): List {\n        rows.push (this.safeString ({}, \'a\'));\n        const result = [];\n        for (let i = 0; i < rows.length; i++) {\n            result.push (this.parseRow (rows[i]));\n        }\n        return result;\n    }\n';
        const out = print (body + caller ('        const rows = this.safeList (data, \'list\', []);\n'));
        expect (out).toContain ('DerefScalar(rows[i])');
    });
});
