import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a parameter typed by a class with a string index signature is that class in Java, never a Map:
// a literal-key read on it keeps the helper (no Map checkcast); a Dict parameter keeps its Map read
const source = 'export interface Dict { [key: string]: any }\n' +
    'export class BaseExchange {\n    [key: string]: any;\n    id: string = \'x\';\n' +
    '    fromClass (other: BaseExchange): any {\n        return \'got \' + other[\'id\'];\n    }\n' +
    '    fromDict (row: Dict): any {\n        return \'got \' + row[\'id\'];\n    }\n' +
    '    fromAny (other: any): any {\n        return \'got \' + other[\'id\'];\n    }\n' +
    '}\n';

describe ('java class-typed parameter with an index signature', () => {
    let output = '';
    beforeAll (() => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h48r03-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        const file = path.join (root, 'ts', 'src', 'base', 'Exchange.ts');
        fs.writeFileSync (file, source);
        const t = new Transpiler ({ 'verbose': false, 'java': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileJavaByPath (file).content;
        fs.rmSync (root, { recursive: true, force: true });
    });
    const body = (name: string, next: string) => output.slice (output.indexOf (name + '('), next === '' ? undefined : output.indexOf (next + '('));
    test ('a class-typed parameter is not cast to a Map', () => {
        expect (body ('fromClass', 'fromDict')).not.toMatch (/\(\((java\.util\.)?Map<String, Object>\) ?other\)/);
    });
    test ('a Dict parameter still reads as a Map', () => {
        expect (body ('fromDict', 'fromAny')).not.toContain ('GetValue');
    });
    test ('an any parameter keeps the helper', () => {
        expect (body ('fromAny', '')).toContain ('Helpers.GetValue(other, "id")');
    });
});
