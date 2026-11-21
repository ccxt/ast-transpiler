import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('h26g33: handleMarketTypeAndParams slot 0 with a literally undefined market is a non-nil string', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n'
        + '    handleMarketTypeAndParams (m: string, market: Dict = undefined, params: Dict = {}, d: Str = undefined): [string, Dict] { return [ d, params ]; }\n'
        + '}\nexport default Exchange;\n';
    const CALLEE = '    async sub (kind: string, params: Dict = {}) {\n'
        + '        if (kind === \'swap\') {\n            return 1;\n        }\n        return 0;\n    }\n';
    const print = (caller: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h26g33-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nclass x extends Exchange {\n' + caller + CALLEE + '}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            return new Transpiler (config).transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const caller = (args: string) => '    async w (market: Dict = undefined, params: Dict = {}) {\n'
        + '        const [ t, p ] = this.handleMarketTypeAndParams (\'w\'' + args + ');\n'
        + '        return await this.sub (t, p);\n    }\n';
    test ('an undefined market makes the parameter string and the caller deref', () => {
        const out = print (caller (', undefined, params'));
        expect (out).toContain ('kind string');
        expect (out).toContain ('this.Sub(*t, p)');
    });
    test ('an undefined market with a literal default is proven too', () => {
        expect (print (caller (', undefined, params, \'spot\''))).toContain ('this.Sub(*t, p)');
    });
    test ('a market argument (market[type] may be nil) keeps the box', () => {
        const out = print (caller (', market, params'));
        expect (out).not.toContain ('*t');
    });
    test ('a non-literal default (may be nil) keeps the box', () => {
        const out = print ('    async w (d: Str = undefined, params: Dict = {}) {\n'
            + '        const [ t, p ] = this.handleMarketTypeAndParams (\'w\', undefined, params, d);\n'
            + '        return await this.sub (t, p);\n    }\n');
        expect (out).not.toContain ('*t');
    });
});
