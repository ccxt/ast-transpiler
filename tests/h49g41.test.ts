import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a decoded endpoint map also handed to `this.extend` keeps its comma-ok reads
describe ('h49g41: an endpoint map handed to extend keeps the comma-ok safeDict read', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
        + '    extend (...args: any[]): Dict { return {}; }\n    keep (o: any): any { return o; }\n}\nexport default BaseExchange;\n';
    const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ninterface Exchange {\n'
        + '    privateGetA (params?: {}): Promise<Dict>;\n    privateGetB (params?: {}): Promise<any>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h49g41-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'abstract'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'abstract', 'x.ts'), ABSTRACT);
            fs.writeFileSync (path.join (dir, 'go', 'v4', 'x_api.go'), 'func (this *x) PrivateGetA(args ...any) <-chan EndpointResult[map[string]any] {\n');
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (file, 'import Exchange from \'./abstract/x.js\';\nclass x extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const fn = (call: string, use: string) => '    async f (params = {}) {\n        const response = await this.' + call + ' (params);\n'
        + '        const data = this.safeDict (response, \'data\', {});\n' + use + '        return data;\n    }\n';

    const letFn = (use: string) => '    async f (a = false, params = {}) {\n        let response = undefined;\n        if (a) {\n'
        + '            response = await this.privateGetA (params);\n        } else {\n            response = await this.privateGetA (this.extend ({}, params));\n        }\n'
        + '        const data = this.safeDict (response, \'data\', {});\n' + use + '        return data;\n    }\n';
    test ('a nil-seeded map receiver handed to extend prints the comma-ok read', () => {
        const out = print (letFn ('        const order = this.extend (response, data);\n        this.keep (order);\n'));
        expect (out).toContain ('var response map[string]any = nil');
        expect (out).toContain ('response["data"].(map[string]any)');
        expect (out).not.toContain ('SafeDictMap(response');
    });
    test ('a const endpoint receive handed to extend prints `.Raw` (any) and keeps the wrap', () => {
        const out = print (fn ('privateGetA', '        const order = this.extend (response, data);\n        this.keep (order);\n'));
        expect (out).not.toContain ('response["data"].(map[string]any)');
    });
    test ('an untyped endpoint receiver handed to extend keeps the wrap', () => {
        const out = print (fn ('privateGetB', '        const order = this.extend (response, data);\n        this.keep (order);\n'));
        expect (out).not.toContain ('response["data"].(map[string]any)');
    });
    test ('a receiver handed to another call keeps the wrap', () => {
        const out = print (fn ('privateGetA', '        this.keep (this.extend (response, data));\n        this.keep (response);\n'));
        expect (out).not.toContain ('response["data"].(map[string]any)');
    });
    test ('a receiver handed to extend inside a push (prints as r.Raw, an any) keeps the wrap', () => {
        const out = print (fn ('privateGetA', '        const rows = [];\n        rows.push (this.extend (response, { \'k\': 1 }));\n        this.keep (rows);\n'));
        expect (out).not.toContain ('response["data"].(map[string]any)');
    });
    test ('a receiver written through keeps the wrap', () => {
        const out = print (fn ('privateGetA', '        response[\'x\'] = 1;\n        this.keep (this.extend (response, data));\n'));
        expect (out).not.toContain ('response["data"].(map[string]any)');
    });
});
