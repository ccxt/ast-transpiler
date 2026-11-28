import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// `const x = this.<map field>` (features; the PredictionExchange caches) prints a `map[string]any` local read natively
describe ('h26g14 map field locals', () => {
    const BASE = [
        'type Dict = {[key: string]: any};',
        'type NullableDict = Dict | undefined;',
        'export class Exchange {',
        '    features!: {[key: string]: NullableDict};',
        '    networkAliases: {[key: string]: string} = { \'ETH\': \'ERC20\' };',
        '    options: Dict = {};',
        '    featuresMapper (a: Dict, b: string): NullableDict { return undefined; }',
        '    keep (x: any) { return x; }',
        '    safeString (a, b, c?) { return \'\'; }',
        '}',
        '',
    ].join ('\n');
    const HEADER = 'import { Exchange } from \'../base/Exchange\';\ntype Dict = {[key: string]: any};\n';
    const print = (body: string): string => {
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h26g14-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { 'recursive': true });
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            fs.writeFileSync (path.join (src, 'ex.ts'), HEADER + 'export class ex extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': {} });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (path.join (src, 'ex.ts')).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    test ('a guarded features local is a map with a native membership read (fails on the base printer)', () => {
        const out = print ('    f () {\n        if (this.features === undefined) {\n            return;\n        }\n        const initial = this.features;\n'
            + '        const types = [ \'spot\', \'swap\' ];\n        const t = types[0];\n        if (!(t in initial)) {\n            return this.featuresMapper (initial, t);\n        }\n        return undefined;\n    }\n');
        expect (out).toContain ('var initial map[string]any = this.Features');
        expect (out).not.toContain ('InOp(initial');
    });
    test ('negative: an unguarded local handed to an any slot keeps the box (typed nil)', () => {
        const out = print ('    h () {\n        const initial = this.features;\n        return this.keep (initial);\n    }\n');
        expect (out).not.toContain ('var initial map[string]any');
    });
    test ('negative: a local that is reassigned keeps the box', () => {
        const out = print ('    k () {\n        let initial: any = this.features;\n        initial = [ 1 ];\n        return initial;\n    }\n');
        expect (out).not.toContain ('var initial map[string]any');
    });
    test ('negative: a local compared with undefined keeps the box', () => {
        const out = print ('    m () {\n        const initial = this.features;\n        return initial === undefined;\n    }\n');
        expect (out).not.toContain ('var initial map[string]any');
    });
});
