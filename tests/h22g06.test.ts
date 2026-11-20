import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD = 'class Exchange {\n'
    + '    omit (x: any, k: any): any { return x; }\n'
    + '    safeString (x: any, k: any): any { return x; }\n'
    + '    extend (...args: any[]): any { return args; }\n'
    + '    handleMarginModeAndParams (methodName: string, params: Dict = {}): [Str, Dict] { return [ undefined, params ]; }\n'
    + '}\nexport default Exchange;\n';
const TYPES = 'type Str = string | undefined;\ntype Bool = boolean | undefined;\ntype Dict = { [key: string]: any };\n';
const UTA = '    async handleUTAAndParams (params: Dict, methodName: Str, defaultValue: boolean = false): Promise<[Bool, Dict]> {\n'
    + '        return [ defaultValue, params ];\n'
    + '    }\n';

const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h22g06-'));
    try {
        fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
        const file = path.join (dir, 'ts', 'src', 'x.ts');
        fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), TYPES + HEAD);
        fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\n' + TYPES + 'export default class X extends Exchange {\n' + UTA + body + '\n}\n');
        const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
        const t = new Transpiler (config);
        installCcxtGoLocalTypes (t.goTranspiler);
        return t.transpileGoByPath (file).content;
    } finally {
        fs.rmSync (dir, { 'recursive': true, 'force': true });
    }
};

const SHAPE = (decl: string, extra = '') => '    async fetchFee (symbol: string, params: Dict = {}) {\n'
    + '        let uta: Bool = undefined;\n'
    + '        ' + decl + '\n'
    + '        [ uta, paramsUTA ] = await this.handleUTAAndParams (params, \'fetchFee\', false);\n'
    + extra
    + '        let marginMode: Str = undefined;\n'
    + '        [ marginMode, paramsUTA ] = this.handleMarginModeAndParams (\'fetchFee\', paramsUTA);\n'
    + '        paramsUTA = this.omit (paramsUTA, \'cost\');\n'
    + '        return this.safeString (paramsUTA, \'x\');\n'
    + '    }';

describe ('h22g06 nil-declared local first bound through an awaited Dict tuple slot', () => {
    test ('the local is a map and the awaited slot read is unboxed', () => {
        const out = print (SHAPE ('let paramsUTA = undefined;'));
        expect (out).toContain ('var paramsUTA map[string]any = nil\n');
        expect (out).toContain ('paramsUTA = MapTyped(GetValue(utaparamsUTAVariable, 1))\n');
    });
    test ('the Bool slot of the same tuple keeps the box', () => {
        const out = print ('    async f (params: Dict = {}) {\n'
            + '        let paramsUTA = undefined;\n'
            + '        let uta = undefined;\n'
            + '        [ uta, paramsUTA ] = await this.handleUTAAndParams (params, \'f\', false);\n'
            + '        return uta;\n'
            + '    }');
        expect (out).not.toContain ('var uta map[string]any');
    });
    test ('a non-map write keeps the box', () => {
        const out = print (SHAPE ('let paramsUTA: any = undefined;', '        paramsUTA = \'x\';\n'));
        expect (out).not.toContain ('var paramsUTA map[string]any');
    });
    test ('an element-written local keeps the box and its helper store', () => {
        const out = print (SHAPE ('let paramsUTA = undefined;', '        paramsUTA[\'k\'] = this.safeString (params, \'k\');\n'));
        expect (out).not.toContain ('MapTyped(GetValue(utaparamsUTAVariable');
    });
    test ('a local returned inside a tuple keeps the box', () => {
        const out = print ('    async f (params: Dict = {}) {\n'
            + '        let uta: Bool = undefined;\n'
            + '        let paramsUTA = undefined;\n'
            + '        [ uta, paramsUTA ] = await this.handleUTAAndParams (params, \'f\', false);\n'
            + '        return [ uta, paramsUTA ];\n'
            + '    }');
        expect (out).not.toContain ('MapTyped(GetValue(utaparamsUTAVariable');
    });
});
