import { Transpiler } from '../src/transpiler.js';
import { installCcxtGoLocalTypes } from '../src/goTranspiler.js';

const go = (body: string) => {
    const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    installCcxtGoLocalTypes (x.goTranspiler);
    const src = [
        'type Dict = { [key: string]: any };',
        'class Base {',
        '    safeList (a: any, b: any, c: any = undefined): any { return undefined; }',
        '    safeDict (a: any, b: any, c: any = undefined): any { return undefined; }',
        '    safeString (a: any, b: any, c: any = undefined): any { return undefined; }',
        '}',
        'class ex extends Base {',
        body,
        '}',
        '',
    ].join ('\n');
    return x.transpileGo (src).content as string;
};
const loop = (decl: string, after = '') => [
    '    parseX (data: Dict) {',
    '        const rows: Dict[] = this.safeList (data, \'rows\', []);',
    '        const out = [];',
    '        for (let i = 0; i < rows.length; i++) {',
    '            ' + decl,
    '            out.push (this.safeString (row, \'a\'));',
    after,
    '        }',
    '        return out;',
    '    }',
].join ('\n');

describe ('H33-P43 Dict element local of a []any list', () => {
    test ('a Dict local read from a typed []any local prints the comma-ok row read (fails on the base printer)', () => {
        const out = go (loop ('const row: Dict = rows[i];'));
        expect (out).toContain ('var row, _ = rows[i].(map[string]any)');
        expect (out).not.toContain ('MapTyped(rows[i])');
    });
    test ('a Dict local read from a typed map local by a string key prints the comma-ok read (missing key answers nil)', () => {
        const out = go ('    parseX (data: Dict, k: string) {\n        const byId: Dict = this.safeDict (data, \'m\', {});\n        const row: Dict = byId[k];\n        return this.safeString (row, \'a\');\n    }');
        expect (out).not.toContain ('MapTyped(byId[');
    });
    test ('negative: a list parameter printed any keeps the helper read (nil list, wrong kind)', () => {
        const out = go ('    parseX (rows) {\n        const out = [];\n        for (let i = 0; i < rows.length; i++) {\n            const row: Dict = rows[i];\n            out.push (this.safeString (row, \'a\'));\n        }\n        return out;\n    }');
        expect (out).not.toContain ('.(map[string]any)');
    });
    test ('negative: an optional-chain element read is left to the base printer', () => {
        const out = go (loop ('const row: Dict = rows?.[i];'));
        expect (out).not.toContain ('var row, _ = rows[i].(map[string]any)');
    });
    test ('the list keeps its declared []any type', () => {
        const out = go (loop ('const row: Dict = rows[i];'));
        expect (out).toContain ('var rows []any = SafeListTyped(data, "rows")');
    });
});
