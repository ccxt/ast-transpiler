import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a ws error handler called from handleMessage with the caller's own boxed `message: Dict` borrows a map
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    json (o: any): string { return \'\'; }\n    hold (x: any): any { return x; }\n' +
    '    handleMessage (client: any, message: Dict) {\n        return message;\n    }\n}\n';
const wsClient = 'export default class Client {\n    lastPong: number = 0;\n}\n';
const proVenue = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    handleErrorMessage (client: Client, message: Dict): boolean {\n        const code = this.safeString (message, 'code');\n        if (code !== undefined) {\n            throw new Error (code);\n        }\n        return false;\n    }\n" +
    "    handleJsonError (client: Client, message: Dict): boolean {\n        throw new Error (this.json (message));\n    }\n" +
    "    override handleMessage (client: Client, message: Dict) {\n        if (this.handleErrorMessage (client, message)) {\n            return;\n        }\n        this.handleJsonError (client, message);\n        this.hold (message);\n    }\n}\n";

describe ('rust venue dict slot: a boxed Dict parameter of the caller lends its map view', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h43r22-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), proVenue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('a read-only error handler takes a borrowed map and the caller lends its view', () => {
        expect (output).toMatch (/fn handle_error_message\([^)]*message: &indexmap::IndexMap<String, Value>\)/);
        expect (output).toMatch (/handle_error_message\([^;]*message\.as_map\(\)\.unwrap_or\(&Default::default\(\)\)/);
    });

    test ('a handler that hands the message on whole keeps the Value slot', () => {
        expect (output).not.toMatch (/fn handle_json_error\([^)]*message: &indexmap::IndexMap/);
        expect (output).not.toMatch (/handle_json_error\([^;]*as_map\(\)/);
    });
});
