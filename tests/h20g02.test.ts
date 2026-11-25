import fs from 'fs';
import path from 'path';
import * as os from 'os';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD =
    'type Dict = { [key: string]: any };\n' +
    'type Int = number | undefined;\n' +
    'export class ex {\n' +
    '    yyyymmdd (ts: any, infix = "-"): string { return ""; }\n' +
    '    ymdhms (ts: any, infix = " "): string { return ""; }\n' +
    '    keepsAny (x: any, y: any = undefined): any { return x; }\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h20g02-'));
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
const method = (consumer: string): string =>
    '    async fetchX (code: string, since: Int = undefined, params: Dict = {}) {\n' +
    '        const request: Dict = {};\n' +
    '        if (since !== undefined) {\n' +
    '            request["start"] = ' + consumer + ';\n' +
    '        }\n' +
    '        return request;\n' +
    '    }\n';

describe ('h20-g02: Int since handed to a base date formatter binds GetArgInt64Ptr', () => {
    test ('yyyymmdd (since) binds a *int64', () => {
        const out = print (method ('this.yyyymmdd (since)'));
        expect (out).toContain ('var since *int64 = GetArgInt64Ptr(optionalArgs, 0, nil)');
    });
    test ('ymdhms (since, infix) binds a *int64', () => {
        const out = print (method ('this.ymdhms (since, "T")'));
        expect (out).toContain ('var since *int64 = GetArgInt64Ptr(optionalArgs, 0, nil)');
    });
    test ('negative: a write that is not an Int keeps the box', () => {
        const out = print (method ('this.yyyymmdd (since); since = this.keepsAny (params)'));
        expect (out).not.toContain ('GetArgInt64Ptr(optionalArgs, 0, nil)');
    });
    test ('negative: since handed to an unaudited any callee keeps the box', () => {
        const out = print (method ('this.keepsAny (since)'));
        expect (out).not.toContain ('GetArgInt64Ptr(optionalArgs, 0, nil)');
    });
    test ('negative: since stored into a list (nil-sensitive consumer) keeps the box', () => {
        const out = print (method ('[ this.yyyymmdd (since), since ]'));
        expect (out).not.toContain ('GetArgInt64Ptr(optionalArgs, 0, nil)');
    });
});
