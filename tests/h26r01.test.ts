import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-h26r01-'));
const BASE = "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport type Strings = string[] | undefined;\nexport default class Exchange {\n    symbols: string[] = undefined;\n    hold (x: any): any { return x; }\n    outcome (s: Str): Dict { return {}; }\n    async loadOutcome (s: Str): Promise<Dict> { return {}; }\n}\n";
const mk = (name: string, body: string): string => {
    const dir = path.join (root, name);
    fs.mkdirSync (path.join (dir, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (dir, 'ts/src/base/Exchange.ts'), BASE);
    fs.writeFileSync (path.join (dir, 'ts/src/venue.ts'), "import Exchange from './base/Exchange.js';\nimport type { Dict, Strings } from './base/Exchange.js';\nexport default class venue extends Exchange {\n" + body + "}\n");
    return new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } }).transpileRustByPath (path.join (dir, 'ts/src/venue.ts')).content;
};

const FN = "    async fetchTickers (outcomes: Strings = undefined, params: Dict = {}): Promise<Dict> {\n        const outcomesList: string[] = (outcomes === undefined) ? [] : outcomes;\n        const n = outcomesList.length;\n        const r: Dict = {};\n        for (let i = 0; i < n; i++) {\n            r[outcomesList[i]] = this.outcome (outcomesList[i]);\n        }\n        if (n > 2) {\n            return this.byHash (outcomesList, r);\n        }\n        return this.byHash (outcomesList, r);\n    }\n";
const LENT = "    byHash (outcomesList: string[], r: Dict): Dict {\n        const n = outcomesList.length;\n        for (let i = 0; i < n; i++) {\n            r[outcomesList[i]] = 1;\n        }\n        return r;\n    }\n";

describe ('h26-r01: a string-list ternary handed to a lent `&[Value]` slot stays an optional list', () => {
    test ('positive: Option<List> local, the lent slot views it in place', () => {
        const out = mk ('pos', FN + LENT);
        const f = out.slice (out.indexOf ('fn fetchTickers'), out.indexOf ('fn byHash'));
        expect (f).toContain ('let mut outcomesList: Option<crate::value::List> = ');
        expect (f).toContain ('self.byHash(outcomesList.as_deref().map(Vec::as_slice).unwrap_or_default(), ');
        expect (f).not.toMatch (/let (mut )?outcomesList: Value/);
    });
    test ('negative: a callee that writes its list keeps a Value slot, so the local stays boxed', () => {
        const writes = "    byHash (outcomesList: string[], r: Dict): Dict {\n        outcomesList.push ('x');\n        r['n'] = outcomesList.length;\n        return r;\n    }\n";
        const out = mk ('neg-write', FN + writes);
        expect (out).toMatch (/let (mut )?outcomesList: Value = /);
    });
    test ('negative: a whole hand-off to an any slot (nil-tested by the consumer) keeps the box', () => {
        const nilTest = "    byHash (outcomesList: any, r: Dict): Dict {\n        if (outcomesList === undefined) {\n            return r;\n        }\n        return this.hold (outcomesList);\n    }\n";
        const out = mk ('neg-nil', FN + nilTest);
        expect (out).toMatch (/let (mut )?outcomesList: Value = /);
    });
});
