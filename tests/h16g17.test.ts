import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoSignTyping } from '../src/transpiler';

describe ('go nil-seeded header maps', () => {
    const root = path.join (__dirname, 'files', 'tmp-h16g17', 'ts', 'src');
    const print = (venue: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), 'export type Dict = {[key: string]: any};\nexport type NullableDict = Dict | undefined;\nexport class Exchange {\n    apiKey: string;\n    extend (...args: any[]): Dict { return {}; }\n    sign (path: any, api: any = \'public\', method = \'GET\', params = {}, headers: any = undefined, body: any = undefined): any { return {}; }\n}\n');
        fs.writeFileSync (path.join (root, 'venue.ts'), "import { Exchange } from './base/Exchange';\nimport type { Dict, NullableDict } from './base/Exchange';\nexport default class venue extends Exchange {\n" + venue + '}\n');
        const t: any = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
        installCcxtGoLocalTypes (t.goTranspiler);
        installCcxtGoIndexableTypes (t.goTranspiler);
        installCcxtGoParamTypes (t.goTranspiler);
        installCcxtGoDictParams (t.goTranspiler);
        installCcxtGoSignTyping (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'venue.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h16g17'), { recursive: true, force: true }));
    const sign = (tail: string) => '    sign (path, api = \'public\', method = \'GET\', params = {}, headers = undefined, body = undefined) {\n        let requestHeaders: NullableDict = undefined;\n        if (api === \'private\') {\n            requestHeaders = {\n                \'KEY\': this.apiKey,\n            };\n        }\n' + tail + '    }\n';

    const copy = '        const headersResolved = requestHeaders;\n';
    test ('a nil-seeded header map copied into a const stored in the result keeps its map type', () => {
        const out = print (sign (copy + '        return { \'url\': path, \'headers\': headersResolved };\n'));
        expect (out).toContain ('var requestHeaders map[string]any = nil');
    });
    test ('negatives keep the box', () => {
        // the copy is also read as a value elsewhere (not only stored into a literal slot)
        expect (print (sign (copy + '        return [ headersResolved ];\n'))).toContain ('var requestHeaders any = nil');
        // a write of another type joins nothing
        expect (print (sign ('        if (api === \'x\') {\n            requestHeaders = [ 1 ] as any;\n        }\n' + copy + '        return { \'headers\': headersResolved };\n'))).toContain ('var requestHeaders any = nil');
        // the copy is compared with undefined: a typed nil map in an any box is not nil
        expect (print (sign (copy + '        if (headersResolved === undefined) {\n            return {};\n        }\n        return { \'headers\': headersResolved };\n'))).toContain ('var requestHeaders any = nil');
    });
});
