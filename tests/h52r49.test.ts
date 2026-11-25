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
        '    async token (client: Client, hash: string) {',
        '        if (hash in client.futures) {',
        '            await this.hold (hash);',
        '            return client.subscriptions[\'token\'];',
        '        }',
        '        client.subscriptions[\'token\'] = hash;',
        '        await this.hold (hash);',
        '        return client.subscriptions[\'token\'];',
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

describe('a subscriptions read keyed by a string literal is the handle keyed read', () => {
    let out = '';
    beforeAll(() => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'h52r49-'));
        for (const [rel, text] of Object.entries(files)) {
            fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
            fs.writeFileSync(path.join(root, rel), text);
        }
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        out = t.transpileRustByPath(path.join(root, 'ts/src/pro/venue.ts')).content;
        fs.rmSync(root, { recursive: true, force: true });
    });
    test('a literal key, before and after a write of that key, is lent to get_subscription', () => {
        expect((out.match(/return (?:__ch|client)\.get_subscription\("token"\);/g) ?? []).length).toBe(2);
        expect(out).not.toMatch(/get_value\(&?client, &Value::Str\("subscriptions"/);
        expect(out).not.toMatch(/subscriptions\.clone\(\)\.as_map\(\)/);
    });
    test('a literal write and a built key are not taken by the rule', () => {
        expect(out).toMatch(/add_subscription\(/);
        expect(out).not.toMatch(/get_subscription\(&\(/);
        expect(out).not.toMatch(/get_future\(&ids/);
    });
});
