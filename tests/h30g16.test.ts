import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler.js';
import { installCcxtGoLocalTypes, installFmGo5G01 } from '../src/goTranspiler.js';

const t = () => {
    const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    installCcxtGoLocalTypes (x.goTranspiler);
    installFmGo5G01 (x.goTranspiler);
    return x;
};
const src = (body: string) => [
    'type Dict = { [key: string]: any };',
    'class Client { }',
    'class Base {',
    '    safeDict (a: any, b: any, c: any = undefined) { return undefined; }',
    '    safeList (a: any, b: any, c: any = undefined) { return undefined; }',
    '    safeString (a: any, b: any, c: any = undefined) { return undefined; }',
    '    handleMessage (client: Client, message: any) { }',
    '}',
    'class ex extends Base {',
    body,
    '}',
    '',
].join ('\n');
const go = (body: string) => {
    // a fresh tree per case: the sibling-file scan indexes the tree once
    const full = path.join (fs.mkdtempSync (path.join (os.tmpdir (), 'h30g16-')), 'ts/src/ex.ts');
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, src (body));
    return t ().transpileGoByPath (full).content as string;
};
const m = (lines: string) => '    build (raw: Dict) {\n' + lines + '\n    }';
const pre = "        const ticker = this.safeString (raw, 'ticker');\n";
const tail = "        const out = [];\n        for (let i = 0; i < 2; i++) {\n            out.push ({ 'id': ids[i] });\n        }\n        return out;";

describe ('h30 G16 pointer elements dereferenced at list construction', () => {
    test ('a *string local in a const literal list is stored dereferenced (fails on the base printer)', () => {
        const out = go (m (pre + "        const ids = [ ticker, ticker + '-NO' ];\n" + tail));
        expect (out).toContain ('if ticker != nil {');
        expect (out).toContain ('ids[0] = *ticker');
        expect (out).toContain ('ids[i]');
        expect (out).not.toContain ('DerefScalar(ids[i])');
    });
    test ('negative: a list that is later pushed keeps DerefScalar', () => {
        const out = go (m (pre + "        const ids = [ ticker, 'x' ];\n        ids.push (this.safeString (raw, 'y'));\n" + tail));
        expect (out).not.toContain ('ids[0] = *ticker');
        expect (out).toContain ('DerefScalar(ids[i])');
    });
    test ('negative: an unproven element keeps DerefScalar', () => {
        const out = go (m (pre + "        const ids = [ ticker, raw['k'] ];\n" + tail));
        expect (out).not.toContain ('ids[0] = *ticker');
        expect (out).toContain ('DerefScalar(ids[i])');
    });
});
