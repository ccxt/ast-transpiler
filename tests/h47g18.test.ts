import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a declared `string` method whose `*string` local a nil guard fills from numberToString of a proven number prints `string`
describe ('h47g18: string return filled from numberToString of a proven number', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\ntype Int = number | undefined;\nclass Exchange {\n'
        + '    options: any = {};\n'
        + '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n'
        + '    safeInteger (o: any, k: any, d: number): number;\n    safeInteger (o: any, k: any, d?: number): Int;\n'
        + '    safeInteger (o: any, k: any, d: Int = undefined): Int { return d; }\n'
        + '    safeDict (o: any, k: any, d: any = undefined): any { return d; }\n'
        + '    numberToString (x: any): string { return x; }\n}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h47g18-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nclass x extends Exchange {\n' + body
                + '    url (t: string, h: string): string {\n        return \'wss://a/\' + this.stream (t, h);\n    }\n}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const stream = (limit: string, extra = '') => '    stream (type: Str, hash: Str): string {\n'
        + '        const byHash: Dict = this.safeDict (this.options, \'byHash\', {});\n'
        + '        let stream = this.safeString (byHash, hash);\n'
        + '        if (stream === undefined) {\n'
        + '            const index = this.safeInteger (this.options, \'index\', -1);\n'
        + '            const limit = this.safeInteger (this.options, type' + limit + ');\n'
        + '            const next = index + 1;\n'
        + '            const normalized = next % ' + ((limit === '') ? '(limit as number)' : 'limit') + ';\n'
        + '            stream = this.numberToString (normalized);\n'
        + '            byHash[hash] = stream;\n' + extra
        + '        }\n'
        + '        return stream;\n'
        + '    }\n';
    test ('a literal-defaulted limit: string return and deref (fails on the base printer)', () => {
        const out = print (stream (', 50'));
        expect (out).toMatch (/\) Stream\(typeVar any, hash any\) string \{/);
        expect (out).toContain ('return *stream');
        expect (out).toContain ('"wss://a/" + this.Stream(t, h)');
    });
    test ('negative: a limit with no default (nil) keeps any', () => {
        const out = print (stream (''));
        expect (out).toMatch (/\) Stream\(typeVar any, hash any\) any \{/);
        expect (out).not.toContain ('return *stream');
    });
    test ('negative: a second write after the fill keeps any', () => {
        const out = print (stream (', 50', '            stream = this.safeString (byHash, \'x\');\n'));
        expect (out).not.toContain ('return *stream');
    });
});
