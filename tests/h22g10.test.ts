import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go int local advanced by an integer constant keeps its int type', () => {
    const root = path.join (__dirname, 'files', 'tmp-h22g10', 'ts', 'src');
    const BASE =
        'export type int = number;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '    sum (...args: any[]): any { return 0; }\n' +
        '}\n';
    const VENUE =
        "import { Exchange } from './base/Exchange.js';\n" +
        "import type { int } from './base/Exchange.js';\n" +
        'export default class v extends Exchange {\n' +
        '    idx (a: boolean, b: boolean, responses: any[]) {\n' +
        '        let crossIndex: int = 0;\n' +
        '        let isolatedIndex: int = 0;\n' +
        '        let nextIndex: int = 0;\n' +
        '        if (a) {\n' +
        '            nextIndex = 1;\n' +
        '        }\n' +
        '        if (b) {\n' +
        '            crossIndex = nextIndex;\n' +
        '            nextIndex = nextIndex + 2;\n' +
        '            isolatedIndex = crossIndex + 1;\n' +
        '        }\n' +
        '        return [ responses[crossIndex], responses[isolatedIndex], responses[nextIndex] ];\n' +
        '    }\n' +
        '    anyStep (a: boolean, step: any) {\n' +
        '        let anyIdx: int = 0;\n' +
        '        if (a) {\n' +
        '            anyIdx = anyIdx + step;\n' +
        '        }\n' +
        '        return anyIdx;\n' +
        '    }\n' +
        '    floatStep (a: boolean) {\n' +
        '        let fIdx: int = 0;\n' +
        '        if (a) {\n' +
        '            fIdx = fIdx + 1.5;\n' +
        '        }\n' +
        '        return fIdx;\n' +
        '    }\n' +
        '    nilWrite (a: boolean, b: boolean) {\n' +
        '        let nIdx: int = 0;\n' +
        '        if (a) {\n' +
        '            nIdx = nIdx + 1;\n' +
        '        }\n' +
        '        if (b) {\n' +
        '            nIdx = undefined;\n' +
        '        }\n' +
        '        if (nIdx === undefined) {\n' +
        '            return 0;\n' +
        '        }\n' +
        '        return nIdx;\n' +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h22g10'), { recursive: true, force: true }));
    test ('positive: x = x + N keeps the int local and prints native', () => {
        expect (out).toMatch (/var nextIndex int = 0/);
        expect (out).toMatch (/var crossIndex int = 0/);
        expect (out).toMatch (/var isolatedIndex int = 0/);
        expect (out).toMatch (/nextIndex = nextIndex \+ 2/);
        expect (out).toMatch (/isolatedIndex = crossIndex \+ 1/);
        expect (out).not.toMatch (/Add\(nextIndex, 2\)/);
    });
    test ('negative: a non-constant step keeps the box and Add', () => {
        expect (out).toMatch (/var anyIdx any = 0/);
        expect (out).toMatch (/anyIdx = Add\(anyIdx, step\)/);
    });
    test ('negative: a float constant step keeps the box', () => {
        expect (out).toMatch (/var fIdx any = 0/);
    });
    test ('negative: a nil write with a nil test keeps the box and the nil answer', () => {
        expect (out).toMatch (/var nIdx any = 0/);
        expect (out).toMatch (/IsEqual\(nIdx, nil\)|nIdx == nil/);
    });
});
