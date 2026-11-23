import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a `string[]` miss list built by typed pushes of `string[]` elements and handed to a `string[]` parameter
describe ('h44g05: string[] miss list in loadOutcomes', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\ntype Strings = string[] | undefined;\nclass BaseExchange {\n'
        + '    hasOutcome (s: Str): boolean { return s !== undefined; }\n    async fetchOutcomes (outcomeSymbols: string[]): Promise<Dict> { return {}; }\n}\nexport default BaseExchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h44g05-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\ntype Dict = { [key: string]: any };\ntype Strings = string[] | undefined;\nclass x extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const fn = (push = 'outcomes[i]') => '    async lo (outcomes: Strings = undefined, reload = false) {\n        if (outcomes !== undefined) {\n'
        + '            let needBulk = false;\n            if (!reload) {\n                for (let i = 0; i < outcomes.length; i++) {\n'
        + '                    if (!this.hasOutcome (outcomes[i])) {\n                        needBulk = true;\n                    }\n                }\n            }\n'
        + '            if (needBulk) {\n                await this.fetchOutcomes ([]);\n            }\n'
        + '            const missing: string[] = [];\n            for (let i = 0; i < outcomes.length; i++) {\n'
        + '                if (reload || !this.hasOutcome (outcomes[i])) {\n                    missing.push (' + push + ');\n                }\n            }\n'
        + '            if (missing.length > 0) {\n                await this.fetchOutcomes (missing);\n            }\n        }\n        return undefined;\n    }\n';
    test ('positive: pushes of a defaulted string[] parameter element keep the miss list []string (fails on the base printer)', () => {
        const out = print (fn ());
        fs.writeFileSync ('/root/workspace/campaigns/hx12/work/h44/tmp-H44-G05/probe.go', out);
        expect (out).toContain ('var missing []string = []string{}');
        expect (out).toContain ('missing = append(missing, outcomes[i])');
    });
    test ('negative: a push of a value that is not a Go string keeps []any', () => {
        expect (print (fn ('this.fetchOutcomes as any'))).not.toContain ('var missing []string');
    });
});
