import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes, installCcxtGoHooks } from '../src/transpiler';

const TYPES = 'type Str = string | undefined;\ntype Dict = { [key: string]: any };\n';
const HEAD = 'class Exchange {\n'
    + '    handleOptionAndParams (params: object, methodName: string, optionName: string, defaultValue = undefined) { return [ defaultValue, params ]; }\n'
    + '    omit (a: any, k: any): any { return a; }\n'
    + '}\nexport default Exchange;\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h28a20-'));
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
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            process.chdir (cwd);
        }
    } finally {
        fs.rmSync (dir, { 'recursive': true, 'force': true });
    }
};

const PAIR = (init: string, use: string) => '    async f (params: Dict = {}) {\n'
    + '        let paginate = false;\n'
    + '        let paramsOmitted' + init + ';\n'
    + '        [ paginate, paramsOmitted ] = this.handleOptionAndParams (paramsOmitted, \'f\', \'paginate\');\n'
    + use
    + '        if (paginate) { return paramsOmitted; }\n'
    + '        return this.omit (paramsOmitted, \'a\');\n'
    + '    }\n';

describe ('h28 A20: TupleSlice params slot is a map[string]any', () => {
    test ('positive: slot 1 of a TupleSlice holder reads by index plus the map assertion, no MapTyped', () => {
        const out = print (PAIR (': Dict = params', ''));
        expect (out).toContain ('TupleSlice(this.HandleOptionAndParams(');
        expect (out).toContain ('paramsOmitted = paginateparamsOmittedVariable[1].(map[string]any)');
        expect (out).not.toContain ('MapTyped(');
    });
    test ('negative: slot 0 (the option value) keeps its own read', () => {
        const out = print (PAIR (': Dict = params', ''));
        expect (out).not.toContain ('paginateparamsOmittedVariable[0].(map[string]any)');
    });
    test ('negative: an untyped local (written with a non-map elsewhere, nil-tested) is not given the assertion', () => {
        const out = print (PAIR (' = undefined', '        if (paramsOmitted === undefined) { paramsOmitted = 1; }\n'));
        expect (out).not.toContain ('paginateparamsOmittedVariable[1].(map[string]any)');
    });
});
