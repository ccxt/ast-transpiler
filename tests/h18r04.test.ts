import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const files: Record<string, string> = {
    'ts/src/base/ws/Client.ts': 'export default class Client {\n    url: string;\n    resolve (result: any, messageHash: string): any { return result; }\n}\n',
    'ts/src/base/Exchange.ts': [
        'export type Dict = { [key: string]: any };',
        'export default class Exchange {',
        '    balance: Dict = {};',
        '    options: Dict = {};',
        '    safeDict (o: any, k: any, d: any = undefined): any { return o; }',
        '    safeBalance (b: Dict): Dict { return b; }',
        '    safeString (o: any, k: any, d: any = undefined): string { return o; }',
        '    safeList (o: any, k: any, d: any = undefined): any[] { return o; }',
        '    safeCurrencyCode (id: string, c: any = undefined): string { return id; }',
        '    account (): Dict { return {}; }',
        '}',
        '',
    ].join('\n'),
    'ts/src/pro/venue.ts': [
        'import Exchange from \'../base/Exchange.js\';',
        'import Client from \'../base/ws/Client.js\';',
        'export default class venue extends Exchange {',
        '    accountTypeOf (url: string): string { return \'spot\'; }',
        '    handleRow (client: Client, message: any) {',
        '        const posKey = this.safeString (message, \'k\');',
        '        const posHash = posKey + \':balance\';',
        '        const posRow = this.safeDict (this.balance, posKey, {});',
        '        const data = this.safeList (message, \'data\', []) as any[];',
        '        for (let i = 0; i < data.length; i++) {',
        '            const posCode = this.safeCurrencyCode (this.safeString (data[i], \'a\')) as string;',
        '            posRow[posCode] = this.account ();',
        '        }',
        '        this.balance[posKey] = this.safeBalance (posRow);',
        '        client.resolve (this.balance[posKey], posHash);',
        '    }',
        '    handleOptions (client: Client, message: any) {',
        '        const optKey = this.accountTypeOf (client.url);',
        '        const optRow = this.safeDict (this.options, optKey, {});',
        '        const optCode = this.safeCurrencyCode (this.safeString (message, \'a\')) as string;',
        '        optRow[optCode] = this.account ();',
        '        this.options[optKey] = optRow;',
        '    }',
        '    handleLetRow (client: Client, message: any) {',
        '        let letRow = this.safeDict (this.balance, \'spot\', {});',
        '        const letCode = this.safeCurrencyCode (this.safeString (message, \'a\')) as string;',
        '        letRow[letCode] = this.account ();',
        '        letRow = {};',
        '        this.balance[\'spot\'] = this.safeBalance (letRow);',
        '    }',
        '    handleNilKey (client: Client, message: any) {',
        '        const nilKey = this.safeString (message, \'t\');',
        '        const nilRow = this.safeDict (this.balance, nilKey, {});',
        '        if (nilKey === undefined) {',
        '            return;',
        '        }',
        '        this.balance[nilKey] = this.safeBalance (nilRow);',
        '    }',
        '}',
        '',
    ].join('\n'),
};

describe('a balance-row local keeps its string keys typed', () => {
    let out = '';
    beforeAll(() => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'h18r04-'));
        for (const [rel, text] of Object.entries(files)) {
            fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
            fs.writeFileSync(path.join(root, rel), text);
        }
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        out = t.transpileRustByPath(path.join(root, 'ts/src/pro/venue.ts')).content;
        fs.rmSync(root, { recursive: true, force: true });
    });
    const line = (name: string) => out.split('\n').find((l) => l.includes(`let ${name}:`) || l.includes(`let mut ${name}:`)) ?? '';
    test('the safeDict key of this.balance stays a string and is lent', () => {
        expect(line('posKey')).toContain('Option<String>');
        expect(out).toContain('Value::from(posKey.as_deref())');
    });
    test('a cast currency code keying the row local stays a string', () => {
        expect(line('posCode')).toContain('Option<String>');
        expect(out).toContain('insert(posCode.as_deref().unwrap_or("null").to_string()');
    });
    test('a row read from another field keeps the boxed code', () => {
        expect(line('optCode')).toContain(': Value');
    });
    test('a reassigned let row keeps the boxed code', () => {
        expect(line('letCode')).toContain(': Value');
    });
    test('a key that can be nil and is tested stays optional', () => {
        expect(line('nilKey')).toContain('Option<String>');
        expect(out).toContain('nilKey.is_none()');
    });
});
