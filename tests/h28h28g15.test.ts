import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// `xs[last] = this.extend (..)` on a `[]any` local prints the native store only when `last` is a const
// `n - 1` of the slice's own length under an `n > 0` guard
describe ('h28g15 guarded last-index extend store', () => {
    const BASE = [
        'export class Exchange {',
        '    safeDict (a, b, c?): any { return {}; }',
        '    safeList (a, b, c?): any { return []; }',
        '    safeString (a, b, c?): any { return \'\'; }',
        '    extend (a, b?): any { return {}; }',
        '}',
        'type Dict = {[key: string]: any};',
        '',
    ].join ('\n');
    const HEADER = 'import { Exchange } from \'./base/Exchange\';\ntype Dict = {[key: string]: any};\ntype List = any[];\ntype Str = string | undefined;\n';
    const tmpRoot = path.join (process.env.TMPDIR || os.tmpdir ());
    const print = (body: string): string => {
        const tmp = fs.mkdtempSync (path.join (tmpRoot, 'h28g15-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { 'recursive': true });
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            fs.writeFileSync (path.join (src, 'ex.ts'), HEADER + 'export class ex extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': {} });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (path.join (src, 'ex.ts')).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    const METHOD = (pre: string, guard: string, inner: string, value = 'this.extend (this.safeDict (rows, lastIndex, {}), { \'c\': cursor })') => '    add (cursor: Str, response: Dict): List {\n'
        + '        const rows: Dict[] = [];\n        rows.push (response);\n'
        + '        const rowsLength = rows.length;\n' + pre
        + '        if (' + guard + ') {\n' + inner
        + '            rows[lastIndex] = ' + value + ';\n'
        + '        }\n'
        + '        return rows;\n'
        + '    }\n';
    const INNER = '            const lastIndex = rowsLength - 1;\n';
    test ('guarded const last index with an extend value prints native (fails on the base printer)', () => {
        const out = print (METHOD ('', '(rowsLength > 0) && (cursor !== undefined)', INNER));
        expect (out).toMatch (/rows\[lastIndex\] = this\.Extend\(/);
        expect (out).not.toContain ('AddElementToObject(rows');
    });
    test ('negative: last index declared before an unrelated guard keeps the helper', () => {
        const out = print (METHOD ('        const lastIndex = rowsLength - 1;\n', 'cursor !== undefined', ''));
        expect (out).toContain ('AddElementToObject(rows, lastIndex');
    });
    test ('negative: a value that may be nil (no default safeDict) keeps the helper', () => {
        const out = print (METHOD ('', 'rowsLength > 0', INNER, 'this.safeDict (rows, lastIndex)'));
        expect (out).not.toMatch (/rows\[lastIndex\] = this\.SafeDict/);
    });
    test ('negative: a guard on another length keeps the helper', () => {
        const out = print (METHOD ('        const other = response[\'n\'];\n', '(other > 0) && (cursor !== undefined)', INNER));
        expect (out).not.toMatch (/rows\[lastIndex\] = this\.Extend\(/);
    });
    test ('negative: a slice that is popped keeps the helper', () => {
        const out = print (METHOD ('        rows.pop ();\n', 'rowsLength > 0', INNER));
        expect (out).not.toMatch (/rows\[lastIndex\] = this\.Extend\(/);
    });
});
