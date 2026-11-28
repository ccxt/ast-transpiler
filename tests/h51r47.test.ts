import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a routed frame that also spawns a sibling with itself, or writes its client's subscriptions, stays a dict handle
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    json (o: any): string { return \'\'; }\n    hold (x: any): any { return x; }\n    spawn (m: any, ...a: any[]): any { return m; }\n' +
    '    handleMessage (client: any, message: Dict) {\n        return message;\n    }\n' +
    '    routeMessage (client: any, message: Dict) {\n        this.handleMessage (client, message);\n    }\n}\n';
const wsClient = 'export default class Client {\n    lastPong: number = 0;\n    subscriptions: any = {};\n}\n';
const proVenue = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    handleErrorMessage (client: Client, message: Dict): boolean {\n        const code = this.safeString (message, 'code');\n        if (code !== undefined) {\n            throw new Error (this.json (message));\n        }\n        return false;\n    }\n" +
    "    override handleMessage (client: Client, message: Dict) {\n        if (this.handleErrorMessage (client, message)) {\n            return;\n        }\n    }\n}\n";

describe ('rust routed frame: spawn hand-off and client subscription writes', () => {
    const build = (src: string): string => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h51r47-'));
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
    const spawnPong = proVenue.replace ("            return;\n        }\n    }\n}", "            return;\n        }\n        this.spawn (this.pong, client, message);\n    }\n    pong (client: Client, message: any) {\n        return message;\n    }\n}");
    test ('a frame handed to this.spawn keeps the dict handle and boxes it in the spawn slice', () => {
        const out = build (spawnPong);
        expect (out).toMatch (/fn handleMessage\([^)]*message: &crate::value::Dict\)/);
        expect (out).toMatch (/fn handleErrorMessage\([^)]*message: &crate::value::Dict\)/);
        expect (out).toContain ('Value::from(message)]');
    });
    test ('a frame that writes its client subscriptions keeps the dict handle', () => {
        const out = build (proVenue.replace ("        if (this.handleErrorMessage", "        client.subscriptions['ok'] = true;\n        if (this.handleErrorMessage"));
        expect (out).toMatch (/fn handleMessage\([^)]*message: &crate::value::Dict\)/);
    });
    test ('a write into a local copied from the frame keeps the box', () => {
        const out = build (proVenue.replace ("        if (this.handleErrorMessage", "        const row = this.hold (message);\n        row['ok'] = true;\n        if (this.handleErrorMessage"));
        expect (out).not.toMatch (/fn handleMessage\([^)]*message: &crate::value::Dict\)/);
    });
    test ('a frame spawned to a target that is not a method reference keeps the box', () => {
        const out = build (spawnPong.replace ('this.spawn (this.pong, client, message)', 'this.spawn (this.hold (this.pong), client, message)'));
        expect (out).not.toMatch (/fn handleMessage\([^)]*message: &crate::value::Dict\)/);
    });
});
