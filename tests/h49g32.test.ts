import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD = 'class Exchange {\n'
    + '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n'
    + '    parseToInt (a: any): int { return 0; }\n'
    + '    extend (a: any, b: any = {}): any { return a; }\n'
    + '    sort (a: any): any { return a; }\n'
    + '}\nexport default Exchange;\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (process.env.TMPDIR ?? os.tmpdir (), 'h49g32-'));
    try {
        fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
        const file = path.join (dir, 'ts', 'src', 'x.ts');
        const types = 'type Str = string | undefined;\ntype Strings = string[] | undefined;\ntype int = number;\ntype Dict = { [key: string]: any };\n';
        fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), types + HEAD);
        fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\n' + types + 'export default class X extends Exchange {\n' + body + '\n}\n');
        const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
        const cwd = process.cwd ();
        process.chdir (dir);
        try {
            const t = new Transpiler (config);
            installCcxtGoLocalTypes (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            process.chdir (cwd);
        }
    } finally {
        fs.rmSync (dir, { 'recursive': true, 'force': true });
    }
};
const method = (append: string) => [
    '    paramsToString (object: any, level: number): string {',
    '        const depth: int = this.parseToInt (level);',
    '        if ((depth >= 3) || (typeof object === \'string\')) {',
    '            return object.toString ();',
    '        }',
    '        let returnString: string = \'\';',
    '        const keys = Object.keys (object);',
    '        for (let i = 0; i < keys.length; i++) {',
    '            const key: string = this.safeString (keys, i, \'\');',
    '            returnString += key;',
    '            const value = object[key];',
    '            if (Array.isArray (value)) {',
    '                for (let j = 0; j < value.length; j++) {',
    '                    returnString += ' + append + ';',
    '                }',
    '            } else {',
    '                returnString += value.toString ();',
    '            }',
    '        }',
    '        return returnString;',
    '    }',
].join ('\n');
describe ('h49g32 self-recursive string append', () => {
    test ('a declared string method appending its own call prints string and +=', () => {
        const out = print (method ('this.paramsToString (value[j], depth + 1)'));
        expect (out).toMatch (/func \(this \*X\) ParamsToString\(object any, level int64\) string \{/);
        expect (out).toContain ('var returnString string = ""');
        expect (out).toContain ('returnString += this.ParamsToString(GetValue(value, j), depth+1)');
        expect (out).toContain ('returnString += key');
        expect (out).not.toContain ('Add(returnString');
    });
    test ('a path that can answer nil keeps the box and the helper', () => {
        const body = method ('this.paramsToString (value[j], depth + 1)')
            .replace ('            return object.toString ();', '            return this.safeString (object, \'k\');');
        const out = print (body);
        expect (out).toMatch (/func \(this \*X\) ParamsToString\(object any, level int64\) any \{/);
        expect (out).toContain ('var returnString any = ""');
        expect (out).toContain ('returnString = Add(returnString, this.ParamsToString(');
    });
    test ('a Str-declared method keeps the helper', () => {
        const body = method ('this.paramsToString (value[j], depth + 1)').replace ('level: number): string {', 'level: number): Str {');
        const out = print (body);
        expect (out).toContain ('Add(returnString, this.ParamsToString(');
    });
    test ('a call to another untyped method keeps the helper', () => {
        const out = print (method ('this.other (value[j])') + '\n    other (x: any) {\n        return x;\n    }');
        expect (out).toContain ('returnString = Add(returnString, this.Other(');
    });
});
