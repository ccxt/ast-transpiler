import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler.js';

jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

const base = [
    'export interface Dict { [key: string]: any }',
    'export type Str = string | undefined;',
    'export default class Exchange {',
    '    safeString (o: any, k: any, d: Str = undefined): Str { return o; }',
    '}',
    '',
].join ('\n');
const venue = (body: string) => [
    'import Exchange from \'./base/Exchange.js\';',
    'import type { Dict, Str } from \'./base/Exchange.js\';',
    'export default class deepcoin extends Exchange {',
    body,
    '}',
    '',
].join ('\n');
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h53r02-'));
let n = 0;
const emit = (body: string): string => {
    const dir = path.join (root, String (n++));
    fs.mkdirSync (path.join (dir, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (dir, 'ts/src/base/Exchange.ts'), base);
    fs.writeFileSync (path.join (dir, 'ts/src/deepcoin.ts'), venue (body));
    const out = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } }).transpileRustByPath (path.join (dir, 'ts/src/deepcoin.ts')).content;
    return out.slice (Math.max (0, out.search (/fn parse_?[tT]ransfer_?[sS]tatus/)));
};

afterAll (() => {
    fs.rmSync (root, { 'recursive': true, 'force': true });
});

describe ('h53r02: a string literal returned from an Option<String> method', () => {
    test ('prints the payload, not a box read back', () => {
        const out = emit ([
            '    parseTransferStatus (status: Str): Str {',
            '        if (status === \'0\') {',
            '            return \'ok\';',
            '        }',
            '        return \'failed\';',
            '    }',
        ].join ('\n'));
        expect (out).toContain ('-> Option<String>');
        expect (out).toContain ('return Some("ok".to_string());');
        expect (out).toContain ('return Some("failed".to_string());');
        expect (out).not.toContain ('Value::Str("ok".into()).as_str()');
    });
    test ('nil stays None and a read stays a read', () => {
        const out = emit ([
            '    parseTransferStatus (status: Str): Str {',
            '        if (status === undefined) {',
            '            return undefined;',
            '        }',
            '        if (status === \'0\') {',
            '            return \'o"k\';',
            '        }',
            '        return status;',
            '    }',
        ].join ('\n'));
        expect (out).toContain ('return None;');
        expect (out).toContain ('return Some("o\\"k".to_string());');
        expect (out).not.toContain ('Some("status"');
    });
});
