import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoSignTyping } from '../src/transpiler';

describe ('go nil-join header copies', () => {
    const root = path.join (__dirname, 'files', 'tmp-h18g16', 'ts', 'src');
    const print = (venue: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), 'export type Dict = {[key: string]: any};\nexport type NullableDict = Dict | undefined;\nexport class Exchange {\n    apiKey: string;\n    sign (path: any, api: any = \'public\', method = \'GET\', params = {}, headers: any = undefined, body: any = undefined): any { return {}; }\n}\n');
        fs.writeFileSync (path.join (root, 'venue.ts'), "import { Exchange } from './base/Exchange';\nimport type { Dict, NullableDict } from './base/Exchange';\nexport default class venue extends Exchange {\n" + venue + '}\n');
        const t: any = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
        installCcxtGoLocalTypes (t.goTranspiler);
        installCcxtGoIndexableTypes (t.goTranspiler);
        installCcxtGoParamTypes (t.goTranspiler);
        installCcxtGoDictParams (t.goTranspiler);
        installCcxtGoSignTyping (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'venue.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h18g16'), { recursive: true, force: true }));
    const sign = (tail: string) => '    sign (path, api = \'public\', method = \'GET\', params = {}, headers = undefined, body = undefined) {\n        let h: NullableDict = undefined;\n        if (api === \'private\') {\n            h = {\n                \'KEY\': this.apiKey,\n            };\n            if (method === \'POST\') {\n                h[\'Content-Type\'] = \'application/json\';\n            }\n        }\n' + tail + '    }\n';
    const guardedCopy = '        let c: NullableDict = h;\n        if (path === \'x\') {\n            if (c === undefined) {\n                c = {};\n            }\n            c[\'P\'] = \'1\';\n        }\n        return { \'url\': path, \'headers\': c };\n';
    const nilledCopy = '        let c: NullableDict = h;\n        if (api === \'public\') {\n            c = undefined;\n        }\n        return { \'url\': path, \'headers\': c };\n';
    test ('a let copy filled under its own nil guard types the seed and the copy', () => {
        const out = print (sign (guardedCopy));
        expect (out).toContain ('var h map[string]any = nil');
        expect (out).toContain ('var c map[string]any = h');
    });
    test ('a let copy reset to nil types the seed and the copy', () => {
        const out = print (sign (nilledCopy));
        expect (out).toContain ('var h map[string]any = nil');
        expect (out).toContain ('var c map[string]any = h');
    });
    test ('negatives keep the box', () => {
        // the copy is filled with another type
        expect (print (sign (guardedCopy.replace ('c = {};', 'c = [ 1 ] as any;')))).toContain ('var h any = nil');
        // the copy is element-written after a nil reset
        expect (print (sign (nilledCopy.replace ('        return', '        c[\'P\'] = \'1\';\n        return')))).toContain ('var h any = nil');
        // the copy is passed to an unknown consumer that may test it against nil
        expect (print (sign (nilledCopy.replace ('\'headers\': c', '\'headers\': this.f (c)') + '') .replace ('', ''))).not.toContain ('var c map[string]any = h');
        // a const copy that is tested against undefined keeps the nil answer
        expect (print (sign ('        const c = h;\n        if (c === undefined) {\n            return {};\n        }\n        return { \'headers\': c };\n'))).toContain ('var h any = nil');
    });
});

describe ('go nil-join header element writes after a fill', () => {
    const root = path.join (__dirname, 'files', 'tmp-h18g16b', 'ts', 'src');
    const print = (venue: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), 'export type Dict = {[key: string]: any};\nexport type NullableDict = Dict | undefined;\nexport class Exchange {\n    apiKey: string;\n    sign (path: any, api: any = \'public\', method = \'GET\', params = {}, headers: any = undefined, body: any = undefined): any { return {}; }\n}\n');
        fs.writeFileSync (path.join (root, 'venue.ts'), "import { Exchange } from './base/Exchange';\nimport type { Dict, NullableDict } from './base/Exchange';\nexport default class venue extends Exchange {\n" + venue + '}\n');
        const t: any = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
        installCcxtGoLocalTypes (t.goTranspiler);
        installCcxtGoIndexableTypes (t.goTranspiler);
        installCcxtGoParamTypes (t.goTranspiler);
        installCcxtGoDictParams (t.goTranspiler);
        installCcxtGoSignTyping (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'venue.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h18g16b'), { recursive: true, force: true }));
    const body = '    sign (path, api = \'public\', method = \'GET\', params = {}, headers = undefined, body = undefined) {\n        let h: NullableDict = undefined;\n        if (api === \'private\') {\n            h = {\n                \'KEY\': this.apiKey,\n            };\n            if (method === \'POST\') {\n                h[\'Content-Type\'] = \'application/json\';\n            }\n        }\n        let c: NullableDict = h;\n        if (path === \'x\') {\n            if (c === undefined) {\n                c = {};\n            }\n            c[\'P\'] = \'1\';\n        }\n        return { \'url\': path, \'headers\': c };\n    }\n';
    test ('a write after a literal fill or a nil-guard fill prints the native store', () => {
        const out = print (body);
        expect (out).toContain ('h["Content-Type"] = "application/json"');
        expect (out).toContain ('c["P"] = "1"');
    });
    test ('negatives keep the helper', () => {
        // the fill is not dominating: it sits in a sibling branch
        expect (print (body.replace ('            if (c === undefined) {\n                c = {};\n            }\n', '            if (c === undefined) {\n                return {};\n            }\n'))).toContain ('AddElementToObject(c, "P", "1")');
        // a write in a loop keeps the helper
        expect (print (body.replace ('            c[\'P\'] = \'1\';\n', '            for (let i = 0; i < 2; i++) {\n                c[\'P\'] = \'1\';\n            }\n'))).toContain ('AddElementToObject(c, "P", "1")');
    });
});
