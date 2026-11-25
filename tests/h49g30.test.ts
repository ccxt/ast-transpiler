import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// `const rows = await this.m (..)` where m is declared `Promise<Dict[]>`: a bounded read `rows[j]` into a
// local is the plain index (the awaited carrier holds maps, never a scalar pointer).
describe ('go awaited Dict[] rows read into a local natively', () => {
    const root = path.join (__dirname, 'files', 'tmp-h49g30', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    extend (...args: any[]): any { return args[0]; }\n' +
        '    safeString (o: any, k: any, d: any = undefined): string { return o; }\n' +
        '    safeDict (o: any, k: any, d: any = undefined): any { return o; }\n' +
        '    safeList (o: any, k: any, d: any = undefined): any[] { return o; }\n' +
        '    async publicGetRows (p: any): Promise<any> { return p; }\n' +
        '    async fetchRawMarketsPaged (extra: Dict = {}): Promise<Dict[]> { return []; }\n' +
        '}\n';
    const VENUE =
        BASE +
        'class v extends Exchange {\n' +
        '    async fetchRows (plain: Dict): Promise<Dict[]> {\n' +
        '        const response = await this.publicGetRows (plain);\n' +
        "        const data = this.safeDict (response, 'data', {});\n" +
        "        return this.safeList (data, 'rows', []);\n" +
        '    }\n' +
        '    async useBaseNested (plain: Dict) {\n' +
        '        const byHash: Dict = {};\n' +
        '        for (let c = 0; c < 3; c++) {\n' +
        '            const bases = await this.fetchRawMarketsPaged (plain);\n' +
        '            const basesLength = bases.length;\n' +
        '            for (let j = 0; j < basesLength; j++) {\n' +
        '                const row = bases[j];\n' +
        "                byHash[this.safeString (row, 'hash', '')] = row;\n" +
        '            }\n' +
        '        }\n' +
        '        return byHash;\n' +
        '    }\n' +
        '    async useOwnFlat (plain: Dict) {\n' +
        '        const byHash: Dict = {};\n' +
        '        const owns = await this.fetchRows (plain);\n' +
        '        for (let j = 0; j < owns.length; j++) {\n' +
        '            const row = owns[j];\n' +
        "            byHash[this.safeString (row, 'hash', '')] = row;\n" +
        '        }\n' +
        '        return byHash;\n' +
        '    }\n' +
        '    async fetchOther (plain: Dict): Promise<Dict[]> {\n' +
        "        return this.safeList (plain, 'rows', []);\n" +
        '    }\n' +
        '    async useOther (plain: Dict) {\n' +
        '        const byHash: Dict = {};\n' +
        '        const others = await this.fetchOther (plain);\n' +
        '        for (let j = 0; j < others.length; j++) {\n' +
        '            const row = others[j];\n' +
        "            byHash[this.safeString (row, 'hash', '')] = row;\n" +
        '        }\n' +
        '        return byHash;\n' +
        '    }\n' +
        '    async useWritten (plain: Dict) {\n' +
        '        const written = await this.fetchRows (plain);\n' +
        "        written[0] = 'x';\n" +
        '        for (let j = 0; j < written.length; j++) {\n' +
        "            this.safeString (written[j], 'hash');\n" +
        '        }\n' +
        '    }\n' +
        '    async useRows (plain: Dict) {\n' +
        '        const byHash: Dict = {};\n' +
        '        for (let c = 0; c < 3; c++) {\n' +
        '        const rows = await this.fetchRows (plain);\n' +
        '        const rowsLength = rows.length;\n' +
        '        for (let j = 0; j < rowsLength; j++) {\n' +
        '            const row = rows[j];\n' +
        "            const h = this.safeString (row, 'hash');\n" +
        '            if (h !== undefined) {\n' +
        '                byHash[h] = row;\n' +
        '            }\n' +
        '        }\n' +
        '        }\n' +
        '        return byHash;\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.mkdirSync (path.join (root, 'prediction'), { recursive: true });
                fs.writeFileSync (path.join (root, 'prediction', 'v.ts'), VENUE);
        const t = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async', 'asyncMapRowListCallees': [ 'FetchRows', 'FetchRawMarketsPaged' ] } } as any);
        installCcxtGoLocalTypes (t.goTranspiler);
        out = t.transpileGoByPath (path.join (root, 'prediction', 'v.ts')).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h49g30'), { recursive: true, force: true }));

    test ('positive: a bounded read of a map-row core receive is the plain index', () => {
        expect (out).toContain ('var rows []any = ListTyped(PanicOnError((<-this.FetchRowsAsync(plain))))');
        expect (out).toContain ('var row any = rows[j]');
        expect (out).toContain ('var row any = owns[j]');
        expect (out).not.toMatch (/GetValue\((rows|owns), j\)/);
    });

    test ('negative: a core outside the map-row table keeps the box', () => {
        expect (out).toMatch (/GetValue\(others, j\)/);
    });

    test ('negative: a list written after the receive keeps the box', () => {
        expect (out).toMatch (/GetValue\(written, j\)/);
    });
});
