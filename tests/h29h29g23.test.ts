import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// `const url = this.getWsUrl ()` of a non-nil `string` getter types the internal url parameter, so
// `url in this.clients` prints the native map membership
describe ('go ws url local types the client registry membership', () => {
    const BASE =
        'export class Client {\n    url: string;\n}\n' +
        'export class Exchange {\n    clients: any;\n    urls: any;\n    options: any;\n' +
        '    safeString (o: any, k: any, d: any = undefined): any {\n        return o;\n    }\n' +
        '    safeValue (o: any, k: any, d: any = undefined): any {\n        return o;\n    }\n}\n';
    const venue = (getter: string, extra = '') =>
        "import { Exchange } from '../base/Exchange.js';\n" +
        'export default class ex extends Exchange {\n' + getter +
        '    async waitPending (url: string, hashes: string[]): Promise<any> {\n' +
        '        if (!(url in this.clients)) {\n            return undefined;\n        }\n        return hashes;\n    }\n' +
        '    async watchA () {\n        const url = this.getWsUrl ();\n        return await this.waitPending (url, [ \'a\' ]);\n    }\n' + extra +
        '}\n';
    const print = (src: string): string => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h29g23-'));
        try {
            const dir = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (dir, 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'pro'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'base', 'Exchange.ts'), BASE);
            fs.writeFileSync (path.join (dir, 'pro', 'ex.ts'), src);
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (path.join (dir, 'pro', 'ex.ts')).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    const LITERAL_DEFAULT =
        '    getWsUrl (): string {\n        const url = this.safeString (this.urls, \'ws\', \'\');\n' +
        '        if (this.options) {\n            return url;\n        }\n        return url + \'?v=\' + \'3\';\n    }\n';
    test ('positive: literal-defaulted getter types the parameter and the membership is native', () => {
        const out = print (venue (LITERAL_DEFAULT));
        expect (out).toContain ('WaitPending(url string, hashes');
        expect (out).toContain ('if _, ok := this.Clients[url]; !ok {');
        expect (out).not.toContain ('InOp(this.Clients, url)');
    });
    test ('negative: a getter that can return nil keeps the box', () => {
        const out = print (venue ('    getWsUrl (): string {\n        return this.safeString (this.urls, \'ws\');\n    }\n'));
        expect (out).not.toContain ('WaitPending(url string');
        expect (out).not.toContain ('this.Clients[url]; !ok');
    });
    test ('negative: a getter returning a boxed field read keeps the box', () => {
        const out = print (venue ('    getWsUrl (): string {\n        return this.urls[\'ws\'];\n    }\n'));
        expect (out).not.toContain ('this.Clients[url]; !ok');
    });
    test ('negative: another caller passing a boxed value keeps the box', () => {
        const extra = '    async watchB (u: any) {\n        return await this.waitPending (u, [ \'b\' ]);\n    }\n';
        const out = print (venue (LITERAL_DEFAULT, extra));
        expect (out).not.toContain ('WaitPending(url string');
        expect (out).not.toContain ('this.Clients[url]; !ok');
    });
});
