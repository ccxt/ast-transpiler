import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const TYPES = 'type Str = string | undefined;\ntype Int = number | undefined;\ntype Dict = { [key: string]: any };\ntype Bool = boolean | undefined;\n';
const HEAD = 'class Exchange {\n'
    + '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n'
    + '    checkAddress (a: Str): Str { return a; }\n'
    + '    extend (a: Dict, b: Dict = {}): Dict { return a; }\n'
    + '    build (a: string): string { return a; }\n'
    + '    parseToInt (a: any): number { return a; }\n'
    + '    safeInteger (o: any, k: any): Int { return undefined; }\n'
    + '    safeBool (o: any, k: any, d: any = undefined): Bool { return d; }\n'
    + '    omit (o: Dict, k: any): Dict { return o; }\n'
    + '}\nexport default Exchange;\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h28g11-'));
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


const PAIR = (slot0: string) => '    handleHf (params: Dict = {}): [Bool, Dict] {\n'
    + '        let hf: boolean = false;\n'
    + '        const p = this.safeBool (params, \'hf\');\n'
    + '        if (p !== undefined) {\n'
    + '            hf = (p === true);\n'
    + '        }\n'
    + '        const rest: Dict = this.omit (params, \'hf\');\n'
    + '        return [ ' + slot0 + ', rest ];\n'
    + '    }\n';
const CALLER = '    f (params: Dict) {\n'
    + '        const [ hf, rest ] = this.handleHf (params);\n'
    + '        if (hf === true) {\n'
    + '            return rest;\n'
    + '        }\n'
    + '        return params;\n'
    + '    }\n'
    + '    g (params: Dict) {\n'
    + '        let hf: Bool = undefined;\n'
    + '        [ hf, params ] = this.handleHf (params);\n'
    + '        if (hf) {\n'
    + '            return params;\n'
    + '        }\n'
    + '        return {};\n'
    + '    }\n';

describe ('go venue [ Bool, Dict ] pairs with a never-nil bool slot print (bool, map[string]any)', () => {
    test ('bool local slot: typed pair, joined bool compares natively, rebind assigns the pair', () => {
        const out = print (PAIR ('hf') + CALLER);
        expect (out).toContain ('HandleHf(optionalArgs ...any) (bool, map[string]any) {');
        expect (out).toContain ('hf, rest := this.HandleHf(params)');
        expect (out).toContain ('hf == true');
        expect (out).toContain ('hf, params = this.HandleHf(params)');
        expect (out).not.toContain ('IsEqual(hf, true)');
        expect (out).not.toContain ('hfrestVariable');
    });
    test ('a nullable slot (safeBool result) keeps the []any return', () => {
        const out = print (PAIR ('p') + CALLER);
        expect (out).not.toContain ('(bool, map[string]any)');
    });
    test ('an undefined slot keeps the []any return', () => {
        const out = print (PAIR ('undefined') + CALLER);
        expect (out).not.toContain ('(bool, map[string]any)');
    });
});
