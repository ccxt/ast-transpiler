import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

describe ('h52g52: handleParamString slot 0 with no default handed on', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass BaseExchange {\n'
        + '    handleParamString (params: object, n: string, d: string): [string, Dict];\n'
        + '    handleParamString (params: object, n: string, d?: string): [Str, Dict];\n'
        + '    handleParamString (params: object, n: string, d: Str = undefined): [Str, Dict] { return [ d, {} ]; }\n'
        + '    checkAddress (address: Str = undefined, code: Str = undefined, tag: Str = undefined) { return address; }\n'
        + '    id: string;\n    note (h: any) { return h; }\n}\nclass Exchange extends BaseExchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h52g52-'));
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
    const WR = '    withdrawRequest (code: Str, address: string, tag: Str = undefined, params: Dict = {}): Dict {\n        const request: Dict = { \'address\': address };\n        if (tag !== undefined) {\n            request[\'paymentId\'] = tag;\n        }\n        return this.note ([ code, request, params ]);\n    }\n';
    const W = (callee: string) => '    withdraw (code: string, address: string, params: Dict = {}) {\n'
        + '        const [ tagWithdrawTag, paramsWithdrawTag ] = this.handleParamString (params, \'tag\');\n'
        + '        this.checkAddress (address, code, tagWithdrawTag);\n'
        + '        const request = this.' + callee + ' (code, address, tagWithdrawTag, paramsWithdrawTag);\n'
        + '        return request;\n    }\n';
    test ('slot 0 handed to a venue *string slot stays the pointer (no boxing closure)', () => {
        const out = print (WR + W ('withdrawRequest'));
        expect (out).toContain ('tagWithdrawTag, paramsWithdrawTag := this.HandleParamString(params, "tag")');
        expect (out).toContain ('this.WithdrawRequest(code, address, tagWithdrawTag, paramsWithdrawTag)');
        expect (out).not.toContain ('func() any');
    });
    test ('a venue slot Go keeps as any keeps the box', () => {
        const loose = '    looseRequest (code: Str, address: string, tag: Str = undefined, params: Dict = {}): Dict {\n'
            + '        return this.note ([ code, address, tag, params ]);\n    }\n';
        const out = print (loose + W ('looseRequest'));
        expect (out).toContain ('tagWithdrawTag := func() any {');
    });
    test ('a required (non-optional) venue slot keeps the box', () => {
        const req = '    strictRequest (code: Str, address: string, tag: Str, params: Dict = {}): Dict {\n'
            + '        const request: Dict = { \'address\': address };\n        if (tag !== undefined) {\n            request[\'paymentId\'] = tag;\n        }\n'
            + '        return this.note ([ code, request, params ]);\n    }\n';
        const out = print (req + W ('strictRequest'));
        expect (out).toContain ('tagWithdrawTag := func() any {');
    });
});
