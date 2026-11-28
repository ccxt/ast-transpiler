import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// parseOrderBookBidsAsks returns its `[]any` accumulator on the base and every override:
// the local a call initialises is declared `[]any`; an unlisted list parser keeps the box.
describe ('go parseOrderBookBidsAsks result locals', () => {
    const HEAD = 'type Num = number | undefined;\nclass Exchange {\n'
        + '    parseOrderBookBidsAsks (bidasks: any, priceKey: any = 0): Num[][] { return []; }\n'
        + '    parseOtherBidsAsks (bidasks: any): Num[][] { return []; }\n'
        + '    sortBy (a: any, k: any): any { return a; }\n'
        + '    rawValue (a: any): any { return a; }\n';
    const print = (body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h27p11-'));
        try {
            const dir = path.join (tmp, 'ts', 'src', 'base');
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'x.ts');
            fs.writeFileSync (file, HEAD + '    run (book: any) {\n' + body + '\n    }\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    test ('the bids local is a []any (fails on the base printer)', () => {
        const out = print ('const bids = this.parseOrderBookBidsAsks (book, 0);\nreturn this.sortBy (bids, 0);');
        expect (out).toMatch (/var bids \[\]any = this\.ParseOrderBookBidsAsks\(/);
    });
    test ('an unlisted list parser keeps the box', () => {
        const out = print ('const bids = this.parseOtherBidsAsks (book);\nreturn this.sortBy (bids, 0);');
        expect (out).not.toMatch (/var bids \[\]any/);
    });
    test ('a local reassigned from another producer keeps the box', () => {
        const out = print ('let bids = this.parseOrderBookBidsAsks (book, 0);\nbids = this.rawValue (book);\nreturn bids;');
        expect (out).not.toMatch (/var bids \[\]any/);
    });
});
