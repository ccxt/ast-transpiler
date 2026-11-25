import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler.js';

jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

const base = [
    'export interface Dict { [key: string]: any }',
    'export type Strings = string[] | undefined;',
    'export default class Exchange {',
    '    safeList (o: any, k: any, d: any[] = undefined): any[] | undefined { return o; }',
    '    safeStringN (o: any, k: any[]): string | undefined { return o; }',
    '    safeListN (o: any, k: any[], d: any[] = undefined): any[] | undefined { return o; }',
    '    safeStringList (o: any, keys: any[]): Strings { const s = this.safeStringN (o, keys); if (s !== undefined) { return [ s ]; } return this.safeListN (o, keys); }',
    '    hold (x: any): any { return x; }',
    '}',
    '',
].join ('\n');
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h36p03-'));
afterAll (() => fs.rmSync (root, { recursive: true, force: true }));
let seq = 0;
const rust = (body: string) => {
    const dir = path.join (root, 'v' + (seq++));
    fs.mkdirSync (path.join (dir, 'ts/src/base'), { recursive: true });
    fs.mkdirSync (path.join (dir, 'ts/src/pro'), { recursive: true });
    fs.writeFileSync (path.join (dir, 'ts/src/base/Exchange.ts'), base);
    const file = path.join (dir, 'ts/src/pro/venue.ts');
    fs.writeFileSync (file, [
        "import Exchange from '../base/Exchange.js';",
        "import type { Dict, Strings } from '../base/Exchange.js';",
        'export default class venue extends Exchange {',
        body,
        '}',
        '',
    ].join ('\n'));
    const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    return t.transpileRustByPath (file).content as string;
};

describe ('h36 P03 safeStringList answers its declared Strings in Rust', () => {
    test ('a null-tested safeStringList local looped by index holds the optional list (fails on the base printer)', () => {
        const out = rust ([
            '    f (sub: Dict) {',
            "        const hs: Strings = this.safeStringList (sub, [ 'messageHashes' ]);",
            '        if (hs !== undefined) {',
            '            for (let j = 0; j < hs.length; j++) {',
            '                this.hold (hs[j]);',
            '            }',
            '        }',
            '    }',
        ].join ('\n'));
        expect (out).toMatch (/let (mut )?hs: Option<crate::value::List> = self\.safeStringList\(/);
        expect (out).toContain ('hs.is_some()');
        expect (out).not.toContain ('hs: Value');
    });

    test ('negative: a missing / nil key is still a None test, never an empty list', () => {
        const out = rust ([
            '    f (sub: Dict) {',
            "        const hs = this.safeStringList (sub, [ 'k' ]);",
            '        if (hs === undefined) {',
            '            return 0;',
            '        }',
            '        return hs.length;',
            '    }',
        ].join ('\n'));
        expect (out).toContain ('hs.is_none()');
        expect (out).not.toContain ('unwrap_or_default().into_opt_list()');
    });

    test ('negative: a safeList with a non-nullish default keeps its own form', () => {
        const out = rust ([
            '    f (sub: Dict) {',
            "        const hs = this.safeList (sub, 'k', [ 'x' ]);",
            '        return hs.length;',
            '    }',
        ].join ('\n'));
        expect (out).not.toContain ('safe_string_list');
        expect (out).not.toMatch (/let hs: Option<crate::value::List>/);
    });
});
