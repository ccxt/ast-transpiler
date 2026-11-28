import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a venue method declared `Promise<List>` whose every return is a `List` local set from an awaited endpoint returns the native list
const base = 'export interface Dict { [key: string]: any }\nexport type List = Array<any>;\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    handleOptionAndParams (p: Dict, m: string, k: string, d: any = undefined): any[] { return [ d, p ]; }\n' +
    '    async hold (x: any): Promise<any> { return x; }\n    async holdList (x: any): Promise<List> { return [ x ]; }\n    safeList (o: any, k: any, d: any[] = undefined): any[] | undefined { return o; }\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n}\n';
const abs = "import _Exchange from '../base/Exchange.js';\nimport type { List } from '../base/Exchange.js';\n" +
    'abstract class Exchange extends _Exchange {\n    webGetAccounts (params = {}): Promise<List> {\n        return this.hold (params);\n    }\n}\nexport default Exchange;\n';
const venue = "import Exchange from './abstract/venue.js';\nimport type { Dict, List, Str } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    async fetchAccountsList (params: Dict = {}): Promise<List> {\n        const [ method, query ] = this.handleOptionAndParams (params, 'fetchAccountsList', 'method', 'a');\n        if (method === 'b') {\n            const sub: List = this.safeList (query, 'a', []);\n            return sub;\n        }\n        const response: List = await this.webGetAccounts (query);\n        return response;\n    }\n" +
    "    async fetchLoose (params: Dict = {}): Promise<List> {\n        const rows = await this.hold (params);\n        return rows;\n    }\n" +
    "    async fetchUse (params: Dict = {}) {\n        const accounts: List = await this.fetchAccountsList (params);\n        return accounts.length;\n    }\n" +
    '}\n';

describe ('rust venue List own-container return from typed list locals', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h49r54-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.mkdirSync (path.join (root, 'ts', 'src', 'abstract'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'abstract', 'venue.ts'), abs);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('a List return of typed list locals prints the native list and returns the locals bare', () => {
        expect (output).toMatch (/fn fetchAccountsList\([^)]*\) -> crate::value::List/);
        expect (output).toMatch (/\n\s*return sub;/);
        expect (output).toMatch (/\n\s*return response;/);
        expect (output).not.toMatch (/return Value::Arr\(sub\)/);
    });

    test ('an untyped list local return keeps the Value return', () => {
        expect (output).toMatch (/fn fetchLoose\([^)]*\) -> Value/);
    });
});
