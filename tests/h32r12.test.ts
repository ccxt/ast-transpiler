import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

const HEAD = 'type Dict = { [key: string]: any };\ntype List = any[];\nclass BaseExchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
    + '    safeList (o: any, k: any, d: List = undefined): List { return d; }\n    safeString (o: any, k: any, d: string = undefined): string { return d; }\n}\nexport default BaseExchange;\n';
const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ntype List = any[];\ninterface Exchange {\n'
    + '    publicPostInfo (params?: {}): Promise<Dict | List>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
export const printGo = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h32r12-'));
    try {
        fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
        fs.mkdirSync (path.join (dir, 'ts', 'src', 'abstract'), { 'recursive': true });
        fs.mkdirSync (path.join (dir, 'go', 'v4'), { 'recursive': true });
        fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
        fs.writeFileSync (path.join (dir, 'ts', 'src', 'abstract', 'x.ts'), ABSTRACT);
        fs.writeFileSync (path.join (dir, 'go', 'v4', 'x_api.go'), 'func (this *x) PublicPostInfo(args ...any) <-chan AsyncResult[any] {\n');
        const file = path.join (dir, 'ts', 'src', 'x.ts');
        fs.writeFileSync (file, 'import Exchange from \'./abstract/x.js\';\nclass x extends Exchange {\n' + body + '}\n');
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (file).content;
    } finally {
        fs.rmSync (dir, { 'recursive': true, 'force': true });
    }
};
const fn = (name: string, decl: string, use: string) => '    async ' + name + ' (params = {}) {\n        const response' + decl + ' = await this.publicPostInfo (params);\n' + use + '    }\n';
describe ('h32r12: an awaited result bound to a declared Dict / List local is one comma-ok read', () => {
    test ('Dict local: comma-ok map, literal-key reads native', () => {
        const out = printGo (fn ('f', ': Dict', '        const data = this.safeDict (response, \'data\');\n        return data;\n'));
        expect (out).toContain ('response, _ := PanicOnError((<-this.PublicPostInfo(params))).(map[string]any)');
        expect (out).toContain ('var data, _ = response["data"].(map[string]any)');
        expect (out).not.toContain ('SafeMapTyped(response');
    });
    test ('List local: comma-ok slice, index read bounds-tested', () => {
        const out = printGo (fn ('g', ': List', '        const first = this.safeDict (response, 0);\n        return first;\n'));
        expect (out).toContain ('response, _ := PanicOnError((<-this.PublicPostInfo(params))).([]any)');
        expect (out).toContain ('if 0 < len(response) {');
    });
    test ('undeclared local keeps the box', () => {
        const out = printGo (fn ('h', '', '        const data = this.safeDict (response, \'data\');\n        return data;\n'));
        expect (out).toContain ('PanicOnError(response)');
        expect (out).not.toContain (', _ := PanicOnError(');
    });
    test ('wrong kind / nil: a Dict local handed on as a value keeps the box', () => {
        const out = printGo (fn ('k', ': Dict', '        return response;\n'));
        expect (out).not.toContain (', _ := PanicOnError(');
    });
    test ('unannotated local over a venue method declared Promise<Dict>: comma-ok map', () => {
        const helper = '    async prep (params: Dict): Promise<Dict> {\n        return params;\n    }\n';
        const out = printGo (helper + '    async u (params = {}) {\n        const q = await this.prep (params);\n        return this.safeString (q, \'a\');\n    }\n');
        expect (out).toContain ('q, _ := PanicOnError((<-this.Prep(params))).(map[string]any)');
    });
    test ('unannotated local over an API stub or an any-declared method keeps the box', () => {
        const helper = '    async prep (params: Dict): Promise<any> {\n        return params;\n    }\n';
        const out = printGo (helper + '    async u (params = {}) {\n        const q = await this.prep (params);\n        const r = await this.publicPostInfo (params);\n        return [ this.safeString (q, \'a\'), this.safeString (r, \'a\') ];\n    }\n');
        expect (out).not.toContain (', _ := PanicOnError(');
    });
    test ('unannotated Dict-method local handed on as a value keeps the box', () => {
        const helper = '    async prep (params: Dict): Promise<Dict> {\n        return params;\n    }\n';
        const out = printGo (helper + '    async u (params = {}) {\n        const q = await this.prep (params);\n        return q;\n    }\n');
        expect (out).not.toContain (', _ := PanicOnError(');
    });
});
