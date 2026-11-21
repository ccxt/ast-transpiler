import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go: a decoded JSON list handed to safe* readers keeps its pointer-free proof', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\ntype List = any[];\nclass Exchange {\n    options: Dict = {};\n'
        + '    safeString (d: any, k: any, def: any = undefined): Str { return d; }\n'
        + '    safeDict (d: any, k: any, def: any = undefined): any { return d; }\n'
        + '    safeList (d: any, k: any, def: any = undefined): any[] { return d; }\n'
        + '    safeValue (d: any, k: any, def: any = undefined): any { return d; }\n'
        + '    parseRow (r: Dict): Dict { return r; }\n'
        + '    async publicGetInfo (p: Dict = {}): Promise<any> { return this.request (p); }\n'
        + '    async request (p: Dict): Promise<any> { return p; }\n';
    const print = (body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h26g25-'));
        try {
            const dir = path.join (tmp, 'ts', 'src', 'base');
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'Exchange.ts');
            fs.writeFileSync (file, HEAD + '    async handle (message: Dict) {\n' + body + '\n    }\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    const LOOP = '\nconst out = [];\nfor (let i = 0; i < rows.length; i++) {\n    const entry = rows[i];\n    out.push (entry);\n}\nreturn out;';
    test('a safeList of a decoded response that is also handed to safeDict reads its element bare (fails on the base printer)', () => {
        const out = print ("const response = await this.publicGetInfo ();\nconst rows = this.safeList (response, 'data', []);\nconst first = this.safeDict (rows, 0, {});" + LOOP);
        expect (out).toMatch (/var entry any = rows\[i\]\n/);
        expect (out).not.toContain ('DerefScalar(rows[i])');
    });
    test('a list handed to a non-reader method keeps the boxed read', () => {
        const out = print ("const response = await this.publicGetInfo ();\nconst rows = this.safeList (response, 'data', []);\nthis.parseRow (rows as any);" + LOOP);
        expect (out).not.toMatch (/var entry any = rows\[i\]\n/);
    });
    test('a list that also receives a string pointer keeps the boxed read', () => {
        const out = print ("const response = await this.publicGetInfo ();\nconst rows = this.safeList (response, 'data', []);\nconst first = this.safeDict (rows, 0, {});\nrows.push (this.safeString (response, 'a'));" + LOOP);
        expect (out).not.toMatch (/var entry any = rows\[i\]\n/);
    });
});
