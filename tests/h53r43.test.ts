import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const BASE = [
    'export interface Dict { [key: string]: any }',
    'export type Str = string | undefined;',
    'export default class Exchange {',
    '    id: string = "";',
    '    exceptions: Dict = {};',
    '    safeString (d: any, k: any, def: Str = undefined): Str { return d[k] ?? def; }',
    '    parseNumber (x: any): any { return x; }',
    '    throwExactlyMatchedException (e: any, s: string, m: string): void { }',
    '    throwBroadlyMatchedException (e: any, s: string, m: string): void { }',
    '}',
    '',
].join('\n');

const venue = (body: string) => [
    "import Exchange, { Dict, Str } from './base/Exchange.js';",
    'export default class venue extends Exchange {',
    '    probe (symbol: string, response: any, body: string): any {',
    body,
    '    }',
    '}',
    '',
].join('\n');

describe('a string local written from a typed string through `as string` keeps its string type', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h53r43-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
    const run = (name: string, text: string) => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } } as any);
        const file = path.join(tmp, 'ts', 'src', name + '.ts');
        fs.writeFileSync(file, text);
        return t.transpileRustByPath(file).content;
    };
    test('positive: `message = type as string` (Str source) types the local and moves the source', () => {
        const out = run('p1', venue("        const type = this.safeString (response, 'type');\n        let message = '';\n        const errorCodeName = this.safeString (response, 'errorCodeName');\n        if (errorCodeName !== undefined) {\n            message = errorCodeName;\n        } else {\n            message = type as string;\n        }\n        const feedback = this.id + ' ' + body;\n        this.throwExactlyMatchedException (this.exceptions['exact'], message, feedback);\n        this.throwBroadlyMatchedException (this.exceptions['broad'], message, feedback);\n        return undefined;"));
        expect(out).toMatch(/let mut message: Option<String> = Some\("".to_string\(\)\);/);
        expect(out).toMatch(/message = type_var;/);
        expect(out).not.toMatch(/let (mut )?message: Value\b/);
    });
    test('positive: a source read again later is cloned, not boxed', () => {
        const out = run('p2', venue("        const type = this.safeString (response, 'type');\n        let message = '';\n        if (type !== undefined) {\n            message = type as string;\n        }\n        return [ message, type ];"));
        expect(out).toMatch(/let mut message: Option<String> = /);
        expect(out).toMatch(/message = type_var\.clone\(\);/);
    });
    test('negative: an `as string` write of an untyped value keeps the box', () => {
        const out = run('n1', venue("        let message = '';\n        if (body !== '') {\n            message = response['m'] as string;\n        }\n        return message;"));
        expect(out).toMatch(/let mut message: Value\b/);
    });
    test('negative: an `as string` write of an untyped any local keeps the box', () => {
        const out = run('n2', venue("        const raw = response['m'];\n        let message = '';\n        if (body !== '') {\n            message = raw as string;\n        }\n        return message;"));
        expect(out).toMatch(/let mut message: Value\b/);
    });
});
