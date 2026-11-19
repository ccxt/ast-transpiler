import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('go statement ternary of one arm type prints an if/else', () => {
    const dir = path.join (__dirname, 'files', 'tmp-h15x01');
    afterAll (() => fs.rmSync (dir, { recursive: true, force: true }));
    const base = "export default class Exchange {\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n}\n";
    const venue = "import Exchange from './base/Exchange.js';\nexport default class venue extends Exchange {\n    run (flag: boolean, a: any, b: any): any {\n        const request = {};\n        request['type'] = flag ? 1 : 2;\n        request['mixed'] = flag ? a : 2;\n        return request;\n    }\n}\n";
    const t = new Transpiler ({ verbose: false });
    fs.mkdirSync (path.join (dir, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (dir, 'ts/src/base/Exchange.ts'), base);
    fs.writeFileSync (path.join (dir, 'ts/src/venue.ts'), venue);
    test ('same-type arms store natively', () => {
        const out = t.transpileGoByPath (path.join (dir, 'ts/src/venue.ts')).content;
        expect (out).toMatch (/if (?:EvalTruthy\(flag\)|flag) \{\n\s*request\["type"\] = 1\n\s*\} else \{\n\s*request\["type"\] = 2\n\s*\}/);
    });
    test ('a boxed arm keeps the literal', () => {
        const out = t.transpileGoByPath (path.join (dir, 'ts/src/venue.ts')).content;
        expect (out).not.toMatch (/request\["mixed"\] = a\n/);
    });
});
