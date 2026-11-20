import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// `const client = this.safeValue (this.clients, url)` in a pro source reads the typed ws client registry
// natively when every use is a member access or an undefined test; any other use keeps the helper.
describe ('go ws client registry read', () => {
    const BASE =
        'export class Client {\n    url: string;\n    subscriptions: any;\n}\n' +
        'export class Exchange {\n    clients: any;\n    urls: any;\n' +
        '    safeValue (o: any, k: any, d: any = undefined): any {\n        return o;\n    }\n' +
        '    safeString (o: any, k: any, d: any = undefined): string {\n        return o;\n    }\n' +
        '    use (x: any): void {\n    }\n}\n';
    const VENUE =
        "import { Exchange, Client } from '../base/Exchange.js';\n" +
        'export default class ex extends Exchange {\n' +
        '    pos () {\n        const url = this.safeString (this.urls, "ws");\n        const client = this.safeValue (this.clients, url);\n' +
        '        if (client !== undefined) {\n            return client.url;\n        }\n        return undefined;\n    }\n' +
        '    posStr () {\n        const url = \'wss://a\';\n        const client = this.safeValue (this.clients, url);\n' +
        '        if (client === undefined) {\n            return 1;\n        }\n        return 2;\n    }\n' +
        '    identity (url: string, other: Client) {\n        const client = this.safeValue (this.clients, url);\n' +
        '        if (client !== other) {\n            return 1;\n        }\n        return 2;\n    }\n' +
        '    handedOff (url: string) {\n        const client = this.safeValue (this.clients, url);\n        this.use (client);\n    }\n' +
        '    otherField (url: string) {\n        const client = this.safeValue (this.urls, url);\n' +
        '        if (client === undefined) {\n            return 1;\n        }\n        return 2;\n    }\n' +
        '}\n';
    let out = '';
    const fn = (name: string) => {
        const start = out.indexOf ('func (this *ex) ' + name[0].toUpperCase () + name.slice (1) + '(');
        const next = out.indexOf ('\nfunc ', start + 1);
        return out.slice (start, (next < 0) ? out.length : next);
    };
    beforeAll (() => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h26g49-'));
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
    test ('positive: a pointer url reads the registry under its nil guard', () => {
        expect (fn ('pos')).toContain ('var client ClientInterface = nil');
        expect (fn ('pos')).toContain ('if entry := this.Clients[*url]; entry != nil {');
        expect (fn ('pos')).not.toContain ('SafeValue(this.Clients');
    });
    test ('positive: a string url reads the registry directly', () => {
        expect (fn ('posStr')).toMatch (/if entry := this\.Clients\[url\]; entry != nil \{\n\s+client = entry\n/);
        expect (fn ('posStr')).not.toContain ('SafeValue(');
    });
    test ('negative: an identity compare keeps the helper', () => {
        expect (fn ('identity')).toContain ('SafeValue(this.Clients, url)');
    });
    test ('negative: a hand-off as a value keeps the helper', () => {
        expect (fn ('handedOff')).toContain ('SafeValue(this.Clients, url)');
    });
    test ('negative: another field keeps the helper', () => {
        expect (fn ('otherField')).toContain ('SafeValue(this.Urls, url)');
    });
});
