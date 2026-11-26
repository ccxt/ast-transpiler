import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

describe ('h53g52: handleParamBool2 slot 0 handed to a venue bool slot', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass BaseExchange {\n'
        + '    handleParamString (params: object, n: string, d: string): [string, Dict];\n'
        + '    handleParamString (params: object, n: string, d?: string): [Str, Dict];\n'
        + '    handleParamString (params: object, n: string, d: Str = undefined): [Str, Dict] { return [ d, {} ]; }\n'
        + '    handleParamBool2 (params: object, a: string, b: string, d: boolean = undefined): [boolean, Dict] { return [ d, {} ]; }\n'
        + '    checkAddress (address: Str = undefined, code: Str = undefined, tag: Str = undefined) { return address; }\n'
        + '    id: string;\n    note (h: any) { return h; }\n}\nclass Exchange extends BaseExchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h53g52-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nclass x extends Exchange {\n' + body + '}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            const t: any = new Transpiler (config);
            installCcxtGoLocalTypes (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const PR = (slot: string) => '    prep (market: Dict = undefined, trigger: ' + slot + ', params: Dict = {}): Dict {\n'
        + '        const request: Dict = {};\n        if (trigger) {\n            request[\'t\'] = 1;\n        }\n        return this.note ([ market, request, params ]);\n    }\n';
    const C = '    caller (params: Dict = {}) {\n'
        + '        const [ trigger, paramsTrigger ] = this.handleParamBool2 (params, \'trigger\', \'stop\');\n'
        + '        const r = this.prep (undefined, trigger, paramsTrigger);\n'
        + '        if (trigger === true) {\n            return r;\n        }\n        return r;\n    }\n';
    test ('slot 0 handed to a venue optional boolean slot stays the pointer (no boxing closure)', () => {
        const out = print (PR ('boolean = false') + C);
        expect (out).toContain ('var trigger bool = GetArgBool(optionalArgs, 1, false)');
        expect (out).toMatch (/this\.Prep\(nil, trigger, paramsTrigger\)/);
        expect (out).not.toContain ('func() any');
    });
    test ('a required venue boolean slot keeps the box', () => {
        const out = print (PR ('boolean') + C);
        expect (out).toContain ('trigger := func() any {');
    });
});
