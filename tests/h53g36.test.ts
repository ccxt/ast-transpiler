import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// `xs[0] = this.extend (..)` (or a const local seeded by it) on a `[]any` local under an `n > 0` guard prints the native store
describe ('h53g36 guarded first-index extend store', () => {
    const BASE = [
        'export class Exchange {',
        '    safeDict (a, b, c?): any { return {}; }',
        '    safeList (a, b, c?): any[] { return []; }',
        '    safeString (a, b, c?): any { return \'\'; }',
        '    extend (a, b?): any { return {}; }',
        '}',
        'type Dict = {[key: string]: any};',
        '',
    ].join ('\n');
    const HEADER = 'import { Exchange } from \'./base/Exchange\';\ntype Dict = {[key: string]: any};\ntype List = any[];\ntype Str = string | undefined;\n';
    const tmpRoot = path.join (process.env.TMPDIR || os.tmpdir ());
    const print = (body: string): string => {
        const tmp = fs.mkdtempSync (path.join (tmpRoot, 'h53g36-'));
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
    const M = (guard: string, inner: string, write: string) => '    add (cursor: Str, response: Dict): List {\n'
        + '        const rows: Dict[] = [];\n        rows.push (response);\n'
        + '        const rowsLength = rows.length;\n'
        + '        if (' + guard + ') {\n' + inner + '            ' + write + '\n        }\n'
        + '        return rows;\n    }\n';
    test ('index 0 with an extend value under a length guard prints native (fails on the base printer)', () => {
        const out = print (M ('(cursor !== undefined) && (rowsLength > 0)', '', 'rows[0] = this.extend (rows[0], { \'c\': cursor });'));
        expect (out).toMatch (/rows\[0\] = this\.Extend\(rows\[0\], /);
        expect (out).not.toContain ('AddElementToObject(rows');
        expect (out).not.toContain ('func() any');
    });
    test ('index 0 with a const local seeded by extend prints native (fails on the base printer)', () => {
        const out = print (M ('rowsLength > 0', '            const first: Dict = this.extend (rows[0], { \'c\': cursor });\n', 'rows[0] = first;'));
        expect (out).toMatch (/rows\[0\] = first/);
        expect (out).not.toContain ('AddElementToObject(rows');
    });
    test ('negative: no length guard keeps the helper', () => {
        const out = print (M ('cursor !== undefined', '', 'rows[0] = this.extend (rows[0], { \'c\': cursor });'));
        expect (out).toContain ('AddElementToObject(rows, 0');
    });
    test ('negative: a let local keeps the helper', () => {
        const out = print (M ('rowsLength > 0', '            let first: Dict = this.extend (rows[0], { \'c\': cursor });\n            first = this.safeDict (response, \'x\');\n', 'rows[0] = first;'));
        expect (out).toContain ('AddElementToObject(rows, 0');
    });
    test ('negative: a const local that is not an extend (may be nil) keeps the helper', () => {
        const out = print (M ('rowsLength > 0', '            const first = this.safeDict (response, \'x\');\n', 'rows[0] = first;'));
        expect (out).toContain ('AddElementToObject(rows, 0');
    });
    test ('negative: index 1 keeps the helper', () => {
        const out = print (M ('rowsLength > 0', '', 'rows[1] = this.extend (rows[0], { \'c\': cursor });'));
        expect (out).toContain ('AddElementToObject(rows, 1');
    });
});
