import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go body local appended right after its this.json write appends a typed string', () => {
    const root = path.join (__dirname, 'files', 'tmp-h21g03', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '    json (o: any): string {\n' +
        '        return JSON.stringify (o);\n' +
        '    }\n' +
        '    other (o: any): Str {\n' +
        '        return o;\n' +
        '    }\n' +
        '}\n';
    const VENUE =
        "import { Exchange } from './base/Exchange.js';\n" +
        "import type { Str } from './base/Exchange.js';\n" +
        'export default class v extends Exchange {\n' +
        '    signed (method: string, params: any) {\n' +
        '        let requestBody: Str = undefined;\n' +
        "        let auth = this.id + 'ts';\n" +
        "        if (method === 'POST') {\n" +
        '            requestBody = this.json (params);\n' +
        '            auth += requestBody;\n' +
        '        }\n' +
        "        return { 'body': requestBody, 'sig': auth };\n" +
        '    }\n' +
        '    anyAcc (params: any, extra: any) {\n' +
        '        let requestBody: Str = undefined;\n' +
        '        let sig = extra;\n' +
        '        requestBody = this.json (params);\n' +
        '        sig += requestBody;\n' +
        "        return { 'body': requestBody, 'sig': sig };\n" +
        '    }\n' +
        '    notJson (method: string, params: any) {\n' +
        '        let signedBody: Str = undefined;\n' +
        "        let payload = this.id + 'ts';\n" +
        "        if (method === 'POST') {\n" +
        '            signedBody = this.other (params);\n' +
        '            payload += signedBody;\n' +
        '        }\n' +
        "        return { 'body': signedBody, 'sig': payload };\n" +
        '    }\n' +
        '    notAdjacent (method: string, params: any) {\n' +
        '        let body: Str = undefined;\n' +
        "        let msg = this.id + 'ts';\n" +
        "        if (method === 'POST') {\n" +
        '            body = this.json (params);\n' +
        "            body = (method === 'X') ? undefined : body;\n" +
        '            msg += body;\n' +
        '        }\n' +
        '        if (body === undefined) {\n' +
        "            return msg;\n" +
        '        }\n' +
        "        return { 'body': body, 'sig': msg };\n" +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h21g03'), { recursive: true, force: true }));

    test ('positive: the json write binds a typed string and the append is native', () => {
        expect (out).toMatch (/var requestBodyText string = this\.Json\(params\)\n\s*requestBody = requestBodyText/);
        expect (out).toMatch (/auth \+= requestBodyText/);
        expect (out).not.toMatch (/auth = Add\(auth, requestBody\)/);
        expect (out).toMatch (/var requestBody any = nil/);
    });

    test ('negative: an any accumulator keeps Add and binds nothing', () => {
        expect (out).toMatch (/sig = Add\(sig, requestBody\)/);
        expect ((out.match (/requestBodyText string/g) ?? []).length).toBe (1);
    });

    test ('negative: a write that is not this.json keeps Add', () => {
        expect (out).toMatch (/payload = Add\(payload, signedBody\)/);
        expect (out).not.toMatch (/signedBodyText/);
    });

    test ('negative: a nilable write between json and the append keeps Add and the nil test', () => {
        expect (out).toMatch (/msg = Add\(msg, body\)/);
        expect (out).not.toMatch (/bodyText/);
        expect (out).toMatch (/body == nil|IsEqual\(body, nil\)/);
    });
});
