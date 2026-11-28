import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

describe ('go producer declarations: Dict request builders', () => {
    const root = path.join (__dirname, 'files', 'tmp-h10g13', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    extend (a: any, b: any = {}): Dict { return a; }\n' +
        '    async watchRequest (action: string, request: Dict): Promise<any> {\n' +
        "        request['action'] = action;\n" +
        '        return request;\n' +
        '    }\n' +
        '}\n';
    const VENUE = (ret: string, body = "        return this.extend (request, params);\n") =>
        "import { Exchange, Dict } from './base/Exchange';\n" +
        'export class ex extends Exchange {\n' +
        '    fetchOrdersRequest (symbol: string, params: Dict = {}): ' + ret + ' {\n' +
        "        const request: Dict = { 'market': symbol };\n" +
        body +
        '    }\n' +
        '    pass (p: Dict): Dict {\n' +
        '        return p;\n' +
        '    }\n' +
        '    run (symbol: string) {\n' +
        '        const request = this.fetchOrdersRequest (symbol);\n' +
        "        request['action'] = 'x';\n" +
        '        return request;\n' +
        '    }\n' +
        '}\n';
    const print = (ret: string, install = true, body?: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'ex.ts'), VENUE (ret, body));
        const t = new Transpiler ({ verbose: false, go: {} });
        if (install) { installCcxtGoLocalTypes (t.goTranspiler); }
        return t.transpileGoByPath (path.join (root, 'ex.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h10g13'), { recursive: true, force: true }));

    test ('a Dict-annotated request builder types its local and the store is native', () => {
        const out = print ('Dict');
        expect (out).toContain ('var request map[string]any = this.FetchOrdersRequest(');
        expect (out).toContain ('request["action"] = "x"');
        expect (print ('Dict', false)).toContain ('AddElementToObject(request');
    });
    test ('an unannotated builder keeps the box', () => {
        expect (print ('any')).toContain ('AddElementToObject(request');
    });
    test ('a Dict builder returning a pass-through keeps the box', () => {
        expect (print ('Dict', true, '        return this.pass (request);\n')).toContain ('AddElementToObject(request');
    });
    test ('an async map parameter fed only maps and a GetArgMap params param stores natively', () => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        const src = (extra: string) => "import { Exchange, Dict } from './base/Exchange';\n" +
            'export class ws extends Exchange {\n' +
            '    async send (action: string, request: Dict) {\n' +
            "        request['action'] = action;\n" +
            '        return request;\n' +
            '    }\n' +
            "    async a (params: Dict = {}) { return await this.send ('a', params); }\n" +
            "    async b (params: Dict = {}) { return await this.send ('b', this.extend ({}, params)); }\n" + extra +
            '}\n';
        const run = (extra: string) => {
            fs.writeFileSync (path.join (root, 'ws.ts'), src (extra));
            const t = new Transpiler ({ verbose: false, go: {} });
            installCcxtGoLocalTypes (t.goTranspiler);
            return t.transpileGoByPath (path.join (root, 'ws.ts')).content;
        };
        expect (run ('')).toContain ('request["action"] = action');
        expect (run ("    async c (x: any) { return await this.send ('c', x); }\n")).toContain ('AddElementToObject(request');
    });
});
