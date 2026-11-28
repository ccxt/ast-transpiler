import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// the hand-written Go DecodeProtoMsg returns map[string]any, so its result local and the handler it feeds are typed
describe ('h48g06: decodeProtoMsg result is a Go map', () => {
    const BASE = 'export type Dict = { [key: string]: any };\nexport type Str = string | undefined;\nexport class Exchange {\n'
        + '    decodeProtoMsg (data: any): Dict { return data; }\n'
        + '    decodeOther (data: any) { return data; }\n'
        + '    safeString (a: any, k: any, d: any = undefined): Str { return a; }\n}\n';
    const run = (members: string): string => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h48g06-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { recursive: true });
            fs.mkdirSync (path.join (src, 'pro'), { recursive: true });
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            const file = path.join (src, 'pro', 'ex.ts');
            fs.writeFileSync (file, 'import { Exchange, Dict, Str } from \'../base/Exchange\';\nexport default class ex extends Exchange {\n' + members + '}\n');
            const inst: any = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 } } });
            installCcxtGoHooks (inst.goTranspiler);
            return inst.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { recursive: true, force: true });
        }
    };
    const body = (call: string) => '    handleBinaryMessage (client: any, message: any) {\n'
        + '        const decodedMessage = this.' + call + ' (message);\n'
        + '        const c = this.safeString (decodedMessage, \'channel\');\n'
        + '        return c;\n'
        + '    }\n';
    test ('positive: decodeProtoMsg result local prints map[string]any', () => {
        const out = run (body ('decodeProtoMsg'));
        expect (out).toContain ('var decodedMessage map[string]any = this.DecodeProtoMsg(message)');
    });
    test ('negative: an untyped base method result stays boxed', () => {
        const out = run (body ('decodeOther'));
        expect (out).not.toContain ('decodedMessage map[string]any');
    });
});
