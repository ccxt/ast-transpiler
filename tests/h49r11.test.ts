import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a prediction venue's routed `handleMessage (client, message: Dict)` takes the frame as the dict handle
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    handleMessage (client: any, message: Dict) {}\n    routeMessage (client: any, message: any) {\n        this.handleMessage (client, message);\n    }\n}\n';
const wsClient = 'export default class Client {\n    lastPong: number = 0;\n    resolve (x: any, h: string) { return x; }\n}\n';
const head = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict, Str } from '../base/Exchange.js';\n";
const readVenue = head + 'export default class pvenue extends Exchange {\n' +
    "    handleTicker (client: Client, message: Dict) {\n        client.resolve (this.safeString (message, 'p'), 't');\n    }\n" +
    "    override handleMessage (client: Client, message: Dict) {\n        const e = this.safeString (message, 'e');\n" +
    "        if (e === 'ticker') {\n            this.handleTicker (client, message);\n        }\n    }\n}\n";
const writeVenue = head + 'export default class qvenue extends Exchange {\n' +
    "    override handleMessage (client: Client, message: Dict) {\n        message['o'] = 1;\n        client.resolve (this.safeString (message, 'e'), 'x');\n    }\n}\n";

describe ('rust routed prediction handleMessage frame as the dict handle', () => {
    const out: any = {};
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h49r11-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'prediction'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'prediction', 'pvenue.ts'), readVenue);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'prediction', 'qvenue.ts'), writeVenue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        out.r = t.transpileRustByPath (path.join (root, 'ts', 'src', 'prediction', 'pvenue.ts')).content;
        out.w = t.transpileRustByPath (path.join (root, 'ts', 'src', 'prediction', 'qvenue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('a routed prediction frame read and handed to a sibling takes the handle', () => {
        const fn = out.r.slice (out.r.indexOf ('fn handleMessage('));
        expect (fn).toMatch (/fn handleMessage\([^)]*message: &crate::value::Dict\)/);
        expect (fn).not.toMatch (/Value::Dict\(message/);
    });

    test ('negative: a prediction frame written into keeps the box', () => {
        expect (out.w).toMatch (/fn handleMessage\([^)]*message: Value\)/);
    });

    test ('negative: a prediction handler other than handleMessage keeps its own slot form', () => {
        expect (out.r).toMatch (/fn handleTicker\([^)]*message: &indexmap::IndexMap<String, Value>\)/);
    });
});
