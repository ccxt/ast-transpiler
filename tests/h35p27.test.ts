import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('rust: a dict field written under a literal-key read of a local is a native insert', () => {
    const BASE = 'export interface Dict { [key: string]: any }\nexport interface Dictionary<T> { [key: string]: T }\n'
        + 'export default class Exchange {\n    markets: Dictionary<any> | undefined;\n    hold (x: any): any { return x; }\n}\n';
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h35p27-'));
    const config: any = { 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (dir, 'ts/src/base'), { 'recursive': true });
        fs.writeFileSync (path.join (dir, 'ts/src/base/Exchange.ts'), BASE);
        fs.writeFileSync (path.join (dir, 'ts/src/venue.ts'), 'import Exchange from \'./base/Exchange.js\';\nimport type { Dict } from \'./base/Exchange.js\';\nexport default class venue extends Exchange {\n'
            + '    a (m: any) {\n        this.markets[(m as Dict)[\'market\']] = m;\n    }\n'
            + '    b (m: any, k: any) {\n        this.markets[(m as Dict)[k]] = m;\n    }\n'
            + '    c (m: any) {\n        this.markets[this.hold (m)] = m;\n    }\n'
            + '}\n');
        out = new Transpiler (config).transpileRustByPath (path.join (dir, 'ts/src/venue.ts')).content;
    });
    afterAll (() => fs.rmSync (dir, { 'recursive': true, 'force': true }));
    const body = (name: string) => out.split ('fn ').find ((part) => part.startsWith (`${name}(`)) ?? '';
    test ('a literal-key read of a local as the key: native insert with the helper key conversion', () => {
        expect (body ('a')).toContain ('.insert(crate::runtime::stringify_param(&');
        expect (body ('a')).not.toContain ('add_element_to_object');
    });
    test ('negative: a variable-key read keeps the helper', () => {
        expect (body ('b')).toContain ('add_element_to_object');
    });
    test ('negative: a call as the key keeps the helper', () => {
        expect (body ('c')).toContain ('add_element_to_object');
    });
});
