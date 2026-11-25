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
        '    handleAck (client: Client, message: any) {',
        '        const keys = Object.keys (client.subscriptions);',
        '        for (let i = 0; i < keys.length; i++) {',
        '            const subscription = client.subscriptions[keys[i]];',
        '            this.hold (subscription);',
        '        }',
        '    }',
        '    handleOther (client: Client, message: any, ids: string[]) {',
        '        const flight = client.futures[ids[0]];',
        '        const joined = client.subscriptions[\'a:\' + ids[1]];',
        '        return this.hold ([ flight, joined ]);',
        '    }',
        '}',
        '',
    ].join('\n'),
};

describe('a subscriptions read keyed by a key-list element is the handle keyed read', () => {
    let out = '';
    beforeAll(() => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'h51r49-'));
        for (const [rel, text] of Object.entries(files)) {
            fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
            fs.writeFileSync(path.join(root, rel), text);
        }
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        out = t.transpileRustByPath(path.join(root, 'ts/src/pro/venue.ts')).content;
        fs.rmSync(root, { recursive: true, force: true });
    });
    test('the key-list element is lent to get_subscription', () => {
        expect(out).toMatch(/let (?:mut )?subscription: Value = (?:__ch|client)\.get_subscription\(&keys\.get\(i as usize\)\.cloned\(\)\.unwrap_or\(Value::Null\)\);/);
        expect(out).not.toMatch(/get_value\(&[^,]*subscriptions[^,]*, &keys/);
    });
    test('a futures element read and a built key are not taken by the rule', () => {
        expect(out).not.toMatch(/get_future\(&ids/);
        expect(out).not.toMatch(/get_subscription\(&\(/);
    });
});
