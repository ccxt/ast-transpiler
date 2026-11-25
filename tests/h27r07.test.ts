import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe('rust base ws helpers read their any-typed client through the typed handle', () => {
    const base = (body: string) => [
        'export type Str = string | undefined;',
        'export default class Exchange {',
        '    id: string;',
        body,
        '}',
        '',
    ].join('\n');
    const FIND = [
        '    findMessageHashes (client: any, element: string): string[] {',
        '        const result: string[] = [];',
        '        const messageHashes = Object.keys (client.futures);',
        '        for (let i = 0; i < messageHashes.length; i++) {',
        '            const messageHash = messageHashes[i];',
        '            if (messageHash.indexOf (element) >= 0) {',
        '                result.push (messageHash);',
        '            }',
        '        }',
        '        return result;',
        '    }',
    ].join('\n');
    const CLEAN = [
        '    cleanUnsubscription (client: any, subHash: Str, unsubHash: Str, subHashIsPrefix = false) {',
        '        if ((unsubHash !== undefined) && (unsubHash in client.subscriptions)) {',
        '            delete client.subscriptions[unsubHash];',
        '        }',
        '        if (subHash !== undefined) {',
        '            if (subHash in client.futures) {',
        "                client.reject ('x', subHash);",
        '            }',
        '        }',
        '        client.resolve (true, unsubHash);',
        '    }',
    ].join('\n');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h27r07-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    let n = 0;
    const run = (text: string) => {
        const dir = path.join(tmp, String(n++), 'ts', 'src', 'base');
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, 'Exchange.ts');
        fs.writeFileSync(file, text);
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        return t.transpileRustByPath(file).content;
    };
    test('findMessageHashes lists the handle future keys (fails on the base printer)', () => {
        const out = run(base(FIND));
        expect(out).not.toContain('get_value(client');
        expect(out).toContain('__ch.future_keys()');
        expect(out).toContain('crate::pro::ws_client::ClientHandle::from_value(&client)');
    });
    test('cleanUnsubscription key tests and deletes go through the handle', () => {
        const out = run(base(CLEAN));
        expect(out).not.toContain('get_value(client');
        expect(out).toContain('__ch.has_subscription(');
        expect(out).toContain('__ch.remove_subscription(');
        expect(out).toContain('__ch.has_future(');
    });
    test('negative: another base method with an any client keeps the helper', () => {
        const out = run(base(FIND.replace('findMessageHashes', 'otherHashes')));
        expect(out).not.toContain('ClientHandle');
    });
    test('negative: a reassigned client keeps the helper', () => {
        const out = run(base(FIND.replace('const result: string[] = [];', 'const result: string[] = []; client = {};')));
        expect(out).not.toContain('ClientHandle');
    });
    test('negative: a whole write of client.futures keeps the live read after it', () => {
        const out = run(base(FIND.replace('const result: string[] = [];', 'const result: string[] = []; client.futures = {};')));
        expect(out).not.toContain('future_keys()');
    });
    test('negative: a delete keyed by a local that is also a string-method receiver keeps the helper', () => {
        const body = [
            '    cleanUnsubscription (client: any, subHash: Str, unsubHash: Str, subHashIsPrefix = false) {',
            '        const keys = Object.keys (client.subscriptions);',
            '        for (let i = 0; i < keys.length; i++) {',
            '            const sub = keys[i];',
            '            if (sub.startsWith (subHash)) {',
            '                delete client.subscriptions[sub];',
            '            }',
            '        }',
            '    }',
        ].join('\n');
        const out = run(base(body));
        expect(out).toContain('__ch.subscription_keys()');
        expect(out).not.toContain('remove_subscription(');
        expect(out).toContain('let mut sub: Option<String>');
    });
});
