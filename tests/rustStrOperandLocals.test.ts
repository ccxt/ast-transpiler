import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// a `const s: string = this.safeString (x, k, '<lit>')` local (the reader's `string` overload) or a typed `+` string local
// read as an `indexOf` / `startsWith` operand or a strict-equality partner prints as a Rust `String`, not a `Value`
const files: Record<string, string> = {
 "ts/src/base/Exchange.ts": "import { safeString } from './functions/type.js';\nexport interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport default class Exchange {\n    safeString = safeString;\n    safeList (o: any, k: any, d: any[] = undefined): any[] | undefined { return o; }\n    hold (x: any): any { return x; }\n}\n",
 "ts/src/base/functions/type.ts": "type Str = string | undefined;\nconst prop = (o: any, k: any): any => o[k];\nfunction safeString (o: any, k: any, $default: string): string;\nfunction safeString (o: any, k: any, $default?: string): Str;\nfunction safeString (o: any, k: any, $default?: string): Str {\n    const x = prop (o, k);\n    if (x === undefined) return $default;\n    if (typeof x === 'string') return x;\n    return $default;\n}\nexport { safeString };\n",
 "ts/src/pro/venue.ts": "import Exchange from '../base/Exchange.js';\nimport type { Dict, Str } from '../base/Exchange.js';\nexport default class venue extends Exchange {\n    clientSubs: Dict = {};\n    findSub (topic: string) {\n        const topicParts = topic.split (':');\n        const topicSymbol: string = this.safeString (topicParts, 1, '');\n        const subs = Object.keys (this.clientSubs);\n        for (let i = 0; i < subs.length; i++) {\n            const key = subs[i];\n            if (key.indexOf (topicSymbol) >= 0) {\n                return this.clientSubs[key];\n            }\n        }\n        return undefined;\n    }\n    findPrefix (marketId: string) {\n        const keys = Object.keys (this.clientSubs);\n        for (let i = 0; i < keys.length; i++) {\n            const key = keys[i];\n            const prefix: string = 'smh::' + marketId + '::';\n            if ((key !== undefined) && key.startsWith (prefix)) {\n                return this.clientSubs[key];\n            }\n        }\n        return undefined;\n    }\n    matchKeys (rebateKeys: string[], transactionKeys: string[]) {\n        for (let i = 0; i < transactionKeys.length; i++) {\n            const transactionKey: string = this.safeString (transactionKeys, i, '');\n            for (let j = 0; j < rebateKeys.length; j++) {\n                if (rebateKeys[j] === transactionKey) {\n                    return this.hold (j);\n                }\n            }\n        }\n        return undefined;\n    }\n    matchVarDefault (rebateKeys: string[], transactionKeys: string[], fallback: string) {\n        for (let i = 0; i < transactionKeys.length; i++) {\n            const varKey: string = this.safeString (transactionKeys, i, fallback);\n            for (let j = 0; j < rebateKeys.length; j++) {\n                if (rebateKeys[j] === varKey) {\n                    return this.hold (j);\n                }\n            }\n        }\n        return undefined;\n    }\n    keyLent (m: Dict, rows: string[], loose: Dict) {\n        const lentKey: string = this.safeString (rows, 0, '');\n        const a = this.safeString (m, lentKey);\n        const optKey = this.safeString (loose, 'k');\n        const b = this.safeString (m, optKey, 'x');\n        return [ a, b, lentKey ];\n    }\n    keyAsDefault (m: Dict, rows: string[]) {\n        const selfKey: string = this.safeString (rows, 0, 'mark');\n        const c = this.safeString (m, selfKey, selfKey);\n        return c;\n    }\n    matchLoose (rebateKeys: string[], transactionKeys: string[]) {\n        for (let i = 0; i < transactionKeys.length; i++) {\n            const looseKey = this.safeString (transactionKeys, i);\n            for (let j = 0; j < rebateKeys.length; j++) {\n                if (rebateKeys[j] === looseKey) {\n                    return this.hold (j);\n                }\n            }\n        }\n        return undefined;\n    }\n}\n"
};
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-strlocal-'));
for (const [rel, text] of Object.entries (files)) {
    fs.mkdirSync (path.dirname (path.join (root, rel)), { recursive: true });
    fs.writeFileSync (path.join (root, rel), text);
}
afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

let out = '';
beforeAll (() => {
    const transpiler = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    out = transpiler.transpileRustByPath (path.join (root, 'ts/src/pro/venue.ts')).content;
});

describe ('rust string locals read as string operands', () => {
    test ('an indexOf needle on a ws-key receiver is a String local', () => {
        expect (out).toContain ('let mut topicSymbol: String = self.safeString(&topicParts, Value::Int(1), &[Value::Str("".into())]).as_str().unwrap_or("").to_string();');
        expect (out).toContain ('(key.as_deref(), Some(topicSymbol.as_str()))');
        expect (out).not.toContain ('topicSymbol: Value');
    });
    test ('a startsWith operand built by + is a String local', () => {
        expect (out).toMatch (/let mut prefix: String = format!\(/);
        expect (out).toContain ('key.as_str().zip(Some(prefix.as_str())).is_some_and(|(__s, __p)| __s.starts_with(__p))');
        expect (out).not.toContain ('prefix: Value');
    });
    test ('a literal-defaulted reader local compared with a string element is a String local', () => {
        expect (out).toContain ('let mut transactionKey: String = ');
        expect (out).toContain ('.as_str() == Some(transactionKey.as_str())');
        expect (out).not.toContain ('transactionKey: Value');
    });
    test ('a string local as the variable key of safeString is lent as &k (impl ScalarArg)', () => {
        expect (out).toContain ('let mut lentKey: String = ');
        expect (out).toMatch (/self\.safe_string_opt\([^\n]*, &lentKey, &\[\]\)/);
        expect (out).not.toContain ('&optKey');
        expect (out).not.toContain ('Value::from(lentKey.as_str()), &[]');
    });
    test ('negative: a string key that is also the default stays boxed (no move while lent)', () => {
        expect (out).not.toContain ('&selfKey, &[Value::from(selfKey');
        expect (out).not.toMatch (/self\.safe_string(_opt)?\(&m, &selfKey,/);
    });
    test ('negative: a non-literal default keeps the Value local', () => {
        expect (out).toMatch (/let mut varKey: Value = /);
    });
    test ('negative: a reader with no default stays Option<String> (missing key / wrong kind read as None)', () => {
        expect (out).toContain ('let mut looseKey: Option<String> = self.safe_string_opt(');
        expect (out).toContain ('== looseKey.as_deref()');
    });
});
