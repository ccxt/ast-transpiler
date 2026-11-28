import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const BASE = [
    'export interface Dict { [key: string]: any }',
    'export type Str = string | undefined;',
    'export interface Order { [key: string]: any }',
    'export default class Exchange {',
    '    safeDict (d: any, k: any, def: Dict = undefined): Dict { return d[k] ?? def; }',
    '    safeString (d: any, k: any, def: Str = undefined): Str { return d[k] ?? def; }',
    '    parseOrder (o: Dict, market: any = undefined): Order { return o; }',
    '    hold (x: any): any { return x; }',
    '}',
    '',
].join('\n');

const src = (body: string) => [
    "import Exchange, { Dict, Order } from '../base/Exchange.js';",
    'export default class venue extends Exchange {',
    '    handleOrder (client: any, message: Dict) {',
    "        const result = this.safeDict (message, 'result', {});",
    "        const inner = this.safeDict (result, 'inner');",
    ...body.split('\n').map((l) => '        ' + l),
    '    }',
    '}',
    '',
].join('\n');

const POS = [
    'let order = undefined;',
    'if (inner !== undefined) {',
    '    order = this.parseOrder (inner);',
    '} else {',
    '    order = this.parseOrder (result);',
    '}',
    "client.resolve (order, 'h');",
].join('\n');

describe('h26-R14: a nil local written only from record parsers holds Option<Dict>', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h26r14-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'pro'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
    const run = (name: string, text: string) => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const file = path.join(tmp, 'ts', 'src', 'pro', name + '.ts');
        fs.writeFileSync(file, text);
        return t.transpileRustByPath(file).content;
    };
    test('parseOrder writes and a ws resolve type the local', () => {
        const out = run('venueA', src(POS));
        expect(out).toMatch(/let mut order: Option<crate::value::Dict> = None/);
        expect(out).toMatch(/order = Some\(self\.parseOrder\(/);
        expect(out).toContain('client.resolve(order.map_or(Value::Null, Value::Dict)');
    });
    test('negative: a write that is not a record parser keeps the box', () => {
        const out = run('venueB', src(POS.replace('this.parseOrder (result)', 'this.hold (result)')));
        expect(out).toMatch(/let mut order: Value = Value::Null/);
    });
    test('negative: a nil local read by a string reader keeps the box', () => {
        const out = run('venueC', src(POS + "\nconst s = this.safeString (order, 'id');\nthis.hold (s);"));
        expect(out).toMatch(/let mut order: Value = Value::Null/);
    });
});
