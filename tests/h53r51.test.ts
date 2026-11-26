import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as path from 'path';

// `this.safeDict (xs, i)` (no default) on a const local printed as a typed `List` in a pro / prediction file reads the
// element's map natively (`None` out of range or for a non-map); other receivers and tiers keep the reader.
// Probed on the real ts/src files (relative paths, as the farm prints them) when the ccxt tree is present.
const tree = '/root/workspace/campaigns/hx12/work/h53/tree';
const has = fs.existsSync (path.join (tree, 'ts', 'src', 'pro', 'okx.ts'));
const run = (rel: string): string => {
    const cwd = process.cwd ();
    try {
        process.chdir (tree);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        return t.transpileRustByPath (rel).content;
    } finally {
        process.chdir (cwd);
    }
};
const fn = (out: string, name: string): string => {
    const at = out.indexOf ('fn ' + name + '(');
    return at < 0 ? '' : out.slice (at, out.indexOf ('\n    pub ', at + 10) < 0 ? undefined : out.indexOf ('\n    pub ', at + 10));
};
const t = has ? test : test.skip;

describe ('rust: list-row safeDict on a typed List local in pro / prediction', () => {
    t ('pro okx handleFundingRate: a counter row of a key_list local is native (fails on the base printer)', () => {
        const b = fn (run ('ts/src/pro/okx.ts'), 'handleFundingRate');
        expect (b).toContain ('(match data.get(i as usize) { Some(Value::Dict(__m)) => Some(std::sync::Arc::clone(__m)), _ => None })');
        expect (b).not.toMatch (/self\.safe(_d|D)ict\(&data/);
    });
    t ('prediction hyperliquid: a literal row of a typed List local is native', () => {
        const out = run ('ts/src/prediction/hyperliquid.ts');
        expect (out).toContain ('(match rawBids.get(0) { Some(Value::Dict(__m)) => Some(std::sync::Arc::clone(__m)), _ => None })');
    });
    t ('negative: a REST venue file is left to its own rule', () => {
        expect (run ('ts/src/okx.ts')).not.toMatch (/\(match \w+\.get\(0\) \{ Some\(Value::Dict\(__m\)\) => Some\(std::sync::Arc::clone\(__m\)\), _ => None \}\)/);
    });
    t ('negative: a defaulted row and a non-local receiver keep the reader (extended dataList, opinion responses)', () => {
        const ext = run ('ts/src/pro/extended.ts');
        expect (ext).not.toContain ('(match dataList.get(0) { Some(Value::Dict(__m))');
        const op = run ('ts/src/prediction/opinion.ts');
        expect (op).not.toContain ('(match responses.get(priceIndex');
    });
});
