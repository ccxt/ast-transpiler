import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// an async venue method with no valued return prints CompletableFuture<Void> when the repo facts
// (printer.javaRepoMethodUses) say every declaration of the name agrees and no hand-written Java uses it
describe('java async void return', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-async-void-return');
    const SRC = path.join(TMP, 'ts', 'src', 'pro', 'probe.ts');
    const print = (uses: (name: string) => any) => {
        const t = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        const printer: any = (t as any).javaTranspiler;
        printer.javaRepoMethodUses = (name: string) => uses(name);
        return t.transpileJavaByPath(SRC).content as string;
    };
    const facts = (asyncVoid: boolean, handWritten = false) => () => ({ declared: 2, mentions: 1, handWritten, asyncVoid, calls: [] });
    beforeAll(() => {
        fs.mkdirSync(path.dirname(SRC), { recursive: true });
        fs.writeFileSync(SRC,
            'class Venue {\n' +
            '    async pong (client: any, message: any) {\n' +
            '        if (message === undefined) {\n' +
            '            return;\n' +
            '        }\n' +
            '        await client.send ({ \'op\': \'pong\' });\n' +
            '    }\n' +
            '}\n');
    });
    afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

    test('the whole repo agrees: CompletableFuture<Void>', () => {
        expect(print(facts(true))).toMatch(/CompletableFuture<Void> pong\(/);
    });
    test('another declaration returns a value: Object stays', () => {
        expect(print(facts(false))).toMatch(/CompletableFuture<Object> pong\(/);
    });
    test('hand-written Java mentions it: Object stays', () => {
        expect(print(facts(true, true))).toMatch(/CompletableFuture<Object> pong\(/);
    });
    test('no repo facts: Object stays', () => {
        expect(print(() => undefined)).toMatch(/CompletableFuture<Object> pong\(/);
    });
});
