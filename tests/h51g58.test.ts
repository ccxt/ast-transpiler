import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a nil-seeded local whose every write is a list endpoint receive is declared `[]any`; its `{}`-defaulted
// row read prints the bounds-tested comma-ok read plus the default instead of the SafeDictMap wrap
describe ('h51g58: a row of a nil-seeded list endpoint local reads natively', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
        + '    extend (...args: any[]): Dict { return {}; }\n    keep (o: any): any { return o; }\n}\nexport default BaseExchange;\n';
    const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ntype List = any[];\ninterface Exchange {\n'
        + '    privateGetA (params?: {}): Promise<Dict>;\n    privateGetL (params?: {}): Promise<List>;\n    privateGetB (params?: {}): Promise<any>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h51g58-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'abstract'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'abstract', 'x.ts'), ABSTRACT);
            fs.writeFileSync (path.join (dir, 'go', 'v4', 'x_api.go'), 'func (this *x) PrivateGetA(args ...any) <-chan EndpointResult[map[string]any] {\n'
                + 'func (this *x) PrivateGetL(args ...any) <-chan EndpointResult[[]any] {\n');
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (file, 'import Exchange from \'./abstract/x.js\';\nclass x extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const letFn = (call: string, key: string, extra: string = '') => '    async f (a = false, params = {}) {\n        let response = undefined;\n        if (a) {\n'
        + '            response = await this.' + call + ' (params);\n        } else {\n            response = await this.' + call + ' (this.extend ({}, params));\n        }\n'
        + extra + '        const order = this.safeDict (response, ' + key + ', {});\n        return order;\n    }\n';
    test ('a nil-seeded list endpoint local read at index 0 prints the bounds-tested comma-ok read and the default', () => {
        const out = print (letFn ('privateGetL', '0'));
        expect (out).toContain ('var response []any = nil');
        expect (out).toMatch (/var order map\[string\]any\n\s*if 0 < len\(response\) \{\n\s*order, _ = response\[0\]\.\(map\[string\]any\)\n\s*\}\n\s*if order == nil \{\n\s*order = map\[string\]any\{\}\n\s*\}/);
        expect (out).not.toContain ('SafeDictMap(response');
        expect (out).not.toContain ('SafeDict(response');
    });
    test ('a loop-counter row of the same local reads natively', () => {
        const out = print ('    async f (params = {}) {\n        let rows = undefined;\n        rows = await this.privateGetL (params);\n        const res = [];\n'
            + '        for (let i = 0; i < rows.length; i++) {\n            const row = this.safeDict (rows, i, {});\n            res.push (row);\n        }\n        return res;\n    }\n');
        expect (out).toContain ('var rows []any = nil');
        expect (out).toContain ('row, _ = rows[i].(map[string]any)');
        expect (out).not.toContain ('SafeDictMap(rows');
    });
    test ('negative: a nil-seeded map endpoint local read at index 0 keeps the wrap', () => {
        const out = print (letFn ('privateGetA', '0'));
        expect (out).not.toContain ('response[0].(map[string]any)');
    });
    test ('negative: an untyped endpoint local keeps the wrap', () => {
        const out = print (letFn ('privateGetB', '0'));
        expect (out).not.toContain ('response[0].(map[string]any)');
    });
    test ('negative: a local also written with a non-endpoint value keeps the wrap', () => {
        const out = print (letFn ('privateGetL', '0', '        if (a) {\n            response = this.keep (params);\n        }\n'));
        expect (out).not.toContain ('response[0].(map[string]any)');
    });
    test ('negative: a string key on the list local keeps the wrap', () => {
        const out = print (letFn ('privateGetL', '\'k\''));
        expect (out).not.toContain ('response["k"].(map[string]any)');
    });
});
