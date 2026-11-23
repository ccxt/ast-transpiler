import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const files: Record<string, string> = {
    'ts/src/base/Exchange.ts': 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o[k]; }\n    safeValue (o: any, k: any, d: any = undefined): any { return o[k]; }\n    hold (x: any): any { return x; }\n}\n',
    'ts/src/base/ws/Client.ts': 'export default class Client {\n    subscriptions: any = {};\n    url: string = "";\n    resolve (v: any, h: string | undefined = undefined): void {}\n}\n',
    'ts/src/pro/venue.ts': [
        "import Exchange from '../base/Exchange';",
        "import type { Dict } from '../base/Exchange';",
        "import Client from '../base/ws/Client';",
        'export default class venue extends Exchange {',
        '    handleTop (client: Client, message: Dict) {',
        "        const hash = this.safeString (message, 'h');",
        '        client.resolve (message, hash);',
        '        this.handleLeaf (client, message);',
        '    }',
        '    handleLeaf (client: Client, message: Dict) {',
        "        const sub = this.safeValue (client.subscriptions, 'k');",
        '        client.resolve (sub);',
        '    }',
        '    handleShared (client: Client, message: Dict) {',
        '        client.resolve (message);',
        '    }',
        '    handleGood (client: Client, message: Dict) {',
        '        this.handleShared (client, message);',
        '    }',
        '    handleBad (client: Client, message: Dict) {',
        '        this.hold (client);',
        '        this.handleShared (client, message);',
        '    }',
        '    handleMessage (client: Client, message: Dict) {',
        "        const methods: Dict = { 't': this.handleTop, 'g': this.handleGood, 'b': this.handleBad };",
        "        const method = this.safeValue (methods, 'x');",
        '        method.call (this, client, message);',
        '    }',
        '}',
        '',
    ].join('\n'),
};
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astfx-rs-wsh2-'));
for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
}
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

let out = '';
beforeAll(() => {
    const transpiler = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
    out = transpiler.transpileRustByPath(path.join(root, 'ts/src/pro/venue.ts')).content;
});
const header = (name: string) => out.split('\n').find((l) => l.includes(`fn ${name}(`)) ?? '';
const body = (name: string, next: string) => out.slice(out.indexOf(`fn ${name}(`), out.indexOf(`fn ${next}(`));
const HANDLE = 'client: &crate::pro::ws_client::ClientHandle';

describe('rust ws handler client handle handed to another handler', () => {
    test('a handler that hands client to a handler of the same set takes the handle, and so does the callee', () => {
        expect(header('handleTop')).toContain(HANDLE);
        expect(header('handleLeaf')).toContain(HANDLE);
        const b = body('handleTop', 'handleLeaf');
        expect(b).toMatch(/self\.handleLeaf\(client, /);
        expect(b).not.toContain('as_value()');
        expect(b).not.toContain('ClientHandle::from_value(&client)');
    });
    test('a callee also reached from a caller that keeps the box keeps the box, and so do all its callers', () => {
        expect(header('handleBad')).not.toContain('ClientHandle');
        expect(header('handleShared')).not.toContain('ClientHandle');
        expect(header('handleGood')).not.toContain('ClientHandle');
    });
});

const routedFiles: Record<string, string> = {
    'ts/src/base/Exchange.ts': [
        'export interface Dict { [key: string]: any }',
        'export type List = any[];',
        "import Client from './ws/Client';",
        'export default class Exchange {',
        '    handleMessage (client: Client, message: any) {}',
        '    handleListMessage (client: Client, message: List) {}',
        '    routeMessage (client: Client, message: any) {',
        '        if (Array.isArray (message)) { this.handleListMessage (client, message); } else { this.handleMessage (client, message); }',
        '    }',
        '}',
        '',
    ].join('\n'),
    'ts/src/base/ws/Client.ts': 'export default class Client {\n    subscriptions: any = {};\n    url: string = "";\n    resolve (v: any, h: string | undefined = undefined): void {}\n}\n',
    'ts/src/pro/routed.ts': [
        "import Exchange from '../base/Exchange';",
        "import type { Dict, List } from '../base/Exchange';",
        "import Client from '../base/ws/Client';",
        'export default class routed extends Exchange {',
        '    override handleMessage (client: Client, message: Dict) {',
        '        this.handleEvent (client, message);',
        '    }',
        '    override handleListMessage (client: Client, message: List) {',
        '        for (let i = 0; i < message.length; i++) {',
        '            this.handleEvent (client, message[i]);',
        '        }',
        '    }',
        '    handleEvent (client: Client, event: Dict) {',
        '        client.resolve (event);',
        '    }',
        '}',
        '',
    ].join('\n'),
};
const routedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'astfx-rs-wsh3-'));
for (const [rel, text] of Object.entries(routedFiles)) {
    fs.mkdirSync(path.dirname(path.join(routedRoot, rel)), { recursive: true });
    fs.writeFileSync(path.join(routedRoot, rel), text);
}
afterAll(() => fs.rmSync(routedRoot, { recursive: true, force: true }));

describe('rust ws handler client hand-off from a frame handler the base routes by name', () => {
    let routedOut = '';
    beforeAll(() => {
        const transpiler = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        routedOut = transpiler.transpileRustByPath(path.join(routedRoot, 'ts/src/pro/routed.ts')).content;
    });
    const rheader = (name: string) => routedOut.split('\n').find((l) => l.includes(`fn ${name}(`)) ?? '';
    test('a callee shared with a base-routed frame handler keeps the box, and so does the frame handler', () => {
        expect(rheader('handleListMessage')).not.toContain('ClientHandle');
        expect(rheader('handleEvent')).not.toContain('ClientHandle');
        expect(rheader('handleEvent')).toContain('client: Value');
    });
});
