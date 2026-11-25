import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// `client.url === p` (client: Client, p a `*string` local) prints the nil-guarded native compare
describe ('go ws client url compare with a string pointer', () => {
    const BASE =
        'export class Client {\n    url: string;\n}\n' +
        'export class Exchange {\n    urls: any;\n' +
        '    safeString (o: any, k: any, d: any = undefined): string {\n        return o;\n    }\n}\n';
    const VENUE =
        "import { Exchange, Client } from '../base/Exchange.js';\n" +
        'export default class ex extends Exchange {\n' +
        '    eq (client: Client) {\n        const gatewayUrl: string = this.safeString (this.urls, "gateway");\n' +
        '        if (client.url === gatewayUrl) {\n            return 1;\n        }\n        return 2;\n    }\n' +
        '    neq (client: Client) {\n        const gatewayUrl: string = this.safeString (this.urls, "gateway");\n' +
        '        if (gatewayUrl !== client.url) {\n            return 1;\n        }\n        return 2;\n    }\n' +
        '    anyClient (client: any) {\n        const gatewayUrl: string = this.safeString (this.urls, "gateway");\n' +
        '        if (client.url === gatewayUrl) {\n            return 1;\n        }\n        return 2;\n    }\n' +
        '    boxed (client: Client, other: any) {\n        if (client.url === other) {\n            return 1;\n        }\n        return 2;\n    }\n' +
        '}\n';
    let out = '';
    const fn = (name: string) => {
        const start = out.indexOf ('func (this *ex) ' + name[0].toUpperCase () + name.slice (1) + '(');
        const next = out.indexOf ('\nfunc ', start + 1);
        return out.slice (start, (next < 0) ? out.length : next);
    };
    beforeAll (() => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h27g36-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (src, 'pro'), { 'recursive': true });
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            fs.writeFileSync (path.join (src, 'pro', 'ex.ts'), VENUE);
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            out = t.transpileGoByPath (path.join (src, 'pro', 'ex.ts')).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    });
    test ('positive: === keeps the nil answer of the pointer', () => {
        expect (fn ('eq')).toContain ('if gatewayUrl != nil && client.Url == *gatewayUrl {');
        expect (fn ('eq')).not.toContain ('IsEqual(');
    });
    test ('positive: !== with the pointer on the left', () => {
        expect (fn ('neq')).toContain ('if gatewayUrl == nil || client.Url != *gatewayUrl {');
    });
    test ('negative: an any client keeps the helper', () => {
        expect (fn ('anyClient')).toContain ('IsEqual(');
    });
    test ('negative: a boxed operand that may be nil keeps the helper', () => {
        expect (fn ('boxed')).toContain ('IsEqual(');
        expect (fn ('boxed')).not.toContain ('*other');
    });
});
