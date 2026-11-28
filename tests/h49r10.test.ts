import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const files: Record<string, string> = {
    'ts/src/base/Exchange.ts': [
        'export interface Dict { [key: string]: any }',
        'export type Str = string | undefined;',
        'export default class Exchange {',
        '    safeString (o: any, k: any, d: Str = undefined): Str { return o[k]; }',
        '    spawn (method: any, ...args: any[]): any { return method; }',
        '    hold (x: any): any { return x; }',
        '    async loadOrderBook (client: any, messageHash: string, symbol: string, limit: any = undefined, params: Dict = {}): Promise<any> { return undefined; }',
        '}',
        '',
    ].join('\n'),
    'ts/src/base/ws/Client.ts': 'export default class Client {\n    subscriptions: any = {};\n    url: string = "";\n    resolve (v: any, h: string | undefined = undefined): void {}\n}\n',
    'ts/src/pro/venue.ts': [
        "import Exchange from '../base/Exchange';",
        "import type { Dict } from '../base/Exchange';",
        "import Client from '../base/ws/Client';",
        'export default class venue extends Exchange {',
        '    handleBook (client: Client, message: Dict) {',
        "        const hash = this.safeString (message, 'h', '');",
        "        this.spawn (this.loadOrderBook, client, hash, 'BTC/USDT', undefined, {});",
        '        client.resolve (message, hash);',
        '    }',
        '    handleHeld (client: Client, message: Dict) {',
        "        this.spawn (this.loadOrderBook, client, 'h', 'BTC/USDT', undefined, {});",
        '        this.hold (client);',
        '    }',
        '    handleTarget (client: Client, message: Dict) {',
        '        const f = this.hold (message);',
        "        this.spawn (f, client, 'h');",
        '    }',
        '    handleLast (client: Client, message: Dict) {',
        '        client.resolve (message);',
        '    }',
        '}',
        '',
    ].join('\n'),
};
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astfx-rs-h49r10-'));
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

describe('rust ws handler client handle handed to this.spawn', () => {
    test('a spawn of a method reference takes the handle and hands the boxed form on', () => {
        expect(header('handleBook')).toContain(HANDLE);
        const b = body('handleBook', 'handleHeld');
        expect(b).toContain('client.as_value()');
        expect(b).not.toContain('client.clone()');
        expect(b).not.toContain('ClientHandle::from_value(&client)');
    });
    test('a spawn next to another boxed use keeps the box', () => {
        expect(header('handleHeld')).not.toContain('ClientHandle');
    });
    test('a spawn whose target is not a method reference keeps the box', () => {
        expect(header('handleTarget')).not.toContain('ClientHandle');
    });
});
