import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const files: Record<string, string> = {
    'ts/src/base/ws/Client.ts': [
        'export default class Client {',
        '    url: string;',
        '    subscriptions: any;',
        '    futures: any;',
        '    resolve (result: any, messageHash: string): any { return result; }',
        '    reject (result: any, messageHash: string = undefined): any { return result; }',
        '}',
        '',
    ].join('\n'),
    'ts/src/base/Exchange.ts': [
        'import Client from \'./ws/Client.js\';',
        'export default class Exchange {',
        '    client (url: string): Client { return new Client (); }',
        '    hold (x: any): any { return x; }',
        '}',
        '',
    ].join('\n'),
    'ts/src/pro/venue.ts': [
        'import Exchange from \'../base/Exchange.js\';',
        'import Client from \'../base/ws/Client.js\';',
        'export default class venue extends Exchange {',
        '    handleBook (client: Client, message: any, symbol: string) {',
        '        const requested = \'book:\' + symbol + \':requested\';',
        '        client.subscriptions[\'book:\' + symbol] = true;',
        '        if (requested in client.subscriptions) {',
        '            delete client.subscriptions[requested];',
        '        }',
        '        this.hold (client);',
        '        if (requested in client.subscriptions) {',
        '            return 1;',
        '        }',
        '        this.hold (client);',
        '        const entry = client.subscriptions[requested];',
        '        const kept = client.subscriptions;',
        '        return this.hold ([ entry, kept ]);',
        '    }',
        '}',
        '',
    ].join('\n'),
};

describe('ws client handle key methods after a subscriptions write read the live registry', () => {
    let out = '';
    beforeAll(() => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'h15m19-'));
        for (const [rel, text] of Object.entries(files)) {
            fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
            fs.writeFileSync(path.join(root, rel), text);
        }
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        out = t.transpileRustByPath(path.join(root, 'ts/src/pro/venue.ts')).content;
        fs.rmSync(root, { recursive: true, force: true });
    });
    test('a key test after the client was handed on is the handle key test', () => {
        expect(out.match(/__ch\.has_subscription\(requested\.as_str\(\)\)/g)?.length).toBe(2);
        expect(out).not.toContain('in_op(');
    });
    test('a keyed read after the write is the handle keyed read', () => {
        expect(out).toContain('__ch.get_subscription(requested.as_str())');
    });
    test('a whole-field read after the write is not the handle snapshot', () => {
        expect(out).not.toMatch(/let mut kept: Value = __ch\.subscriptions/);
    });
});
