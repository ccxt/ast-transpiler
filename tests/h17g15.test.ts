import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoSignTyping } from '../src/transpiler';

describe ('go nil-seeded maps written inside their own nil guard', () => {
    const root = path.join (__dirname, 'files', 'tmp-h17g15', 'ts', 'src');
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h17g15'), { recursive: true, force: true }));
    const body = (inner: string, tail = '') => '    fetchIt (enabled: boolean, req: Dict) {\n        let data: NullableDict = undefined;\n        if (enabled) {\n            data = { \'request\': undefined };\n        }\n        if (data !== undefined) {\n' + inner + '        }\n' + tail + '        return 1;\n    }\n';

    test ('a guarded literal-key write into a nil-seeded map join prints a native store', () => {
        const out = print (body ('            data[\'request\'] = { \'a\': 1 };\n'));
        expect (out).toContain ('var data map[string]any = nil');
        expect (out).toContain ('data["request"] = map[string]any{');
        expect (out).not.toContain ('AddElementToObject(data');
    });
    test ('negatives keep the box', () => {
        // a write of another type joins nothing
        const other = print (body ('            data[\'request\'] = { \'a\': 1 };\n', '        data = [ 1 ] as any;\n'));
        expect (other).toContain ('var data any = nil');
        expect (other).toContain ('AddElementToObject(data');
        // an unguarded write may meet nil (the helper is a no-op there)
        const bare = print (body ('            data[\'x\'] = 1;\n', '        data[\'request\'] = { \'a\': 1 };\n'));
        expect (bare).toContain ('AddElementToObject(data, "request"');
        // the value is handed on outside the guard and compared with nil there
        const handed = print (body ('            data[\'request\'] = { \'a\': 1 };\n', '        const copy: any = data;\n        if (copy === undefined) {\n            return 0;\n        }\n'));
        expect (handed).toContain ('var data any = nil');
        // the local is rebound inside the guard
        const rebound = print (body ('            data = undefined;\n            data[\'request\'] = { \'a\': 1 };\n'));
        expect (rebound).not.toContain ('data["request"] = map[string]any{');
    });
});
