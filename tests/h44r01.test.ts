import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// a ws error handler declared `boolean` whose try block always returns or throws: the closure yields the bool
const base = "export interface Dict { [key: string]: any }\nexport class ExchangeError extends Error {}\nexport default class Exchange {\n    id: string = '';\n    safeString (o: any, k: any, d: any = undefined): string | undefined { return o[k]; }\n}\n";
const handler = (decl: string, tryBody: string, catchBody: string) => "import Exchange from '../base/Exchange.js';\nimport { ExchangeError } from '../base/Exchange.js';\nimport type { Dict } from '../base/Exchange.js';\n"
    + "export default class venue extends Exchange {\n"
    + `    handleErrorMessage (client: any, message: Dict)${decl} {\n        const code = this.safeString (message, 'code');\n        try {\n${tryBody}\n        } catch (error) {\n${catchBody}\n        }\n    }\n`
    + "    handleMessage (client: any, message: Dict) {\n        if (this.handleErrorMessage (client, message) === true) {\n            return;\n        }\n    }\n}\n";

function build (venue: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astfx-h44r01-'));
    fs.mkdirSync(path.join(root, 'ts/src/base'), { recursive: true });
    fs.mkdirSync(path.join(root, 'ts/src/pro'), { recursive: true });
    fs.writeFileSync(path.join(root, 'ts/src/base/Exchange.ts'), base);
    fs.writeFileSync(path.join(root, 'ts/src/pro/venue.ts'), venue);
    const t = new Transpiler({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    try { return t.transpileRustByPath(path.join(root, 'ts/src/pro/venue.ts')).content; } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

const returnsTry = "            if (code !== undefined) {\n                throw new ExchangeError (code);\n            }\n            return false;";
const rejectCatch = "            client.reject (error);\n            return true;";

describe('rust try/catch in a method typed -> bool', () => {
    test('try block that returns: the closure yields bool and the Ok arm returns it', () => {
        const out = build (handler(': boolean', returnsTry, rejectCatch));
        expect(out).toMatch(/fn handleErrorMessage\([^)]*\) -> bool \{/);
        expect(out).toContain("let _try_result: Result<bool, String> = ('__try: {");
        expect(out).toMatch(/\n\s*\}\);\n\s*match _try_result \{ Ok\(__try_ret\)/);
        expect(out).toContain("break '__try Ok(false);");
        expect(out).toContain("break '__try Err(crate::exchange_errors::exchange_error(");
        expect(out).toContain('match _try_result { Ok(__try_ret) => return __try_ret, Err(_try_err) => { let error: crate::error::CaughtError = crate::error::CaughtError::from_panic(Box::new(_try_err));');
        expect(out).not.toContain('catch_unwind');
    });
    test('try block that only throws, catch that rethrows or returns false', () => {
        const out = build (handler(': boolean', "            throw new ExchangeError ('x');", "            if (code === undefined) {\n                throw error;\n            }\n            return false;"));
        expect(out).toContain("'__try: {");
        expect(out).toContain('Ok(__try_ret) => return __try_ret');
        // the rethrow in the catch arm is a real panic, not a break
        expect(out).toContain('panic!("{}", error);');
    });
    test('try block with a call that may panic keeps the catch_unwind closure', () => {
        const out = build (handler(': boolean', "            this.check (code);\n            return false;", rejectCatch).replace("    handleMessage", "    check (c: any) {\n    }\n    handleMessage"));
        expect(out).toContain('std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| -> bool {');
        expect(out).not.toContain("'__try");
    });
    test('a throw of a non-error value keeps the closure', () => {
        const out = build (handler(': boolean', "            throw code;", rejectCatch));
        expect(out).not.toContain("'__try");
    });
    test('catch that ignores its binding prints Err(_)', () => {
        const out = build (handler(': boolean', returnsTry, "            return false;"));
        expect(out).toContain('Ok(__try_ret) => return __try_ret, Err(_) => {');
        expect(out).toContain("'__try: {");
    });
    test('catch that falls through to a return after the try', () => {
        const out = build (handler(': boolean', returnsTry, "            client.reject (error);").replace("        }\n    }\n    handleMessage", "        }\n        return true;\n    }\n    handleMessage"));
        expect(out).toContain('Ok(__try_ret) => return __try_ret, Err(_try_err) => {');
        expect(out).not.toContain('catch_unwind');
        expect(out).toMatch(/\} \}\n\s*return true;/);
    });
    test('negative: no declaration keeps the Value try lowering', () => {
        const out = build (handler('', returnsTry, rejectCatch));
        expect(out).not.toContain('|| -> bool {');
        expect(out).toContain('std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {');
    });
    test('negative: a try block that can fall through keeps the old form', () => {
        const out = build (handler(': boolean', "            if (code !== undefined) {\n                return true;\n            }", "            return false;") .replace("        }\n    }\n    handleMessage", "        }\n        return false;\n    }\n    handleMessage"));
        expect(out).not.toContain('|| -> bool {');
    });
});
