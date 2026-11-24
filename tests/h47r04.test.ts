import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a routed `handleMessage (client, message: Dict)` override takes the frame as the dict handle
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n    hold (x: any): any { return x; }\n' +
    '    handleMessage (client: any, message: Dict) {}\n    routeMessage (client: any, message: any) {\n        this.handleMessage (client, message);\n    }\n}\n';
const wsClient = 'export default class Client {\n    lastPong: number = 0;\n    resolve (x: any, h: string) { return x; }\n}\n';
const head = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict, Str } from '../base/Exchange.js';\n";
const readVenue = head + 'export default class rvenue extends Exchange {\n' +
    "    handleTicker (client: Client, message: Dict) {\n        client.resolve (this.safeString (message, 'p'), 't');\n    }\n" +
    "    override handleMessage (client: Client, message: Dict) {\n        const methods: Dict = { 'ticker': this.handleTicker };\n" +
    "        const event = this.safeString (message, 'e');\n        const method = this.safeValue (methods, event);\n" +
    "        if (method !== undefined) {\n            method.call (this, client, message);\n        }\n    }\n" +
    '    safeValue (o: any, k: any): any { return o; }\n}\n';
const writeVenue = head + 'export default class wvenue extends Exchange {\n' +
    "    override handleMessage (client: Client, message: Dict) {\n        message['o'] = 1;\n        client.resolve (this.safeString (message, 'e'), 'x');\n    }\n}\n";

describe ('rust routed handleMessage frame as the dict handle', () => {
    const out: any = {};
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h47r04-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'rvenue.ts'), readVenue);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'wvenue.ts'), writeVenue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        out.r = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'rvenue.ts')).content;
        out.w = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'wvenue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('a routed frame read and dispatched by name takes the handle and boxes it for the dispatch', () => {
        const fn = out.r.slice (out.r.indexOf ('fn handleMessage('));
        expect (fn).toMatch (/fn handleMessage\([^)]*message: &crate::value::Dict\)/);
        expect (fn).toMatch (/Value::from\(message\)/);
        expect (fn).not.toMatch (/Value::Dict\(message/);
    });

    test ('negative: a frame written into keeps the box', () => {
        expect (out.w).toMatch (/fn handleMessage\([^)]*message: Value\)/);
    });
});
