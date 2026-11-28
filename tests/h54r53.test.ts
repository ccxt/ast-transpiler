import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const BASE_HEAD = [
    'export interface Dict { [key: string]: any }',
    'export type Str = string | undefined;',
    'export type Int = number | undefined;',
    'export default class Exchange {',
    '    id: string;',
    '    options: Dict;',
    '    safeString (d: any, k: any, def: Str = undefined): Str { return d[k] ?? def; }',
    '    networkCodeToId (c: string, cc: Str = undefined): Str { return c; }',
];

const SELECT = [
    '    selectNetworkKey (currencyCode: string, networkCode: Str, entries: Dict): Str {',
    '        let chosenNetworkId: Str = undefined;',
    '        if (networkCode !== undefined) {',
    '            const networkIdOrCode = this.networkCodeToId (networkCode, currencyCode);',
    '            if (networkIdOrCode === undefined) {',
    "                throw new Error (this.id + ' missing');",
    '            }',
    '            if (networkIdOrCode in entries) {',
    '                chosenNetworkId = networkIdOrCode;',
    '            } else {',
    "                throw new Error (this.id + ' ' + networkIdOrCode + ' not found');",
    '            }',
    '        }',
    '        return chosenNetworkId;',
    '    }',
];

const run = (body: string[], dir = 'base') => {
    const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h54r53-'));
    fs.mkdirSync (path.join (tmp, 'ts', 'src', 'base'), { 'recursive': true });
    fs.mkdirSync (path.join (tmp, 'ts', 'src', 'pro'), { 'recursive': true });
    const head = dir === 'base' ? BASE_HEAD : [ "import Exchange, { Dict, Str } from '../base/Exchange.js';", 'export default class venue extends Exchange {' ];
    fs.writeFileSync (path.join (tmp, 'ts', 'src', 'base', 'Exchange.ts'), [ ...BASE_HEAD, '}', '' ].join ('\n'));
    const file = path.join (tmp, 'ts', 'src', dir, dir === 'base' ? 'Exchange.ts' : 'venue.ts');
    fs.writeFileSync (file, [ ...head, ...body, '}', '' ].join ('\n'));
    const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    const out = t.transpileRustByPath (file).content;
    fs.rmSync (tmp, { 'recursive': true, 'force': true });
    return out;
};

describe ('h54-R53: a nil string local returned by a base method that keeps -> Value is Option<String>', () => {
    test ('base tier: typed local, boxed once at the return', () => {
        const out = run (SELECT);
        expect (out).toContain ('let mut chosenNetworkId: Option<String> = None;');
        expect (out).toContain ('return chosenNetworkId.map(Value::from).unwrap_or(Value::Null);');
        expect (out).not.toContain ('let mut chosenNetworkId: Value');
    });
    test ('a venue method keeps its own -> Option<String> form (no box at the return)', () => {
        const out = run (SELECT, 'pro');
        expect (out).toContain ('-> Option<String> {');
        expect (out).not.toContain ('return chosenNetworkId.map(Value::from)');
    });
    test ('negative: a local also read after an alias copy keeps Value', () => {
        const body = SELECT.map ((l) => (l.includes ('return chosenNetworkId') ? '        const other = chosenNetworkId;\n        return other;' : l));
        const out = run (body);
        expect (out).not.toContain ('let mut chosenNetworkId: Option<String> = None;');
    });
    test ('negative: a non-string write keeps Value', () => {
        const body = SELECT.map ((l) => (l.includes ('chosenNetworkId = networkIdOrCode') ? '                chosenNetworkId = entries[networkIdOrCode];' : l));
        const out = run (body);
        expect (out).not.toContain ('let mut chosenNetworkId: Option<String> = None;');
    });
    test ('the source read only in the other if arm moves into the local (no copy)', () => {
        const out = run (SELECT);
        expect (out).toContain ('chosenNetworkId = networkIdOrCode.take();');
        expect (out).toMatch (/let mut networkIdOrCode: Option<String>/);
        expect (out).not.toContain ('networkIdOrCode.clone()');
    });
    test ('negative: a source read again in the same arm keeps the copy', () => {
        const body = SELECT.map ((l) => (l.includes ('chosenNetworkId = networkIdOrCode') ? "                chosenNetworkId = networkIdOrCode;\n                this.safeString (entries, networkIdOrCode);" : l));
        const out = run (body);
        expect (out).not.toContain ('networkIdOrCode.take()');
    });
});
