import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoSignTyping } from '../src/transpiler';

describe ('go nil-guard-filled header maps', () => {
    const root = path.join (__dirname, 'files', 'tmp-h17g12', 'ts', 'src');
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h17g12'), { recursive: true, force: true }));
    const sign = (tail: string) => '    sign (path, api = \'public\', method = \'GET\', params = {}, headers = undefined, body = undefined) {\n        let requestHeaders: NullableDict = undefined;\n        if (api === \'private\') {\n            requestHeaders = {\n                \'KEY\': this.apiKey,\n            };\n        }\n' + tail + '    }\n';

    const guard = '        if (method === \'POST\') {\n            if (requestHeaders === undefined) {\n                requestHeaders = {};\n            }\n            requestHeaders[\'Content-Type\'] = \'application/json\';\n        }\n';
    test ('a nil guard that fills the local proves the element write after it', () => {
        expect (print (sign (guard + '        return { \'url\': path, \'headers\': requestHeaders };\n'))).toContain ('var requestHeaders map[string]any = nil');
    });
    test ('negatives keep the box', () => {
        // the guard has an else branch that leaves the local nil
        const withElse = guard.replace ('                requestHeaders = {};\n            }\n', '                requestHeaders = {};\n            } else {\n                path = path;\n            }\n');
        expect (print (sign (withElse.replace ('requestHeaders === undefined', 'requestHeaders !== undefined') + '        return { \'headers\': requestHeaders };\n'))).toContain ('var requestHeaders any = nil');
        // the fill writes another type
        expect (print (sign (guard.replace ('requestHeaders = {};', 'requestHeaders = [ 1 ] as any;') + '        return { \'headers\': requestHeaders };\n'))).toContain ('var requestHeaders any = nil');
        // the guard runs on one path only, and a copy is then tested against undefined: the nil answer must stay
        expect (print (sign (guard + '        const c = requestHeaders;\n        if (c === undefined) {\n            return {};\n        }\n        return { \'headers\': c };\n'))).toContain ('var requestHeaders any = nil');
    });
});
