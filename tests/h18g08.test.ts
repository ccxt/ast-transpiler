import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD = 'class Exchange {\n'
    + '    handleMarketTypeAndParams (methodName: string, market: any = undefined, params: Dict = {}, defaultValue: Str = undefined): [ string, Dict ] { return [ \'spot\', params ]; }\n'
    + '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n'
    + '    safeBool (o: any, k: any, d: any = undefined): any { return d; }\n'
    + '    request (h: any): any { return h; }\n'
    + '}\nexport default Exchange;\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h18g08-'));
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

const BIN = '    resolveAuthType (methodName: string, market: any = undefined, params: Dict = {}): [string, Str, Dict] {\n'
    + '        const [ t, p ] = this.handleMarketTypeAndParams (methodName, market, params);\n'
    + '        return [ t, undefined, p ];\n'
    + '    }\n'
    + '    f (market: any = undefined, params: Dict = {}) {\n'
    + '        let type: Str = undefined;\n'
    + '        let subType: Str = undefined;\n'
    + '        let paramsAuth = undefined;\n'
    + '        [ type, subType, paramsAuth ] = this.resolveAuthType (\'watchPositions\', market, params);\n'
    + '        if (type === \'spot\' || type === \'margin\') {\n'
    + '            type = (subType === \'inverse\') ? \'inverse\' : \'linear\';\n'
    + '        }\n'
    + '        const o: Dict = {};\n'
    + '        o[\'type\'] = type;\n'
    + '        return this.request (type + \':x\');\n'
    + '    }';
const variant = (from: string, to: string): string => {
    expect (BIN).toContain (from);
    return BIN.replace (from, to);
};
const TERNARY = "            type = (subType === \'inverse\') ? \'inverse\' : \'linear\';\n";

describe ('go statement ternary into a nil-seeded string box', () => {
    test ('string arms print an if/else, so the box holds only plain strings', () => {
        const out = print (BIN);
        expect (out).toContain ('var typeVar any = nil');
        expect (out).toContain ('\t\tif subType == "inverse" {\n\t\t\ttypeVar = "inverse"\n\t\t} else {\n\t\t\ttypeVar = "linear"\n\t\t}');
        expect (out).not.toContain ('typeVar = func() string {');
    });
    test ('an arm that is not a string keeps the literal', () => {
        const out = print (variant (TERNARY, "            type = (subType === \'inverse\') ? \'inverse\' : this.request (1);\n"));
        expect (out).not.toContain ('\t\t\ttypeVar = "inverse"\n\t\t} else {');
    });
    test ('a nil arm (a nil the box would be compared with) keeps the literal', () => {
        const out = print (variant (TERNARY, "            type = (subType === \'inverse\') ? \'inverse\' : undefined;\n"));
        expect (out).not.toContain ('\t\t\ttypeVar = "inverse"\n\t\t} else {');
    });
    test ('a local seeded with a value, not nil, keeps the literal', () => {
        const out = print (variant ('        let type: Str = undefined;\n', '        let type: any = this.request (0);\n'));
        expect (out).not.toContain ('\t\t\ttypeVar = "inverse"\n\t\t} else {');
    });
});
