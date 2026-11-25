import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// `const response` in each branch, read by `x = this.safeDict (response, 'k', {})`: the comma-ok read plus the {} fill
describe ('h48g41: assigned defaulted safeDict of a decoded map prints the comma-ok read', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
        + '    safeString (o: any, k: any, d: string = undefined): string { return d; }\n    keep (o: any): any { return o; }\n}\nexport default BaseExchange;\n';
    const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ninterface Exchange {\n'
        + '    privateGetA (params?: {}): Promise<Dict>;\n    privateGetB (params?: {}): Promise<any>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h48g41-'));
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
    const fn = (call: string, use: string, after = '') => '    async f (params = {}) {\n        let bal: Dict = undefined;\n'
        + '        if (this.keep (params)) {\n            const response = await this.' + call + ' (params);\n' + use
        + '            bal = this.safeDict (response, \'data\', {});\n        } else {\n            const response = await this.privateGetA (params);\n'
        + '            bal = this.safeDict (response, \'other\', {});\n        }\n' + after + '        return bal;\n    }\n';
    const native = '\t\tbal, _ = response["data"].(map[string]any)\n\t\tif bal == nil {\n\t\t\tbal = map[string]any{}\n\t\t}\n';

    test ('a branch-local endpoint receiver: the assignment prints the comma-ok read plus the {} fill', () => {
        const out = print (fn ('privateGetA', ''));
        expect (out).toContain (native);
        expect (out).toContain ('bal, _ = response["other"].(map[string]any)');
        expect (out).not.toContain ('SafeDictMap(');
    });
    test ('untyped endpoint receiver keeps the wrap', () => {
        const out = print (fn ('privateGetB', ''));
        expect (out).not.toContain ('response["data"].(map[string]any)');
    });
    test ('a receiver handed out to a call keeps the wrap', () => {
        const out = print (fn ('privateGetA', '            this.keep (response);\n'));
        expect (out).not.toContain ('response["data"].(map[string]any)');
    });
    test ('a receiver written through keeps the wrap', () => {
        const out = print (fn ('privateGetA', '            response[\'x\'] = 1;\n'));
        expect (out).not.toContain ('response["data"].(map[string]any)');
    });
    test ('an assigned local written through keeps the wrap', () => {
        const out = print (fn ('privateGetA', '', '        bal[\'t\'] = 1;\n'));
        expect (out).not.toContain ('response["data"].(map[string]any)');
    });
    test ('a let receiver rebound in its arm (alpaca fetchOHLCV) keeps the wrap', () => {
        const out = print ('    async f (params = {}) {\n        let bal: Dict = undefined;\n        if (this.keep (params)) {\n'
            + '            let response = await this.privateGetA (params);\n            bal = this.safeDict (response, \'data\', {});\n'
            + '            for (let i = 0; i < 2; i++) {\n                response = await this.privateGetA (params);\n'
            + '                bal = this.safeDict (response, \'data\', {});\n            }\n'
            + '        } else {\n            const response = await this.privateGetA (params);\n            bal = this.safeDict (response, \'other\', {});\n        }\n        return bal;\n    }\n');
        expect (out).not.toContain ('response["data"].(map[string]any)');
    });
    test ('a non-empty default keeps the wrap', () => {
        const out = print ('    async f (params = {}) {\n        let bal: Dict = undefined;\n        if (this.keep (params)) {\n'
            + '            const response = await this.privateGetA (params);\n            bal = this.safeDict (response, \'data\', { \'a\': 1 });\n'
            + '        } else {\n            const response = await this.privateGetA (params);\n            bal = this.safeDict (response, \'other\', {});\n        }\n        return bal;\n    }\n');
        expect (out).not.toContain ('response["data"].(map[string]any)');
    });
});
