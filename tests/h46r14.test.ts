import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a ws handler name quoted in another pro file that declares its own copy names that copy: the handler still borrows its message
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    hold (x: any): any { return x; }\n}\n';
const wsClient = 'export default class Client {\n    lastPong: number = 0;\n}\n';
const head = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict } from '../base/Exchange.js';\n";
const handler = (name: string): string => `    ${name} (client: Client, message: Dict) {\n        const data = this.safeString (message, 'data');\n        this.hold (data);\n    }\n`;
const dispatch = (names: string[]): string => '    handleMessage (client: Client, message: Dict) {\n        const methods: Dict = {\n' +
    names.map((n: string, i: number) => `            'k${i}': this.${n},\n`).join('') + '        };\n        this.hold (methods);\n    }\n';
const venue = head + 'export default class venue extends Exchange {\n' + handler('handleSnapshot') + handler('handleOwnQuoted') + handler('handleOtherQuoted') +
    dispatch([ 'handleSnapshot', 'handleOwnQuoted', 'handleOtherQuoted' ]) +
    "    route (client: Client, message: Dict) {\n        const name = 'handleOwnQuoted';\n        this.hold (name);\n    }\n}\n";
// declares its own handleSnapshot and quotes it; quotes handleOtherQuoted without declaring it
const other = head + 'export default class other extends Exchange {\n' + handler('handleSnapshot') +
    "    route (client: Client, message: Dict) {\n        const names = [ 'handleSnapshot', 'handleOtherQuoted' ];\n        this.hold (names);\n    }\n}\n";

describe ('rust ws handler message slot: a quoted name in a file declaring its own copy', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h46r14-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), venue);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'other.ts'), other);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('a name quoted only by a file that declares its own copy borrows the message', () => {
        expect (output).toMatch (/fn handle_?[sS]napshot\([^)]*message: &(?:indexmap::IndexMap<String, Value>|crate::value::Dict)/);
    });

    test ('negatives keep the Value slot', () => {
        // quoted in the handler's own file: a by-name route may reach it
        expect (output).toMatch (/fn handle_?[oO]wn_?[qQ]uoted\([^)]*message: Value/);
        // quoted in a file that does not declare it
        expect (output).toMatch (/fn handle_?[oO]ther_?[qQ]uoted\([^)]*message: Value/);
    });
});
