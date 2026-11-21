import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// `'lit' + xs[K]` where xs is a declared `string[]` local printed as `[]string` and the index printed native:
// a native Go string concat. Unguarded reads, `any[]` / `number[]` lists keep Add.
describe ('go string[] element as a native concat operand', () => {
    const root = path.join (__dirname, 'files', 'tmp-h32r07', 'ts', 'src');
    const SRC =
        'type Dict = { [key: string]: any };\n' +
        'class Exchange {\n' +
        '    safeString (o: any, k: any, d: any = undefined): string { return o[k]; }\n' +
        '}\n' +
        'class venue extends Exchange {\n' +
        '    guarded (raw: string) {\n' +
        '        const parts = raw.split (\',\');\n' +
        '        const thresholds: string[] = [];\n' +
        '        for (let i = 0; i < parts.length; i++) {\n' +
        '            thresholds.push (parts[i].trim ());\n' +
        '        }\n' +
        '        const n = thresholds.length;\n' +
        '        let label: string = \'\';\n' +
        '        if (n > 0) {\n' +
        '            label = \'BELOW_\' + thresholds[0];\n' +
        '        }\n' +
        '        return label;\n' +
        '    }\n' +
        '    unguarded (raw: string) {\n' +
        '        const tags: string[] = [];\n' +
        '        const sp = raw.split (\',\');\n' +
        '        for (let i = 0; i < sp.length; i++) {\n' +
        '            tags.push (sp[i].trim ());\n' +
        '        }\n' +
        '        const label: string = \'TAG_\' + tags[1];\n' +
        '        return label;\n' +
        '    }\n' +
        '    anyList (o: Dict) {\n' +
        '        const rows: any[] = [];\n' +
        '        rows.push (o);\n' +
        '        if (rows.length > 0) {\n' +
        '            return \'ROW_\' + rows[0];\n' +
        '        }\n' +
        '        return \'\';\n' +
        '    }\n' +
        '    numbers (): number[] {\n' +
        '        const ids: number[] = [];\n' +
        '        ids.push (1);\n' +
        '        if (ids.length > 0) {\n' +
        '            const s = \'ID_\' + ids[0];\n' +
        '        }\n' +
        '        return ids;\n' +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h32r07'), { recursive: true, force: true }));
    test ('positive: a guarded element of a []string local concatenates natively', () => {
        expect (out).toMatch (/var thresholds \[\]string = /);
        expect (out).toMatch (/label = "BELOW_" \+ thresholds\[0\]/);
    });
    test ('negative: an out-of-range-possible read keeps the helper', () => {
        expect (out).toMatch (/var tags \[\]string = /);
        expect (out).not.toMatch (/"TAG_" \+ tags\[1\]/);
    });
    test ('negative: an any[] element keeps Add', () => {
        expect (out).not.toMatch (/"ROW_" \+ rows\[0\]/);
    });
    test ('negative: a number[] element (number[] return) is not a string operand', () => {
        expect (out).not.toMatch (/"ID_" \+ ids\[0\]/);
    });
});
