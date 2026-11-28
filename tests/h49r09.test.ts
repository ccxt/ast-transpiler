import { Transpiler } from '../src/transpiler';
import { rustDispatch } from '../src/rustTranspiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const files: Record<string, string> = {
    'ts/src/base/Exchange.ts': 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o[k]; }\n    safeValue (o: any, k: any, d: any = undefined): any { return o[k]; }\n    handleMessage (client: any, message: Dict) {}\n    routeMessage (client: any, message: any) { this.handleMessage (client, message); }\n}\n',
    'ts/src/base/ws/Client.ts': 'export default class Client {\n    subscriptions: any = {};\n    url: string = "";\n    resolve (v: any, h: string | undefined = undefined): void {}\n}\n',
    'ts/src/pro/venue.ts': [
        "import Exchange from '../base/Exchange';",
        "import type { Dict } from '../base/Exchange';",
        "import Client from '../base/ws/Client';",
        'export default class venue extends Exchange {',
        '    handleAdd (client: Client, message: Dict) {',
        "        const hash = this.safeString (message, 'h');",
        '        client.subscriptions[hash] = message;',
        '        client.resolve (message, hash);',
        '    }',
        '    handleDrop (client: Client, message: Dict) {',
        "        const hash = this.safeString (message, 'h');",
        '        delete client.subscriptions[hash];',
        '        this.handleAdd (client, message);',
        '    }',
        '    handleReadAfter (client: Client, message: Dict) {',
        "        client.subscriptions['k'] = message;",
        "        const sub = this.safeValue (client.subscriptions, 'k');",
        '        client.resolve (sub);',
        '    }',
        '    handleWhole (client: Client, message: Dict) {',
        '        client.subscriptions = {};',
        '        client.resolve (message);',
        '    }',
        '    handleNested (client: Client, message: Dict) {',
        "        client.subscriptions['k']['n'] = message;",
        '        client.resolve (message);',
        '    }',
        '    override handleMessage (client: Client, message: Dict) {',
        "        const methods: Dict = { 'a': this.handleDrop, 'r': this.handleReadAfter, 'w': this.handleWhole, 'n': this.handleNested };",
        "        const method = this.safeValue (methods, 'x');",
        '        method.call (this, client, message);',
        '    }',
        '}',
        '',
    ].join('\n'),
};
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astfx-rs-h49r09-'));
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

describe('rust ws handler handle slot with subscriptions writes', () => {
    test('a subscriptions entry write prints through the typed mutable handle', () => {
        expect(header('handleAdd')).toContain('client: &mut crate::pro::ws_client::ClientHandle');
        const b = body('handleAdd', 'handleDrop');
        expect(b).toContain('client.add_subscription(');
        expect(b).not.toContain('ClientHandle::from_value(&client)');
    });
    test('a subscriptions entry delete prints through the handle and lends it to a linked handler', () => {
        expect(header('handleDrop')).toContain('client: &mut crate::pro::ws_client::ClientHandle');
        const b = body('handleDrop', 'handleReadAfter');
        expect(b).toContain('client.remove_subscription(');
        expect(b).not.toContain('__ch');
    });
    test('a subscriptions read after a write keeps the boxed client', () => {
        expect(header('handleReadAfter')).not.toContain('ClientHandle');
    });
    test('a whole subscriptions assignment keeps the boxed client', () => {
        expect(header('handleWhole')).not.toContain('ClientHandle');
    });
    test('a nested subscriptions write keeps the boxed client', () => {
        expect(header('handleNested')).not.toContain('ClientHandle');
    });
    test('the routed handleMessage keeps the shared handle', () => {
        expect(header('handleMessage')).toContain('client: &crate::pro::ws_client::ClientHandle');
    });
    test('the dispatch arm lends a mutable handle built from the boxed client', () => {
        expect(rustDispatch.wsArg('mutclient', 0)).toBe('&mut crate::pro::ws_client::ClientHandle::from_value(args.get(0).unwrap_or(&crate::Value::Null))');
    });
});
