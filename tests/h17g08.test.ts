import fs from 'fs';
import path from 'path';
import * as os from 'os';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

describe ('go nilable int local copied from a reader local joins as *int64', () => {
    const HEAD =
        'type Dict = { [key: string]: any };\n' +
        'type Int = number | undefined;\n' +
        'export class ex {\n' +
        '    safeInteger (o: Dict, k: string, d: Int = undefined): Int { return o[k]; }\n' +
        '    safeString (o: Dict, k: string): string | undefined { return o[k]; }\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h17g08-'));
        fs.mkdirSync (path.join (dir, 'ts', 'src'), { recursive: true });
        fs.writeFileSync (path.join (dir, 'ts', 'src', 'ex.ts'), HEAD + body + '}\n');
        const cwd = process.cwd ();
        try {
            process.chdir (dir);
            const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoLocalTypes (x.goTranspiler);
            return x.transpileGoByPath ('ts/src/ex.ts').content;
        } finally {
            process.chdir (cwd);
            fs.rmSync (dir, { recursive: true, force: true });
        }
    };
    const body = (seed: string, write: string): string =>
        '    f (params: Dict, h: number) {\n' +
        seed +
        '        let g = o;\n' +
        '        if ((o !== undefined) && (o > 0)) {\n' +
        "            throw new Error ('x');\n" +
        '        }\n' +
        '        if (g === undefined) {\n' +
        '            g = ' + write + ';\n' +
        '        }\n' +
        "        return { 'g': g };\n" +
        '    }\n';

    test ('a copy of a const reader local written an int and nil-tested prints *int64 with a fresh temp', () => {
        const out = print (body ("        const o = this.safeInteger (params, 'g');\n", '20'));
        expect (out).toContain ('var g *int64 = o');
        expect (out).toContain ('if g == nil {');
        expect (out).toContain ('gValue := int64(20)');
        expect (out).toContain ('g = &gValue');
    });

    test ('a write that is not an int keeps the box', () => {
        const out = print (body ("        const o = this.safeInteger (params, 'g');\n", "this.safeString (params, 's')"));
        expect (out).toContain ('var g any = o');
        expect (out).not.toContain ('gValue');
    });

    test ('a copy of a rebound (nilable) reader local keeps the box and the boxed nil test', () => {
        const out = print (body ("        let o = this.safeInteger (params, 'g');\n        if (h > 1) { o = undefined; }\n", '20'));
        expect (out).toContain ('var g any = o');
        expect (out).not.toContain ('if g == nil {');
    });

    test ('a copy whose seed is a defaulted reader keeps the box', () => {
        const out = print (body ("        const o = this.safeInteger (params, 'g', 5);\n", '20'));
        expect (out).not.toContain ('var g *int64 = o');
    });
});
