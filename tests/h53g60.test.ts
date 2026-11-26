import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a const local bound to an awaited list channel passes a []any to a venue Dict[] parameter: the slot prints []any
describe ('go awaited list local proves a Dict[] parameter slot', () => {
    const HEAD =
        'export type Dict = { [key: string]: any };\n' +
        'class Exchange {\n' +
        '    async fetchPaginatedCallCursor (method: string, params: Dict = {}): Promise<any[]> { return []; }\n' +
        '    async fetchNames (params: Dict = {}): Promise<string[]> { return []; }\n' +
        '    async fetchOtherDict (params: Dict = {}): Promise<Dict> { return {}; }\n' +
        '    safeString (o: any, k: any, d: string = undefined): string { return o[k]; }\n' +
        '}\n' +
        'export class ex extends Exchange {\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h53g60-'));
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
    const FILTER =
        '    filterByKind (rows: Dict[], kind: string): Dict[] {\n' +
        '        const result: Dict[] = [];\n' +
        '        for (let i = 0; i < rows.length; i++) {\n' +
        "            if (this.safeString (rows[i], 'kind') === kind) {\n" +
        '                result.push (rows[i]);\n' +
        '            }\n' +
        '        }\n' +
        '        return result;\n' +
        '    }\n';

    test ('const awaited list local: the slot is []any and the length is native', () => {
        const out = print (FILTER +
            '    async run (params = {}) {\n' +
            "        const rows = await this.fetchPaginatedCallCursor ('x', params);\n" +
            "        return this.filterByKind (rows, 'A');\n" +
            '    }\n');
        expect (out).toMatch (/FilterByKind\(rows \[\]any, kind string\)/);
        expect (out).toMatch (/len\(rows\)/);
        expect (out).not.toMatch (/GetArrayLength\(rows\)/);
    });

    test ('negative: a second caller passing a boxed value keeps the boxed slot', () => {
        const out = print (FILTER +
            '    async run (params = {}) {\n' +
            "        const rows = await this.fetchPaginatedCallCursor ('x', params);\n" +
            "        return this.filterByKind (rows, 'A');\n" +
            '    }\n' +
            '    other (boxed: any) {\n' +
            "        return this.filterByKind (boxed, 'B');\n" +
            '    }\n');
        expect (out).toMatch (/FilterByKind\(rows any, kind string\)/);
        expect (out).toMatch (/GetArrayLength\(rows\)/);
    });

    test ('negative: an awaited dict channel keeps the boxed slot', () => {
        const out = print (FILTER +
            '    async run (params = {}) {\n' +
            '        const rows = await this.fetchOtherDict (params);\n' +
            "        return this.filterByKind (rows as any, 'A');\n" +
            '    }\n');
        expect (out).toMatch (/FilterByKind\(rows any, kind string\)/);
    });

    test ('negative: an awaited string[] local keeps the boxed slot', () => {
        const out = print (
            '    useNames (names: string[], k: string): string[] {\n' +
            '        const result: string[] = [];\n' +
            '        for (let i = 0; i < names.length; i++) {\n' +
            '            result.push (names[i] + k);\n' +
            '        }\n' +
            '        return result;\n' +
            '    }\n' +
            '    async run (params = {}) {\n' +
            '        const names = await this.fetchNames (params);\n' +
            "        return this.useNames (names, 'A');\n" +
            '    }\n');
        expect (out).not.toMatch (/UseNames\(names \[\]any/);
    });
});
