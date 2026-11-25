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
        '    async later (): Promise<any> { return 1; }',
        '    safeDict (o: any, k: any, d: any = undefined): any { return o; }',
        '}',
        '',
    ].join('\n'),
    'ts/src/pro/venue.ts': [
        'import Exchange from \'../base/Exchange.js\';',
        'import Client from \'../base/ws/Client.js\';',
        'export default class venue extends Exchange {',
        '    watchSynced (url: string, key: string) {',
        '        const client = this.client (url);',
        '        if (!(key in client.subscriptions)) {',
        '            client.subscriptions[key] = { \'a\': 1 };',
        '        }',
        '        const syncedRead = this.safeDict (client.subscriptions, key, {});',
        '        return syncedRead;',
        '    }',
        '    async watchAwaited (url: string, key: string) {',
        '        const client = this.client (url);',
        '        client.subscriptions[key] = { \'a\': 1 };',
        '        await this.later ();',
        '        const awaitedRead = this.safeDict (client.subscriptions, key, {});',
        '        return awaitedRead;',
        '    }',
        '    handleHanded (client: Client, key: string) {',
        '        delete client.subscriptions[key];',
        '        this.hold (client);',
        '        const handedRead = this.safeDict (client.subscriptions, key);',
        '        return handedRead;',
        '    }',
        '    handleNested (client: Client, key: string) {',
        '        client.subscriptions[key][\'x\'] = 1;',
        '        const nestedRead = this.safeDict (client.subscriptions, key);',
        '        return nestedRead;',
        '    }',
        '}',
        '',
    ].join('\n'),
};

describe('a safe read of client.subscriptions after a synced write reads the handle snapshot', () => {
    let out = '';
    beforeAll(() => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'h17r01-'));
        for (const [rel, text] of Object.entries(files)) {
            fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
            fs.writeFileSync(path.join(root, rel), text);
        }
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        out = t.transpileRustByPath(path.join(root, 'ts/src/pro/venue.ts')).content;
        fs.rmSync(root, { recursive: true, force: true });
    });
    const line = (name: string) => out.split('\n').find((l) => l.includes(`let ${name}`) || l.includes(`let mut ${name}`)) ?? '';
    test('after whole-statement writes with no await or hand-off it reads the snapshot field', () => {
        expect(line('syncedRead')).toMatch(/(?:__ch|\(client\))\.subscriptions/);
        expect(line('syncedRead')).not.toContain('client.subscriptions');
    });
    test('an await before the read keeps the live read', () => {
        expect(line('awaitedRead')).toContain('(client.subscriptions,');
        expect(line('awaitedRead')).not.toContain('__ch.subscriptions');
    });
    test('a hand-off of the client before the read keeps the live read', () => {
        expect(line('handedRead')).toContain('(client.subscriptions,');
        expect(line('handedRead')).not.toContain('__ch.subscriptions');
    });
    test('a nested write through the field keeps the live read', () => {
        expect(line('nestedRead')).toContain('(client.subscriptions,');
        expect(line('nestedRead')).not.toContain('__ch.subscriptions');
    });
});
