import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// the truthiness of a nullable-bool pair result reads its pointer, not the re-boxed value
describe ('h28-G12: nullable handleOptionBoolAndParams result in a condition', () => {
    const HEAD = 'class BaseExchange {\n'
        + '    handleOptionBoolAndParams (params: object, methodName: string, optionName: string, defaultValue: boolean = undefined): [ boolean, any ] { return [ defaultValue, params ]; }\n'
        + '    handleOptionAndParams (params: object, methodName: string, optionName: string, defaultValue: any = undefined): [ any, any ] { return [ defaultValue, params ]; }\n'
        + '    keep (x: any): void { }\n}\nclass Exchange extends BaseExchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h28g12-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nclass x extends Exchange {\n' + body + '}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            const t: any = new Transpiler (config);
            installCcxtGoLocalTypes (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const method = (b: string) => '    f (params: any, uta: any): any { ' + b + ' }\n';
    test ('a boxed nullable result in an if prints the pointer test', () => {
        const out = print (method ("const [ u, p ] = this.handleOptionBoolAndParams (params, 'm', 'uta', uta); let t = 'A'; if (u) { t = 'B'; } this.keep (u); return [ t, p ];"));
        expect (out).toContain ('u := func() any {');
        expect (out).toContain ('if (uPtr != nil && *uPtr) {');
        expect (out).not.toContain ('EvalTruthy(u)');
    });
    test ('a negated boxed nullable result prints the negated pointer test', () => {
        const out = print (method ("const [ u, p ] = this.handleOptionBoolAndParams (params, 'm', 'uta', uta); let t = 'A'; if (!u) { t = 'B'; } this.keep (u); return [ t, p ];"));
        expect (out).not.toContain ('EvalTruthy(u)');
        expect (out).toContain ('uPtr != nil && *uPtr');
    });
    test ('a handleOptionAndParams result keeps EvalTruthy', () => {
        const out = print (method ("const [ u, p ] = this.handleOptionAndParams (params, 'm', 'uta', uta); let t = 'A'; if (u) { t = 'B'; } this.keep (u); return [ t, p ];"));
        expect (out).not.toContain ('uPtr != nil');
    });
    test ('a literal default (non-nullable pair) does not use the pointer test', () => {
        const out = print (method ("const [ u, p ] = this.handleOptionBoolAndParams (params, 'm', 'uta', false); let t = 'A'; if (u) { t = 'B'; } this.keep (u); return [ t, p ];"));
        expect (out).not.toContain ('uPtr');
    });
    test ('a let-bound result keeps EvalTruthy', () => {
        const out = print (method ("let [ u, p ] = this.handleOptionBoolAndParams (params, 'm', 'uta', uta); u = params; let t = 'A'; if (u) { t = 'B'; } this.keep (u); return [ t, p ];"));
        expect (out).not.toContain ('(uPtr != nil && *uPtr)');
    });
    test ('a boxed local used only in conditions keeps EvalTruthy (it would be unused)', () => {
        const out = print (method ("const [ u, p ] = this.handleOptionBoolAndParams (params, 'm', 'uta', uta); let t = 'A'; if (u) { t = 'B'; } return [ t, p ];"));
        expect (out).not.toContain ('(uPtr != nil && *uPtr)');
    });
});
