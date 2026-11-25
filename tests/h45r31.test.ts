import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// an async venue method whose `Dict` parameter is only an operand of the runtime `this.extend` borrows its map
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    extend (...args: any[]): any { return args[0]; }\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    async watch (url: string, hash: string, request: any = undefined, sub: any = undefined): Promise<any> { return request; }\n' +
    '    hold (x: any): any { return x; }\n}\n';
const proVenue = "import Exchange from '../base/Exchange.js';\nimport type { Dict, Str } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    async watchPublic (messageHash: string, message: Dict) {\n        const subscribe: Dict = { 'id': 1 };\n        const request = this.extend (subscribe, message);\n        return await this.watch ('u', messageHash, request, messageHash);\n    }\n" +
    "    async watchHead (messageHash: string, message: Dict) {\n        const request = this.extend (message, { 'id': 1 });\n        return await this.watch ('u', messageHash, request, messageHash);\n    }\n" +
    "    async watchStored (messageHash: string, message: Dict) {\n        const request = this.extend ({ 'id': 1 }, message);\n        return await this.watch ('u', messageHash, request, message);\n    }\n" +
    "    async watchHanded (messageHash: string, message: Dict) {\n        return await this.watch ('u', messageHash, message, messageHash);\n    }\n" +
    "    async watchA (symbol: string, params: Dict = {}) {\n        const request: Dict = { 'topic': symbol };\n        const message = this.extend (request, params);\n        return await this.watchPublic (symbol, message);\n    }\n" +
    "    async watchB (symbol: string, params: Dict = {}) {\n        const request: Dict = { 'topic': symbol };\n        const message = this.extend (request, params);\n        return await this.watchHead (symbol, message);\n    }\n" +
    "    async watchC (symbol: string, params: Dict = {}) {\n        const request: Dict = { 'topic': symbol };\n        const message = this.extend (request, params);\n        return await this.watchStored (symbol, message);\n    }\n" +
    "    async watchD (symbol: string, params: Dict = {}) {\n        const request: Dict = { 'topic': symbol };\n        const message = this.extend (request, params);\n        return await this.watchHanded (symbol, message);\n    }\n}\n";

describe ('rust pro venue: an async Dict parameter read only by this.extend is borrowed', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h45r31-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), proVenue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('an extend operand or head borrows the map', () => {
        expect (output).toMatch (/fn watchPublic\(&(?:mut )?self, messageHash: &str, message: &indexmap::IndexMap<String, Value>\)/);
        // the borrowed map is lent to the merge as it is, no copy
        expect (output).toMatch (/fn watchPublic\([^]*?self\.extend\(Value::Map\(subscribe\), &\[message\]\)/);
        expect (output).toMatch (/fn watchHead\(&(?:mut )?self, messageHash: &str, message: &indexmap::IndexMap<String, Value>\)/);
    });

    test ('negatives keep the Value slot', () => {
        // the map is also handed on whole
        expect (output).not.toMatch (/fn watchStored\([^)]*message: &indexmap::IndexMap/);
        expect (output).not.toMatch (/fn watchHanded\([^)]*message: &indexmap::IndexMap/);
    });

});
