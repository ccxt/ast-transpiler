import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';
import { isRustTsIndexSource } from '../src/rustTranspiler';

// a parallel transpiler's temporary copy in ts/src must not change a Rust ts/src scan
describe ('rust ws relatives scan ignores temporary source copies', () => {
    const VENUE = 'import Exchange from \'../base/Exchange.js\';\nexport default class bitvavo extends Exchange {\n    handle (client) { return 1; }\n}\n';
    const CHILD = 'import bitvavo from \'./bitvavo.js\';\nexport default class child extends bitvavo {\n    handle (client) { client.resolve (2); }\n}\n';
    const relatives = (plant: string[]): boolean => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h27r10-'));
        try {
            const pro = path.join (tmp, 'ts', 'src', 'pro');
            fs.mkdirSync (pro, { recursive: true });
            fs.writeFileSync (path.join (pro, 'bitvavo.ts'), VENUE);
            for (const name of plant) { fs.writeFileSync (path.join (pro, name), CHILD); }
            const t: any = new Transpiler ({ 'verbose': false });
            const file = path.join (pro, 'bitvavo.ts');
            return t.rustTranspiler.rustWsHasWsRelatives (file, 0);
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    test ('a dot-file or foreign nooverloads copy does not count as a ws subclass', () => {
        expect (relatives ([])).toBe (false);
        expect (relatives ([ '.__bitvavoCopy.ts' ])).toBe (false);
        expect (relatives ([ 'bitvavo.nooverloads.1.ts' ])).toBe (false);
        expect (relatives ([ 'types.d.ts' ])).toBe (false);
    });
    test ('a real ws subclass still counts', () => {
        expect (relatives ([ 'child.ts' ])).toBe (true);
    });
    test ('name filter', () => {
        expect (isRustTsIndexSource ('bitvavo.ts')).toBe (true);
        expect (isRustTsIndexSource ('.__ExchangeNoOverloads.ts')).toBe (false);
        expect (isRustTsIndexSource ('Exchange.nooverloads.1.ts')).toBe (false);
    });
});

const XBASE = [
    'export interface Dict { [key: string]: any }',
    'export type Str = string | undefined;',
    'export default class Exchange {',
    '    orders: any = {};',
    '    safeDict (d: any, k: any, def: Dict = undefined): Dict { return d[k] ?? def; }',
    '    safeValue (d: any, k: any, def: any = undefined): any { return d[k] ?? def; }',
    '    safeString (d: any, k: any, def: Str = undefined): Str { return d[k] ?? def; }',
    '    safeBool (d: any, k: any, def: any = undefined): any { return d[k] ?? def; }',
    '}',
    '',
].join('\n');

const venue = (reader: string, field: string, value: string) => [
    "import Exchange, { Dict, Str } from '../base/Exchange.js';",
    'export default class venue extends Exchange {',
    '    handleOrderBook (client: any, message: Dict) {',
    "        const messageHash = 'x@' + this.safeString (message, 'market', '');",
    `        const subscription = this.${reader} (${field}, messageHash, {});`,
    "        const flagKey = 'w@' + this.safeString (message, 'market', '');",
    '        const w = this.safeBool (subscription, flagKey);',
    '        if (w === undefined) {',
    `            subscription[flagKey] = ${value};`,
    `            ${field}[messageHash] = subscription;`,
    '        }',
    '    }',
    '}',
    '',
].join('\n');

describe ('a literal written under a String key into a client.subscriptions safeDict row keeps the key a String', () => {
    const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h27r10b-'));
    afterAll (() => fs.rmSync (tmp, { 'recursive': true, 'force': true }));
    fs.mkdirSync (path.join (tmp, 'ts', 'src', 'base'), { 'recursive': true });
    fs.mkdirSync (path.join (tmp, 'ts', 'src', 'pro'), { 'recursive': true });
    fs.writeFileSync (path.join (tmp, 'ts', 'src', 'base', 'Exchange.ts'), XBASE);
    let k = 0;
    const run = (text: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        const file = path.join (tmp, 'ts', 'src', 'pro', 'venue' + (k++) + '.ts');
        fs.writeFileSync (file, text);
        return t.transpileRustByPath (file).content;
    };
    test ('positive: safeDict row, literal value: the key local stays String and the helper write lends it', () => {
        const out = run (venue ('safeDict', 'client.subscriptions', 'true'));
        expect (out).toContain ('let mut flagKey: String = ');
        expect (out).toContain ('add_element_to_object(&mut subscription, &Value::from(flagKey.as_str()), Value::Bool(true));');
    });
    test ('negative: a non-literal value keeps the boxed key', () => {
        const out = run (venue ('safeDict', 'client.subscriptions', 'message'));
        expect (out).toContain ('let mut flagKey: Value = ');
    });
    test ('negative: a nullable (undefined) write keeps the boxed key', () => {
        const out = run (venue ('safeDict', 'client.subscriptions', 'undefined'));
        expect (out).toContain ('let mut flagKey: Value = ');
    });
});
