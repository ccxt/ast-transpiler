import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a local annotated with the parse* callee's own Num / Int holds the callee's pointer, nil test or not
describe('h53g50: annotated parse* Num / Int locals', () => {
    const BASE = 'export type Dict = { [key: string]: unknown };\n'
        + 'export type Str = string | undefined;\n'
        + 'export type Num = number | undefined;\n'
        + 'export type Int = number | undefined;\n'
        + 'export default class Exchange {\n'
        + '    safeString (a: Dict, k: string, d: Str = undefined): Str { return d; }\n'
        + '    parseNumber (v: Str, d: Num = undefined): Num { return d; }\n'
        + '    parse8601 (v: Str): Int { return undefined; }\n'
        + '}\n';
    const run = (members: string): string => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h53g50-'));
        try {
            fs.mkdirSync(path.join(tmp, 'ts/src/base'), { recursive: true });
            fs.writeFileSync(path.join(tmp, 'ts/src/base/Exchange.ts'), BASE);
            const file = path.join(tmp, 'ts/src/x.ts');
            fs.writeFileSync(file, "import Exchange, { Dict, Str, Num, Int } from './base/Exchange.js';\nclass X extends Exchange {\n"
                + '    parseDay (day: string): Int {\n'
                + "        if (day === '') {\n"
                + '            return undefined;\n'
                + '        }\n'
                + "        return this.parse8601 (day + 'T00:00:00Z');\n"
                + '    }\n'
                + '    parseScaled (value: Str): Num {\n'
                + '        if (value === undefined) {\n'
                + '            return undefined;\n'
                + '        }\n'
                + '        return this.parseNumber (value);\n'
                + '    }\n'
                + members + '}\n');
            const t = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 } } });
            installCcxtGoHooks(t.goTranspiler);
            return t.transpileGoByPath(file).content;
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    };
    test('a `Num`-annotated local with no nil test takes *float64', () => {
        const out = run('    f (trade: Dict): Dict {\n'
            + "        const amount: Num = this.parseScaled (this.safeString (trade, 'amount'));\n"
            + "        return { 'amount': amount };\n"
            + '    }\n');
        expect(out).toContain('var amount *float64 = this.ParseScaled(');
    });
    test('an `Int`-annotated local with no nil test takes *int64', () => {
        const out = run('    f (trade: Dict): Dict {\n'
            + "        const ts: Int = this.parseDay (this.safeString (trade, 'd', ''));\n"
            + "        return { 'ts': ts };\n"
            + '    }\n');
        expect(out).toContain('var ts *int64 = this.ParseDay(');
    });
    test('an unannotated local with no nil test keeps the box', () => {
        const out = run('    f (trade: Dict): Dict {\n'
            + "        const amount = this.parseScaled (this.safeString (trade, 'amount'));\n"
            + "        return { 'amount': amount };\n"
            + '    }\n');
        expect(out).toContain('var amount any = this.ParseScaled(');
    });
    test('an `any`-annotated local keeps the box', () => {
        const out = run('    f (trade: Dict): Dict {\n'
            + "        const amount: any = this.parseScaled (this.safeString (trade, 'amount'));\n"
            + "        return { 'amount': amount };\n"
            + '    }\n');
        expect(out).not.toContain('var amount *float64');
    });
});
