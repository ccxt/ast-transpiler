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
        '    pick (keys: string[]): string { return keys[0]; }',
        '    handleKeysOnly (client: Client, message: any) {',
        '        const subscriptions = client.subscriptions;',
        '        const keysOnly = Object.keys (subscriptions);',
        '        return this.pick (keysOnly);',
        '    }',
        '    handleWritten (client: Client, message: any) {',
        '        const subscriptions = client.subscriptions;',
        '        subscriptions[\'x\'] = true;',
        '        const keysWritten = Object.keys (subscriptions);',
        '        return this.pick (keysWritten);',
        '    }',
        '    handleNullTested (client: Client, message: any) {',
        '        const subscriptions = client.subscriptions;',
        '        if (subscriptions === undefined) {',
        '            return undefined;',
        '        }',
        '        const keysTested = Object.keys (subscriptions);',
        '        return this.pick (keysTested);',
        '    }',
        '    handleHandedAlias (client: Client, message: any) {',
        '        const subscriptions = client.subscriptions;',
        '        this.hold (subscriptions);',
        '        const keysHanded = Object.keys (subscriptions);',
        '        return this.pick (keysHanded);',
        '    }',
        '}',
        '',
    ].join('\n'),
};

describe('Object.keys of a keys-only alias of client.subscriptions prints the handle key list', () => {
    let out = '';
    beforeAll(() => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'h18r01-'));
        for (const [rel, text] of Object.entries(files)) {
            fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
            fs.writeFileSync(path.join(root, rel), text);
        }
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        out = t.transpileRustByPath(path.join(root, 'ts/src/pro/venue.ts')).content;
        fs.rmSync(root, { recursive: true, force: true });
    });
    const line = (name: string) => out.split('\n').find((l) => l.includes(`let ${name}`) || l.includes(`let mut ${name}`)) ?? '';
    const method = (name: string) => { const i = out.indexOf(`fn ${name}`); const j = out.indexOf('pub fn', i + 1); return out.slice(i, j < 0 ? undefined : j); };
    test('an alias read only by Object.keys prints subscription_keys and no alias local', () => {
        expect(line('keysOnly')).toContain('subscription_keys()');
        expect(line('keysOnly')).not.toContain('object_keys');
        expect(method('handle_keys_only')).not.toMatch(/let (mut )?subscriptions\b/);
    });
    test('a written alias keeps object_keys', () => {
        expect(line('keysWritten')).toContain('object_keys');
        expect(line('keysWritten')).not.toContain('subscription_keys');
    });
    test('a null-tested alias keeps object_keys', () => {
        expect(line('keysTested')).toContain('object_keys');
        expect(line('keysTested')).not.toContain('subscription_keys');
    });
    test('an alias handed to a call keeps object_keys', () => {
        expect(line('keysHanded')).toContain('object_keys');
        expect(line('keysHanded')).not.toContain('subscription_keys');
    });
});
