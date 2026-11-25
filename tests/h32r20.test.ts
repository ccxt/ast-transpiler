import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('rust: the last Dict slot of a base tuple reader is typed from its declared return', () => {
    const BASE = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport type Bool = boolean | undefined;\nexport type Int = number | undefined;\n'
        + 'export default class Exchange {\n    hold (x: any): any { return x; }\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n'
        + '    handleOptionBoolAndParams (params: Dict, methodName: Str, optionName: string, defaultValue: Bool = undefined): [Bool, Dict] { return [ defaultValue, params ]; }\n'
        + '    handleMarginModeAndParams (methodName: string, params: Dict = {}, defaultValue: Str = undefined): [Str, Dict] { return [ defaultValue, params ]; }\n'
        + '    handleParamInteger (params: Dict, paramName: string): [number, Dict] { return [ 1, params ]; }\n'
        + '    handleOptionAndParams2 (params: Dict, methodName: Str, a: string, b: string, d: any = undefined): [any, Dict] { return [ d, params ]; }\n'
        + '    handleLooseAndParams (params: Dict): [Str, any] { return [ undefined, params ]; }\n'
        + '    handleOptionIntegerAndParams (params: Dict, methodName: Str, optionName: string, defaultValue: Int = undefined): [Int, Dict] { return [ defaultValue, params ]; }\n'
        + '    async paged (method: string, symbol: Str = undefined, params: Dict = {}) {\n'
        + '        const [ maxRetries, paramsMaxRetries ] = this.handleOptionIntegerAndParams (params, method, \'maxRetries\', 3);\n'
        + '        return await this[method] (symbol, maxRetries, paramsMaxRetries);\n    }\n}\n';
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h32r20-'));
    const venue = (body: string) => 'import Exchange from \'./base/Exchange.js\';\nimport type { Dict, Str } from \'./base/Exchange.js\';\nexport default class venue extends Exchange {\n' + body + '}\n';
    const config: any = { 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
    let out = '';
    let base = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (dir, 'ts/src/base'), { 'recursive': true });
        fs.writeFileSync (path.join (dir, 'ts/src/base/Exchange.ts'), BASE);
        fs.writeFileSync (path.join (dir, 'ts/src/venue.ts'), venue (
            '    a (params: Dict = {}) {\n        const [ marginMode, rest ] = this.handleMarginModeAndParams (\'fetchX\', params);\n        return marginMode;\n    }\n'
            + '    b (params: Dict = {}) {\n        const [ flag, restB ] = this.handleOptionBoolAndParams (params, \'fetchX\', \'flag\', false);\n        return flag;\n    }\n'
            + '    c (params: Dict = {}) {\n        const [ until, restC ] = this.handleParamInteger (params, \'until\');\n        return until;\n    }\n'
            + '    d (params: Dict = {}) {\n        const [ v, restD ] = this.handleOptionAndParams2 (params, \'fetchX\', \'a\', \'b\', \'z\');\n        return v;\n    }\n'
            + '    e (params: Dict = {}) {\n        const [ w, restE ] = this.handleLooseAndParams (params);\n        return w;\n    }\n'));
        out = new Transpiler (config).transpileRustByPath (path.join (dir, 'ts/src/venue.ts')).content;
        base = new Transpiler (config).transpileRustByPath (path.join (dir, 'ts/src/base/Exchange.ts')).content;
    });
    afterAll (() => fs.rmSync (dir, { 'recursive': true, 'force': true }));
    test ('an unread rest slot of each [x, Dict] reader is a Dict', () => {
        for (const n of [ 'rest', 'restB', 'restC', 'restD' ]) expect (out).toMatch (new RegExp (`let mut ${n}: crate::value::Dict = \\w+\\.get\\(1\\)\\.cloned\\(\\)\\.unwrap_or\\(Value::Null\\)\\.into_dict\\(\\)`));
        expect (out).toContain ('let mut flag: Option<bool> = ');
    });
    test ('negative: a slot the reader declares `any` keeps its Value box', () => {
        expect (out).toContain ('let mut restE: Value = ');
    });
    test ('a typed slot handed to a by-name call boxes there instead of cloning', () => {
        expect (base).toContain ('let mut paramsMaxRetries: crate::value::Dict = ');
        expect (base).toContain ('Value::Dict(paramsMaxRetries)]');
    });
});
