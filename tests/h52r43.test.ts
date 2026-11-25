import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const BASE = [
    'export interface Dict { [key: string]: any }',
    'export type Str = string | undefined;',
    'export default class Exchange {',
    '    markets: Dict = {};',
    '    safeString (d: any, k: any, def: Str = undefined): Str { return d[k] ?? def; }',
    '    safeDict (d: any, k: any, def: Dict = undefined): Dict | undefined { return d[k] ?? def; }',
    '    safeBool (d: any, k: any, def: boolean = undefined): boolean { return d[k] ?? def; }',
    '    extend (...args: any[]): Dict { return {}; }',
    '    account (): Dict { return {}; }',
    '    keep (x: any): any { return x; }',
    '}',
    '',
].join('\n');

const venue = (body: string, extra = '') => [
    "import Exchange, { Dict, Str } from './base/Exchange.js';",
    'export default class venue extends Exchange {',
    extra,
    '    parseBal (response: any, code: Str): any {',
    body,
    '    }',
    '}',
    '',
].join('\n');

describe('a no-default safeDict local rewritten only with maps and stored whole takes the optional map', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h52r43-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
    const run = (name: string, text: string) => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } } as any);
        const file = path.join(tmp, 'ts', 'src', name + '.ts');
        fs.writeFileSync(file, text);
        return t.transpileRustByPath(file).content;
    };
    test('positive: extend rewrites in both arms, stored into a map', () => {
        const out = run('x1', venue("        const result: Dict = {};\n        let account = this.safeDict (result, code);\n        if (account === undefined) {\n            account = this.extend (this.account (), { 'free': '1' });\n        } else {\n            account = this.extend (account, { 'free': this.safeString (account, 'free') });\n        }\n        if (code !== undefined) {\n            result[code] = account;\n        }\n        return result;"));
        expect(out).toMatch(/let mut account: Option<crate::value::Dict> = /);
        expect(out).toMatch(/account\.map_or\(Value::Null, Value::Dict\)/);
        expect(out).toMatch(/account = Some\(self\.extend_t\(/);
        expect(out).not.toMatch(/into_opt_dict/);
        expect(out).not.toMatch(/let (mut )?account: Value\b/);
    });
    test('negative: a rewrite of unknown kind keeps the box', () => {
        const out = run('x2', venue("        const result: Dict = {};\n        let account = this.safeDict (result, code);\n        if (account === undefined) {\n            account = this.keep (response);\n        } else {\n            account = this.extend (account, { 'free': '2' });\n        }\n        if (code !== undefined) {\n            result[code] = account;\n        }\n        return result;"));
        expect(out).toMatch(/let (mut )?account: Value\b/);
    });
});
