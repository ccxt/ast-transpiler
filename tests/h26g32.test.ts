import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

describe ('h26g32: handleParamString[2] slot 0 with a literal default is a Go string', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass BaseExchange {\n'
        + '    handleParamString (params: object, n: string, d: string): [string, Dict];\n'
        + '    handleParamString (params: object, n: string, d?: string): [Str, Dict];\n'
        + '    handleParamString (params: object, n: string, d: Str = undefined): [Str, Dict] { return [ d, {} ]; }\n'
        + '    handleParamString2 (params: object, a: string, b: string, d: string): [string, Dict];\n'
        + '    handleParamString2 (params: object, a: string, b: string, d?: string): [Str, Dict];\n'
        + '    handleParamString2 (params: object, a: string, b: string, d: Str = undefined): [Str, Dict] { return [ d, {} ]; }\n'
        + '    id: string;\n    note (h: any) { return h; }\n}\nclass Exchange extends BaseExchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h26g32-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'pro'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'pro', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (file, 'import Exchange from \'../base/Exchange.js\';\nclass x extends Exchange {\n' + body + '}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            const t: any = new Transpiler (config);
            installCcxtGoLocalTypes (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const method = (call: string, kw = 'const') => '    w (params: Dict = {}) {\n'
        + '        ' + kw + ' [ k, p ] = ' + call + ';\n'
        + '        if (k === \'indexPriceKline\') {\n            return this.note (p);\n        }\n'
        + '        return this.id + \' \' + k + this.note (k);\n    }\n';
    test ('handleParamString with a literal default binds slot 0 as a string', () => {
        const out = print (method ('this.handleParamString (params, \'channel\', \'kline\')'));
        expect (out).toContain ('k := *kPtr');
        expect (out).toContain ('if k == "indexPriceKline" {');
        expect (out).not.toContain ('func() any');
        expect (out).toContain ('Add(this.Id+" "+k, ');
    });
    test ('handleParamString2 with a literal default binds slot 0 as a string', () => {
        const out = print (method ('this.handleParamString2 (params, \'channel\', \'name\', \'kline\')'));
        expect (out).toContain ('k := *kPtr');
        expect (out).not.toContain ('IsEqual(k,');
    });
    test ('no default: slot 0 can be nil and keeps the box', () => {
        const out = print ('    w (params: Dict = {}) {\n        const [ k, p ] = this.handleParamString (params, \'channel\');\n'
            + '        if (k === undefined) {\n            return this.note (p);\n        }\n        return this.id + \' \' + k;\n    }\n');
        expect (out).not.toContain ('k := *kPtr');
    });
    test ('a non-literal default keeps the box', () => {
        const out = print ('    w (d: Str, params: Dict = {}) {\n        const [ k, p ] = this.handleParamString (params, \'channel\', d);\n'
            + '        if (k === \'indexPriceKline\') {\n            return this.note (p);\n        }\n        return this.id + \' \' + k;\n    }\n');
        expect (out).not.toContain ('k := *kPtr');
    });
    test ('a let binding (may be rewritten) keeps the box', () => {
        const out = print (method ('this.handleParamString (params, \'channel\', \'kline\')', 'let'));
        expect (out).not.toContain ('k := *kPtr');
    });
    test ('a slot the printer bound as a typed pointer is rebound as the string its compares read', () => {
        const out = print ('    w (params: Dict = {}) {\n        const [ a, pa ] = this.handleParamString (params, \'account\', \'\');\n'
            + '        const [ m, pm ] = this.handleParamString (pa, \'method\', \'v2\');\n        let r = undefined;\n'
            + '        if (m === \'v3\') {\n            r = this.note (pm);\n        } else {\n            r = this.note (a);\n        }\n        return r;\n    }\n');
        expect (out).toContain ('m := *mPtr');
        expect (out).toContain ('if m == "v3" {');
    });
    test ('a required string parameter as the default binds slot 0 as a string', () => {
        const out = print ('    w (name: string, params: Dict = {}) {\n        const [ k, p ] = this.handleParamString (params, \'channel\', name);\n'
            + '        return this.id + \' \' + k + this.note (p);\n    }\n');
        expect (out).toContain ('k := *kPtr');
        expect (out).not.toContain ('func() any');
    });
    test ('an optional or nullable parameter as the default keeps the box', () => {
        for (const sig of [ 'name: Str', 'name?: string', 'name: string = undefined' ]) {
            const out = print ('    w (' + sig + ', params: Dict = {}) {\n        const [ k, p ] = this.handleParamString (params, \'channel\', name);\n'
                + '        return this.id + \' \' + k + this.note (p);\n    }\n');
            expect (out).not.toContain ('k := *kPtr');
        }
    });
});
