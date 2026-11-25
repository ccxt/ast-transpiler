import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// an endpoint declared `Promise<Dict>` whose answer feeds a venue `Dict` row also fed by a nil-declared `let`
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeList (o: any, k: any, d: any = undefined): any { return o; }\n    extend (...args: any[]): any { return {}; }\n}\n';
const abstract = "import { Exchange as _Exchange } from '../base/Exchange.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default abstract class Exchange extends _Exchange {\n' +
    '    privatePostCancel (params = {}): Promise<Dict> {\n        return this[\'request\'] (\'cancel\', \'private\', \'POST\', params);\n    }\n' +
    '    privatePostCancelMargin (params = {}): Promise<Dict> {\n        return this[\'request\'] (\'cancelm\', \'private\', \'POST\', params);\n    }\n}\n';
const venue = "import Exchange from './abstract/venue.js';\nimport type { Dict, Str } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    async cancelOrder (id: string, margin: boolean, params: Dict = {}) {\n        let response = undefined;\n        if (margin) {\n            response = await this.privatePostCancelMargin (this.extend ({}, params));\n        } else {\n            response = await this.privatePostCancel (this.extend ({}, params));\n        }\n        return this.parseCancelOrders (response);\n    }\n" +
    "    async cancelOrders (params: Dict = {}) {\n        const response = await this.privatePostCancel (this.extend ({}, params));\n        return this.parseCancelOrders (response);\n    }\n" +
    "    async cancelAll (params: Dict = {}) {\n        const response = await this.privatePostCancel (this.extend ({}, params));\n        return this.parseCancelOrders (response, {});\n    }\n" +
    "    parseCancelOrders (response: Dict, symbolsById: Dict = {}): any[] {\n        const success = this.safeList (response, 'success', []);\n        const result = [];\n        for (let i = 0; i < success.length; i++) {\n            result.push (this.safeString (symbolsById, this.safeString (success, i)));\n        }\n        return result;\n    }\n}\n";

describe ('rust endpoint Dict local handed to a venue row slot', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h52r02-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'abstract'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'abstract', 'venue.ts'), abstract);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('the const endpoint local keeps its Dict type', () => {
        expect (output).toMatch (/let (?:mut )?response: crate::value::Dict = self\.private_post_cancel\(/);
        expect (output).not.toMatch (/let (?:mut )?response: Value = self\.private_post_cancel\(/);
        expect (output).toMatch (/self\.parseCancelOrders\(&response, &\[Value::Map/);
    });

    test ('the nil-declared endpoint local keeps its optional map', () => {
        expect (output).toMatch (/let (?:mut )?response: Option<crate::value::Dict> = None;/);
    });
});
