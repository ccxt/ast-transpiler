import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// `xs[0]` / `xs[n - 1]` on a `[]any` slice parameter under an enclosing `n > 0` guard, as a this.safeX reader's object,
// is the plain index; an unguarded read, a parameter written in the body, a non-reader use or an `any` parameter keeps its form.
describe ('go guarded slice-parameter read in a safe reader', () => {
    const root = path.join (__dirname, 'files', 'tmp-h27g11', 'ts', 'src');
    const SRC =
        'type Dict = { [key: string]: any };\n' +
        'class Exchange {\n' +
        '    safeFloat (o: any, k: any, d: any = undefined): number { return o[k]; }\n' +
        '    other (o: any): any { return o; }\n' +
        '    filterByLimit (array: any[], limit: number = undefined, key: string = \'timestamp\') {\n' +
        '        if (limit !== undefined) {\n' +
        '            const n = array.length;\n' +
        '            if (n > 0) {\n' +
        '                const first = this.safeFloat (array[0], key);\n' +
        '                const last = this.safeFloat (array[n - 1], key);\n' +
        '                return [ first, last ];\n' +
        '            }\n' +
        '        }\n' +
        '        return array;\n' +
        '    }\n' +
        '    unguarded (array: any[], key: string = \'t\') {\n' +
        '        return this.safeFloat (array[0], key);\n' +
        '    }\n' +
        '    written (array: any[], key: string = \'t\') {\n' +
        '        const m = array.length;\n' +
        '        if (m > 0) {\n' +
        '            array = [];\n' +
        '            return this.safeFloat (array[0], key);\n' +
        '        }\n' +
        '        return undefined;\n' +
        '    }\n' +
        '    notReader (array: any[], key: string = \'t\') {\n' +
        '        const k = array.length;\n' +
        '        if (k > 0) {\n' +
        '            return this.other (array[0]);\n' +
        '        }\n' +
        '        return undefined;\n' +
        '    }\n' +
        '    boxed (array: any, key: string = \'t\') {\n' +
        '        const b = array.length;\n' +
        '        if (b > 0) {\n' +
        '            return this.safeFloat (array[0], key);\n' +
        '        }\n' +
        '        return undefined;\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (root, { recursive: true });
        const file = path.join (root, 'Exchange.ts');
        fs.writeFileSync (file, SRC);
        const slice = { 'filterByLimit': { 0: '[]any' }, 'unguarded': { 0: '[]any' }, 'written': { 0: '[]any' }, 'notReader': { 0: '[]any' } };
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async', 'unifiedSliceParams': slice } });
        installCcxtGoLocalTypes (t.goTranspiler);
        out = t.transpileGoByPath (file).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h27g11'), { recursive: true, force: true }));
    test ('positive: index 0 and n - 1 under an n > 0 guard read the slice natively', () => {
        expect (out).toMatch (/SafeFloat\(array\[0\], key\)/);
        expect (out).toMatch (/SafeFloat\(array\[n-1\], key\)/);
    });
    test ('negative: an unguarded read keeps its guarded form', () => {
        const body = out.slice (out.indexOf ('Unguarded('), out.indexOf ('Written('));
        expect (body).not.toMatch (/SafeFloat\(array\[0\], key\)/);
    });
    test ('negative: a parameter written in the body keeps its guarded form', () => {
        const body = out.slice (out.indexOf ('Written('), out.indexOf ('NotReader('));
        expect (body).not.toMatch (/SafeFloat\(array\[0\], key\)/);
    });
    test ('negative: a read outside a safe reader keeps its guarded form', () => {
        const body = out.slice (out.indexOf ('NotReader('), out.indexOf ('Boxed('));
        expect (body).not.toMatch (/Other\(array\[0\]\)/);
    });
    test ('negative: an any parameter keeps GetValue', () => {
        const body = out.slice (out.indexOf ('Boxed('));
        expect (body).toMatch (/GetValue\(array, 0\)/);
    });
});
