import fs from 'fs';
import path from 'path';
import * as os from 'os';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD =
    'type Dict = { [key: string]: any };\n' +
    'type Int = number | undefined;\n' +
    'export class ex {\n' +
    '    parseToInt (x: any): number { return x; }\n' +
    '    parseTimeframe (t: string): number { return 1; }\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h20g01-'));
    fs.mkdirSync (path.join (dir, 'ts', 'src'), { recursive: true });
    fs.writeFileSync (path.join (dir, 'ts', 'src', 'ex.ts'), HEAD + body + '}\n');
    const cwd = process.cwd ();
    try {
        process.chdir (dir);
        const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        installCcxtGoLocalTypes (x.goTranspiler);
        return x.transpileGoByPath ('ts/src/ex.ts').content;
    } finally {
        process.chdir (cwd);
        fs.rmSync (dir, { recursive: true, force: true });
    }
};
const method = (guard: string, expr: string): string =>
    '    async fetchX (timeframe: string, since: Int = undefined, limit: Int = undefined, params: Dict = {}) {\n' +
    '        const request: Dict = {};\n' +
    '        const duration = this.parseTimeframe (timeframe);\n' +
    '        if (' + guard + ') {\n' +
    '            request["after"] = this.parseToInt (' + expr + ');\n' +
    '        }\n' +
    '        return request;\n' +
    '    }\n';

describe ('h20g01: non-nil *int64 with a nested int64 arithmetic operand', () => {
    test ('guarded since plus a product prints the native sum', () => {
        const go = print (method ('since !== undefined', 'since + (duration * 60) * 1000'));
        expect (go).toContain ('this.ParseToInt(*since + (duration*60)*1000)');
        expect (go).not.toContain ('Add(since');
    });
    test ('guarded since minus a product prints the native difference', () => {
        const go = print (method ('since !== undefined', 'since - duration * 1000'));
        expect (go).toContain ('*since - (duration*1000)');
        expect (go).not.toContain ('Subtract(since');
    });
    test ('an unguarded since keeps the helper', () => {
        const go = print (method ('limit !== undefined', 'since + duration * 1000'));
        expect (go).toContain ('Add(since');
        expect (go).not.toContain ('*since +');
    });
    test ('a nested operand over an any box keeps the helper', () => {
        const go = print (method ('since !== undefined', 'since + params["x"] * 1000'));
        expect (go).not.toContain ('*since +');
    });
});
