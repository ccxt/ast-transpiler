import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// `const x: Dict = c ? a : b` whose two arms are Go maps prints a typed map local instead of an any IIFE.
describe ('h26g20 two-map-arm ternary declaration', () => {
    const BASE = [
        'export class Exchange {',
        '    timeframes: Dict = {};',
        '    options: Dict = {};',
        '    safeDict (a, b, c?): Dict { return {}; }',
        '    safeString (a, b, c?): string { return \'\'; }',
        '}',
        'type Dict = {[key: string]: any};',
        '',
    ].join ('\n');
    const HEADER = 'import { Exchange } from \'../base/Exchange\';\ntype Dict = {[key: string]: any};\n';
    const print = (body: string): string => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h26g20-'));
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
    const FT = (decl: string, use: string) => print ([
        '    findTimeframe (timeframe, timeframes: Dict = undefined, other: any = undefined) {',
        '        ' + decl,
        '        const keys = Object.keys (timeframesResolved);',
        '        for (let i = 0; i < keys.length; i++) {',
        '            const key = keys[i];',
        '            if (timeframesResolved[key] === timeframe) {',
        '                return key;',
        '            }',
        '        }',
        use,
        '        return undefined;',
        '    }',
    ].join ('\n') + '\n');
    const DECL = 'const timeframesResolved: Dict = (timeframes === undefined) ? this.timeframes : timeframes;';
    test ('a map field arm and a map param arm print a typed map local (fails on the base printer)', () => {
        const out = FT (DECL, '');
        expect (out).toContain ('\tvar timeframesResolved map[string]any\n\tif timeframes == nil {\n\t\ttimeframesResolved = this.Timeframes\n\t} else {\n\t\ttimeframesResolved = timeframes\n\t}\n');
        expect (out).toContain ('IsEqual(timeframesResolved[key], timeframe)');
        expect (out).not.toContain ('func() any');
    });
    test ('a nil test of the local keeps the box (a nil map arm is a non-nil any)', () => {
        const out = FT (DECL, '        if (timeframesResolved === undefined) { return \'x\'; }');
        expect (out).toContain ('var timeframesResolved any = func() any {');
    });
    test ('a hand-off into an any slot keeps the box', () => {
        const out = FT (DECL, '        return this.safeString (timeframesResolved, \'a\');');
        expect (out).toContain ('var timeframesResolved any = func() any {');
    });
    test ('an untyped arm keeps the box', () => {
        const out = FT ('const timeframesResolved: Dict = (timeframes === undefined) ? this.timeframes : other;', '');
        expect (out).toContain ('var timeframesResolved any = func() any {');
    });
    test ('a non-map write to a let local keeps the box', () => {
        const out = FT ('let timeframesResolved: any = (timeframes === undefined) ? this.timeframes : timeframes;', '        timeframesResolved = \'s\';');
        expect (out).not.toContain ('var timeframesResolved map[string]any');
    });
});
