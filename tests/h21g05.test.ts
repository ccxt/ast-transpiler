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
    + '    handleOptionBoolAndParams (params: Dict, m: string, o: string, d: boolean = false): [ boolean, Dict ] { return [ d, params ]; }\n'
    + '    convertTypeToAccount (account: string): string { return account; }\n'
    + '    conv2 (t: string): string { return t; }\n'
    + '}\nexport default Exchange;\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h21g05-'));
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



const fn = (decl: string, tail = ''): string => '    f (market: any = undefined, params: Dict = {}) {\n'
    + '        const [ marketType, pm ] = this.handleMarketTypeAndParams (\'e\', market, params);\n'
    + '        let accountParsed: Str = undefined;\n'
    + '        if (marketType !== undefined) {\n'
    + '            accountParsed = this.convertTypeToAccount (marketType);\n'
    + '        }\n'
    + '        const [ uu, pp ] = this.handleOptionBoolAndParams (params, \'e\', \'u\', false);\n'
    + '        ' + decl + '\n'
    + '        if (account === \'spot\') { return undefined; }\n'
    + tail
    + '        return this.request ({ \'account\': account });\n'
    + '    }\n';

describe ('h21-g05: Str local declared from a string literal / nil-seeded Str ternary', () => {
    test ('nil-seeded Str arm becomes *string and the declaration takes the guarded deref', () => {
        const out = print (fn ('const account: Str = uu ? \'unified\' : accountParsed;'));
        expect (out).toMatch (/var accountParsed \*string = nil\n/);
        expect (out).toMatch (/var account any\n\s*if uu \{\n\s*account = "unified"\n\s*\} else if derefPtr := accountParsed; derefPtr != nil \{\n\s*account = \*derefPtr\n\s*\}/);
        expect (out).not.toMatch (/var account any = func\(\)/);
        expect (out).toMatch (/"account": account,/);
    });
    test ('mirrored arms keep the branch order', () => {
        const out = print (fn ('const account = uu ? accountParsed : \'spot\';'));
        expect (out).toMatch (/var account any\n\s*if uu \{\n\s*if derefPtr := accountParsed; derefPtr != nil \{\n\s*account = \*derefPtr\n\s*\}\n\s*\} else \{\n\s*account = "spot"\n/);
    });
    test ('a non-literal other arm keeps the box', () => {
        const out = print (fn ('const account: Str = uu ? marketType : accountParsed;'));
        expect (out).toMatch (/var accountParsed any = nil\n/);
    });
    test ('an any-annotated declaration keeps the box', () => {
        const out = print (fn ('const account: any = uu ? \'unified\' : accountParsed;'));
        expect (out).toMatch (/var accountParsed any = nil\n/);
    });
    test ('the arm local also stored into a map keeps the box (typed nil is not an absent value)', () => {
        const out = print (fn ('const account: Str = uu ? \'unified\' : accountParsed;', '        const r = { \'p\': accountParsed };\n'));
        expect (out).toMatch (/var accountParsed any = nil\n/);
    });
});
