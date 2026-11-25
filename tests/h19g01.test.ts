import fs from 'fs';
import path from 'path';
import * as os from 'os';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD =
    'type Dict = { [key: string]: any };\n' +
    'type Int = number | undefined;\n' +
    'type Str = string | undefined;\n' +
    'export class ex {\n' +
    '    safeInteger (o: Dict, k: string, d: Int = undefined): Int { return o[k]; }\n' +
    '    milliseconds (): number { return 1; }\n' +
    '    filterBySinceLimit (a: any[], since: Int = undefined, limit: Int = undefined, key: any = "timestamp"): any[] { return a; }\n' +
    '    takesAny (a: any[], since: any = undefined): any[] { return a; }\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h19g01-'));
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
const method = (decl: string, write: string, consumer: string): string =>
    '    async fetchX (symbol: string, since: Int = undefined, limit: Int = undefined, params: Dict = {}) {\n' +
    '        const endTime = this.safeInteger (params, "endTime", this.milliseconds ());\n' +
    '        const limitResolved: Int = (limit === undefined) ? 100 : limit;\n' +
    '        ' + decl + '\n' +
    '        if ((endTime !== undefined) && (since === undefined)) {\n' +
    '            sinceResolved = ' + write + ';\n' +
    '        }\n' +
    '        const request: Dict = { "startTime": sinceResolved };\n' +
    '        return ' + consumer + ';\n' +
    '    }\n';

describe ('h19g01: venue since copies join as *int64', () => {
    test ('annotated copy handed to a defaulted Int slot is *int64', () => {
        const go = print (method ('let sinceResolved: Int = since;', 'endTime - 1000', 'this.filterBySinceLimit ([ request ], sinceResolved, limitResolved)'));
        expect (go).toContain ('var sinceResolved *int64 = since');
        expect (go).toContain ('sinceResolved = &sinceResolvedValue');
    });
    test ('unannotated copy of an Int parameter is *int64', () => {
        const go = print (method ('let sinceResolved = since;', 'endTime - 1000', 'this.filterBySinceLimit ([ request ], sinceResolved, limitResolved)'));
        expect (go).toContain ('var sinceResolved *int64 = since');
    });
    test ('a non-int write keeps the box', () => {
        const go = print (method ('let sinceResolved = since;', 'params["x"]', 'this.filterBySinceLimit ([ request ], sinceResolved, limitResolved)'));
        expect (go).not.toContain ('var sinceResolved *int64');
    });
    test ('an any-typed parameter slot keeps the box', () => {
        const go = print (method ('let sinceResolved: Int = since;', 'endTime - 1000', 'this.takesAny ([ request ], sinceResolved)'));
        expect (go).not.toContain ('var sinceResolved *int64');
    });
});
