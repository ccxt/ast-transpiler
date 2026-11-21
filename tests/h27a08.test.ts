import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// a row read `this.safeDict|safeList (xs, K)` from a read-only JSON-origin []any local prints the comma-ok element
// assertion (bounds-proven, or tested in a statement); other receivers keep the SafeMapTyped / SafeListTyped wrap
describe ('go JSON-origin list row read at a literal index', () => {
    const root = path.join (__dirname, 'files', 'tmp-h27a08', 'ts', 'src');
    const SRC =
        'type Dict = { [key: string]: any };\n' +
        'class Exchange {\n' +
        '    safeList (o: any, k: any, d: any = undefined): any[] { return o[k]; }\n' +
        '    safeDict (o: any, k: any, d: any = undefined): Dict { return o[k]; }\n' +
        '    safeString (o: any, k: any, d: any = undefined): string { return o[k]; }\n' +
        '    parseX (o: Dict): Dict { return o; }\n' +
        '    request (path: any, api: any = undefined, method: any = undefined, params: any = {}): any { return {}; }\n' +
        '    publicGetRows (params: any = {}): any { return this.request (\'rows\', \'public\', \'GET\', params); }\n' +
        '}\n' +
        'class venue extends Exchange {\n' +
        '    async unguarded () {\n' +
        '        const response = await this.publicGetRows ();\n' +
        '        const rows = this.safeList (response, \'data\', []);\n' +
        '        const first = this.safeDict (rows, 0);\n' +
        '        return this.parseX (first);\n' +
        '    }\n' +
        '    async guarded () {\n' +
        '        const response = await this.publicGetRows ();\n' +
        '        const items = this.safeList (response, \'items\', []);\n' +
        '        if (items.length > 1) {\n' +
        '            const second = this.safeList (items, 1);\n' +
        '            return second;\n' +
        '        }\n' +
        '        return undefined;\n' +
        '    }\n' +
        '    async nilTested () {\n' +
        '        const response = await this.publicGetRows ();\n' +
        '        const lst = this.safeList (response, \'lst\', []);\n' +
        '        const head = this.safeDict (lst, 0);\n' +
        '        if (head === undefined) {\n' +
        '            return undefined;\n' +
        '        }\n' +
        '        return this.parseX (head);\n' +
        '    }\n' +
        '    async defaulted () {\n' +
        '        const response = await this.publicGetRows ();\n' +
        '        const dl = this.safeList (response, \'dl\', []);\n' +
        '        const d0 = this.safeDict (dl, 0, {});\n' +
        '        d0[\'x\'] = 1;\n' +
        '        return d0;\n' +
        '    }\n' +
        '    paramList (prs: any[]) {\n' +
        '        const pr = this.safeDict (prs, 0);\n' +
        '        return this.parseX (pr);\n' +
        '    }\n' +
        '    async written () {\n' +
        '        const response = await this.publicGetRows ();\n' +
        '        const wl = this.safeList (response, \'wl\', []);\n' +
        '        wl.push ({});\n' +
        '        const w0 = this.safeDict (wl, 0);\n' +
        '        return this.parseX (w0);\n' +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h27a08'), { recursive: true, force: true }));
    test ('positive: an unguarded index reads in a bounds-tested statement', () => {
        expect (out).toMatch (/var first map\[string\]any\n\s*if 0 < len\(rows\) \{\n\s*first, _ = rows\[0\]\.\(map\[string\]any\)\n\s*\}/);
        expect (out).not.toMatch (/SafeMapTyped\(rows, 0\)/);
    });
    test ('positive: a length guard proves the index of a list row', () => {
        expect (out).toMatch (/var second, _ = items\[1\]\.\(\[\]any\)/);
    });
    test ('positive: a nil-tested row keeps the nil answer of a missing element', () => {
        expect (out).toMatch (/head, _ = lst\[0\]\.\(map\[string\]any\)/);
        expect (out).toMatch (/if IsTrue\(IsEqual\(head, nil\)\)|if head == nil/);
    });
    test ('positive: a {}-defaulted row keeps the empty-map answer', () => {
        expect (out).toMatch (/d0, _ = dl\[0\]\.\(map\[string\]any\)\n\s*\}\n\s*if d0 == nil \{\n\s*d0 = map\[string\]any\{\}/);
    });
    test ('negative: a parameter list keeps the wrap', () => {
        expect (out).toMatch (/var pr map\[string\]any = SafeMapTyped\(prs, 0\)/);
        expect (out).not.toMatch (/pr, _ = /);
    });
    test ('negative: a list written into keeps the wrap', () => {
        expect (out).toMatch (/var w0 map\[string\]any = SafeMapTyped\(wl, 0\)/);
    });
});
