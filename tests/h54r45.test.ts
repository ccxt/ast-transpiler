import { Transpiler } from '../src/transpiler';

const transpiler = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
const rs = (body: string) => transpiler.transpileRust (`type Dict = any;\nclass T {\n    sendA (x) { return x; }\n    sendB (x) { return x; }\n    f (flag, a) {\n${body}\n    }\n}`).content;

// a typed request map handed to a call in one arm of an if / else, read again only in the other arm, moves there
describe ('h54r45: a typed map handed off in each arm of an if / else', () => {
    test ('each arm moves the map (no clone)', () => {
        const out = rs ("        const request = {};\n        request['orderId'] = a;\n        let response = undefined;\n        if (flag) {\n            response = this.sendA (request);\n        } else {\n            response = this.sendB (request);\n        }\n        return response;");
        expect (out).toContain ('Value::Map(request)');
        expect (out).not.toContain ('request.clone()');
    });
    test ('negative: a read after the if keeps the clone', () => {
        const out = rs ("        const request = {};\n        request['orderId'] = a;\n        let response = undefined;\n        if (flag) {\n            response = this.sendA (request);\n        } else {\n            response = this.sendB (request);\n        }\n        return this.sendA (request);");
        expect (out).toContain ('request.clone()');
    });
    test ('negative: a hand-off inside a loop keeps the clone', () => {
        const out = rs ("        const request = {};\n        request['orderId'] = a;\n        let response = undefined;\n        for (let i = 0; i < 3; i++) {\n            if (flag) {\n                response = this.sendA (request);\n            } else {\n                response = this.sendB (request);\n            }\n        }\n        return response;");
        expect (out).toContain ('request.clone()');
    });
});
