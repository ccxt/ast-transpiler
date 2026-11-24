import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// an async venue watch method whose `Dict` slot is only merged by `this.extend` borrows it from a literal local
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    extend (...args: any[]): any { return args[0]; }\n' +
    '    async watchMultiple (url: string, hashes: string[], request: any = undefined, sub: any = undefined, s: any = undefined): Promise<any> { return request; }\n' +
    '    async authenticate (params: Dict = {}): Promise<any> { return params; }\n}\n';
const proVenue = "import Exchange from '../base/Exchange.js';\nimport type { Dict, Str } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    async watchPrivateMultiple (messageHashes: string[], message: Dict, params: Dict = {}) {\n        await this.authenticate (params);\n        const subscribe: Dict = { 'id': 1 };\n        const request = this.extend (subscribe, message);\n        return await this.watchMultiple ('u', messageHashes, request, messageHashes, subscribe);\n    }\n" +
    "    async watchKept (messageHashes: string[], message: Dict, params: Dict = {}) {\n        const request = this.extend ({ 'id': 1 }, message);\n        return await this.watchMultiple ('u', messageHashes, request, messageHashes, message);\n    }\n" +
    "    async watchPositions (symbols: string[], params: Dict = {}) {\n        const messageHashes = [ 'positions' ];\n        const request: Dict = {\n            'event': 'subscribe',\n            'topic': 'position',\n        };\n        return await this.watchPrivateMultiple (messageHashes, request, params);\n    }\n" +
    "    async watchRead (messageHashes: string[], message: Dict, params: Dict = {}) {\n        const request = this.extend ({ 'id': 1 }, message);\n        const topic = message['topic'];\n        return await this.watchMultiple ('u', messageHashes, request, topic);\n    }\n" +
    "    async watchR (symbols: string[], params: Dict = {}) {\n        const request: Dict = { 'topic': 'r' };\n        return await this.watchRead ([ 'r' ], request, params);\n    }\n" +
    "    async watchK (symbols: string[], params: Dict = {}) {\n        const request: Dict = { 'topic': 'k' };\n        return await this.watchKept ([ 'k' ], request, params);\n    }\n}\n";

describe ('rust pro venue: watchPrivateMultiple borrows its literal message', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h46r13-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), proVenue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('the literal local is lent to the borrowed slot', () => {
        expect (output).toMatch (/fn watchPrivateMultiple\(&(?:mut )?self, messageHashes: [^,]+, message: &indexmap::IndexMap<String, Value>/);
        expect (output).toMatch (/self\.watchPrivateMultiple\([^;]*&request/);
    });

    test ('a map also handed on whole keeps the Value slot', () => {
        // a read beside the extend
        expect (output).not.toMatch (/fn watchRead\([^)]*message: &indexmap::IndexMap/);
        expect (output).not.toMatch (/fn watchKept\([^)]*message: &indexmap::IndexMap/);
    });
});
