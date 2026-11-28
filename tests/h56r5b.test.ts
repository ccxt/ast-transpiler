import fs from 'fs';
import path from 'path';
import {
    Transpiler,
    installCcxtGoHooks,
    installCcxtGoLocalTypes,
    installCcxtGoIndexableTypes,
    installCcxtGoParamTypes,
    installCcxtGoDictParams,
} from '../src/transpiler';

const tmp = path.join (__dirname, 'files', 'tmp-h56r5b-' + (process.env.JEST_WORKER_ID || '0'));

describe ('h56r5b: typeof string narrowing in Go (fetchWebEndpoint Trim/Split, hyperliquid Replace)', () => {
    afterAll (() => fs.rmSync (tmp, { recursive: true, force: true }));

    test ('Go: early-exit typeof !== string narrows content to string (strings.Split + strings.TrimSpace) and typeof === string narrows Str local to *string (strings.Replace)', () => {
        const root = path.join (tmp, 'go', 'ts', 'src');
        fs.mkdirSync (root, { recursive: true });
        const file = path.join (root, 'demo.ts');
        fs.writeFileSync (file, `
type Str = string | undefined;
class NullResponse extends Error {}
class BadResponse extends Error {}
export class Demo {
    id: string = '';
    parseJson (v: any): any { return v; }
    async publicPostInfo (p: any): Promise<any> { return p; }
    async fetchWebEndpoint (endpointMethod: any, returnAsJson: boolean, startRegex: Str = undefined, endRegex: Str = undefined) {
        let response: any = undefined;
        response = await this[endpointMethod] ({});
        if (response === undefined) {
            throw new NullResponse (this.id + ' empty');
        }
        if (typeof response !== 'string') {
            if ((startRegex !== undefined) || (endRegex !== undefined)) {
                throw new BadResponse (this.id + ' non-string');
            }
            return response;
        }
        let content: string = response;
        if (startRegex !== undefined) {
            const splitted_by_start = content.split (startRegex);
            if (splitted_by_start.length < 2) {
                throw new NullResponse (this.id + ' empty');
            }
            content = splitted_by_start[1];
        }
        if (endRegex !== undefined) {
            const splitted_by_end = content.split (endRegex);
            if (splitted_by_end.length < 1) {
                throw new NullResponse (this.id + ' empty');
            }
            content = splitted_by_end[0];
        }
        if (returnAsJson === true) {
            return this.parseJson (content.trim ());
        }
        return content;
    }
    async isUnified (request: any) {
        let response: Str = undefined;
        try {
            const rawResponse = await this.publicPostInfo (request);
            if (typeof rawResponse === 'string') {
                response = rawResponse;
            }
        } catch (e) {
            response = undefined;
        }
        let enabled = false;
        if (response !== undefined) {
            const cleaned = response.replace ('"', '').replace ('"', '');
            enabled = cleaned === 'unifiedAccount';
        }
        return enabled;
    }
}
`);
        const t = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 } } });
        installCcxtGoLocalTypes (t.goTranspiler);
        installCcxtGoHooks (t.goTranspiler);
        installCcxtGoIndexableTypes (t.goTranspiler);
        installCcxtGoParamTypes (t.goTranspiler);
        installCcxtGoDictParams (t.goTranspiler);
        const go = t.transpileGoByPath (file).content;
        expect (go).toContain ('responseStr, isResponseStr := response.(string)');
        expect (go).toContain ('var content string = responseStr');
        expect (go).toContain ('strings.Split(content, *startRegex)');
        expect (go).toContain ('strings.Split(content, *endRegex)');
        expect (go).toContain ('strings.TrimSpace(content)');
        expect (go).not.toMatch (/(?<![A-Za-z_.])Trim\(/);
        expect (go).not.toMatch (/(?<![A-Za-z_.])Split\(/);
        expect (go).toContain ('var response *string = nil');
        expect (go).toContain ('if rawResponseStr, ok := rawResponse.(string); ok {');
        expect (go).toContain ('strings.Replace(strings.Replace(*response,');
        expect (go).not.toMatch (/(?<![A-Za-z_.])Replace\(/);
        expect (go).not.toMatch (/(?<![A-Za-z_.])IsString\(/);
    });
});
