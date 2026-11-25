import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('h24b03: a string parameter whose callers pass a literal-default handleOptionStringAndParams slot', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n'
        + '    handleOptionStringAndParams (params: Dict, m: string, o: string, d: string): [string, Dict];\n'
        + '    handleOptionStringAndParams (params: Dict, m: string, o: string, d?: Str): [Str, Dict];\n'
        + '    handleOptionStringAndParams (params: Dict, m: string, o: string, d: Str = undefined): [Str, Dict] { return [ d, params ]; }\n'
        + '    note (h: any) { return h; }\n}\nexport default Exchange;\n';
    const CALLEE = '    async sub (channel: string, params: Dict = {}) {\n'
        + '        if (channel === \'candle\') {\n            return 1;\n        }\n        return 0;\n    }\n';
    const print = (caller: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h24b03-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'pro'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'pro', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (file, 'import Exchange from \'../base/Exchange.js\';\nclass x extends Exchange {\n' + caller + CALLEE + '}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'guardedStringTupleCalls': [ 'handleOptionStringAndParams' ] } };
            return new Transpiler (config).transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const caller = (dflt: string) => '    async w (params: Dict = {}) {\n'
        + '        const [ channel, p ] = this.handleOptionStringAndParams (params, \'w\', \'channel\'' + dflt + ');\n'
        + '        return await this.sub (channel, p);\n    }\n';
    test ('a literal default makes the parameter string and the compare native', () => {
        const out = print (caller (', \'books\''));
        expect (out).toContain ('subBody(ch chan any, channel string, ');
        expect (out).toContain ('this.Sub(*channel, p)');
    });
    test ('no default (the slot may be nil) keeps the box', () => {
        const out = print (caller (''));
        expect (out).toContain ('subBody(ch chan any, channel any, ');
        expect (out).not.toContain ('*channel');
    });
    test ('a non-literal default keeps the box', () => {
        const out = print ('    async w (params: Dict = {}) {\n        const d: Str = this.note (params);\n'
            + '        const [ channel, p ] = this.handleOptionStringAndParams (params, \'w\', \'channel\', d);\n'
            + '        return await this.sub (channel, p);\n    }\n');
        expect (out).toContain ('subBody(ch chan any, channel any, ');
    });
    test ('a second caller passing another type keeps the box', () => {
        const out = print (caller (', \'books\'') + '    async v (params: Dict = {}) {\n        return await this.sub (this.note (params), params);\n    }\n');
        expect (out).toContain ('subBody(ch chan any, channel any, ');
    });
});
