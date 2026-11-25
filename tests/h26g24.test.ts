import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// `xs[K]` on a pointer-free []any local under an enclosing length / safeDict guard, or after an exiting `length === 0`
// guard, is the plain slice index; an unguarded read, a too-small guard, a rebound list or a closure keeps the guarded form.
describe ('go literal list read under a length guard', () => {
    const root = path.join (__dirname, 'files', 'tmp-h26g24', 'ts', 'src');
    const SRC =
        'type Dict = { [key: string]: any };\n' +
        'class Exchange {\n' +
        '    safeList (o: any, k: any, d: any = undefined): any[] { return o[k]; }\n' +
        '    safeDict (o: any, k: any, d: any = undefined): Dict { return o[k]; }\n' +
        '    safeString (o: any, k: any, d: any = undefined): string { return o[k]; }\n' +
        '    parseX (o: Dict): Dict { return o; }\n' +
        '}\n' +
        'class venue extends Exchange {\n' +
        '    tagged (response: Dict) {\n' +
        '        const rows: Dict[] = this.safeList (response, \'rows\', []);\n' +
        '        const cursor = this.safeString (response, \'cursor\');\n' +
        '        const first = this.safeDict (rows, 0);\n' +
        '        if ((first !== undefined) && (cursor !== undefined)) {\n' +
        '            rows[0][\'cursor\'] = cursor;\n' +
        '        }\n' +
        '        return rows;\n' +
        '    }\n' +
        '    exiting (response: Dict) {\n' +
        '        const items: Dict[] = this.safeList (response, \'items\', []);\n' +
        '        const n = items.length;\n' +
        '        if (n === 0) {\n' +
        '            return {};\n' +
        '        }\n' +
        '        const head = items[0];\n' +
        '        return this.parseX (head);\n' +
        '    }\n' +
        '    enclosing (response: Dict) {\n' +
        '        const lst: Dict[] = this.safeList (response, \'lst\', []);\n' +
        '        if (lst.length > 1) {\n' +
        '            return this.parseX (lst[1]);\n' +
        '        }\n' +
        '        return undefined;\n' +
        '    }\n' +
        '    tooSmall (response: Dict) {\n' +
        '        const sm: Dict[] = this.safeList (response, \'sm\', []);\n' +
        '        if (sm.length > 0) {\n' +
        '            return this.parseX (sm[1]);\n' +
        '        }\n' +
        '        return undefined;\n' +
        '    }\n' +
        '    unguarded (response: Dict) {\n' +
        '        const ug: Dict[] = this.safeList (response, \'ug\', []);\n' +
        '        return this.parseX (ug[0]);\n' +
        '    }\n' +
        '    rebound (response: Dict, other: Dict) {\n' +
        '        let rb: Dict[] = this.safeList (response, \'rb\', []);\n' +
        '        if (rb.length > 0) {\n' +
        '            rb = this.safeList (other, \'rb\', []);\n' +
        '            return this.parseX (rb[0]);\n' +
        '        }\n' +
        '        return undefined;\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (root, { recursive: true });
        const file = path.join (root, 'venue.ts');
        fs.writeFileSync (file, SRC);
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoLocalTypes (t.goTranspiler);
        out = t.transpileGoByPath (file).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h26g24'), { recursive: true, force: true }));
    test ('positive: a row write under a defined safeDict (xs, 0) guard indexes natively', () => {
        // H30-G31 prints the row store natively on the same proven index
        expect (out).toContain ('if row, ok := rows[0].(map[string]any); ok && (row != nil) {');
        expect (out).not.toMatch (/AddElementToObject\(GetValue\(rows, 0\)/);
    });
    test ('positive: an exiting length === 0 guard proves index 0', () => {
        expect (out).toMatch (/head any = items\[0\]|head = items\[0\]/);
        expect (out).not.toMatch (/0 < len\(items\)/);
    });
    test ('positive: an enclosing length > 1 guard proves index 1', () => {
        expect (out).toMatch (/ParseX\(lst\[1\]\)/);
    });
    test ('negative: length > 0 does not prove index 1', () => {
        expect (out).toMatch (/1 < len\(sm\)/);
    });
    test ('negative: an unguarded read keeps the guard', () => {
        expect (out).toMatch (/0 < len\(ug\)/);
    });
    test ('negative: a list rebound after the guard keeps the guard', () => {
        expect (out).not.toMatch (/ParseX\(rb\[0\]\)/);
    });
});
