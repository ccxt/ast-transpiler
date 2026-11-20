import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';
import { goIsOwnTsSourceName } from '../src/goTranspiler';

// a parallel transpiler's temporary Exchange.ts copy in ts/src must not reach the Go sibling-call index,
// so the index (and every parameter proof built on it) is the same whether the copy exists or not
describe ('go ts/src call index ignores other processes\' temporary source copies', () => {
    const BASE = 'export default class Exchange {\n    a (d: any) { return d; }\n    b () { return this.a (this.safeDict ({}, "k", {})); }\n}\n';
    const TEMP = BASE.replace ('this.a (this.safeDict ({}, "k", {}))', 'this.a (this.options)');
    const indexOf = (plant: string[]): any => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h26g60-'));
        try {
            const base = path.join (tmp, 'ts', 'src', 'base');
            fs.mkdirSync (base, { recursive: true });
            fs.writeFileSync (path.join (base, 'Exchange.ts'), BASE);
            for (const name of plant) { fs.writeFileSync (path.join (base, name), TEMP); }
            const t: any = new Transpiler ({ 'verbose': false });
            const tree = t.goTranspiler.goTsSrcTree ({ 'fileName': path.join (base, 'Exchange.ts') });
            return { 'calls': (tree.callIndex.get ('a') ?? []).map ((s: any) => s.file + ':' + s.args.join (',')), 'files': [ ...tree.fileText.keys () ].sort () };
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    test ('the index is the same with and without a temp copy', () => {
        const clean = indexOf ([]);
        expect (clean.calls).toEqual ([ 'base/Exchange.ts:this.safeDict ({}, "k", {})' ]);
        expect (indexOf ([ '.__ExchangeNoOverloads.ts' ])).toEqual (clean);
        expect (indexOf ([ 'Exchange.nooverloads.1.ts' ])).toEqual (clean);
    });
    test ('own-process copy and regular sources are kept, declarations and dot files are not', () => {
        expect (goIsOwnTsSourceName ('Exchange.ts')).toBe (true);
        expect (goIsOwnTsSourceName ('Exchange.nooverloads.' + process.pid + '.ts')).toBe (true);
        expect (goIsOwnTsSourceName ('Exchange.nooverloads.1.ts')).toBe (false);
        expect (goIsOwnTsSourceName ('.__ExchangeNoOverloads.ts')).toBe (false);
        expect (goIsOwnTsSourceName ('types.d.ts')).toBe (false);
        expect (goIsOwnTsSourceName ('Exchange.js')).toBe (false);
    });
});
