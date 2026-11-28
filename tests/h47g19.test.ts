import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a venue-private `params: Dict` parameter prints map[string]any when every caller passes the GetArgMap map
describe ('h47g19: venue-private Dict params parameter', () => {
    const HEAD = 'export type Dict = { [key: string]: any };\nexport type Str = string | undefined;\nclass BaseExchange {\n'
        + '    walletAddress: string = \'\';\n    id: string = \'\';\n'
        + '    handleOptionStringAndParams (params: object, methodName: string, optionName: string, defaultValue: Str = undefined): [Str, Dict] { return [ defaultValue, params ]; }\n'
        + '    safeDict (o: any, k: any, d: Dict = undefined): Dict { return o; }\n'
        + '    keep (o: any): any { return o; }\n}\nexport default BaseExchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h47g19-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nimport type { Dict, Str } from \'./base/Exchange.js\';\nclass x extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const HANDLE = '    handlePublicAddress (methodName: string, params: Dict): [Str, Dict] {\n'
        + '        const [ user, rest ] = this.handleOptionStringAndParams (params, methodName, \'user\');\n'
        + '        if (user !== undefined) {\n            return [ user, rest ];\n        }\n        return [ this.walletAddress, rest ];\n    }\n';
    const CALLER = '    async fetchA (params = {}) {\n        const [ u, p ] = this.handlePublicAddress (\'fetchA\', params);\n        return this.keep ([ u, p ]);\n    }\n';
    test ('callers hand on their GetArgMap params: map[string]any (fails on the base printer)', () => {
        const out = print (HANDLE + CALLER);
        expect (out).toContain ('HandlePublicAddress(methodName string, params map[string]any)');
        expect (out).toContain ('this.HandlePublicAddress("fetchA", params)');
    });
    test ('negative: a caller passing a boxed value keeps the box', () => {
        const out = print (HANDLE + CALLER + '    fetchC (x: any) {\n        return this.handlePublicAddress (\'fetchC\', x);\n    }\n');
        expect (out).toContain ('HandlePublicAddress(methodName string, params any)');
    });
    test ('negative: a caller passing undefined (nil) keeps the box', () => {
        const out = print (HANDLE + CALLER + '    fetchD () {\n        return this.handlePublicAddress (\'fetchD\', undefined);\n    }\n');
        expect (out).toContain ('HandlePublicAddress(methodName string, params any)');
    });
    test ('negative: reads from the typed user params bag keep the helper (not decoded JSON)', () => {
        const READ = '    readBag (methodName: string, params: Dict) {\n        const d = this.safeDict (params, \'x\');\n        return this.keep (d);\n    }\n';
        const out = print (READ + '    async fetchB (params = {}) {\n        return this.readBag (\'fetchB\', params);\n    }\n');
        expect (out).toContain ('ReadBag(methodName string, params map[string]any)');
        expect (out).not.toContain ('params["x"].(');
    });
    test ('negative: a parameter not declared Dict keeps the box', () => {
        const out = print (HANDLE.replace ('params: Dict', 'params') + CALLER);
        expect (out).toContain ('HandlePublicAddress(methodName string, params any)');
    });
});
