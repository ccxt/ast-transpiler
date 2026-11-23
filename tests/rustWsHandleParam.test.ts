import { Transpiler } from '../src/transpiler';
import { rustDispatch } from '../src/rustTranspiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const files: Record<string, string> = {
    'ts/src/base/Exchange.ts': 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o[k]; }\n    safeValue (o: any, k: any, d: any = undefined): any { return o[k]; }\n    hold (x: any): any { return x; }\n    useUrl (u: any): any { return u; }\n}\n',
    'ts/src/base/ws/Client.ts': 'export default class Client {\n    subscriptions: any = {};\n    url: string = "";\n    resolve (v: any, h: string | undefined = undefined): void {}\n}\n',
    'ts/src/pro/venue.ts': [
        "import Exchange from '../base/Exchange';",
        "import type { Dict } from '../base/Exchange';",
        "import Client from '../base/ws/Client';",
        'export default class venue extends Exchange {',
        '    handleTick (client: Client, message: Dict) {',
        "        const hash = this.safeString (message, 'h');",
        "        const sub = this.safeValue (client.subscriptions, 'k');",
        '        client.resolve (sub, hash);',
        '    }',
        '    handleUrl (client: Client, message: Dict) {',
        '        this.useUrl (client.url);',
        '        client.resolve (message);',
        '    }',
        '    handleHanded (client: Client, message: Dict) {',
        '        this.hold (client);',
        '    }',
        '    handleSpot (client: Client, message: Dict) {',
        "        const isSpot = client.url.indexOf ('spot') >= 0;",
        '        client.resolve (isSpot);',
        '    }',
        '    handleWrites (client: Client, message: Dict) {',
        "        client.subscriptions['k'] = message;",
        '    }',
        '    handleCalled (client: Client, message: Dict) {',
        '        client.resolve (message);',
        '    }',
        '    async handleAsync (client: Client, message: Dict) {',
        '        client.resolve (message);',
        '    }',
        '    handleMessage (client: Client, message: Dict) {',
        "        const methods: Dict = { 'a': this.handleTick, 'b': this.handleHanded, 'u': this.handleUrl, 's': this.handleSpot, 'c': this.handleWrites, 'd': this.handleAsync };",
        "        const method = this.safeValue (methods, 'x');",
        '        method.call (this, client, message);',
        '        this.handleCalled (client, message);',
        '    }',
        '}',
        '',
    ].join('\n'),
};
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astfx-rs-wsh-'));
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

describe('rust ws handler client handle param', () => {
    test('a by-name handler that only reads handle fields and resolves takes the typed handle', () => {
        expect(header('handleTick')).toContain('client: &crate::pro::ws_client::ClientHandle');
        const b = body('handleTick', 'handleHanded');
        expect(b).not.toContain('ClientHandle::from_value(&client)');
        expect(b).toContain('(client).subscriptions');
    });
    test('a url read on the typed handle goes through the accessor, no field clone', () => {
        expect(header('handleUrl')).toContain('client: &crate::pro::ws_client::ClientHandle');
        const b = body('handleUrl', 'handleHanded');
        expect(b).toContain('Value::from(client.url())');
        expect(b).not.toContain('url.clone()');
    });
    test('a handle field used as a method receiver keeps the boxed client and the in-place read', () => {
        expect(header('handleSpot')).not.toContain('ClientHandle');
        expect(body('handleSpot', 'handleWrites')).toContain('__ch.url.as_str().unwrap_or("").contains("spot")');
    });
    test('a handler that hands client on whole keeps the boxed client', () => {
        expect(header('handleHanded')).not.toContain('ClientHandle');
    });
    test('a handler that writes a handle field keeps the boxed client', () => {
        expect(header('handleWrites')).not.toContain('ClientHandle');
    });
    test('a handler with a direct call site keeps the boxed client', () => {
        expect(header('handleCalled')).not.toContain('ClientHandle');
    });
    test('an async handler keeps the boxed client', () => {
        expect(header('handleAsync')).not.toContain('ClientHandle');
    });
    test('the dispatch arm builds the handle from the boxed client (Null when missing)', () => {
        expect(rustDispatch.wsArg('client', 0)).toBe('&crate::pro::ws_client::ClientHandle::from_value(args.get(0).unwrap_or(&crate::Value::Null))');
    });
});
