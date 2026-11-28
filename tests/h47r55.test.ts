import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// a `safeList (.., [])` local whose length is read through `(rows as List).length` is still a list of maps
const base = "export interface Dict { [key: string]: any }\nexport type List = any[];\nexport type Str = string | undefined;\nexport default class Exchange {\n    safeList (o: any, k: any, d: any[]): any[];\n    safeList (o: any, k: any, d?: any[]): any[] | undefined;\n    safeList (o: any, k: any, d: any[] = undefined): any[] | undefined { return o; }\n    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n    hold (x: any): any { return x; }\n}\n";
const venue = (extra: string, len = '(data as List).length') => "import Exchange from './base/Exchange.js';\nimport type { Dict, List, Str } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    pick (response: Dict, wanted: string): Str {\n        const data = this.safeList (response, 'data', []);\n        const dataLength = " + len + ";\n        for (let i = 0; i < dataLength; i++) {\n            const entry = this.safeDict (data, i, {});\n            if (this.safeString (entry, 'id') === wanted) {\n                return this.safeString (entry, 'v');\n            }\n        }\n" + extra + "        return undefined;\n    }\n}\n";
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-h47r55-'));
afterAll (() => fs.rmSync (root, { recursive: true, force: true }));
jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

function run (dir: string, extra: string, len?: string): string {
    fs.mkdirSync (path.join (root, dir, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (root, dir, 'ts/src/base/Exchange.ts'), base);
    fs.writeFileSync (path.join (root, dir, 'ts/src/venue.ts'), venue (extra, len));
    return new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } }).transpileRustByPath (path.join (root, dir, 'ts/src/venue.ts')).content;
}

describe ('a cast length read keeps a safeList local a list of maps', () => {
    test ('the local converts once and its rows read as typed elements', () => {
        const out = run ('pos', '');
        expect (out).toContain ('let data: Vec<crate::value::Dict> = crate::value::dict_rows(');
        expect (out).not.toContain ('safe_dict_t(&data');
    });
    test ('negative: a list also handed on whole keeps the List local', () => {
        const out = run ('neg', '        this.hold (data);\n');
        expect (out).not.toContain ('Vec<crate::value::Dict> = crate::value::dict_rows(');
        expect (out).toContain ('let mut data: crate::value::List = ');
    });
});
