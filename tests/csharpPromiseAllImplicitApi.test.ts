import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as path from 'path';
jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

// RF-cs-2 a: `await Promise.all (list)` whose every element is the Task<T> of an implicit-API endpoint
// (a method of the generated ts/src/abstract/<ex>.ts class) with ONE plain T prints a List<Task<T>> and
// awaits it with Task.WhenAll; T comes from the endpoint's declared Promise<...> type.
describe('csharp promiseAll over implicit-API tasks -> Task.WhenAll (RF-cs-2 a)', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-rfcs2a-promiseall');
    const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const ABSTRACT = path.join(TMP, 'ts', 'src', 'abstract', 'x.ts');
    const VENUE = path.join(TMP, 'ts', 'src', 'v.ts');
    let out: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(BASE), { recursive: true });
        fs.mkdirSync(path.dirname(ABSTRACT), { recursive: true });
        fs.writeFileSync(BASE,
            "export type Dict = { [key: string]: any };\n" +
            "export type List = any[];\n" +
            "export class T {\n" +
            "    request(path: any, api: any, method: any, params: any, config: any): Promise<any> { return undefined as any; }\n" +
            "    extend(...args: any[]): any { return {}; }\n" +
            "}\n");
        fs.writeFileSync(ABSTRACT,
            "import { T, Dict, List } from '../base/Exchange.js';\n" +
            "export abstract class X extends T {\n" +
            "    publicGetA (params = {}): Promise<Dict> { return this.request ('a', 'public', 'GET', params, {}); }\n" +
            "    publicGetB (params = {}): Promise<Dict> { return this.request ('b', 'public', 'GET', params, {}); }\n" +
            "    publicGetL (params = {}): Promise<List> { return this.request ('l', 'public', 'GET', params, {}); }\n" +
            "    publicGetU (params = {}): Promise<Dict | List> { return this.request ('u', 'public', 'GET', params, {}); }\n" +
            "}\n");
        fs.writeFileSync(VENUE,
            "import { X } from './abstract/x.js';\n" +
            "import { List } from './base/Exchange.js';\n" +
            "export class V extends X {\n" +
            "    async own (params = {}): Promise<List> { return []; }\n" +
            // 1: a literal of two dict endpoints
            "    async literal (params = {}): Promise<any> {\n" +
            "        const r = await Promise.all ([ this.publicGetL (params), this.publicGetL (params) ]);\n" +
            "        return r;\n" +
            "    }\n" +
            // 2: a list filled by push in a loop
            "    async pushed (params = {}): Promise<any> {\n" +
            "        const promises = [];\n" +
            "        for (let i = 0; i < 2; i++) {\n" +
            "            promises.push (this.publicGetL (params));\n" +
            "        }\n" +
            "        const responses = await Promise.all (promises);\n" +
            "        for (let i = 0; i < responses.length; i++) {\n" +
            "            this.extend (responses[i], {});\n" +
            "        }\n" +
            "        return responses;\n" +
            "    }\n" +
            // 3: task locals read nowhere else, destructured result
            "    async locals (params = {}): Promise<any> {\n" +
            "        const a = this.publicGetL (params);\n" +
            "        const b = this.publicGetL (params);\n" +
            "        const [ first, second ] = await Promise.all ([ a, b ]);\n" +
            "        return [ first, second ];\n" +
            "    }\n" +
            // 4: a union endpoint keeps the widest T, the way the generated api spells it
            "    async union (params = {}): Promise<any> {\n" +
            "        const r = await Promise.all ([ this.publicGetU (params), this.publicGetU (params) ]);\n" +
            "        return r;\n" +
            "    }\n" +
            "    async dictAu03 (params = {}): Promise<any> {\n" +
            "        const r = await Promise.all ([ this.publicGetA (params), this.publicGetB (params) ]);\n" +
            "        return r;\n" +
            "    }\n" +
            // negatives
            "    async mixed (params = {}): Promise<any> {\n" +
            "        const r = await Promise.all ([ this.publicGetL (params), this.publicGetU (params) ]);\n" +
            "        return r;\n" +
            "    }\n" +
            "    async ownMethod (params = {}): Promise<any> {\n" +
            "        const r = await Promise.all ([ this.own (params), this.own (params) ]);\n" +
            "        return r;\n" +
            "    }\n" +
            "    async escapes (params = {}): Promise<any> {\n" +
            "        const promises = [];\n" +
            "        promises.push (this.publicGetL (params));\n" +
            "        this.extend (promises, {});\n" +
            "        const r = await Promise.all (promises);\n" +
            "        return r;\n" +
            "    }\n" +
            "    async localReadTwice (params = {}): Promise<any> {\n" +
            "        const a = this.publicGetL (params);\n" +
            "        this.extend (a, {});\n" +
            "        const r = await Promise.all ([ a, this.publicGetL (params) ]);\n" +
            "        return r;\n" +
            "    }\n" +
            "    async letResult (params = {}): Promise<any> {\n" +
            "        let r = await Promise.all ([ this.publicGetL (params), this.publicGetL (params) ]);\n" +
            "        r = [];\n" +
            "        return r;\n" +
            "    }\n" +
            "    async notAList (promises: any, params = {}): Promise<any> {\n" +
            "        const r = await Promise.all (promises);\n" +
            "        return r;\n" +
            "    }\n" +
            "}\n");
        const byPath = new Transpiler({ 'verbose': false, 'csharp': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        out = byPath.transpileCSharpByPath(VENUE).content;
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    // the text of one printed method
    const method = (name: string): string => {
        const start = out.indexOf(' ' + name + '(');
        expect(start).toBeGreaterThan(-1);
        const next = out.indexOf('\n    public ', start + 1);
        return out.substring(start, next < 0 ? out.length : next);
    };

    test('a literal of list endpoints awaits through a typed List<Task<T>>', () => {
        const body = method('literal');
        expect(body).toContain('List<object> r = new List<object>(await Task.WhenAll(new List<Task<List<object>>> {this.publicGetL(parameters), this.publicGetL(parameters)}));');
        expect(body).not.toContain('promiseAll(');
    });

    test('a list filled by push is declared with the task type and awaited natively', () => {
        const body = method('pushed');
        expect(body).toContain('List<Task<List<object>>> promises = new List<Task<List<object>>>() {};');
        expect(body).toContain('promises.Add(this.publicGetL(parameters));');
        expect(body).toContain('new List<object>(await Task.WhenAll(promises))');
        expect(body).not.toContain('promiseAll(');
        expect(body).not.toContain('((IList<object>)promises)');
    });

    test('task locals feeding the list are declared as their Task<T>', () => {
        const body = method('locals');
        expect(body).toContain('Task<List<object>> a = this.publicGetL(parameters);');
        expect(body).toContain('Task<List<object>> b = this.publicGetL(parameters);');
        expect(body).toContain('new List<object>(await Task.WhenAll(new List<Task<List<object>>>() {a, b}))');
        expect(body).not.toContain('promiseAll(');
    });

    test('a dict endpoint stays with the AU03 task-local plan', () => {
        const body = method('dictAu03');
        expect(body).toMatch(/await Task\.WhenAll\(hxauTask\d+_\d+, hxauTask\d+_\d+\);/);
        expect(body).not.toContain('List<Task<');
    });

    test('a union endpoint keeps the widest task type', () => {
        const body = method('union');
        expect(body).toContain('new List<object>(await Task.WhenAll(new List<Task<object>> {this.publicGetU(parameters), this.publicGetU(parameters)}))');
    });

    test.each([ 'mixed', 'ownMethod', 'escapes', 'localReadTwice', 'letResult', 'notAList' ])('%s keeps the helper', (name) => {
        const body = method(name);
        expect(body).toContain('promiseAll(');
        expect(body).not.toContain('Task.WhenAll');
    });
});
