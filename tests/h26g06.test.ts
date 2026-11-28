import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('go Dict / NullableDict venue parameter fed only by base map fields prints a map', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype NullableDict = Dict | undefined;\n'
        + 'class Exchange {\n'
        + '    markets: Dict = undefined;\n'
        + '    currencies: Dict = {};\n'
        + '    options: Dict = {};\n'
        + '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o[k] ?? d; }\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h26g06-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD + '}\nexport default Exchange;\n');
            fs.writeFileSync (file, 'type Dict = { [key: string]: any };\ntype NullableDict = Dict | undefined;\n'
                + 'import Exchange from \'./base/Exchange.js\';\nclass x extends Exchange {\n' + body + '}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            return new Transpiler (config).transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const callee = (decl: string, extra = '') => '    idx (input: ' + decl + '): NullableDict {\n'
        + '        if (input === undefined) {\n            return undefined;\n        }\n' + extra
        + '        const result: Dict = {};\n        result[\'n\'] = this.safeDict (input, \'k\', {});\n        return result;\n    }\n';
    const caller = (args: string[]) => '    load (other: any) {\n'
        + args.map ((a, i) => '        this.options[\'k' + i + '\'] = this.idx (' + a + ');\n').join ('') + '    }\n';

    test ('this.markets / this.currencies arguments type the parameter', () => {
        const out = print (caller ([ 'this.currencies', 'this.markets' ]) + callee ('NullableDict'));
        expect (out).toContain ('func (this *x) Idx(input map[string]any) any {');
        expect (out).toContain ('if input == nil {');
        expect (print (caller ([ 'this.currencies' ]) + callee ('Dict'))).toContain ('Idx(input map[string]any)');
    });

    test ('negatives keep the box', () => {
        // a caller passes an untyped value
        expect (print (caller ([ 'this.markets', 'other' ]) + callee ('NullableDict'))).toContain ('Idx(input any)');
        // the body writes another type into the parameter
        expect (print (caller ([ 'this.markets' ]) + callee ('any', '        input = 3;\n'))).toContain ('Idx(input any)');
        // a same-named local field of the venue is not the base map field
        expect (print ('    markets2: any = undefined;\n' + caller ([ 'this.markets2' ]) + callee ('NullableDict'))).toContain ('Idx(input any)');
    });
});
