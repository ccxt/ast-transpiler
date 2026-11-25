import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

// a parameter the method prints as String needs no (String) checkcast as a String-method
// receiver or in a String argument slot; an any / written / defaulted parameter keeps it
describe('h42j15 java String parameter casts', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-h42j15');
    const FIXTURE = path.join(TMP, 'ts', 'src', 'bitfake.ts');
    const source =
    "class T {\n" +
    "    take (s: string): any { return s; }\n" +
    "    f1 (message: string): any { return message.toLowerCase (); }\n" +
    "    f2 (message: any): any { return message.toLowerCase (); }\n" +
    "    f3 (message: string): any { return this.take (message); }\n" +
    "    f4 (message: any): any { return this.take (message); }\n" +
    "    f5 (message: string): any { return message.split ('\\n'); }\n" +
    "    f6 (message: string): any { return message.indexOf ('x') >= 0; }\n" +
    "    f7 (message: string): any { message = message.trim (); return this.take (message); }\n" +
    "    f8 (message: string = undefined): any { return this.take (message); }\n" +
    "    f9 (status: string): any { return status.endsWith ('x'); }\n" +
    "    async a1 (message: string): Promise<any> { await this.take (message); return message.toLowerCase (); }\n" +
    "    async a2 (message: string): Promise<any> { message = message.trim (); await this.take (message); return message.toUpperCase (); }\n" +
    "}\n";
    let out: string;

    beforeAll(() => {
        fs.mkdirSync(path.join(TMP, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync(FIXTURE, source);
        const t = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        out = t.transpileJavaByPath(FIXTURE).content;
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('a String parameter is a bare String-method receiver', () => {
        expect(out).toMatch(/f1\(String message\)\s*\{\s*return message\.toLowerCase\(\);/);
        expect(out).toContain('message.split(java.util.regex.Pattern.quote(');
        expect(out).toContain('return message.indexOf("x") >= 0;');
        expect(out).toContain('return status.endsWith(');
    });

    test('a String parameter passes bare into a String slot', () => {
        expect(out).toMatch(/f3\(String message\)\s*\{\s*return this\.take\(message\);/);
    });

    test('an any parameter keeps the checkcast', () => {
        expect(out).toMatch(/f2\(Object message\)\s*\{\s*return \(\(String\)message\)\.toLowerCase\(\);/);
        expect(out).toMatch(/f4\(Object message\)\s*\{\s*return this\.take\(\(String\) \(message\)\);/);
    });

    test('a defaulted (Object-printed) parameter keeps the checkcast', () => {
        expect(out).toMatch(/f8\(Object message\)\s*\{\s*return this\.take\(\(String\) \(message\)\);/);
    });
});
