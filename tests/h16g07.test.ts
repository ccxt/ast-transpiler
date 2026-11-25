import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('go *string concat after a nil guard', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\n'
        + 'class Exchange {\n    id: string = \'\';\n'
        + '    handleMarketTypeAndParams (m: string, market: any = undefined, params: Dict = {}): [ Str, Dict ] { return [ undefined, params ]; }\n'
        + '    sub (h: string, t: string, p: Dict) { return h; }\n'
        + '    note (h: any) { return h; }\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h16g07-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'pro'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'pro', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD + '}\nexport default Exchange;\n');
            fs.writeFileSync (file, 'import Exchange from \'../base/Exchange.js\';\nclass x extends Exchange {\n' + body + '}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'stringPointerTupleCalls': [ 'handleMarketTypeAndParams' ] } };
            return new Transpiler (config).transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const fn = (decl: string, between: string, use: string) => '    async watchBalance (params: Dict = {}) {\n'
        + '        ' + decl + ' [ type, rest ] = this.handleMarketTypeAndParams (\'watchBalance\', undefined, params);\n'
        + between + use + '        return rest;\n    }\n';
    const THROW = '        if (type === undefined) {\n            throw new Error (this.id + \' requires\');\n        }\n';
    test ('an exiting undefined guard makes the tuple slot concat native', () => {
        const out = print (fn ('const', THROW, '        this.sub (type + \':balance\', \'a\', rest);\n'));
        expect (out).toContain ('this.Sub(*typeVar+":balance", "a", rest)');
        expect (out).not.toContain ('Add(typeVar');
    });
    test ('an enclosing defined check makes the tuple slot concat native', () => {
        const out = print (fn ('const', '', '        if (type !== undefined) {\n            this.note (\'a:\' + type);\n        }\n'));
        expect (out).toContain ('this.Note("a:" + *typeVar)');
    });
    test ('negatives keep the helper', () => {
        // no guard: Add answers nil for a nil operand
        expect (print (fn ('const', '', '        this.note (type + \':b\');\n'))).toContain ('Add(typeVar, ":b")');
        // a rebindable local may be written something else after the guard
        expect (print (fn ('let', THROW, '        type = this.note (params);\n        this.note (type + \':b\');\n'))).toContain ('Add(typeVar, ":b")');
        // a guard that does not exit leaves the value nilable for the consumer
        expect (print (fn ('const', '        if (type === undefined) {\n            this.note (\'x\');\n        }\n', '        this.note (type + \':b\');\n'))).toContain ('Add(typeVar, ":b")');
        // the else branch of a defined check
        expect (print (fn ('const', '', '        if (type !== undefined) {\n            this.note (1);\n        } else {\n            this.note (type + \':b\');\n        }\n'))).toContain ('Add(typeVar, ":b")');
    });
});
