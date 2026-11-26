import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a typed `String` key that is an insert key and then keys a read on a held Dict local inside the inserted value
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    id: string = \'\';\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
    '    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    extend (...args: any): any { return args[0]; }\n' +
    '    sort (x: any): any { return x; }\n' +
    '    isDictionary (x: any): boolean { return true; }\n}\n';
const venue = "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    '    sortIt (value: any): any {\n        if (this.isDictionary (value)) {\n            const result: Dict = {};\n            const valueCopy: Dict = this.extend ({}, value);\n' +
    '            const keys = Object.keys (valueCopy);\n            const sortedKeys: string[] = this.sort (keys);\n            for (let i = 0; i < sortedKeys.length; i++) {\n' +
    "                const key = this.safeString (sortedKeys, i, '');\n                result[key] = this.sortIt (valueCopy[key]);\n            }\n            return result;\n        }\n        return value;\n    }\n" +
    '    keepIt (value: any): any {\n        const result: Dict = {};\n        const valueCopy: Dict = this.extend ({}, value);\n' +
    "        const key = this.safeString (value, 'k', '');\n        result[key] = this.keepIt (valueCopy[key]);\n        result['again'] = key;\n        return result;\n    }\n}\n";

describe ('rust typed String key of a held Dict read inside its own insert value', () => {
    let output = '';
    beforeAll (() => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h55r49-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
        fs.rmSync (root, { recursive: true, force: true });
    });
    const fn = (name: string): string => {
        const at = output.indexOf ('fn ' + name + '(');
        const end = output.indexOf ('\n    pub ', at + 10);
        return output.slice (at, end < 0 ? undefined : end);
    };
    test ('the key stays a String and the held read takes it (fails on the base printer)', () => {
        const b = fn ('sortIt');
        expect (b).toContain ('let mut key: String = ');
        expect (b).toContain ('self.sortIt(valueCopy.get(key.as_str()).cloned().unwrap_or(Value::Null))');
        expect (b).not.toContain ('KeyRead::read(');
        expect (b).not.toContain ('stringify_param(&key)');
        expect (b).not.toContain ('get_value(');
    });
    test ('negative: a key used again after the insert value keeps its old form', () => {
        const b = fn ('keepIt');
        expect (b).not.toContain ('valueCopy.get(key.as_str())');
    });
});
