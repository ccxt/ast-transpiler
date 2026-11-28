import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

// a string parameter fed by a nil-guarded safeString rewrite and by a safeString defaulted with a GetArgString parameter
describe ('h30g01: safeString locals defaulted by a guarded pointer or a GetArgString parameter are Go strings', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n'
        + '    timeframes: Dict = {};\n'
        + '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n'
        + '    note (h: any) { return h; }\n}\nexport default Exchange;\n';
    const CALLEE = '    windowOf (request: Dict, period: string) {\n'
        + '        if (period.endsWith (\'utc\')) {\n            request[\'u\'] = 1;\n        }\n        return request;\n    }\n';
    const print = (callers: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h30g01-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nclass x extends Exchange {\n' + callers + CALLEE + '}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            return new Transpiler (config).transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const guarded = (body: string) => '    w (params: Dict = {}) {\n        const request: Dict = {};\n        const timeframe = this.safeString (params, \'tf\');\n'
        + '        let period = \'5m\';\n' + body
        + '        return this.windowOf (request, period);\n    }\n';
    const paramDefault = (decl: string) => '    v (timeframe: string = \'1d\', params: Dict = {}) {\n'
        + '        const timeframeValue' + decl + ' = this.safeString (this.timeframes, timeframe, timeframe);\n'
        + '        return this.windowOf ({}, timeframeValue);\n    }\n';
    const GUARD = '        if (timeframe !== undefined) {\n            period = this.safeString (this.timeframes, timeframe, timeframe);\n        }\n';
    test ('both callers pass Go strings, so the parameter is a string', () => {
        const out = print (guarded (GUARD) + paramDefault (': string'));
        expect (out).toContain ('var period string = "5m"');
        expect (out).toContain ('period = *this.SafeString(this.Timeframes, timeframe, timeframe)');
        expect (out).toContain ('var timeframeValue string = *this.SafeString(this.Timeframes, timeframe, timeframe)');
        expect (out).toContain ('WindowOf(request any, period string)');
        expect (out).not.toContain ('EndsWith(period');
        expect (out).not.toContain ('SafeStringPtr(');
    });
    test ('an unannotated parameter-defaulted local keeps the pointer', () => {
        const out = print (paramDefault (''));
        expect (out).not.toContain ('var timeframeValue string');
    });
    test ('an unguarded pointer default keeps the local boxed', () => {
        const out = print (guarded ('        period = this.safeString (this.timeframes, timeframe, timeframe);\n'));
        expect (out).not.toContain ('var period string');
    });
    test ('a write of a box keeps the local boxed', () => {
        const out = print (guarded ('        if (timeframe !== undefined) {\n            period = this.safeString (this.timeframes, timeframe, timeframe);\n        } else {\n            period = this.note (params);\n        }\n'));
        expect (out).not.toContain ('var period string');
    });
    test ('a local tested against undefined keeps it boxed', () => {
        const out = print (guarded ('        period = this.safeString (this.timeframes, \'k\');\n        if (period === undefined) {\n            period = \'1m\';\n        }\n'));
        expect (out).not.toContain ('var period string');
    });
});
