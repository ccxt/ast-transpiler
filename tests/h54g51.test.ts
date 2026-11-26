import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a nil-seeded Str written from Go string concatenations and read only as a hash slot of cleanUnsubscription takes *string
describe ('h54g51: a nil-seeded Str hash written from Go strings and read only by cleanUnsubscription', () => {
    const BASE = 'export type Dict = { [key: string]: any };\nexport type Str = string | undefined;\n'
        + 'export class Exchange {\n'
        + '    urls: any = {};\n'
        + '    safeString (a: any, k: any, d: any = undefined): Str { return a; }\n'
        + '    safeBool (a: any, k: any, d: any = undefined): boolean { return a; }\n'
        + '    client (url: any): any { return url; }\n'
        + '    async watch (url: any, messageHash: any, message: any = undefined, subscribeHash: any = undefined): Promise<any> { return url; }\n'
        + '    keep (x: any): any { return x; }\n'
        + '    cleanUnsubscription (client: any, subHash: Str, unsubHash: Str, subHashIsPrefix = false) { }\n}\n';
    const run = (members: string): string => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h54g51-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { recursive: true });
            fs.mkdirSync (path.join (src, 'pro'), { recursive: true });
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            fs.writeFileSync (path.join (src, 'venue.ts'), 'import { Exchange } from \'./base/Exchange\';\nexport default class venue extends Exchange {\n}\n');
            const file = path.join (src, 'pro', 'venue.ts');
            fs.writeFileSync (file, 'import venueRest from \'../venue\';\nexport default class venue extends venueRest {\n' + members + '}\n');
            const inst: any = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 } } });
            installCcxtGoHooks (inst.goTranspiler);
            return inst.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { recursive: true, force: true });
        }
    };
    const fn = (use: string, elseArm = '') => '    h (client: any, symbol: string, timeframe: string, isUta: boolean) {\n'
        + '        let messageHash: Str = undefined;\n'
        + '        let subMessageHash: Str = undefined;\n'
        + '        if (isUta) {\n'
        + '            messageHash = \'unsubscribe:kline:\' + symbol;\n'
        + '            subMessageHash = \'kline:\' + symbol;\n'
        + '        } else if (timeframe !== \'\') {\n'
        + '            messageHash = \'unsubscribe:candles:\' + timeframe + \':\' + symbol;\n'
        + '            subMessageHash = \'candles:\' + timeframe + \':\' + symbol;\n'
        + '        }' + elseArm + '\n'
        + use
        + '    }\n';
    test ('both hashes read only by cleanUnsubscription: *string, writes stored through a string local', () => {
        const out = run (fn ('        this.cleanUnsubscription (client, subMessageHash, messageHash);\n'));
        expect (out).toContain ('var messageHash *string = nil');
        expect (out).toContain ('var subMessageHash *string = nil');
        expect (out).not.toMatch (/var \w*[mM]essageHash any = nil/);
        expect (out).toMatch (/messageHash = &messageHashStr\b/);
        expect (out).toContain ('this.CleanUnsubscription(client, subMessageHash, messageHash)');
    });
    test ('nil when no arm writes: the nil pointer reaches the slot', () => {
        const out = run (fn ('        this.cleanUnsubscription (client, subMessageHash, messageHash);\n'));
        expect (out).not.toContain ('SafeStringPtr(');
    });
    test ('a hash also handed to another method keeps the box', () => {
        const out = run (fn ('        this.cleanUnsubscription (client, subMessageHash, messageHash);\n        this.keep (messageHash);\n'));
        expect (out).toContain ('var messageHash any = nil');
        expect (out).toContain ('var subMessageHash *string = nil');
    });
    test ('a hash written from an untyped value keeps the box', () => {
        const out = run (fn ('        messageHash = this.keep (client);\n        this.cleanUnsubscription (client, subMessageHash, messageHash);\n'));
        expect (out).toContain ('var messageHash any = nil');
        expect (out).toContain ('var subMessageHash *string = nil');
    });
    test ('a hash written on every path stays a plain string (no pointer)', () => {
        const out = run (fn ('        this.cleanUnsubscription (client, subMessageHash, messageHash);\n',
            ' else {\n            messageHash = \'u\';\n            subMessageHash = \'s\';\n        }'));
        expect (out).not.toContain ('var messageHash *string');
        expect (out).not.toContain ('var messageHash any = nil');
    });
    test ('a Str seed written only from literals and stored in a dict keeps its box (no raw literal into *string)', () => {
        const out = run ('    p (op: Str): any {\n'
            + '        let direction: Str = undefined;\n'
            + '        if (op === \'funding\') {\n            direction = \'in\';\n        } else if (op === \'trade\') {\n            direction = undefined;\n        } else if (op === \'fee\') {\n            direction = \'out\';\n        }\n'
            + '        return this.keep ({ \'direction\': direction });\n    }\n');
        expect (out).not.toContain ('var direction *string');
        expect (out).not.toMatch (/\*string[\s\S]*direction = "in"/);
    });
});
