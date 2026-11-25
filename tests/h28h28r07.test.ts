import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const BASE = [
    'export interface Dict { [key: string]: any }',
    'export type Str = string | undefined;',
    'export default class Exchange {',
    '    id: string;',
    '    safeDict (d: any, k: any, def: Dict = undefined): Dict { return d[k] ?? def; }',
    '    safeString (d: any, k: any, def: Str = undefined): Str { return d[k] ?? def; }',
    '    async privateGetKey (params = {}): Promise<any> { return {}; }',
    '}',
    '',
].join('\n');

const src = (body: string, ret = 'any') => [
    "import Exchange, { Dict, Str } from '../base/Exchange.js';",
    'export default class venue extends Exchange {',
    `    async getKey (client: any, isContract: boolean): Promise<${ret}> {`,
    ...body.split('\n').map((l) => '        ' + l),
    '    }',
    '}',
    '',
].join('\n');

const XT = [
    'let listenKey: Str = undefined;',
    'if (isContract) {',
    '    const response = await this.privateGetKey ();',
    "    listenKey = this.safeString (response, 'result');",
    '} else {',
    '    const response = await this.privateGetKey ();',
    "    const result = this.safeDict (response, 'result');",
    "    listenKey = this.safeString (result, 'accessToken');",
    '}',
    'if (listenKey === undefined) {',
    "    throw new Error (this.id + ' empty');",
    '}',
    "client.subscriptions['token'] = listenKey;",
    "client.resolve (listenKey, 'h');",
    'return listenKey;',
].join('\n');

const run = (name: string, text: string) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h28r07-'));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'pro'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
    const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
    const file = path.join(tmp, 'ts', 'src', 'pro', name + '.ts');
    fs.writeFileSync(file, text);
    const out = t.transpileRustByPath(file).content;
    fs.rmSync(tmp, { recursive: true, force: true });
    return out;
};

const typed = (out: string) => /let mut listenKey: Option<String> = None;/.test(out);

describe('h28-R07: a string nil local handed to client.resolve / client.subscriptions keeps Option<String>', () => {
    test('resolve and subscription store box the local; writes and the test stay native', () => {
        const out = run('venueA', src(XT));
        expect(typed(out)).toBe(true);
        expect(out).toContain('listenKey.is_none()');
        expect(out).toContain('add_subscription(&Value::Str("token".into()), listenKey.clone().map(Value::from).unwrap_or(Value::Null))');
        expect(out).toMatch(/client\.resolve\(listenKey(\.clone\(\))?\.map\(Value::from\)\.unwrap_or\(Value::Null\), "h"\)/);
    });
    test('negative: resolve on a receiver other than client is not a box slot', () => {
        const out = run('venueB', src(XT.replace("client.resolve (listenKey, 'h');", "const other = client; other.resolve (listenKey, 'h');")));
        expect(out).not.toContain('let mut listenKey: Option<String>');
    });
    test('negative: a subscriptions store on a non-client value is not a box slot', () => {
        const out = run('venueC', src(XT.replace("client.subscriptions['token'] = listenKey;", "const holder: any = {}; holder.subscriptions['token'] = listenKey;")));
        expect(out).not.toContain('let mut listenKey: Option<String>');
    });
});
