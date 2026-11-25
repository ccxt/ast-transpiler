import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const BASE = [
    'export interface Dict { [key: string]: any }',
    'export type List = any[];',
    'export type Str = string | undefined;',
    'export default class Exchange {',
    '    balance: any = {};',
    '    orders: any = {};',
    '    safeDict (d: any, k: any, def: Dict = undefined): Dict { return d[k] ?? def; }',
    '    safeList (d: any, k: any, def: List = undefined): List { return d[k] ?? def; }',
    '    safeString (d: any, k: any, def: Str = undefined): Str { return d[k] ?? def; }',
    '    safeBalance (b: Dict): Dict { return b; }',
    '}',
    '',
].join('\n');

const src = (body: string[]) => [
    "import Exchange, { Dict, Str } from '../base/Exchange.js';",
    'export default class venue extends Exchange {',
    '    handleBalance (client: any, message: Dict) {',
    "        const type = 'spot';",
    ...body.map((l) => '        ' + l),
    '    }',
    '}',
    '',
].join('\n');

const rowSwap = [
    "const data = this.safeDict (message, 'd', {});",
    'if (!(type in this.balance)) {',
    '    this.balance[type] = {};',
    '}',
    'const balance = this.safeDict (this.balance, type, {});',
    "balance['info'] = data;",
    "balance['free'] = this.safeString (data, 'a');",
    'this.balance[type] = this.safeBalance (balance);',
];

describe('a typed dict stored into a balance row copy keeps its typed local', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h26r05-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'pro'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
    let k = 0;
    const run = (text: string) => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const file = path.join(tmp, 'ts', 'src', 'pro', 'venue' + (k++) + '.ts');
        fs.writeFileSync(file, text);
        return t.transpileRustByPath(file).content;
    };
    test('positive: the info store boxes the typed dict once, the local stays Dict', () => {
        const out = run(src(rowSwap));
        expect(out).toContain('let mut data: crate::value::Dict = ');
        expect(out).toContain('insert("info".into(), Value::from(&data))');
    });
    test('negative: a row read from a store other than balance/options (a tagged ws store) keeps the base form', () => {
        const out = run(src(rowSwap.map((l) => l.replace('this.safeDict (this.balance, type, {})', 'this.safeDict (this.orders, type, {})'))));
        expect(out).not.toContain('insert("info".into(), Value::from(&data))');
    });
    test('negative: a row read without the empty-map default keeps the base form', () => {
        const out = run(src(rowSwap.map((l) => l.replace('this.safeDict (this.balance, type, {})', 'this.safeDict (this.balance, type)'))));
        expect(out).not.toContain('insert("info".into(), Value::from(&data))');
    });
    test('negative: a nullable source that a consumer null-tests stays optional, never the plain Dict', () => {
        const body = rowSwap.map((l) => l.replace("this.safeDict (message, 'd', {})", "this.safeDict (message, 'd')"));
        body.push('if (data === undefined) {', '    return;', '}');
        const out = run(src(body));
        expect(out).not.toContain('let mut data: crate::value::Dict = ');
    });
});
