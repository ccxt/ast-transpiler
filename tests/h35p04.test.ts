// h35p04 // handleTriggerAndParams / isTriggerOrder take map[string]any and return a (*bool, map[string]any) pair
import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks, installCcxtGoDictParams, installCcxtGoLocalTypes } from '../src/transpiler';

describe ('h35p04: trigger pair handlers with a map parameter', () => {
    const root = path.join (__dirname, 'files', 'tmp-h35p04-' + process.pid, 'ts', 'src');
    const BASE = (extra: string) =>
        'type Dict = { [key: string]: any };\ntype Bool = boolean | undefined;\n' +
        'export class Exchange {\n' +
        '    other: any = undefined;\n' +
        '    safeBool2 (d: any, k1: any, k2: any, def: any = undefined): Bool { return def; }\n' +
        '    omit (d: any, ...k: any[]): any { return d; }\n' +
        '    handleTriggerAndParams (params: Dict): [Bool, Dict] {\n' +
        '        const isTrigger = this.safeBool2 (params, \'trigger\', \'stop\');\n' +
        '        const paramsOmitted = (isTrigger === true) ? this.omit (params, [ \'trigger\', \'stop\' ]) : params;\n' +
        '        return [ isTrigger, paramsOmitted ];\n' +
        '    }\n' +
        '    isTriggerOrder (params: Dict): [Bool, Dict] {\n' +
        '        return this.handleTriggerAndParams (params);\n' +
        '    }\n' +
        '    cancelOrder (id: string, params = {}) {\n' +
        '        const [ isTrigger, query ] = this.isTriggerOrder (params);\n' +
        '        if (isTrigger) {\n' +
        '            return query;\n' +
        '        }\n' +
        '        return params;\n' +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h35p04-' + process.pid), { recursive: true, force: true }));

    test ('positive: both handlers print a map parameter and a typed pair (fails on the base printer)', () => {
        const out = print ('');
        expect (out).toContain ('HandleTriggerAndParams(params map[string]any) (*bool, map[string]any)');
        expect (out).toContain ('IsTriggerOrder(params map[string]any) (*bool, map[string]any)');
        expect (out).toContain ('return this.HandleTriggerAndParams(params)');
        expect (out).toContain ('isTrigger, query := this.IsTriggerOrder(params)');
        expect (out).not.toContain ('GetValue(isTriggerquery');
    });
    test ('nil / missing / wrong kind: the flag is still the SafeBool2 pointer read, the omit only when it is true', () => {
        const out = print ('');
        expect (out).toContain ('var isTrigger *bool = this.SafeBool2(params, "trigger", "stop")');
        expect (out).toContain ('if isTrigger != nil && *isTrigger == true {');
    });
    test ('negative: a caller passing an untyped field keeps the box', () => {
        const out = print ('    viaField () {\n        return this.handleTriggerAndParams (this.other);\n    }\n');
        expect (out).not.toContain ('HandleTriggerAndParams(params map[string]any');
    });
});
