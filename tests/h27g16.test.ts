import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const TYPES = 'type Str = string | undefined;\ntype Int = number | undefined;\ntype Dict = { [key: string]: any };\n';
const HEAD = 'class Exchange {\n'
    + '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n'
    + '    checkAddress (a: Str): Str { return a; }\n'
    + '    extend (a: Dict, b: Dict = {}): Dict { return a; }\n'
    + '    build (a: string): string { return a; }\n'
    + '    parseToInt (a: any): number { return a; }\n'
    + '    safeInteger (o: any, k: any): Int { return undefined; }\n'
    + '}\nexport default Exchange;\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h27g16-'));
    try {
        fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
        const file = path.join (dir, 'ts', 'src', 'x.ts');
        fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), TYPES + HEAD);
        fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\n' + TYPES + 'export default class X extends Exchange {\n' + body + '\n}\n');
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


const PAIR = (slot: string) => '    handleSub (methodName: string, params: Dict): [Int, Dict] {\n'
    + '        const raw = this.safeInteger (params, \'id\');\n'
    + '        if (raw !== undefined) {\n'
    + '            ' + slot + '\n'
    + '            return [ subId, this.extend (params) ];\n'
    + '        }\n'
    + '        return [ this.parseToInt (raw), this.extend (params) ];\n'
    + '    }\n';
const CALLER = '    f (params: Dict) {\n'
    + '        const [ subId, rest ] = this.handleSub (\'f\', params);\n'
    + '        return { \'id\': subId, \'rest\': rest };\n'
    + '    }\n';

describe ('go venue [ Int, Dict ] pairs whose slot 0 is parseToInt print (int64, map[string]any)', () => {
    test ('const local seeded by parseToInt: typed pair, destructuring binds two locals', () => {
        const out = print (PAIR ('const subId = this.parseToInt (raw);') + CALLER);
        expect (out).toContain ('HandleSub(methodName string, params any) (int64, map[string]any) {');
        expect (out).toContain ('subId, rest := this.HandleSub("f", params)');
        expect (out).not.toContain ('subIdrestVariable[0]');
    });
    test ('a let local (may be rewritten) keeps the []any return', () => {
        const out = print (PAIR ('let subId = this.parseToInt (raw); subId = raw;') + CALLER);
        expect (out).not.toContain ('(int64, map[string]any)');
    });
    test ('a nullable slot (safeInteger result) keeps the []any return', () => {
        const out = print (PAIR ('const subId = this.safeInteger (params, \'x\');') + CALLER);
        expect (out).not.toContain ('(int64, map[string]any)');
    });
});
