import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('rust typed fetchTransactionFees: Option<Dict> return', () => {
    const src = "import Exchange from './base/Exchange.js';\nimport type { Dict, Strings } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    async fetchTransactionFees (codes: Strings = undefined, params: Dict = {}): Promise<Dict> {\n        const result: Dict = {};\n        return result;\n    }\n    async fetchOtherFees (codes: Strings = undefined, params: Dict = {}): Promise<Dict> {\n        const result: Dict = {};\n        return result;\n    }\n}\n";
    const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-h49r13-'));
    const file = path.join (root, 'ts/src/venue.ts');
    fs.mkdirSync (path.dirname (file), { recursive: true });
    fs.writeFileSync (file, src);
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));
    const emit = (names: string[]) => new Transpiler ({ 'verbose': false, 'rust': { 'typedUnified': names, 'parser': { 'NUM_LINES_END_FILE': 0 } } }).transpileRustByPath (file).content;
    test ('a listed fetchTransactionFees prints the typed signature', () => {
        expect (emit ([ 'fetchTransactionFees' ])).toMatch (/fn fetchTransactionFees\(&self, codes: Option<Vec<String>>, params: impl Into<crate::Params> \+ Send\) -> crate::Result<Option<crate::value::Dict>>/);
    });
    test ('negative: unlisted, it keeps the Value signature; a sibling fee method stays untyped', () => {
        expect (emit ([])).not.toContain ('Option<crate::value::Dict>>');
        expect (emit ([ 'fetchTransactionFees' ])).not.toMatch (/fn fetchOtherFees\([^\n]*crate::Result</);
    });
});
