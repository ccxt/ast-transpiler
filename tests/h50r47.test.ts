import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a ws error handler that prints its message through `this.json`, called only from a routed handleMessage frame
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    json (o: any): string { return \'\'; }\n    hold (x: any): any { return x; }\n' +
    '    handleMessage (client: any, message: Dict) {\n        return message;\n    }\n' +
    '    routeMessage (client: any, message: Dict) {\n        this.handleMessage (client, message);\n    }\n}\n';
const wsClient = 'export default class Client {\n    lastPong: number = 0;\n}\n';
const proVenue = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    handleErrorMessage (client: Client, message: Dict): boolean {\n        const code = this.safeString (message, 'code');\n        if (code !== undefined) {\n            throw new Error (this.json (message));\n        }\n        return false;\n    }\n" +
    "    override handleMessage (client: Client, message: Dict) {\n        if (this.handleErrorMessage (client, message)) {\n            return;\n        }\n    }\n}\n";

describe ('rust handleErrorMessage json operand: a routed frame lends its dict handle', () => {
    const build = (src: string): string => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h50r47-'));
        try {
            fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
            fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
            fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
            fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
            fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), src);
            const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
            return t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
        } finally {
            fs.rmSync (root, { recursive: true, force: true });
        }
    };
    test ('the error handler takes the dict handle and the frame passes it as is', () => {
        const out = build (proVenue);
        expect (out).toMatch (/fn handleErrorMessage\([^)]*message: &crate::value::Dict\)/);
        expect (out).toContain ('json_stringify(message)');
        expect (out).not.toMatch (/fn handleErrorMessage\([^)]*message: &Value\)/);
    });
    test ('a second caller that is not a routed frame keeps the boxed slot', () => {
        const other = proVenue.replace ('    override handleMessage', "    handleOther (client: Client, message: any) {\n        this.handleErrorMessage (client, message);\n    }\n    override handleMessage");
        const out = build (other);
        expect (out).not.toMatch (/fn handleErrorMessage\([^)]*message: &crate::value::Dict\)/);
    });
    test ('a frame that hands a read of itself, not the frame, keeps the boxed slot', () => {
        const other = proVenue.replace ('if (this.handleErrorMessage (client, message))', "if (this.handleErrorMessage (client, this.hold (message)))");
        const out = build (other);
        expect (out).not.toMatch (/fn handleErrorMessage\([^)]*message: &crate::value::Dict\)/);
    });
});
