import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go numberToString of a nil-guarded *int64 seeds a Go string accumulator', () => {
    const root = path.join (__dirname, 'files', 'tmp-h22g08', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export type Int = number | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '    numberToString (x: number): string;\n' +
        '    numberToString (x: any): Str;\n' +
        '    numberToString (x: any): Str {\n' +
        '        return (x === undefined) ? undefined : String (x);\n' +
        '    }\n' +
        '    safeString (o: any, k: string, d: Str = undefined): Str {\n' +
        '        return o[k];\n' +
        '    }\n' +
        '    guarded (timestamp: Int = undefined, side: Str = undefined): Str {\n' +
        '        if (timestamp !== undefined) {\n' +
        '            let tradeId: string = this.numberToString (timestamp);\n' +
        '            if (side !== undefined) {\n' +
        "                tradeId += '-' + side;\n" +
        '            }\n' +
        '            return tradeId;\n' +
        '        }\n' +
        '        return undefined;\n' +
        '    }\n' +
        '    unguarded (timestamp: Int = undefined, side: Str = undefined): Str {\n' +
        '        let loose: Str = this.numberToString (timestamp);\n' +
        "        loose += '-' + side;\n" +
        '        return loose;\n' +
        '    }\n' +
        '    boxedWrite (timestamp: Int = undefined, o: any = undefined): Str {\n' +
        '        if (timestamp !== undefined) {\n' +
        '            let mixed: Str = this.numberToString (timestamp);\n' +
        "            mixed = this.safeString (o, 'id');\n" +
        "            mixed += '-x';\n" +
        '            return mixed;\n' +
        '        }\n' +
        '        return undefined;\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        out = t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h22g08'), { recursive: true, force: true }));

    test ('positive: the guarded pointer formats non-nil, the accumulator is a Go string', () => {
        expect (out).toMatch (/var tradeId string = \*this\.NumberToString\(timestamp\)/);
        expect (out).toMatch (/tradeId \+= "-" ?\+ ?\*side/);
        expect (out).not.toMatch (/tradeId = Add\(/);
    });

    test ('negative: an unguarded pointer can format to nil, the box stays', () => {
        expect (out).not.toMatch (/var loose string/);
        expect (out).toMatch (/loose = Add\(loose, /);
    });

    test ('negative: a later *string write keeps the box', () => {
        expect (out).not.toMatch (/var mixed string/);
        expect (out).toMatch (/mixed = Add\(mixed, /);
    });
});
