import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// `this.safeDict (R, 'k', R)` on a decoded JSON map prints the comma-ok read with R as the nil fallback
describe ('h28a05: self-defaulted safeDict of a decoded map prints the comma-ok read', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
        + '    keep (o: any): any { return o; }\n}\nexport default BaseExchange;\n';
    const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ninterface Exchange {\n'
        + '    privateGetA (params?: {}): Promise<Dict>;\n    privateGetB (params?: {}): Promise<any>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h28a05-'));
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
    const fn = (call: string, read: string, use = '') => '    async f (params = {}) {\n        const response = await this.' + call + ' (params);\n'
        + '        const data = this.safeDict (response, \'data\', {});\n        const order = ' + read + ';\n' + use + '        return order;\n    }\n';
    const native = '\tvar order map[string]any\n\torder, _ = data["order"].(map[string]any)\n\tif order == nil {\n\t\torder = data\n\t}\n';

    test ('decoded map receiver: comma-ok read with the receiver as fallback', () => {
        const out = print (fn ('privateGetA', 'this.safeDict (data, \'order\', data) as Dict'));
        expect (out).toContain (native);
        expect (out).not.toContain ('SafeDictMap(data, "order", data)');
        expect (out).not.toContain ('order :=');
    });
    test ('untyped endpoint receiver does not print the assertion', () => {
        const out = print ('    async f (params = {}) {\n        const response = await this.privateGetB (params);\n'
            + '        const order = this.safeDict (response, \'order\', response);\n        return order;\n    }\n');
        expect (out).not.toContain ('response["order"].(map[string]any)');
    });
    test ('a receiver handed out to a call does not print the assertion', () => {
        const out = print (fn ('privateGetA', 'this.safeDict (data, \'order\', data)', '        this.keep (data);\n'));
        expect (out).not.toContain ('data["order"].(map[string]any)');
    });
    test ('a result written through (it may alias the receiver) does not print the assertion', () => {
        const out = print (fn ('privateGetA', 'this.safeDict (data, \'order\', data)', '        order[\'t\'] = 1;\n'));
        expect (out).not.toContain ('data["order"].(map[string]any)');
    });
    test ('an awaited endpoint receiver (bound r.Raw by the ccxt pass when used as a value) does not print the assertion', () => {
        const out = print ('    async f (params = {}) {\n        const response = await this.privateGetA (params);\n'
            + '        const order = this.safeDict (response, \'order\', response);\n        return order;\n    }\n');
        expect (out).not.toContain ('response["order"].(map[string]any)');
    });
    test ('a fallback other than the receiver does not print the assertion', () => {
        const out = print ('    async f (params = {}) {\n        const response = await this.privateGetA (params);\n'
            + '        const data = this.safeDict (response, \'data\', {});\n        const order = this.safeDict (data, \'order\', response);\n        return order;\n    }\n');
        expect (out).not.toContain ('data["order"].(map[string]any)');
    });
});
