import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

const config = {
    'verbose': false,
    'python': {
        'parser': {
            'NUM_LINES_END_FILE': 0
        }
    }
};

const TMP = path.join(__dirname, 'files', 'tmp-batch');

function writeFixture (name: string, content: string): string {
    const p = path.join(TMP, name);
    fs.writeFileSync(p, content);
    return p;
}

describe('createProgramBatch', () => {

    beforeAll(() => {
        fs.mkdirSync(TMP, { recursive: true });
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('a batch emits exactly what the per-file path emits', () => {
        const a = writeFixture('alpha.ts', 'const alpha = 1;\n');
        const b = writeFixture('beta.ts', 'const beta = 2;\n');
        const c = writeFixture('gamma.ts', 'const gamma = 3;\n');
        const files = [ a, b, c ];

        const perFile = new Transpiler(config);
        const expected = files.map ((f) => perFile.transpilePythonByPath(f).content);

        const batched = new Transpiler(config);
        const batch = batched.createProgramBatch(files);
        const actual = files.map ((f) => batch.transpilePythonByPath(f).content);

        expect(actual).toEqual(expected);
        expect(actual).toEqual([ 'alpha = 1', 'beta = 2', 'gamma = 3' ]);
    });

    test('all root files of the batch live in one program', () => {
        const a = writeFixture('one.ts', 'const one = 1;\n');
        const b = writeFixture('two.ts', 'const two = 2;\n');

        const transpiler = new Transpiler(config);
        const batch = transpiler.createProgramBatch([ a, b ]);
        const program = batch.getProgram();

        expect(program.getSourceFile(path.resolve(a))).toBeDefined();
        expect(program.getSourceFile(path.resolve(b))).toBeDefined();
    });

    test('a file that is not a root of the batch throws, and the batch stays usable', () => {
        const a = writeFixture('kept.ts', 'const kept = 1;\n');
        const b = writeFixture('survivor.ts', 'const survivor = 2;\n');

        const transpiler = new Transpiler(config);
        const batch = transpiler.createProgramBatch([ a, b ]);

        expect(() => batch.transpilePythonByPath('./does/not/exist.ts')).toThrow();
        // the context is rebuilt per call, so one bad file does not poison the batch
        expect(batch.transpilePythonByPath(b).content).toBe('survivor = 2');
        expect(batch.transpilePythonByPath(a).content).toBe('kept = 1');
    });

    test('the batch does not become the cache byPathOldProgram, and single-file transpiles still work after it', () => {
        const a = writeFixture('batched.ts', 'const batched = 1;\n');
        const b = writeFixture('single.ts', 'const single = 2;\n');

        const cache = Transpiler.createProgramCache();
        const transpiler = new Transpiler(config, cache);

        const batch = transpiler.createProgramBatch([ a ]);
        expect(batch.transpilePythonByPath(a).content).toBe('batched = 1');
        expect(cache.byPathOldProgram).not.toBe(batch.getProgram());

        // the shared host + SourceFile cache survive, so the single-file path keeps working
        expect(transpiler.transpilePythonByPath(b).content).toBe('single = 2');
    });
});
