import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// a venue `string[]` producer returning `this.safeList (o, k, d)` where d is a const local of list literals prints
// []any through SafeListSlice, so a caller local read by its length takes []any and its length prints len()
function transpile (source: string): string {
    const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h48g33-'));
    fs.mkdirSync (path.join (dir, 'ts', 'src'), { 'recursive': true });
    fs.writeFileSync (path.join (dir, 'ts', 'src', 'ex.ts'), source);
    const cwd = process.cwd ();
    try {
        process.chdir (dir);
        const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        installCcxtGoLocalTypes (x.goTranspiler);
        return x.transpileGoByPath ('ts/src/ex.ts').content;
    } finally {
        process.chdir (cwd);
        fs.rmSync (dir, { 'recursive': true, 'force': true });
    }
}
const head = 'type Dict = { [key: string]: unknown };\n'
    + 'type Str = string | undefined;\n'
    + 'class base {\n'
    + '    options: Dict = {};\n'
    + '    safeList (o: unknown, k: unknown, d: unknown = undefined): unknown[] { return d as unknown[]; }\n'
    + '    safeDict (o: unknown, k: unknown, d: unknown = undefined): Dict { return d as Dict; }\n'
    + '    safeString (o: unknown, k: unknown): string { return undefined; }\n'
    + '}\n'
    + 'export class ex extends base {\n';
const caller = '    f () {\n'
    + '        const xs = this.settlements (\'swap\');\n'
    + '        let n = \'\';\n'
    + '        for (let i = 0; i < xs.length; i++) {\n'
    + '            n = this.safeString (xs, i);\n'
    + '        }\n'
    + '        return n;\n'
    + '    }\n';
describe ('h48g33: venue string[] producer defaulted by a const list-literal local', () => {
    test ('positive: ternary of list literals as the default (fails on the base printer)', () => {
        const out = transpile (head
            + '    settlements (type: Str): string[] {\n'
            + '        const options = this.safeDict (this.options, type, {});\n'
            + '        const defaultSettle = (type === \'swap\') ? [ \'usdt\' ] : [ \'btc\' ];\n'
            + '        return this.safeList (options, \'settlementCurrencies\', defaultSettle);\n'
            + '    }\n' + caller + '}\n');
        expect (out).toContain (') Settlements(typeVar string) []any {');
        expect (out).toContain ('if list, ok := options["settlementCurrencies"].([]any); ok {');
        expect (out).toContain ('return defaultSettle');
        expect (out).not.toContain ('SafeListSlice(options');
        expect (out).toContain ('var xs []any = this.Settlements("swap")');
        expect (out).toContain ('i < len(xs)');
        expect (out).not.toContain ('GetArrayLength(xs)');
    });
    test ('negative: an untyped container keeps the SafeListSlice read', () => {
        const out = transpile (head
            + '    settlements (type: Str, o: any = undefined): string[] {\n'
            + '        const defaultSettle = [ \'btc\' ];\n'
            + '        return this.safeList (o, \'settlementCurrencies\', defaultSettle);\n'
            + '    }\n'
            + '}\n');
        expect (out).not.toContain ('.([]any); ok {');
    });
    test ('negative: a let default that is rebound keeps any', () => {
        const out = transpile (head
            + '    settlements (type: Str): string[] {\n'
            + '        let defaultSettle = [ \'btc\' ];\n'
            + '        if (type === \'swap\') {\n'
            + '            defaultSettle = undefined;\n'
            + '        }\n'
            + '        return this.safeList (this.options, \'settlementCurrencies\', defaultSettle);\n'
            + '    }\n' + caller + '}\n');
        expect (out).toContain ('Settlements(typeVar string) any {');
    });
    test ('negative: a default that is a parameter (may be nil) keeps any', () => {
        const out = transpile (head
            + '    settlements (type: Str, d: string[] = undefined): string[] {\n'
            + '        return this.safeList (this.options, type, d);\n'
            + '    }\n'
            + '}\n');
        expect (out).not.toContain (') []any {');
    });
    test ('negative: a const default seeded by a call keeps any', () => {
        const out = transpile (head
            + '    settlements (type: Str): string[] {\n'
            + '        const d = this.safeList (this.options, \'d\');\n'
            + '        return this.safeList (this.options, type, d);\n'
            + '    }\n'
            + '}\n');
        expect (out).not.toContain ('Settlements(typeVar string) []any {');
    });
});
