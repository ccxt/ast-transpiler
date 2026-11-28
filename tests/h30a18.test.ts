// h30a18 // the base tuple param handlers take map[string]any when every caller passes a map, slot 1 of a base pair
// twin destructuring, or a GetArgMap-bound `params = {}` parameter
import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks, installCcxtGoDictParams, installCcxtGoLocalTypes } from '../src/transpiler';

describe ('h30a18: handleParam* / handleNetworkCodeAndParams caller proofs', () => {
    const root = path.join (__dirname, 'files', 'tmp-h30a18-' + process.pid, 'ts', 'src');
    const BASE = (extra: string) =>
        'type Dict = { [key: string]: any };\ntype Str = string | undefined;\n' +
        'export class Exchange {\n' +
        '    other: any = undefined;\n' +
        '    safeString (d: any, k: any, def: any = undefined): Str { return def; }\n' +
        '    safeString2 (d: any, k1: any, k2: any, def: any = undefined): Str { return def; }\n' +
        '    omit (d: any, ...k: any[]): any { return d; }\n' +
        '    handleParamString (params: object, paramName: string, defaultValue: Str = undefined): [Str, Dict] {\n' +
        '        const value = this.safeString (params, paramName, defaultValue);\n' +
        '        let paramsOmitted = params;\n' +
        '        if (value !== undefined) {\n' +
        '            paramsOmitted = this.omit (params, paramName);\n' +
        '        }\n' +
        '        return [ value, paramsOmitted ];\n' +
        '    }\n' +
        '    handleNetworkCodeAndParams (params: Dict): [Str, Dict] {\n' +
        '        const networkCodeInParams = this.safeString2 (params, \'networkCode\', \'network\');\n' +
        '        let paramsOmitted = undefined;\n' +
        '        if (networkCodeInParams !== undefined) {\n' +
        '            paramsOmitted = this.omit (params, [ \'networkCode\', \'network\' ]);\n' +
        '        } else {\n' +
        '            paramsOmitted = params;\n' +
        '        }\n' +
        '        return [ networkCodeInParams, paramsOmitted ];\n' +
        '    }\n' +
        '    withdraw (code: string, params = {}) {\n' +
        '        const [ tag, paramsTag ] = this.handleParamString (params, \'tag\');\n' +
        '        const [ networkCode, query ] = this.handleNetworkCodeAndParams (paramsTag);\n' +
        '        return [ tag, networkCode, query ];\n' +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h30a18-' + process.pid), { recursive: true, force: true }));

    test ('positive: a GetArgMap params and a pair slot 1 caller type both handlers (fails on the base printer)', () => {
        const out = print ('');
        expect (out).toContain ('HandleParamString(params map[string]any, paramName any');
        expect (out).toContain ('HandleNetworkCodeAndParams(params map[string]any)');
    });
    test ('negative: a caller passing an untyped field keeps the box', () => {
        const out = print ('    viaField () {\n        return this.handleParamString (this.other, \'x\');\n    }\n');
        expect (out).not.toContain ('HandleParamString(params map[string]any');
    });
    test ('negative: a reassigned params parameter is not proven by its GetArgMap binding', () => {
        const out = print ('    rebound (params = {}) {\n        params = this.other;\n        return this.handleNetworkCodeAndParams (params);\n    }\n');
        expect (out).not.toContain ('HandleNetworkCodeAndParams(params map[string]any)');
    });
    test ('negative: slot 1 of a let destructuring (reassignable) does not prove the caller', () => {
        const out = print ('    viaLet (params = {}) {\n        let [ a, p ] = this.handleParamString (params, \'a\');\n        p = this.other;\n        return this.handleNetworkCodeAndParams (p);\n    }\n');
        expect (out).not.toContain ('HandleNetworkCodeAndParams(params map[string]any)');
    });
});
