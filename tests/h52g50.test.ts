import fs from 'fs';
import path from 'path';
import * as os from 'os';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD =
    'type Dict = { [key: string]: any };\n' +
    'type Int = number | undefined;\n' +
    'class base {\n' +
    '    safeIntegerOmitZero (o: any, k: any, d: Int = undefined): Int { return d; }\n' +
    '    iso8601 (t: any): string { return ""; }\n' +
    '}\n' +
    'export class ex extends base {\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h52g50-'));
    fs.mkdirSync (path.join (dir, 'ts', 'src'), { recursive: true });
    fs.writeFileSync (path.join (dir, 'ts', 'src', 'ex.ts'), HEAD + body + '}\n');
    const cwd = process.cwd ();
    try {
        process.chdir (dir);
        const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        installCcxtGoLocalTypes (x.goTranspiler);
        return x.transpileGoByPath ('ts/src/ex.ts').content;
    } finally {
        process.chdir (cwd);
        fs.rmSync (dir, { recursive: true, force: true });
    }
};

describe ('h52g50: safeIntegerOmitZero locals take the hand-written *int64', () => {
    test ('a timestamp local read into a result dict is *int64', () => {
        const out = print (
            '    parseThing (info: Dict): Dict {\n' +
            '        const timestamp = this.safeIntegerOmitZero (info, "ts");\n' +
            '        return { "timestamp": timestamp, "datetime": this.iso8601 (timestamp) };\n' +
            '    }\n');
        expect (out).toContain ('var timestamp *int64 = this.SafeIntegerOmitZero(info, "ts")');
    });
    test ('a local that is later written with another kind stays boxed', () => {
        const out = print (
            '    parseThing (info: Dict): Dict {\n' +
            '        let timestamp = this.safeIntegerOmitZero (info, "ts");\n' +
            '        if (timestamp === undefined) {\n' +
            '            timestamp = "none";\n' +
            '        }\n' +
            '        return { "timestamp": timestamp };\n' +
            '    }\n');
        expect (out).not.toContain ('var timestamp *int64');
    });
    test ('an unrelated Int method keeps its box', () => {
        const out = print (
            '    otherOmitZero (o: any, k: any): any { return undefined; }\n' +
            '    parseThing (info: Dict): Dict {\n' +
            '        const timestamp = this.otherOmitZero (info, "ts");\n' +
            '        return { "timestamp": timestamp };\n' +
            '    }\n');
        expect (out).toContain ('var timestamp any = this.OtherOmitZero(info, "ts")');
    });
});
