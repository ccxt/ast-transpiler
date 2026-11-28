import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// an awaited `string[]` channel local handed to a required `string[]` parameter of a venue async method
describe ('go awaited string-list local proves a string[] parameter slot', () => {
    const HEAD =
        'export type Dict = { [key: string]: any };\n' +
        'export type Str = string | undefined;\n' +
        'class Exchange {\n' +
        '    safeString (o: any, k: any, d: string = undefined): string { return o[k]; }\n' +
        '}\n' +
        'export class ex extends Exchange {\n' +
        '    async resolveEventSeriesTickers (params: Dict = {}): Promise<string[]> { return []; }\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h55g63-'));
        fs.mkdirSync (path.join (dir, 'ts', 'src'), { recursive: true });
        fs.writeFileSync (path.join (dir, 'ts', 'src', 'ex.ts'), HEAD + body + '}\n');
        const cwd = process.cwd ();
        try {
            process.chdir (dir);
            const t = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async', asyncStringListCallees: [ 'ResolveEventSeriesTickers' ] } } as any);
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath ('ts/src/ex.ts').content;
        } finally {
            process.chdir (cwd);
            fs.rmSync (dir, { recursive: true, force: true });
        }
    };
    const USE =
        '    async useNames (names: string[], k: Str): Promise<string[]> {\n' +
        '        const out: string[] = [];\n' +
        '        const n = names.length;\n' +
        '        for (let i = 0; i < n; i++) {\n' +
        "            out.push (this.safeString (names, i, ''));\n" +
        '        }\n' +
        '        return out;\n' +
        '    }\n';
    const RUN = (decl: string, extra = '') =>
        '    async run (params = {}) {\n' +
        '        ' + decl + ' names = await this.resolveEventSeriesTickers (params);\n' +
        '        const namesLength = names.length;\n' +
        '        if (namesLength === 0) { return []; }\n' + extra +
        "        return await this.useNames (names, 'A');\n" +
        '    }\n';
    test ('const awaited string-list local: []string local and []string slot', () => {
        const out = print (USE + RUN ('const'));
        expect (out).toContain ('var names []string = NewStringArray(PanicOnError((<-this.ResolveEventSeriesTickersAsync(params))))');
        expect (out).toMatch (/UseNamesAsync\(names \[\]string, k string\)/);
        expect (out).toContain ('var n int = len(names)');
    });
    test ('negative: a let local keeps the box', () => {
        const out = print (USE + RUN ('let'));
        expect (out).not.toContain ('var names []string');
        expect (out).toMatch (/UseNamesAsync\(names any, k string\)/);
    });
    test ('negative: another use of the local keeps the box', () => {
        const out = print (USE + RUN ('const', "        this.safeString (names, 0);\n"));
        expect (out).not.toContain ('var names []string');
    });
    test ('negative: a callee outside the host table keeps the box', () => {
        const out = print (USE + RUN ('const').replace (/resolveEventSeriesTickers/g, 'resolveOther') + '    async resolveOther (params: Dict = {}): Promise<string[]> { return []; }\n');
        expect (out).not.toContain ('var names []string');
    });
});
