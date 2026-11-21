import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// an omit-of-a-map local whose later writes are base `extend` / `deepExtend` results stays `map[string]any`;
// a write from a boxed producer or a venue method keeps the box.
describe ('go omit local rebound from base extend / deepExtend', () => {
    const root = path.join (__dirname, 'files', 'tmp-h27g07', 'ts', 'src');
    const SRC =
        'type Dict = { [key: string]: any };\n' +
        'class Exchange {\n' +
        '    extend (...args: any[]): Dict { return args[0]; }\n' +
        '    deepExtend (...args: any[]): Dict { return args[0]; }\n' +
        '    omit (o: any, ...k: any[]): any { return o; }\n' +
        '    safeValue (o: any, k: any, d: any = undefined): any { return o[k]; }\n' +
        '    safeString (o: any, k: any, d: string = undefined): string { return o[k]; }\n' +
        '    request (p: Dict): any { return p; }\n' +
        '}\n' +
        'class venue extends Exchange {\n' +
        '    viaExtend (status: string, params = {}) {\n' +
        '        let postParams: Dict = this.omit (params, [ \'query\' ]);\n' +
        '        if (status === \'OPEN\') {\n' +
        '            postParams = this.extend (postParams, { \'status\': \'active\' });\n' +
        '        } else if (status === \'X\') {\n' +
        '            postParams = this.deepExtend (postParams, { \'status\': \'closed\' });\n' +
        '        }\n' +
        '        return this.request (postParams);\n' +
        '    }\n' +
        '    viaBox (response: any, params = {}) {\n' +
        '        let boxed: Dict = this.omit (params, [ \'query\' ]);\n' +
        '        boxed = this.extend (boxed, { \'a\': 1 });\n' +
        '        boxed = this.safeValue (response, \'p\');\n' +
        '        return this.request (boxed);\n' +
        '    }\n' +
        '    viaOther (params = {}) {\n' +
        '        let other: Dict = this.omit (params, [ \'query\' ]);\n' +
        '        other = this.mine (other);\n' +
        '        if (other === undefined) {\n' +
        '            return undefined;\n' +
        '        }\n' +
        '        return this.request (other);\n' +
        '    }\n' +
        '    mine (p: any): any { return undefined; }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (root, { recursive: true });
        const file = path.join (root, 'venue.ts');
        fs.writeFileSync (file, SRC);
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoLocalTypes (t.goTranspiler);
        out = t.transpileGoByPath (file).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h27g07'), { recursive: true, force: true }));

    test ('positive: extend / deepExtend rebinds keep the map type', () => {
        expect (out).toMatch (/var postParams map\[string\]any = /);
        expect (out).toMatch (/postParams = this\.Extend\(postParams, /);
        expect (out).not.toMatch (/var postParams any = /);
    });

    test ('negative: a write from a boxed safeValue keeps the box', () => {
        expect (out).toMatch (/var boxed any = /);
    });

    test ('negative: a venue method write with a nil test keeps the box', () => {
        expect (out).toMatch (/var other any = /);
    });
});
