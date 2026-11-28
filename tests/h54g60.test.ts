import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a nil-declared list local the container join prints `[]any` passes that slice to a venue Dict[] parameter
describe ('go nil-joined list local proves a Dict[] parameter slot', () => {
    const HEAD =
        'export type Dict = { [key: string]: any };\n' +
        'export type NullableList = any[] | undefined;\n' +
        'class Exchange {\n' +
        '    async fetchPaginatedCallCursor (method: string, params: Dict = {}): Promise<any[]> { return []; }\n' +
        '    async fetchNames (params: Dict = {}): Promise<string[]> { return []; }\n' +
        '    async fetchOtherDict (params: Dict = {}): Promise<Dict> { return {}; }\n' +
        '    safeString (o: any, k: any, d: string = undefined): string { return o[k]; }\n' +
        '    safeList (o: any, k: any, d: any[] = undefined): any[] { return o[k]; }\n' +
        '    safeValue (o: any, k: any, d: any = undefined): any { return o[k]; }\n' +
        '}\n' +
        'export class ex extends Exchange {\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h54g60-'));
        fs.mkdirSync (path.join (dir, 'ts', 'src'), { recursive: true });
        fs.writeFileSync (path.join (dir, 'ts', 'src', 'ex.ts'), HEAD + body + '}\n');
        const cwd = process.cwd ();
        try {
            process.chdir (dir);
            const t = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } } as any);
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath ('ts/src/ex.ts').content;
        } finally {
            process.chdir (cwd);
            fs.rmSync (dir, { recursive: true, force: true });
        }
    };
    const PARSE =
        '    parseRows (rows: Dict[], extra: Dict = undefined): Dict {\n' +
        '        const result: Dict = {};\n' +
        '        for (let i = 0; i < rows.length; i++) {\n' +
        "            result[i] = this.safeString (rows[i], 'k');\n" +
        '        }\n' +
        '        return result;\n' +
        '    }\n';

    test ('nil-joined list local: the slot is []any and the length is native', () => {
        const out = print (PARSE +
            '    run (response: Dict, flag: boolean) {\n' +
            '        let rows: NullableList = undefined;\n' +
            '        if (flag) {\n' +
            "            rows = this.safeList (response, 'a', []);\n" +
            '        } else {\n' +
            "            rows = this.safeList (response, 'b', []);\n" +
            '        }\n' +
            '        return this.parseRows (rows, response);\n' +
            '    }\n');
        expect (out).toMatch (/ParseRows\(rows \[\]any/);
        expect (out).toMatch (/len\(rows\)/);
        expect (out).not.toMatch (/GetArrayLength\(rows\)/);
    });

    test ('negative: a second caller passing a boxed value keeps the boxed slot', () => {
        const out = print (PARSE +
            '    run (response: Dict, flag: boolean) {\n' +
            '        let rows: NullableList = undefined;\n' +
            '        if (flag) {\n' +
            "            rows = this.safeList (response, 'a', []);\n" +
            '        }\n' +
            '        return this.parseRows (rows, response);\n' +
            '    }\n' +
            '    other (boxed: any) {\n' +
            '        return this.parseRows (boxed);\n' +
            '    }\n');
        expect (out).toMatch (/ParseRows\(rows any/);
        expect (out).toMatch (/GetArrayLength\(rows\)/);
    });

    test ('negative: a nil-declared local written from a dict keeps the boxed slot', () => {
        const out = print (PARSE +
            '    run (response: Dict) {\n' +
            '        let rows = undefined;\n' +
            "        rows = this.safeValue (response, 'a');\n" +
            '        return this.parseRows (rows, response);\n' +
            '    }\n');
        expect (out).toMatch (/ParseRows\(rows any/);
    });
});
