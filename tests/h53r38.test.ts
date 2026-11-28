import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a venue method declared `Promise<Dict>` whose only return is an awaited endpoint declared `Promise<Dict>`
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    extend (...args: any[]): any { return {}; }\n    hold (x: any): any { return x; }\n}\n';
const abstract = "import { Exchange as _Exchange } from '../base/Exchange.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default abstract class Exchange extends _Exchange {\n' +
    '    publicGetDetail (params = {}): Promise<Dict> {\n        return this.hold (params);\n    }\n' +
    '    publicGetRaw (params = {}): Promise<any> {\n        return this.hold (params);\n    }\n}\n';
const venue = "import Exchange from './abstract/venue.js';\nimport type { Dict, Str } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    async fetchRawDetail (id: string, params: Dict = {}): Promise<Dict> {\n        const request: Dict = { 'id': id };\n        return await this.publicGetDetail (this.extend (request, params));\n    }\n" +
    "    async fetchRawOther (id: string, params: Dict = {}): Promise<Dict> {\n        const request: Dict = { 'id': id };\n        return await this.publicGetRaw (this.extend (request, params));\n    }\n" +
    "    async fetchThing (id: string): Promise<Str> {\n        const detail: Dict = await this.fetchRawDetail (id);\n        const other: Dict = await this.fetchRawOther (id);\n        return this.safeString (detail, 'a', this.safeString (other, 'b'));\n    }\n}\n";

jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

describe ('rust venue method answering a declared Dict endpoint', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h53r38-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'abstract'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'abstract', 'venue.ts'), abstract);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
        if (process.env.H53R38_DUMP) fs.writeFileSync (process.env.H53R38_DUMP, output);
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('the method returns the dict and its caller takes it without a conversion (fails on the base printer)', () => {
        expect (output).toMatch (/fn fetchRawDetail\([^\n]*\) -> crate::value::Dict \{/);
        expect (output).toMatch (/return self\.public_get_detail\([^\n]*\)\.await\.into_dict\(\);/);
        expect (output).toMatch (/let (?:mut )?detail: crate::value::Dict = self\.fetchRawDetail\([^\n]*\)\.await;/);
    });
    test ('negative: an endpoint not declared Dict keeps the Value return and the caller conversion', () => {
        expect (output).toMatch (/fn fetchRawOther\([^\n]*\) -> Value \{/);
        expect (output).toMatch (/let (?:mut )?other: crate::value::Dict = self\.fetchRawOther\([^\n]*\)\.await\.into_dict\(\);/);
    });
});
