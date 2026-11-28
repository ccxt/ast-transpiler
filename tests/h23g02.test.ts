import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const TYPES = 'type Str = string | undefined;\ntype Dict = { [key: string]: any };\n';
const HEAD = 'class Exchange {\n'
    + '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n'
    + '    checkAddress (a: Str): Str { return a; }\n'
    + '}\nexport default Exchange;\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h23g02-'));
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

const PAIR = '    parseAddress (addressString: Str): [Str, Str] {\n'
    + '        if (addressString !== undefined) {\n'
    + '            const tag = this.safeString ({}, \'tag\');\n'
    + '            return [ addressString, tag ];\n'
    + '        }\n'
    + '        return [ addressString, undefined ];\n'
    + '    }\n';
const CALLER = '    f (value: Dict) {\n'
    + '        const [ address, tag ] = this.parseAddress (this.safeString (value, \'address\'));\n'
    + '        this.checkAddress (address);\n'
    + '        return { \'address\': address, \'tag\': tag };\n'
    + '    }\n';

describe ('go venue [ Str, Str ] methods print two typed results', () => {
    test ('the method returns (*string, *string) and the caller binds both', () => {
        const out = print (PAIR + CALLER);
        expect (out).toContain ('ParseAddress(addressString *string) (*string, *string) {');
        expect (out).toContain ('return addressString, tag\n');
        expect (out).toContain ('return addressString, nil\n');
        expect (out).toContain ('address, tag := this.ParseAddress(this.SafeString(value, "address"))');
        expect (out).not.toContain ('SafeStringPtr(');
    });
    test ('a caller that keeps the tuple leaves the []any return', () => {
        const out = print (PAIR + CALLER + '    g () {\n        const h = this.parseAddress (\'x\');\n        return h;\n    }\n');
        expect (out).not.toContain ('(*string, *string)');
        expect (out).not.toContain ('address, tag := this.ParseAddress(');
    });
    test ('a destructuring into existing let locals leaves the []any return', () => {
        const out = print (PAIR + CALLER + '    g () {\n        let a: Str = undefined;\n        let b: Str = undefined;\n        [ a, b ] = this.parseAddress (\'x\');\n        return a;\n    }\n');
        expect (out).not.toContain ('(*string, *string)');
    });
    test ('a method named by string (dynamic dispatch) leaves the []any return', () => {
        const out = print (PAIR + CALLER + '    g () {\n        return \'parseAddress\';\n    }\n');
        expect (out).not.toContain ('(*string, *string)');
    });
    test ('a return that is not a pair literal leaves the []any return', () => {
        const out = print (PAIR.replace ('return [ addressString, undefined ];', 'return this.parseAddress (\'y\') as any;') + CALLER);
        expect (out).not.toContain ('(*string, *string)');
    });
});
