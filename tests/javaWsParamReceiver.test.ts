import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// a ws receiver that is a PARAMETER declared with the ws class binds `.store` / `.storeArray` natively
describe('java ws parameter receiver', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-ws-param-receiver');
    const SRC = path.join(TMP, 'ts', 'src', 'pro', 'probe.ts');
    const print = (type: string | undefined) => {
        const t = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        const printer: any = (t as any).javaTranspiler;
        printer.javaDeclaredLocalTypeResolver = (d: any) => (d?.name?.text === 'bookside' ? type : undefined);
        return t.transpileJavaByPath(SRC).content as string;
    };
    beforeAll(() => {
        fs.mkdirSync(path.dirname(SRC), { recursive: true });
        fs.writeFileSync(SRC,
            'class Venue {\n' +
            '    handleDelta (bookside, delta) {\n' +
            '        bookside.store (delta[0], delta[1]);\n' +
            '        bookside.storeArray (delta);\n' +
            '    }\n' +
            '}\n');
    });
    afterAll(() => { fs.rmSync(TMP, { recursive: true, force: true }); });

    test('a parameter declared OrderBookSide prints native calls', () => {
        const out = print('io.github.ccxt.ws.OrderBookSide');
        expect(out).toMatch(/\bbookside\.store\(/);
        expect(out).toMatch(/\bbookside\.storeArray\(delta\)/);
        expect(out).not.toContain('(io.github.ccxt.ws.OrderBookSide) bookside');
    });

    test('an untyped parameter keeps the cast', () => {
        const out = print(undefined);
        expect(out).toContain('((io.github.ccxt.ws.OrderBookSide) bookside).storeArray(delta)');
    });

    test('a parameter declared another class keeps the cast', () => {
        const out = print('java.util.List<Object>');
        expect(out).toContain('((io.github.ccxt.ws.OrderBookSide) bookside).storeArray(delta)');
    });
});
