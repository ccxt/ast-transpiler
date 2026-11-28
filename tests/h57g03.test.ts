import fs from 'fs';
import path from 'path';
import {
    Transpiler,
    installCcxtGoHooks,
    installCcxtGoLocalTypes,
    installCcxtGoIndexableTypes,
    installCcxtGoParamTypes,
    installCcxtGoDictParams,
    installFmGo5OG02,
} from '../src/transpiler';

const tmp = path.join (__dirname, 'files', 'tmp-h57g03-' + (process.env.JEST_WORKER_ID || '0'));

function makeTranspiler (extraGo: Record<string, any> = {}) {
    const t = new Transpiler ({
        go: {
            useTypeScriptChecker: true,
            ...extraGo,
        },
    });
    installCcxtGoLocalTypes (t.goTranspiler);
    installCcxtGoIndexableTypes (t.goTranspiler);
    installCcxtGoParamTypes (t.goTranspiler, extraGo);
    installCcxtGoDictParams (t.goTranspiler);
    installCcxtGoHooks (t.goTranspiler);
    installFmGo5OG02 (t.goTranspiler);
    return t;
}

function emit (name: string, body: string, extraGo: Record<string, any> = {}): string {
    const root = path.join (tmp, name, 'ts', 'src');
    fs.mkdirSync (root, { recursive: true });
    const file = path.join (root, 'demo.ts');
    fs.writeFileSync (file, `
type Str = string | undefined;
type Num = number | undefined;
class Base {
    safeString (d: any, k: string): Str { return undefined; }
    safeNumber (d: any, k: string): Num { return undefined; }
    other (s: any): void {}
}
export class Demo extends Base {
${body}
}
`);
    return makeTranspiler (extraGo).transpileGoByPath (file).content;
}

describe ('h57g03: Go parseInt operand typing', () => {
    afterAll (() => fs.rmSync (tmp, { recursive: true, force: true }));

    test ('a nil-declared Str local read by parseInt (x as string) stays *string', () => {
        const body = (read: string) => `
    run (d: any, flag: boolean): any {
        let amount: Num = 0;
        let signed: Str = undefined;
        if (flag) {
            signed = this.safeString (d, 'a');
            ${read}
        }
        const request: any = {};
        request['size'] = signed;
        return [ amount, request ];
    }`;
        const control = emit ('control', body (''));
        expect (control).toContain ('var signed *string = nil');
        const out = emit ('join', body ('amount = parseInt (signed as string);'));
        expect (out).toContain ('var signed *string = nil');
        expect (out).toContain ('ParseInt(signed)');
    });

    test ('a radix form, a cast handed to another call and a non-string join keep the box', () => {
        const radix = emit ('radix', `
    run (d: any, flag: boolean): any {
        let signed: Str = undefined;
        if (flag) {
            signed = this.safeString (d, 'a');
            return parseInt (signed as string, 16);
        }
        return signed;
    }`);
        expect (radix).toContain ('var signed any = nil');
        const handed = emit ('handed', `
    run (d: any, flag: boolean): any {
        let signed: Str = undefined;
        if (flag) {
            signed = this.safeString (d, 'a');
            this.other (signed as string);
        }
        return 1;
    }`);
        expect (handed).toContain ('var signed any = nil');
        const numeric = emit ('numeric', `
    run (d: any, flag: boolean): any {
        let signed: Num = undefined;
        if (flag) {
            signed = this.safeNumber (d, 'a');
            return parseInt (signed as any);
        }
        return 1;
    }`);
        expect (numeric).not.toContain ('var signed *string');
    });

    test ('an optional string parameter listed as a nullable string slot prints *string', () => {
        const table = { unifiedNullableStringParams: { parsePrecision: [ 0 ] } };
        const out = emit ('param', `
    parsePrecision (precision?: string): Str {
        if (precision === undefined) {
            return undefined;
        }
        const precisionNumber = parseInt (precision);
        if (precisionNumber === 0) {
            return '1';
        }
        return '0';
    }
    caller (d: any): Str {
        return this.parsePrecision (this.safeString (d, 'p'));
    }`, table);
        expect (out).toContain ('ParsePrecision(precision *string)');
        expect (out).toContain ('precision == nil');
        expect (out).toContain ('ParseInt(precision)');
        expect (out).toContain ('this.ParsePrecision(this.SafeString(d, "p"))');
        expect (() => emit ('param-number', `
    parsePrecision (precision?: number): Str {
        return undefined;
    }`, table)).toThrow ('is not a Str written only as *string');
    });
});
