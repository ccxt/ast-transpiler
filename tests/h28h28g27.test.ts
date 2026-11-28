import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// `const c = this.safeValue (this.clients, client.url); if (c !== client)` prints the native identity compare
describe ('go ws client registry identity compare', () => {
    const BASE =
        'export class Client {\n    url: string;\n}\n' +
        'export class Exchange {\n    clients: any;\n' +
        '    safeValue (o: any, k: any, d: any = undefined): any {\n        return o;\n    }\n}\n';
    const VENUE =
        "import { Exchange, Client } from '../base/Exchange.js';\n" +
        'export default class ex extends Exchange {\n' +
        '    neq (client: Client) {\n        const currentClient = this.safeValue (this.clients, client.url);\n' +
        '        if (currentClient !== client) {\n            return 1;\n        }\n        return 2;\n    }\n' +
        '    eq (client: Client) {\n        const currentClient = this.safeValue (this.clients, client.url);\n' +
        '        if (client === currentClient) {\n            return 1;\n        }\n        return 2;\n    }\n' +
        '    anyClient (client: any) {\n        const currentClient = this.safeValue (this.clients, client.url);\n' +
        '        if (currentClient !== client) {\n            return 1;\n        }\n        return 2;\n    }\n' +
        '    other (client: Client, x: any) {\n        const currentClient = this.safeValue (this.clients, client.url);\n' +
        '        if (currentClient !== x) {\n            return 1;\n        }\n        return 2;\n    }\n' +
        '}\n';
    let out = '';
    const fn = (name: string) => {
        const start = out.indexOf ('func (this *ex) ' + name[0].toUpperCase () + name.slice (1) + '(');
        const next = out.indexOf ('\nfunc ', start + 1);
        return out.slice (start, (next < 0) ? out.length : next);
    };
    beforeAll (() => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h28g27-'));
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
    test ('positive: !== prints the typed registry read and a native identity compare', () => {
        expect (fn ('neq')).toContain ('var currentClient ClientInterface = nil');
        expect (fn ('neq')).toContain ('if currentClient != client {');
        expect (fn ('neq')).not.toContain ('IsEqual(');
    });
    test ('positive: === with the client on the left', () => {
        expect (fn ('eq')).toContain ('if client == currentClient {');
    });
    test ('negative: an any client parameter keeps the box', () => {
        expect (fn ('anyClient')).not.toContain ('currentClient != client {');
        expect (fn ('anyClient')).not.toContain ('ClientInterface = nil');
    });
    test ('negative: a compare with another boxed value keeps the box', () => {
        expect (fn ('other')).not.toContain ('currentClient != x {');
        expect (fn ('other')).not.toContain ('ClientInterface = nil');
    });
});
