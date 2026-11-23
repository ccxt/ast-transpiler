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
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h40r19-'));
afterAll (() => fs.rmSync (root, { recursive: true, force: true }));
let seq = 0;
const rust = (body: string) => {
    const dir = path.join (root, 'v' + (seq++));
    fs.mkdirSync (path.join (dir, 'ts/src/base'), { recursive: true });
    fs.mkdirSync (path.join (dir, 'ts/src'), { recursive: true });
    fs.writeFileSync (path.join (dir, 'ts/src/base/Exchange.ts'), base);
    const file = path.join (dir, 'ts/src/venue.ts');
    fs.writeFileSync (file, [
        "import Exchange from './base/Exchange.js';",
        "import type { Dict, Strings } from './base/Exchange.js';",
        'export default class venue extends Exchange {',
        body,
        '}',
        '',
    ].join ('\n'));
    const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    return t.transpileRustByPath (file).content as string;
};

describe ('h40 R19 a venue method declared Dict[] that returns a list it builds returns List in Rust', () => {
    test ('a built list of maps hands on its vector (fails on the base printer)', () => {
        const out = rust ([
            '    buildRows (xs: Dict): Dict[] {',
            '        const result: Dict[] = [];',
            "        result.push ({ 'a': this.hold (xs) });",
            '        return result;',
            '    }',
            '    useRows (xs: Dict) {',
            '        const rows: Dict[] = this.buildRows (xs);',
            '        return rows.length;',
            '    }',
        ].join ('\n'));
        expect (out).toMatch (/fn buildRows\([^\n]*\) -> crate::value::List/);
        expect (out).toContain ('return std::sync::Arc::new(result);');
    });

    test ('negative: an unannotated local of the call in the same file keeps the boxed return', () => {
        const out = rust ([
            '    buildRows (xs: Dict): Dict[] {',
            '        const result: Dict[] = [];',
            "        result.push ({ 'a': this.hold (xs) });",
            '        return result;',
            '    }',
            '    useRows (xs: Dict) {',
            '        const rows = this.buildRows (xs);',
            '        return rows[0];',
            '    }',
        ].join ('\n'));
        expect (out).not.toMatch (/fn buildRows\([^\n]*\) -> crate::value::List/);
    });

    test ('negative: an endpoint-shaped any return stays Value', () => {
        const out = rust ([
            '    passThrough (xs: any): Dict[] {',
            '        return xs;',
            '    }',
        ].join ('\n'));
        expect (out).not.toMatch (/fn passThrough\([^\n]*\) -> crate::value::List/);
    });
});
