import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a pro venue whose endpoints are declared in `abstract/pro/x.ts` reads the stub element off the REST companion
// `go/v4/x_api.go`, as the REST venue does: its endpoint receives are typed maps
describe ('h54g64: pro abstract endpoints take the REST companion stub element', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
        + '    extend (...args: any[]): Dict { return {}; }\n}\nexport default BaseExchange;\n';
    const abstractOf = (base: string) => 'import _Exchange from \'' + base + '\';\ntype Dict = { [key: string]: any };\ninterface Exchange {\n'
        + '    privateGetA (params?: {}): Promise<Dict>;\n    privateGetB (params?: {}): Promise<Dict>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
    const print = (stubs: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h54g64-'));
        try {
            for (const d of [ 'ts/src/base', 'ts/src/abstract/pro', 'ts/src/pro', 'go/v4' ]) { fs.mkdirSync (path.join (dir, d), { 'recursive': true }); }
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'abstract', 'pro', 'x.ts'), abstractOf ('../../base/Exchange.js'));
            fs.writeFileSync (path.join (dir, 'go', 'v4', 'x_api.go'), stubs);
            const file = path.join (dir, 'ts', 'src', 'pro', 'x.ts');
            fs.writeFileSync (file, 'import Exchange from \'../abstract/pro/x.js\';\nclass x extends Exchange {\n'
                + '    async f (a = false, params = {}) {\n        let response = undefined;\n        if (a) {\n            response = await this.privateGetA (params);\n'
                + '        } else {\n            response = await this.privateGetB (params);\n        }\n        const data = this.safeDict (response, \'data\', {});\n        return data;\n    }\n}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const MAP = 'func (this *x) PrivateGetA(args ...any) <-chan EndpointResult[map[string]any] {\nfunc (this *x) PrivateGetB(args ...any) <-chan EndpointResult[map[string]any] {\n';
    test ('a nil-seeded local of two map stubs is a map and its defaulted read is the comma-ok read', () => {
        const out = print (MAP);
        expect (out).toContain ('var response map[string]any = nil');
        expect (out).toMatch (/data, _ = response\["data"\]\.\(map\[string\]any\)\n\s*if data == nil \{\n\s*data = map\[string\]any\{\}/);
        expect (out).not.toContain ('SafeDictMap(response');
    });
    test ('negative: a stub missing from the companion keeps the box', () => {
        const out = print (MAP.split ('\n')[0] + '\n');
        expect (out).not.toContain ('var response map[string]any');
        expect (out).not.toContain ('response["data"].(map[string]any)');
    });
    test ('negative: a list stub keeps the box', () => {
        const out = print (MAP.replace ('EndpointResult[map[string]any] {\nfunc (this *x) PrivateGetB', 'EndpointResult[map[string]any] {\nfunc (this *x) PrivateGetC'));
        expect (out).not.toContain ('response["data"].(map[string]any)');
    });
});
