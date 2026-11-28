import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD = 'class Exchange {\n'
    + '    handleMarketTypeAndParams (methodName: string, market: any = undefined, params: Dict = {}, defaultValue: Str = undefined): [ Str, Dict ] { return [ undefined, params ]; }\n'
    + '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n'
    + '    safeBool (o: any, k: any, d: any = undefined): any { return d; }\n'
    + '    request (h: any): any { return h; }\n'
    + '    conv (t: Str): Str { return t; }\n'
    + '}\nexport default Exchange;\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h20g03-'));
    try {
        fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
        const file = path.join (dir, 'ts', 'src', 'x.ts');
        const types = 'type Str = string | undefined;\ntype Dict = { [key: string]: any };\n';
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



const fn = (decl: string): string => '    f (market: any = undefined, params: Dict = {}) {\n'
    + '        const marketType = this.safeString (market, \'type\');\n'
    + '        ' + decl + '\n'
    + '        if (type !== \'MARGIN\') { return undefined; }\n'
    + '        return this.request ({ \'type\': type });\n'
    + '    }\n';

describe ('h20-g03: local declared from a ternary with string / *string arms', () => {
    test ('string arm then *string call arm: if/else with the call bound in its own clause', () => {
        const out = print (fn ('const type = this.safeBool (market, \'spot\') ? \'MARGIN\' : this.safeString (market, \'t\');'));
        expect (out).toMatch (/var typeVar any\n\s*if .+ \{\n\s*typeVar = "MARGIN"\n\s*\} else if derefPtr := this\.SafeString\(market, "t"\); derefPtr != nil \{\n\s*typeVar = \*derefPtr\n\s*\}/);
        expect (out).not.toMatch (/var typeVar any = func\(\)/);
    });
    test ('*string identifier arm first keeps the branch order', () => {
        const out = print (fn ('const type = this.safeBool (market, \'spot\') ? marketType : \'swap\';'));
        expect (out).toMatch (/var typeVar any\n\s*if .+ \{\n\s*if derefPtr := marketType; derefPtr != nil \{\n\s*typeVar = \*derefPtr\n\s*\}\n\s*\} else \{\n\s*typeVar = "swap"\n/);
    });
    test ('a non-string arm keeps the literal', () => {
        const out = print (fn ('const type = this.safeBool (market, \'spot\') ? 1 : this.safeString (market, \'t\');'));
        expect (out).not.toContain ('derefPtr :=');
    });
    test ('a nil arm (both sides nilable) keeps the literal', () => {
        const out = print (fn ('const type = this.safeBool (market, \'spot\') ? undefined : this.safeString (market, \'t\');'));
        expect (out).not.toContain ('typeVar = *derefPtr');
    });
    test ('an annotated any local keeps the literal', () => {
        const out = print (fn ('const type: any = this.safeBool (market, \'spot\') ? \'MARGIN\' : this.safeString (market, \'t\');'));
        expect (out).not.toContain ('typeVar = *derefPtr');
    });
});
