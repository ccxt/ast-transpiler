import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go nil test on an any local written only by awaited request stubs', () => {
    const print = (methods: string, body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h27g19-'));
        try {
            const dir = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'x.ts');
            fs.writeFileSync (file, 'type Dict = { [key: string]: any };\nclass X {\n'
                + '    async request (path: string, params: Dict = {}): Promise<any> { return params; }\n'
                + '    safeString (d: any, k: any): string | undefined { return d; }\n'
                + '    privateGetOrder (params = {}): Promise<Dict> {\n        return this.request (\'order\', params);\n    }\n'
                + '    publicGetTicker (params = {}): Promise<Dict> {\n        return this.request (\'ticker\', params);\n    }\n' + methods
                + '    async run (p: any, n: number) {\n' + body + '\n    }\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    test('const and joined request-stub receives compare natively (fails on the base printer)', () => {
        const out = print ('', '        const response = await this.privateGetOrder ({});\n        if (response === undefined) {\n            return 1;\n        }\n'
            + '        let other: any = undefined;\n        if (n > 1) {\n            other = await this.privateGetOrder ({});\n        } else {\n'
            + '            other = await this.publicGetTicker ({});\n        }\n        if (other !== undefined) {\n            return other;\n        }\n        return response;');
        expect (out).toContain ('response == nil');
        expect (out).toContain ('other != nil');
        expect (out).not.toMatch (/IsEqual\((response|other), nil\)/);
    });
    test('a sibling write from a pointer-capable accessor keeps the helper', () => {
        const out = print ('', '        let other: any = await this.privateGetOrder ({});\n        if (n > 1) {\n            other = this.safeString (p, \'x\');\n        }\n'
            + '        if (other === undefined) {\n            return 1;\n        }\n        return other;');
        expect (out).toContain ('IsEqual(other, nil)');
    });
    test('an awaited async method that is not a request stub keeps the helper', () => {
        const out = print ('    async fetchThing (p: any): Promise<any> {\n        return this.safeString (p, \'x\');\n    }\n',
            '        const other = await this.fetchThing (p);\n        if (other === undefined) {\n            return 1;\n        }\n        return other;');
        expect (out).toContain ('IsEqual(other, nil)');
    });
    test('a stub whose body is more than the request call keeps the helper', () => {
        const out = print ('    privateGetX (params = {}): Promise<Dict> {\n        const a = this.request (\'x\', params);\n        return a;\n    }\n',
            '        const other = await this.privateGetX ({});\n        if (other === undefined) {\n            return 1;\n        }\n        return other;');
        expect (out).toContain ('IsEqual(other, nil)');
    });
});
