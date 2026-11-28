import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD = 'class Exchange {\n'
    + '    handleMarketTypeAndParams (methodName: string, market: any = undefined, params: Dict = {}, defaultValue: Str = undefined): [ Str, Dict ] { return [ undefined, params ]; }\n'
    + '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n'
    + '    safeBool (o: any, k: any, d: any = undefined): any { return d; }\n'
    + '    request (h: any): any { return h; }\n'
    + '}\nexport default Exchange;\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h19g08-'));
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


const fn = (assign: string, seed = 'let type: Str = undefined;'): string => '    f (market: any = undefined, params: Dict = {}) {\n'
    + '        ' + seed + '\n'
    + '        const marketType = this.safeString (market, \'type\');\n'
    + '        ' + assign + '\n'
    + '        const swap = (type === \'swap\');\n'
    + '        return this.request ({ \'type\': type, \'swap\': swap });\n'
    + '    }\n';

const pair = (assign: string): string => fn (assign).replace ('const marketType = this.safeString (market, \'type\');', 'const [ marketType, p ] = this.handleMarketTypeAndParams (\'f\', market, params);');

describe ('h19-g08: statement ternary with a *string arm into a nil-seeded box', () => {
    test ('string arm then *string arm prints if/else with a guarded deref', () => {
        const out = print (fn ('type = (marketType === \'spot\') ? \'future\' : marketType;'));
        expect (out).toContain ('if derefPtr := marketType; derefPtr != nil {');
        expect (out).toContain ('typeVar = "future"');
        expect (out).toContain ('typeVar = *derefPtr');
        expect (out).toContain ('typeVar = nil');
        expect (out).not.toMatch (/typeVar = func\(\)/);
    });
    test ('*string arm first keeps the branch order', () => {
        const out = print (fn ('type = (marketType !== undefined) ? marketType : \'swap\';'));
        expect (out).toMatch (/if marketType != nil \{\n\s*if derefPtr := marketType; derefPtr != nil \{/);
        expect (out).toMatch (/\} else \{\n\s*typeVar = "swap"\n/);
    });
    test ('a value-seeded box keeps the literal', () => {
        const out = print (fn ('type = (marketType === \'spot\') ? \'future\' : marketType;', 'let type: any = this.safeBool (market, \'x\');'));
        expect (out).not.toContain ('derefPtr := marketType');
    });
    test ('a non-identifier *string arm keeps the literal', () => {
        const out = print (fn ('type = (marketType === \'spot\') ? \'future\' : this.safeString (market, \'t\');'));
        expect (out).not.toContain ('typeVar = *derefPtr');
    });
    test ('slot 0 of a joined *string pair binding', () => {
        const out = print (pair ('type = (marketType === \'spot\') ? \'future\' : marketType;'));
        expect (out).toContain ('marketType, p := this.HandleMarketTypeAndParams(');
        expect (out).toContain ('if derefPtr := marketType; derefPtr != nil {');
        expect (out).not.toMatch (/typeVar = func\(\)/);
    });
});
