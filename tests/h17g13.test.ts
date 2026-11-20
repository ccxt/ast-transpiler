import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go nil-guarded string reads of a Str optional in generateClientOrderId', () => {
    const root = path.join (__dirname, 'files', 'tmp-h17g13', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n' +
        '}\n';
    const print = (name: string, body: string): string => {
        const venue =
            "import { Exchange, Str, Dict } from './base/Exchange';\n" +
            'export class ex extends Exchange {\n' +
            `    ${name} (market: Dict = undefined, api: Str = undefined, path: Str = undefined): string {\n` + body +
            '    }\n' +
            '    run (api: string, path: string) {\n' +
            `        return this.${name} (undefined, api, path);\n` +
            '    }\n' +
            '}\n';
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'ex.ts'), venue);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'ex.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h17g13'), { recursive: true, force: true }));

    const GUARDED =
        '        let t: Str = undefined;\n' +
        "        if ((t === undefined) && (path !== undefined)) { if (path.indexOf ('um/') === 0) { t = 'swap'; } }\n" +
        "        if ((t === undefined) && (api !== undefined)) { if (api.indexOf ('dapi') > -1 || api === 'private') { t = 'spot'; } }\n" +
        "        return (t === undefined) ? 'x' : t;\n";

    test ('guarded indexOf reads bind *string and print strings.Index', () => {
        const out = print ('generateClientOrderId', GUARDED);
        expect (out).toContain ('var path *string = GetArgStringPtr(optionalArgs, 2, nil)');
        expect (out).toContain ('strings.Index(*path, "um/")');
        expect (out).not.toContain ('GetIndexOf(path,');
        expect (out).not.toContain ('GetIndexOf(api,');
    });
    test ('the same body in a method outside the table keeps the box', () => {
        const out = print ('otherClientOrderId', GUARDED);
        expect (out).toContain ('GetIndexOf(path, "um/")');
    });
    test ('a body writing a non-string into the parameter keeps the box', () => {
        const out = print ('generateClientOrderId',
            '        path = 3 as any;\n' +
            "        if (path !== undefined && path.indexOf ('um/') === 0) { return 'a'; }\n" +
            "        return 'b';\n");
        expect (out).not.toContain ('var path *string');
        expect (out).toContain ('GetIndexOf(path, "um/")');
    });
    test ('a body handing the nil-capable value to an unknown consumer keeps the box', () => {
        const out = print ('generateClientOrderId',
            "        if (path === undefined) { return this.unknownSink (path); }\n" +
            "        return path.indexOf ('um/') === 0 ? 'a' : 'b';\n");
        expect (out).not.toContain ('var path *string');
    });
});
