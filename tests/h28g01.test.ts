import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

// a string parameter whose caller passes an option slot defaulted by a reassigned Go-string local
describe ('h28g01: an option slot defaulted by a reassigned string local proves a string parameter', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n'
        + '    handleOptionStringAndParams (params: Dict, m: string, o: string, d: string): [string, Dict];\n'
        + '    handleOptionStringAndParams (params: Dict, m: string, o: string, d?: Str): [Str, Dict];\n'
        + '    handleOptionStringAndParams (params: Dict, m: string, o: string, d: Str = undefined): [Str, Dict] { return [ d, params ]; }\n'
        + '    note (h: any) { return h; }\n}\nexport default Exchange;\n';
    const CALLEE = '    async suffix (topic: string, params: Dict = {}) {\n'
        + '        let s = \'-spot\';\n        if (topic.indexOf (\'contract\') >= 0) {\n            s = \'-contract\';\n        }\n        return s + this.note (params);\n    }\n';
    const print = (caller: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h28g01-'));
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
    const caller = (seed: string) => '    async w (flag: boolean, params: Dict = {}) {\n' + seed
        + '        const [ topic, p ] = this.handleOptionStringAndParams (params, \'w\', \'method\', d);\n'
        + '        return await this.suffix (topic, p);\n    }\n';
    test ('a let default rewritten only with strings makes the parameter string and the read native', () => {
        const out = print (caller ('        let d = \'/spot\';\n        if (flag) {\n            d = \'/contract\';\n        }\n'));
        expect (out).toContain ('suffixBody(ch chan any, topic string, ');
        expect (out).toContain ('this.Suffix(*topic, p)');
        expect (out).not.toContain ('GetIndexOf(topic');
    });
    test ('a let default that may be rewritten with a box keeps the parameter boxed', () => {
        const out = print (caller ('        let d = \'/spot\';\n        if (flag) {\n            d = this.note (params);\n        }\n'));
        expect (out).toContain ('suffixBody(ch chan any, topic any, ');
        expect (out).not.toContain ('*topic');
    });
    test ('a let default that may stay undefined keeps the parameter boxed', () => {
        const out = print (caller ('        let d: Str = undefined;\n        if (flag) {\n            d = \'/contract\';\n        }\n'));
        expect (out).toContain ('suffixBody(ch chan any, topic any, ');
        expect (out).not.toContain ('*topic');
    });
});
