import fs from 'fs';
import path from 'path';
import * as os from 'os';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD =
    'type Dict = { [key: string]: any };\n' +
    'type Int = number | undefined;\n' +
    'type Str = string | undefined;\n' +
    'export class ex {\n' +
    '    verbose = false;\n' +
    '    safeInteger (o: Dict, k: string, d: Int = undefined): Int { return o[k]; }\n' +
    '    safeInteger2 (o: Dict, k: string, k2: string, d: Int = undefined): Int { return o[k]; }\n' +
    '    safeDict (o: any, k: any): Dict { return o[k]; }\n' +
    '    numberToString (x: any): Str { return x; }\n' +
    '    filterBySinceLimit (a: any[], since: Int = undefined, limit: Int = undefined, key: any = "timestamp"): any[] { return a; }\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h18g01-'));
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
const dyn = (forwardWrite: string, extra = ''): string =>
    '    async fetchDyn (method: string, symbol: Str = undefined, since: Int = undefined, limit: Int = undefined, params: Dict = {}) {\n' +
    '        let paginationTimestamp: Int = undefined;\n' +
    '        let result: any[] = [];\n' +
    "        if (method === 'forward') {\n" +
    '            if (since === undefined) {\n' +
    "                throw new Error ('x');\n" +
    '            }\n' +
    '            paginationTimestamp = since;\n' +
    '        }\n' +
    '        for (let i = 0; i < 3; i++) {\n' +
    "            if (method === 'backward') {\n" +
    '                if (paginationTimestamp !== undefined) {\n' +
    "                    params['until'] = paginationTimestamp - 1;\n" +
    '                }\n' +
    '                const response = await this[method] (symbol, undefined, limit, params);\n' +
    '                if (this.verbose) {\n' +
    "                    let m: string = 'a';\n" +
    '                    if (paginationTimestamp !== undefined) {\n' +
    "                        m += ' timestamp ' + this.numberToString (paginationTimestamp);\n" +
    '                    }\n' +
    '                }\n' +
    '                const firstElement = this.safeDict (response, 0);\n' +
    "                paginationTimestamp = this.safeInteger2 (firstElement, 'timestamp', 'ts');\n" +
    '                if (paginationTimestamp === undefined) {\n' +
    '                    break;\n' +
    '                }\n' +
    '                if ((since !== undefined) && (paginationTimestamp <= since)) {\n' +
    '                    break;\n' +
    '                }\n' +
    '            } else {\n' +
    '                const response = await this[method] (symbol, paginationTimestamp, limit, params);\n' +
    '                const responseLength: number = response.length;\n' +
    '                const last = this.safeDict (response, responseLength - 1);\n' +
    "                const lastTimestamp = this.safeInteger (last, 'timestamp', 0);\n" +
    '                if (lastTimestamp === undefined) {\n' +
    '                    break;\n' +
    '                }\n' +
    '                const nextPaginationTimestamp = lastTimestamp + 1;\n' +
    '                paginationTimestamp = ' + forwardWrite + ';\n' +
    '            }\n' +
    extra +
    '        }\n' +
    '        return this.filterBySinceLimit (result, since, limit);\n' +
    '    }\n';

describe ('go since bound *int64 in dynamic pagination; paginationTimestamp joins as *int64', () => {
    test ('since binds *int64 and the nil-seeded paginationTimestamp joins as *int64', () => {
        const out = print (dyn ('nextPaginationTimestamp'));
        expect (out).toContain ('var since *int64 = GetArgInt64Ptr(optionalArgs, 1, nil)');
        expect (out).toContain ('var paginationTimestamp *int64 = nil');
        expect (out).toContain ('if paginationTimestamp != nil {');
        expect (out).toContain ('params["until"] = *paginationTimestamp - 1');
        expect (out).toContain ('if paginationTimestamp == nil {');
        expect (out).toContain ('(paginationTimestamp == nil || *paginationTimestamp <= *since)');
        expect (out).toContain ('paginationTimestampValue := nextPaginationTimestamp');
        expect (out).toContain ('paginationTimestamp = &paginationTimestampValue');
    });

    test ('a write that is not an int keeps both boxes', () => {
        const out = print (dyn ("'x'"));
        expect (out).toContain ('var paginationTimestamp any = nil');
        expect (out).toContain ('since := GetArg(optionalArgs, 1, nil)');
        expect (out).not.toContain ('paginationTimestampValue');
    });

    test ('a nil-testing consumer that receives the local through any keeps both boxes', () => {
        const out = print (dyn ('nextPaginationTimestamp', '            result = [ paginationTimestamp ];\n'));
        expect (out).toContain ('var paginationTimestamp any = nil');
        expect (out).toContain ('since := GetArg(optionalArgs, 1, nil)');
    });

    const venue = (write: string, read: string): string =>
        '    async fetchO (symbol: string, since: Int = undefined, until: Int = undefined, params: Dict = {}) {\n' +
        '        const request: Dict = {};\n' +
        '        const now = 5;\n' +
        '        let startTime: Int = since;\n' +
        '        if ((since === undefined) && (until !== undefined)) {\n' +
        '            startTime = ' + write + ';\n' +
        '        }\n' +
        '        ' + read + ';\n' +
        '        return request;\n' +
        '    }\n';

    test ('a copy of a *int64 since parameter joins as *int64', () => {
        const out = print (venue ('until - 1000', "request['start'] = startTime"));
        expect (out).toContain ('var startTime *int64 = since');
        expect (out).toContain ('startTimeValue := *until - 1000');
        expect (out).toContain ('startTime = &startTimeValue');
    });

    test ('a copy written a non-int keeps the box', () => {
        const out = print (venue ("'x'", "request['start'] = startTime"));
        expect (out).toContain ('var startTime any = since');
    });

    test ('a copy handed to a nil-testing list keeps the box', () => {
        const out = print (venue ('until - 1000', "request['list'] = [ startTime ]"));
        expect (out).toContain ('var startTime any = since');
    });
});
