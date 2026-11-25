import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go base nullable string inputs and string async receives', () => {
    const root = path.join (__dirname, 'files', 'tmp-h11g07', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        '    safeString (o: any, k: any, d: Str = undefined): Str { return o[k] ?? d; }\n' +
        '    convertExpireDate (date: Str): Str {\n' +
        '        if (date === undefined) {\n' +
        '            return undefined;\n' +
        '        }\n' +
        '        const year = date.slice (0, 2);\n' +
        "        return '20' + year;\n" +
        '    }\n' +
        '    otherDate (date: Str): Str {\n' +
        '        if (date === undefined) {\n' +
        '            return undefined;\n' +
        '        }\n' +
        '        return date.slice (1, 3);\n' +
        '    }\n' +
        '}\n';
    const VENUE =
        "import { Exchange, Str } from './base/Exchange';\n" +
        'export class ex extends Exchange {\n' +
        '    run (parts: string[], slash: boolean) {\n' +
        '        let expiry: Str = undefined;\n' +
        '        if (slash) {\n' +
        '            expiry = this.safeString (parts, 1);\n' +
        '        }\n' +
        '        const datetime = this.convertExpireDate (expiry);\n' +
        "        return datetime + '-' + expiry;\n" +
        '    }\n' +
        '}\n';
    const print = (file: string, install = true): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'ex.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        if (install) { installCcxtGoHooks (t.goTranspiler); }
        return t.transpileGoByPath (path.join (root, file)).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h11g07'), { recursive: true, force: true }));

    test ('a tabled base Str input prints *string and its guarded slice is a native subscript', () => {
        const out = print (path.join ('base', 'Exchange.ts'));
        expect (out).toContain ('ConvertExpireDate(date *string)');
        expect (out).toContain ('(*date)[0:min(2, len((*date)))]');
        expect (out).not.toContain ('Slice(date, 0, 2)');
        // an untabled method keeps the box and the helper
        expect (out).toContain ('Slice(date, 1, 3)');
        expect (print (path.join ('base', 'Exchange.ts'), false)).not.toContain ('ConvertExpireDate(date *string)');
    });
    test ('a nil-seeded Str local handed to the tabled input is a *string', () => {
        const out = print ('ex.ts');
        expect (out).toContain ('var expiry *string = nil');
        expect (out).toContain ('this.ConvertExpireDate(expiry)');
    });
    test ('a const receive of a string-channel callee passes a string parameter', () => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'ws.ts'), "import { Exchange } from './base/Exchange';\n" +
            'export class ws extends Exchange {\n' +
            "    async getUrl (): Promise<string> { return 'wss://x'; }\n" +
            "    kind (url: string): string { return (url.indexOf ('spot') >= 0) ? 'spot' : 'other'; }\n" +
            '    async run () {\n' +
            '        const url = await this.getUrl ();\n' +
            '        return this.kind (url);\n' +
            '    }\n' +
            '}\n');
        const go = (callees: string[]) => {
            const t = new Transpiler ({ verbose: false, go: { asyncMethodSuffix: 'Async', asyncStringCallees: callees } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (path.join (root, 'ws.ts')).content;
        };
        expect (go ([ 'Ws.GetUrl' ])).toContain ('Kind(url string)');
        expect (go ([])).toContain ('Kind(url any)');
    });
});
