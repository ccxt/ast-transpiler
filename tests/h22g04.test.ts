import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go SafeString with a Go string field default is non-nil, so its concat locals type string', () => {
    const root = path.join (__dirname, 'files', 'tmp-h22g04', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        "    version: string = 'v';\n" +
        '    json (o: any): string { return JSON.stringify (o); }\n' +
        '    implodeParams (p: string, o: any): string { return p; }\n' +
        '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n' +
        '    urlencode (o: any): string { return o; }\n' +
        '}\n';
    const VENUE =
        "import { Exchange } from './base/Exchange.js';\n" +
        "import type { Str } from './base/Exchange.js';\n" +
        'export default class v extends Exchange {\n' +
        '    sign (path: string, params: any, apiName: string) {\n' +
        "        const dv = this.safeString (params, path, this.version);\n" +
        "        const version = this.safeString (params, 'version', dv);\n" +
        "        const endpoint: string = version + '/' + this.implodeParams (path, params);\n" +
        '        let query: string = endpoint;\n' +
        "        let postData = '';\n" +
        "        if (path === 'b') {\n" +
        "            postData = this.urlencode (params);\n" +
        "            query += '?' + postData;\n" +
        '        }\n' +
        "        let auth: string = postData + '/api/';\n" +
        "        if (apiName !== 'private') {\n" +
        "            auth += postData + '/';\n" +
        '        }\n' +
        '        auth += endpoint;\n' +
        "        return { 'url': query, 'a': auth };\n" +
        '    }\n' +
        '    nilDefault (params: any, d: Str) {\n' +
        "        const ver = this.safeString (params, 'version', d);\n" +
        "        let ep = ver + '/x';\n" +
        "        ep += '?' + this.urlencode (params);\n" +
        "        return ep;\n" +
        '    }\n' +
        '    nilTested (params: any) {\n' +
        "        const ver2 = this.safeString (params, 'version');\n" +
        "        let other = this.safeString (params, 'other', this.version);\n" +
        "        if (ver2 === undefined) {\n" +
        "            other = ver2;\n" +
        '        }\n' +
        "        let ep2 = other + '/x';\n" +
        "        ep2 += '?' + this.urlencode (params);\n" +
        "        return ep2;\n" +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        out = t.transpileGoByPath (path.join (root, 'v.ts')).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h22g04'), { recursive: true, force: true }));
    test ('positive: a field-defaulted chain types the endpoint, query and auth accumulators string', () => {
        expect (out).toMatch (/var endpoint string = \*version \+ "\/" \+ this\.ImplodeParams\(path, params\)/);
        expect (out).toMatch (/var query string = endpoint/);
        expect (out).toMatch (/query \+= "\?" ?\+ ?postData/);
        expect (out).toMatch (/var auth string = postData \+ "\/api\/"/);
        expect (out).toMatch (/auth \+= endpoint/);
        expect (out).not.toMatch (/Add\((query|auth|version),/);
    });

    test ('negative: a default that can be nil keeps the box and Add', () => {
        expect (out).toMatch (/var ver \*string = this\.SafeString\(params, "version", d\)/);
        expect (out).toMatch (/ep = Add\(ep, /);
    });

    test ('negative: a field-defaulted local that is later written nil keeps the box and Add', () => {
        expect (out).toMatch (/other = ver2/);
        expect (out).toMatch (/ep2 = Add\(ep2, /);
    });
});
