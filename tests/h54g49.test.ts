// a `let x = undefined` local bound only by tuple handler map slots proves a handleParam* caller
import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks, installCcxtGoDictParams, installCcxtGoLocalTypes } from '../src/transpiler';

describe ('h54g49: a tuple-joined map local proves a handleParam* caller', () => {
    const root = path.join (__dirname, 'files', 'tmp-h54g49-' + process.pid, 'ts', 'src');
    const BASE = (extra: string) =>
        'type Dict = { [key: string]: any };\ntype Str = string | undefined;\ntype Bool = boolean | undefined;\n' +
        'export class Exchange {\n' +
        '    other: any = undefined;\n' +
        '    safeBool2 (d: any, k1: any, k2: any, def: any = undefined): Bool { return def; }\n' +
        '    safeString (d: any, k: any, def: any = undefined): Str { return def; }\n' +
        '    omit (d: any, ...k: any[]): any { return d; }\n' +
        '    handleParamString (params: object, paramName: string, defaultValue: Str = undefined): [Str, Dict] {\n' +
        '        const value = this.safeString (params, paramName, defaultValue);\n' +
        '        let paramsOmitted = params;\n' +
        '        if (value !== undefined) {\n' +
        '            paramsOmitted = this.omit (params, paramName);\n' +
        '        }\n' +
        '        return [ value, paramsOmitted ];\n' +
        '    }\n' +
        '    handleParamBool2 (params: object, paramName1: string, paramName2: string, defaultValue: Bool = undefined): [Bool, object] {\n' +
        '        const value = this.safeBool2 (params, paramName1, paramName2, defaultValue);\n' +
        '        let paramsOmitted = params;\n' +
        '        if (value !== undefined) {\n' +
        '            paramsOmitted = this.omit (params, [ paramName1, paramName2 ]);\n' +
        '        }\n' +
        '        return [ value, paramsOmitted ];\n' +
        '    }\n' +
        '    watch (params = {}) {\n' +
        '        let tag = undefined;\n' +
        '        let query = undefined;\n' +
        '        [ tag, query ] = this.handleParamString (params, \'tag\');\n' +
        '        let trigger = undefined;\n' +
        '        [ trigger, query ] = this.handleParamBool2 (query, \'trigger\', \'stop\', false);\n' +
        '        return [ tag, trigger, query ];\n' +
        '    }\n' +
        extra +
        '}\n';
    const print = (extra: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE (extra));
        const t: any = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        installCcxtGoLocalTypes (t.goTranspiler);
        installCcxtGoDictParams (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h54g49-' + process.pid), { recursive: true, force: true }));

    test ('positive: a local bound only by a handler map slot types handleParamBool2 (fails on the base printer)', () => {
        expect (print ('')).toContain ('HandleParamBool2(params map[string]any, paramName1 any');
    });
    test ('negative: the same local also written from an untyped field keeps the box', () => {
        const out = print ('    viaField (params = {}) {\n        let q = undefined;\n        [ q, q ] = this.handleParamString (params, \'a\');\n        q = this.other;\n        return this.handleParamBool2 (q, \'a\', \'b\');\n    }\n');
        expect (out).not.toContain ('HandleParamBool2(params map[string]any');
    });
    test ('negative: a nil local never written by a handler keeps the box', () => {
        const out = print ('    viaNil () {\n        const q = undefined;\n        return this.handleParamBool2 (q, \'a\', \'b\');\n    }\n');
        expect (out).not.toContain ('HandleParamBool2(params map[string]any');
    });
});
