const acorn = require('acorn');
const walk = require('acorn-walk');
const { unCamelCase } = require('../js/base/functions.js');
const camelCase = require('just-camel-case');
const binanceJsFile = './js/binance.js';
const Exchange = require('.' + binanceJsFile);

function isUpperCase(x) {
    return x && x.length > 0 && x[0] === x.toUpperCase()[0];
}

function capitalizeFirstLetter(l) {
    return l.charAt(0).toUpperCase() + l.slice(1);
}

function isUndefined(node) {
    return node.type === 'Identifier' && node.name === 'undefined';
}

function uncapitalizeFirstLetter(l) {
    return l.charAt(0).toLowerCase() + l.slice(1);
}

function functionIsAsync(node) {
    if (node.type !== 'FunctionDeclaration') {
        throw new Error("Unexpected node type");
    }
    let rv = false;
    walk.simple(node, {
        AwaitExpression(node) {
            rv = true;
        }
    });
    return rv;
}

function isAllCaps(x) {
    if (!x) {
        return false;
    }
    for (let i = 0; i < x.length; i++) {
        if (x[i] !== x[i].toUpperCase()) {
            return false;
        }
    }
    return true;
}

function unCamelCamelCase(x) {
    return !x || x.length === 0 || isUpperCase(x) ? x : unCamelCase(x);
}

function getFunctionNameFromCallee(node) {
    switch (node.type) {
        case "MemberExpression":
            if (node.property.type !== 'Identifier') {
                throw new Error("Unexpected MemberExpression");
            }
            return node.property.name;
        case "Identifier":
            return node.name;
        default:
            throw new Error("Unexpected callee type");
    }
}

function transformIdentifier(name) {
    switch (name) {
        case 'type':
            return "r#type";

        default:
            return unCamelCamelCase(name);
    }
}

function quoteString(str) {
    return str.includes('"') ? `r#"${str}"#` : `"${str}"`;
}

function getCalleeFunctionName(node) {
    if (node.type !== 'CallExpression') {
        throw new Error("Unexpected node type");
    }
    switch (node.callee.type) {
        case "MemberExpression":
            if (node.callee.property.type !== 'Identifier') {
                throw new Error("Unexpected MemberExpression");
            }
            return node.callee.property.name;
        case "Identifier":
            return node.callee.name;
        default:
            throw new Error("Unexpected callee type");
    }
}

function getReturnType(node) {
    if (node.type !== 'CallExpression') {
        throw new Error("Unexpected node type");
    }

    const fname = getCalleeFunctionName(node);
    switch (fname) {
        case 'stringEquals':
        case 'stringEq':
        case 'stringGt':
        case 'stringGe':
        case 'stringLt':
        case 'stringLe':
            return 'bool';

        default:
            return 'value';
    }
}

let FUNCTION_INFO = {};

function analyzeClassIfNeeded(className, exchange) {
    if (className in FUNCTION_INFO) {
        return;
    }

    const parts = [];
    const go = (x, k) => {
        const f = x[k];
        if (k.startsWith("_") || k === 'defaultFetch' || k === 'default_fetch' || typeof f !== 'function') {
            return;
        }
        const s = f.toString();
        if (s.includes('[native code]') || s.startsWith('class ')) {
            return;
        }
        // parts.push("/* " + k + " */");
        const line0 = s.split('\n')[0];
        if (line0.includes(") {") && line0.startsWith('async ')) {
            parts.push(`${k}: async function ${s.replace(/^async (function )?/, '')},`);
        } else if (line0.includes(") {") && !line0.startsWith('function ')) {
            parts.push(`${k}: function ${s},`);
        } else {
            parts.push(`${k}: ${s},`);
        }
    }

    if (exchange) {
        let x = Object.getPrototypeOf(exchange);
        for (const k of Object.getOwnPropertyNames(x)) {
            go(x, k);
        }
    } else {
        let x = new Exchange();
        while (x) {
            for (const k of Object.getOwnPropertyNames(x)) {
                go(x, k);
            }
            x = Object.getPrototypeOf(x);
        }
    }

    // const src = 'class Base {\n' + parts.join('\n') + '\n}';
    const src = 'var x = {\n' + parts.join('\n') + '\n};';
    // fs.writeFileSync('/Users/chris/Desktop/wat.js', src);
    // const src = fs.readFileSync("/Users/chris/Desktop/wat.js");
    const ast = acorn.parse(src, {
        ecmaVersion: 2017,
        allowSuperOutsideMethod: true
    });

    FUNCTION_INFO[className] = {};
    walk.recursive(ast, {}, {
        Property(node) {
            switch (node.value.type) {
                case 'FunctionExpression':
                case 'ArrowFunctionExpression':
                    if (node.key.type !== 'Identifier') {
                        throw new Error("Unexpected node type");
                    }

                    if (!node.value.params.some((x) => x.type === 'RestElement')) {
                        FUNCTION_INFO[className][node.key.name] = {
                            paramsCount: node.value.params.filter((x) => !(x.type === 'Identifier' && x.name === '$default')).length,
                            async: node.value.async,
                        };
                    }
                    break;

                case 'ClassExpression':
                    break;

                default:
                    throw new Error("Unexpected node type");
            }
        }
    });
}

function getArgumentCount(className, node) {
    if (node.type !== 'CallExpression') {
        throw new Error("Unexpected node type");
    }
    const argCounts = {
        fetchAccounts: 1,
        fetchBorrowRates: 1,
        fetchDepositAddresses: 2,
        fetchTradingLimits: 2,
        parseDepositAddress: 2,
        parseFundingRateHistory: 2,
        parseFundingHistory: 2,
        parseLedgerEntry: 2,
        parsePosition: 2,
        stringDiv: 3,
        throttle: 1,
        totp: 1,
    };
    const fname = getCalleeFunctionName(node);
    const rv = FUNCTION_INFO[className][fname] || FUNCTION_INFO['Exchange'][fname];
    if (!rv) {
        // if (fname in argCounts) {
        //     console.log(`coulda ${fname}`);
        // }
        // console.warn(`Unknown function ${fname}`);
        return argCounts[fname] || node.arguments.length;
    }
    return rv.paramsCount;
}

function enumerateApiMethodMapping(api, apiName = undefined, method = undefined, keyPrefixes = undefined, pathPrefix = undefined) {
    const rv = [];
    for (let [k, v] of Object.entries(api)) {
        if (!apiName) {
            Object.assign(rv, enumerateApiMethodMapping(v, k, method, [...(keyPrefixes || []), k], pathPrefix));
        } else if (!method) {
            if (['get', 'post', 'put', 'delete'].includes(k.toLowerCase())) {
                Object.assign(rv, enumerateApiMethodMapping(v, apiName, k, [...(keyPrefixes || []), k], pathPrefix));
            } else {
                Object.assign(rv, enumerateApiMethodMapping(v, apiName, undefined, [...(keyPrefixes || []), k], pathPrefix));
            }
        } else {
            if (Array.isArray(api)) {
                k = v;
            }

            let k1 = camelCase(k.split('/').map((x) => x.replace("{", "").replace("}", "")).join('_'));
            if (pathPrefix) {
                k1 = capitalizeFirstLetter(k1);
            }
            rv[camelCase([...(keyPrefixes || []), k1].join('_'))] = {
                apiName,
                method,
                path: (pathPrefix || '') + k
            };
        }
    }
    return rv;
}

module.exports = {
    transpileMethodToRust(className, method, exchange, baseMethodNames) {
        analyzeClassIfNeeded(className, exchange);

        const api = exchange?.describe().api;
        const apiMethods = new Set(api ? Object.keys(enumerateApiMethodMapping(api)) : []);
        const baseClassName = exchange ?
            Object.getPrototypeOf(Object.getPrototypeOf(exchange)).constructor.name
            : undefined;

        method = method.trim().startsWith('async ') ? method.replace(/^\s*async\s+/, 'async function ') : `function ${method}`;
        const comments = [];
        const ast = acorn.parse(method, {
            ecmaVersion: 2017,
            onComment: comments,
            allowSuperOutsideMethod: true,
        });

        const output = { value: "" };
        let currentOutput = output;

        const emit = (x) => {
            currentOutput.value += x;
        };

        const asType = (state, type) => ({
            ...state,
            asType: type
        });

        const withNewOutput = (node, state, c) => {
            const oldOutput = currentOutput;
            const rv = { value: "" };
            currentOutput = rv;
            c(node, asType(state));
            currentOutput = oldOutput;
            return rv.value;
        };

        const indent = (state) => {
            emit(' '.repeat(state.indentLevel * state.indentSize));
        }

        const isDispatchCall = (node) => {
            if (node.type !== 'CallExpression') {
                throw new Error("Unexpected node type");
            }

            return node.callee.type === 'MemberExpression' &&
                node.callee.object.type === 'ThisExpression' &&
                node.callee.property.type === 'Identifier' &&
                ((apiMethods.has(node.callee.property.name) && !node.callee.computed) ||
                    (node.callee.property.name === 'method' && node.callee.computed));
        };

        const isOverridenMethodCall = (node) => {
            if (className === 'Exchange') {
                return false;
            }

            if (
                !node.callee.computed && node.callee.type === 'MemberExpression' &&
                node.callee.object.type === 'ThisExpression' && node.callee.property.type === 'Identifier'
            ) {
                const fname = node.callee.property.name;

                if (baseMethodNames && baseMethodNames.includes(fname)) {
                    return true;
                }

                return !!FUNCTION_INFO[className][fname];
            }

            return false;
        };

        const parseAndEmitDocComment = (comment, state) => {
            let lines = comment.value.split("\n");
            lines = lines.slice(1, lines.length - 1);
            lines = lines.map((l) => l.replace(/{@link ([^}]+)}/g, "($1)"));

            const returns = [];
            const params = [];
            const descriptions = [];
            const otherTags = [];
            const otherText = [];

            for (const line of lines) {
                const line1 = line.replace(/^\s*\*\s*/g, '');
                if (line1.includes("@method") || line1.includes("@name")) {
                    // ignore
                } else if (line1.includes("@return")) {
                    returns.push(line1);
                } else if (line1.includes("@param")) {
                    params.push(line1);
                } else if (line1.includes("@description")) {
                    descriptions.push(line1);
                } else if (line1.includes("@ignore")) {
                    otherTags.push(line1);
                } else {
                    otherText.push(line1);
                }
            }

            if (returns.length > 0) {
                indent(state);
                emit("/// Returns " + returns.map((x) => uncapitalizeFirstLetter(x.replace("@returns ", "").replace("@return ", "").replace(/{[\w|\[\]]+} /, ''))).join("; "));
                emit("\n");

                indent(state);
                emit("///\n")
            }

            for (const line of otherTags) {
                indent(state);
                emit(`/// ${line}\n`);
            }

            for (const line of descriptions) {
                indent(state);
                emit(`/// ${capitalizeFirstLetter(line.replace("@description ", ""))}\n`);
            }

            for (const line of otherText) {
                indent(state);
                emit(`/// ${line}\n`);
            }

            if (params.length > 0) {
                indent(state);
                emit("///\n");
                indent(state);
                emit("/// # Arguments\n");
                indent(state);
                emit("///\n");
                for (const line of params) {
                    indent(state);
                    const line1 = line.replace("@param ", "");
                    const words = line1.split(' ');
                    const paramType = words.shift();
                    const paramName = words.shift();
                    emit('/// * `' + paramName + '` ' + paramType + ' - ' + words.join(' ') + "\n");
                }
            }
        };

        // Since we're just transpiling function by function we assume the var
        // type don't change and we don't track scope, etc.
        const varTypes = {};

        const inferType = (node) => {
            switch (node.type) {
                case 'Identifier':
                    return varTypes[node.name];

                case 'MemberExpression':
                    if (!node.computed && node.property.type === 'Identifier' && node.property.name.toLowerCase().endsWith('length')) {
                        return 'usize'
                    }
                    return undefined;

                default:
                    return undefined;
            }
        };

        walk.recursive(ast, {
            indentLevel: 1,
            indentSize: 4,
            asType: undefined
        }, {
            FunctionDeclaration(node, state, c) {
                if (comments[0] && comments[0].type === 'Block' && (comments[0].value.includes('@method') || comments[0].value.includes('@param'))) {
                    parseAndEmitDocComment(comments[0], state);
                    comments.shift();
                }

                const params = [];
                const defaultValues = {};
                for (const param of node.params) {
                    switch (param.type) {
                        case 'Identifier':
                            params.push(transformIdentifier(param.name));
                            break;

                        case 'AssignmentPattern':
                            const n = transformIdentifier(param.left.name);
                            params.push(n);
                            if (!isUndefined(param.right)) {
                                defaultValues[n] = param.right;
                            }
                            break;

                        default:
                            throw new Error('Unsupported parameter type: ' + param.type);
                    }
                }

                indent(state);
                let retType = 'Value';
                const fname = node.id.name;
                const isAsync = node.async;
                // let isAsync = fname.startsWith('fetch') ||
                //     fname.startsWith('load') || // Still need to hardcode these because the base implementation is just `todo!()`
                //     fname.startsWith('edit') ||
                //     fname.startsWith('create') ||
                //     fname.startsWith('cancel') ||
                //     fname === 'request' ||
                //     node.async;
                // functionIsAsync(node);
                let isSelfImmutable = false;
                if (
                    fname.startsWith('safe') ||
                    fname.startsWith('parse') || fname.startsWith('filter') || fname === 'marketSymbols' || fname.startsWith('convert') ||
                    fname === 'commonCurrencyCode' || fname === 'market' || fname === 'getSupportedMapping' ||
                    fname === 'describe' || fname === 'nonce' || fname === 'symbol' || fname === 'account' || fname === 'currency'
                ) {
                    isSelfImmutable = true;
                }

                // It's just because safeOrder sets `number` -- try to just byparse it I guess
                if (
                    fname === 'safeOrder' || fname === 'safeTrade' || fname === 'parseTrade' || fname === 'parseOrder' ||
                    fname === 'parseTrades' || fname === 'parseOrders'
                ) {
                    isSelfImmutable = false;
                }

                if (fname.startsWith('throw')) {
                    retType = '()';
                }

                if (fname === 'describe') {
                    emit("fn describe(&self) -> Value {\n");
                    indent({
                        ...state,
                        indentLevel: state.indentLevel + 1
                    });
                    emit(`Value::Json(serde_json::Value::from_str(r###"`);
                    emit(JSON.stringify(exchange.describe(), null, 4).split("\n").join("\n" + " ".repeat(state.indentSize * (state.indentLevel + 1))));
                    emit(`"###).unwrap())\n`);
                    indent(state);
                    emit("}");
                    return;
                }

                emit(`${isAsync ? 'async ' : ''}fn ${unCamelCamelCase(fname)}(&${isSelfImmutable ? '' : 'mut '}self`)
                if (params.length > 0) {
                    emit(", ");
                    emit(`${params.map((x) => `mut ${x}: Value`).join(', ')}`)
                }
                emit(`) -> ${retType} `);

                if (node.body.body.length === 0 && retType === 'Value') {
                    emit("{ Value::Undefined }");
                } else {
                    let appendBlock = undefined;
                    if (retType === 'Value' && node.body.body.length > 0 && node.body.body[node.body.body.length - 1].type !== 'ReturnStatement') {
                        appendBlock = "Value::Undefined";
                    }
                    c(node.body, asType({
                        ...state,
                        defaultValues,
                        functionName: fname,
                        indentLevel: state.indentLevel + 1,
                        appendBlock
                    }));
                }

            },

            BlockStatement(node, state, c) {
                emit("{\n");
                const appendBlock = state.appendBlock;
                state.appendBlock = undefined;

                if (state.defaultValues) {
                    for (const [name, value] of Object.entries(state.defaultValues)) {
                        indent(state);
                        emit(`${name} = ${name}.or_default(`);
                        c(value, asType(state, 'value'));
                        emit(");\n");
                    }
                }

                state = {
                    ...state,
                    defaultValues: undefined
                };

                for (const stmt of node.body) {
                    while (comments[0] && comments[0].start < stmt.start) {
                        switch (comments[0].type) {
                            case 'Line':
                                indent(state);
                                emit("//");
                                emit(comments[0].value);
                                emit("\n");
                                comments.shift();
                                break;

                            case 'Block':
                                indent(state);
                                emit("/*");
                                const lines = comments[0].value.split('\n');
                                for (let i = 0; i < lines.length; i++) {
                                    emit(lines[i]);
                                    if (i < lines.length - 1) {
                                        emit("\n");
                                    }
                                }
                                emit("*/\n");
                                comments.shift();
                                break;

                            default:
                                throw new Error('Unsupported comment type: ' + comments[0].type);
                        }
                    }
                    indent(state);
                    c(stmt, asType(state));
                    emit(";\n");
                }

                if (appendBlock) {
                    indent(state);
                    emit(appendBlock);
                    emit("\n");
                }

                indent({
                    ...state,
                    indentLevel: state.indentLevel - 1
                });
                emit("}");
            },

            ThrowStatement(node, state, c) {
                emit('panic!(r###"');
                c(node.argument, asType(state));
                emit('"###)');
            },

            NewExpression(node, state, c) {
                c(node.callee, asType(state));
                emit("::new(");
                for (let i = 0; i < node.arguments.length; i++) {
                    const arg = node.arguments[i];
                    c(arg, asType(state));
                    if (i < node.arguments.length - 1) {
                        emit(", ");
                    }
                }
                emit(")");
            },

            ExpressionStatement(node, state, c) {
                c(node.expression, asType(state));
            },

            AwaitExpression(node, state, c) {
                // XXX Another special case
                const callee = node.argument.callee;
                let shouldAwait = true;
                if (
                    callee.object.type === 'ThisExpression' &&
                    callee.property.type === 'Identifier' &&
                    callee.property.name === 'market'
                ) {
                    shouldAwait = false;
                }

                c(node.argument, asType({
                    ...state,
                    awaited: shouldAwait
                }, state.asType));
            },

            AssignmentExpression(node, state, c) {
                // Special case
                if (
                    node.left.type === 'MemberExpression' &&
                    node.left.object.type === 'ThisExpression' &&
                    node.left.property.type === 'Identifier' &&
                    node.left.property.name === 'number' &&
                    node.right.type === 'Identifier' && node.right.name === 'String'
                ) {
                    emit(`self.set_number_mode("String".into())`);
                    return;
                }

                if (node.left.type === 'MemberExpression') {
                    // if (node.left.property.type !== 'Identifier' && node.left.property.type !== 'Literal' && node.left.property.type !== 'MemberExpression') {
                    //     throw new Error("Unexpected MemberExpression");
                    // }

                    c(node.left.object, asType(state));
                    emit(".set(")
                    switch (node.left.property.type) {
                        case 'Literal':
                            c(node.left.property, asType(state));
                            emit('.into()');
                            break;

                        case 'Identifier':
                            // emit('"');
                            if (node.left.computed) {
                                c(node.left.property, asType(state));
                                emit('.clone()');
                            } else {
                                emit('"');
                                c(node.left.property, asType(state));
                                emit('".into()');
                            }
                            break;

                        default:
                            c(node.left.property, asType(state));
                            break;
                    }
                    emit(", ");
                    c(node.right, asType(state, 'rvalue'));
                    emit(")");
                    return;
                }

                let destructure = 0;
                if (node.left.type === 'ArrayPattern') {
                    destructure = node.left.elements.length;
                    emit("(");
                    for (let i = 0; i < node.left.elements.length; i++) {
                        const el = node.left.elements[i];
                        c(el, asType(state));
                        if (i < node.left.elements.length - 1) {
                            emit(", ");
                        }
                    }
                    emit(")");
                } else {
                    c(node.left, asType(state));
                }

                emit(' ');

                switch (node.operator) {
                    case '=':
                        emit(node.operator);
                        break;

                    case '+=':
                        emit('= ');
                        c(node.left, asType(state));
                        emit(' + ');
                        break;

                    case '-=':
                        emit('= ');
                        c(node.left, asType(state));
                        emit(' - ');
                        break;

                    case '*=':
                        emit('= ');
                        c(node.left, asType(state));
                        emit(' * ');
                        break;

                    case '/=':
                        emit('= ');
                        c(node.left, asType(state));
                        emit(' / ');
                        break;

                    default:
                        throw new Error("Unexpected assignment operator");
                }
                emit(' ');

                if (destructure > 0) {
                    emit(`shift_${destructure}(`)
                    c(node.right, asType(state, 'value'));
                    emit(")");
                } else {
                    c(node.right, asType(state, 'value'));
                }
            },

            VariableDeclaration(node, state, c) {
                for (const decl of node.declarations) {
                    c(decl, asType(state));
                }
            },

            VariableDeclarator(node, state, c) {
                switch (node.id.type) {
                    case 'Identifier':
                        const ident = transformIdentifier(node.id.name);
                        if (state.parent?.type === 'ForStatement') {
                            emit(`let mut ${ident}: usize = `);
                            c(node.init, asType(state, 'usize'));
                            varTypes[ident] = 'usize';
                        } else {
                            emit(`let mut ${ident}: Value = `);
                            c(node.init, asType(state, 'value'));
                            varTypes[ident] = 'value';
                        }
                        break;

                    case 'ArrayPattern':
                        emit("let (");
                        for (let i = 0; i < node.id.elements.length; i++) {
                            const el = node.id.elements[i];
                            emit("mut ")
                            c(el, asType(state));
                            if (i < node.id.elements.length - 1) {
                                emit(", ");
                            }
                        }
                        emit(") = ");
                        emit("shift_2(")
                        c(node.init, asType(state, 'value'));
                        emit(")");
                        break;

                    default:
                        throw new Error("Unexpected VariableDeclarator");
                }
            },

            Literal(node, state, c) {
                switch (typeof node.value) {
                    case 'number':
                        switch (state.asType) {
                            case undefined:
                            case 'usize':
                                break;

                            case 'property':
                            case 'rvalue':
                            case 'value':
                                // emit(".into()");
                                emit("Value::from(");
                                break;

                            default:
                                throw new Error("Unexpected literal type");
                        }
                        emit(node.value.toString());

                        if (node.value < -2147483648 || node.value > 2147483647) {
                            emit("i64");
                        }

                        switch (state.asType) {
                            case undefined:
                            case 'usize':
                                break;

                            case 'property':
                            case 'rvalue':
                            case 'value':
                                emit(")");
                                break;

                            default:
                                throw new Error("Unexpected literal type");
                        }
                        break;

                    case 'string':
                        switch (state.asType) {
                            case undefined:
                                break;

                            case 'value':
                            case 'rvalue':
                            case 'property':
                                emit("Value::from(");
                                break;

                            default:
                                throw new Error("Unexpected literal type");
                        }
                        emit(quoteString(node.value));
                        switch (state.asType) {
                            case undefined:
                                break;

                            case 'value':
                            case 'rvalue':
                            case 'property':
                                emit(")");
                                break;

                            default:
                                throw new Error("Unexpected literal type");
                        }
                        break;

                    case 'boolean':
                        emit(node.value ? 'true' : 'false');
                        switch (state.asType) {
                            case undefined:
                            case 'bool':
                                break;

                            case 'rvalue':
                            case 'value':
                                emit(".into()");
                                break;

                            default:
                                throw new Error("Unexpected literal type");
                        }
                        break;

                    case 'object':
                        if (node.value === null) {
                            emit("Value::null()");
                        } else {
                            throw new Error("Unexpected literal type");
                        }
                        break;

                    default:
                        throw new Error("Unexpected literal type");
                }
            },

            ConditionalExpression(node, state, c) {
                emit("if ");
                c(node.test, asType(state, 'bool'));
                // if (node.test.type !== 'BinaryExpression') {
                //     emit(".is_truthy()");
                // }
                emit(" { ");
                c(node.consequent, asType(state, 'value'));
                emit(" } else { ");
                c(node.alternate, asType(state, 'value'));
                emit(" }");
            },

            UnaryExpression(node, state, c) {
                switch (node.operator) {
                    case '!':
                        switch (state.asType) {
                            case 'value':
                                emit("(");
                                break;

                            case 'bool':
                            case undefined:
                                break;

                            default:
                                throw new Error("Unexpected asType");
                        }

                        emit(node.operator);
                        c(node.argument, asType(state, 'bool'));

                        switch (state.asType) {
                            case 'value':
                                emit(").into()");
                                break;

                            case 'bool':
                            case undefined:
                                break;

                            default:
                                throw new Error("Unexpected asType");
                        }
                        break;

                    case 'typeof':
                        c(node.argument, asType(state));
                        emit(".typeof_()");
                        break;

                    case '-':
                        c(node.argument, asType(state, 'value'));
                        emit(".neg()");
                        break;

                    default:
                        throw new Error("Unexpected unary operator");
                }
            },

            IfStatement(node, state, c) {
                emit("if ");
                c(node.test, asType(state, 'bool'));
                emit(" ");

                c(node.consequent, asType({
                    ...state,
                    indentLevel: state.indentLevel + 1
                }));
                if (node.alternate) {
                    emit(' else ');
                    if (node.alternate.type === 'IfStatement') {
                        c(node.alternate, asType({
                            ...state,
                            indentLevel: state.indentLevel
                        }));
                    } else {
                        c(node.alternate, asType({
                            ...state,
                            indentLevel: state.indentLevel + 1
                        }));
                    }
                }
            },

            LogicalExpression(node, state, c) {
                switch (node.operator) {
                    case '&&':
                    case '||':
                        switch (state.asType) {
                            case 'rvalue':
                            case 'value':
                                emit("(");
                                break;

                            case undefined:
                            case 'bool':
                                break;

                            default:
                                throw new Error("Unexpected logical expression type");
                        }

                        c(node.left, asType(state, 'bool'));
                        emit(" ");
                        emit(node.operator);
                        emit(" ");
                        c(node.right, asType(state, 'bool'));

                        switch (state.asType) {
                            case 'rvalue':
                            case 'value':
                                emit(").into()");
                                break;

                            case undefined:
                            case 'bool':
                                break;

                            default:
                                throw new Error("Unexpected logical expression type");
                        }
                        break;

                    default:
                        throw new Error("Unexpected logical operator");
                }
            },

            BinaryExpression(node, state, c) {
                switch (node.operator) {
                    case 'in':
                        c(node.right, asType(state));
                        emit(".contains_key(");
                        c(node.left, asType(state, 'value'));
                        emit(")");
                        switch (state.asType) {
                            case undefined:
                            case 'bool':
                                break;

                            case 'value':
                                emit(".into()");
                                break;

                            default:
                                throw new Error("Unexpected asType");
                        }
                        break;

                    case '===':
                    case '!==':
                    case '==':
                    case '!=':
                    case '>':
                    case '<':
                    case '>=':
                    case '<=':
                        if (state.asType === 'value') {
                            emit("(");
                        }
                        const desiredExpressionType = inferType(node.left) || 'value';
                        c(node.left, asType(state, desiredExpressionType));
                        if ((node.operator === '===' || node.operator === '==' ||
                            node.operator === '!==' || node.operator === '!=') &&
                            node.right.name === 'undefined'
                        ) {
                            if (node.operator === '===' || node.operator === '==') {
                                emit(".is_nullish()");
                            } else {
                                emit(".is_nonnullish()");
                            }
                        } else {
                            emit(" ");
                            if (node.operator === '===') {
                                emit("==");
                            } else if (node.operator === '!==') {
                                emit("!=");
                            } else {
                                emit(node.operator);
                            }
                            emit(" ");
                            c(node.right, asType(state, desiredExpressionType));
                        }

                        if (state.asType === 'value') {
                            emit(").into()");
                        }
                        break;

                    case "+":
                    case "-":
                    case "*":
                    case "/":
                    case "%":
                        c(node.left, asType(state, 'value'));
                        emit(" ");
                        emit(node.operator);
                        emit(" ");
                        c(node.right, asType(state, 'value'));
                        break;

                    default:
                        throw new Error("Unexpected binary operator: " + node.operator);
                }
            },

            CallExpression(node, state, c) {
                let argCounts = getArgumentCount(className, node);
                const retType = getReturnType(node);
                let shouldAwait = state.awaited;

                state = {
                    ...state,
                    awaited: undefined
                };

                if (isDispatchCall(node)) {
                    if (node.callee.property.name === 'method' && node.callee.computed) {
                        emit(`${capitalizeFirstLetter(className)}::dispatch(self, ` + node.callee.property.name + `, `);
                    } else {
                        emit(`${capitalizeFirstLetter(className)}::dispatch(self, "` + node.callee.property.name + `".into(), `);
                    }
                    argCounts = 2;
                } else {
                    if (isOverridenMethodCall(node)) {
                        emit(capitalizeFirstLetter(className) + "::");
                        c(node.callee.property, asType({
                            ...state,
                            parent: node
                        }));
                        emit("(self")
                        if (argCounts > 0) {
                            emit(", ");
                        }
                    } else {
                        c(node.callee, asType({
                            ...state,
                            parent: node
                        }));
                        emit("(");

                        if (node.callee.type === 'MemberExpression' && node.callee.object.type === 'Super') {
                            emit("self");
                            if (argCounts > 0) {
                                emit(", ");
                            }
                        }
                    }
                }
                for (let i = 0; i < argCounts; i++) {
                    const arg = node.arguments[i];
                    if (!arg) {
                        emit("Value::Undefined");
                    } else {
                        c(arg, asType(state, 'value'));
                    }
                    if (i < argCounts - 1) {
                        emit(", ");
                    }
                }
                emit(")");
                switch (state.asType) {
                    case undefined:
                    case 'rvalue':
                    case 'value':
                        break;

                    case 'bool':
                        if (retType !== 'bool') {
                            emit(".is_truthy()");
                        }
                        break;

                    default:
                        throw new Error("Unexpected asType");
                }

                const fname = getFunctionNameFromCallee(node.callee);

                if (fname === 'cancelOrder' || fname === 'fetchTransactionFees' || fname === 'fetchTransactionFee') {
                    shouldAwait = true;
                }

                if (shouldAwait) {
                    emit(".await");
                }
            },

            MemberExpression(node, state, c) {
                if ((node.property.type === 'Literal') || (node.object.type === 'ThisExpression' && state.parent?.type !== 'CallExpression')) {
                    c(node.object, asType(state));
                    emit(`.get(`)
                    if (node.computed && node.property.type === 'Identifier') {
                        c(node.property, asType(state, 'rvalue'));
                    } else {
                        c(node.property, asType(state, 'property'));
                    }
                    emit(`)`);

                    switch (state.asType) {
                        case undefined:
                        case 'rvalue':
                        case 'value':
                            break;

                        case 'bool':
                            emit(".is_truthy()");
                            break;

                        case 'usize':
                            emit(".into()");
                            break;

                        default:
                            throw new Error("Unexpected asType");
                    }
                } else if (node.property.type === 'Identifier' && node.property.name === 'length') {
                    c(node.object, asType(state));
                    emit(".");
                    c(node.property, asType(state, 'member'));
                    switch (state.asType) {
                        case 'usize':
                        case undefined:
                            break;

                        case 'value':
                            emit(".into()");
                            break;

                        case 'bool':
                            emit(" > 0");
                            break;

                        default:
                            throw new Error("Unexpected asType");
                    }
                } else if (node.property.type === 'Identifier' && varTypes[node.property.name] === 'usize') {
                    c(node.object, asType(state));
                    emit(".get(");
                    c(node.property, asType(state));
                    emit(".into())");
                } else if (state.parent?.type === 'CallExpression' && node.property.type === 'Identifier' && node.property.name === 'extend') {
                    if (state.parent.arguments.length === 1) {
                        c(node.object, asType(state));
                        emit(".extend_1");
                    } else if (state.parent.arguments.length === 2) {
                        // c(node.object, asType(state));
                        emit("extend_2");
                    } else if (state.parent.arguments.length === 4) {
                        throw new Error('Unsupported extend call');
                        c(node.object, asType(state));
                        emit(".extend_4");
                    } else {
                        throw new Error('Unsupported extend call');
                    }
                } else if (state.parent?.type === 'CallExpression' && node.property.type === 'Identifier' && node.property.name === 'deepExtend') {
                    if (state.parent.arguments.length === 2) {
                        c(node.object, asType(state));
                        emit(".deep_extend_2");
                    } else if (state.parent.arguments.length === 3) {
                        c(node.object, asType(state));
                        emit(".deep_extend_3");
                    } else if (state.parent.arguments.length === 4) {
                        c(node.object, asType(state));
                        emit(".deep_extend_4");
                    } else {
                        throw new Error('Unsupported deepExtend call');
                    }
                } else {
                    if (node.object.type === 'Identifier' && isUpperCase(node.object.name)) {
                        c(node.object, asType(state));
                        emit("::");
                        c(node.property, asType(state));
                    } else if (node.object.type === 'Super') {
                        c(node.object, asType(state));
                        emit("::");
                        c(node.property, asType(state));
                    } else {
                        if (state.parent?.type !== 'CallExpression') {
                            c(node.object, asType(state));
                            emit(".get(");
                            c(node.property, asType(state));
                            emit(".clone())");

                            switch (state.asType) {
                                case 'bool':
                                    emit(".is_truthy()");
                                    break;

                                case 'value':
                                case 'rvalue':
                                case undefined:
                                    break;

                                default:
                                    throw new Error("Unexpected asType");
                            }
                        } else {
                            c(node.object, asType({
                                ...state,
                                parent: node
                            }));
                            emit(".");
                            c(node.property, asType({
                                ...state,
                                parent: node
                            }));
                        }
                    }
                }
            },

            ThisExpression(node, state, c) {
                emit('self');
            },

            Identifier(node, state, c) {
                switch (node.name) {
                    case 'undefined':
                        emit('Value::Undefined');
                        break;
                    case 'null':
                        emit("Value::Json(json!(null))");
                        break;

                    case 'true':
                    case 'false':
                        emit(node.name);
                        switch (state.asType) {
                            case 'bool':
                            case undefined:
                                break;

                            case 'value':
                                emit(".into()");
                                break;

                            default:
                                throw new Error(`Unsupported type ${state.asType}`);
                        }
                        break;

                    default:
                        if (isAllCaps(node.name)) {
                            if (node.name === 'JSON') {
                                emit(node.name);
                            } else {
                                emit(node.name);
                                switch (state.asType) {
                                    case undefined:
                                    case 'value':
                                        emit(".into()");
                                        break;

                                    default:
                                        throw new Error(`Unsupported type ${state.asType}`);
                                }
                            }
                        } else {
                            switch (state.asType) {
                                case 'property':
                                    emit('"');
                                    break;

                                case undefined:
                                case 'bool':
                                case 'rvalue':
                                case 'usize':
                                case 'value':
                                case 'member':
                                    break;

                                default:
                                    throw new Error(`Unsupported type ${state.asType}`);
                            }
                            let isValueType = false;
                            if (varTypes[node.name] === 'usize') {
                                if (state.asType === 'value') {
                                    emit("Value::from(");
                                }
                                emit(node.name);
                                isValueType = true;
                            } else {
                                switch (node.name) {
                                    case 'length':
                                        if (state.asType === 'value') {
                                            emit("Value::from(");
                                        }
                                        emit('len()');
                                        isValueType = true;
                                        break;

                                    case 'apiKey':
                                        emit(node.name);
                                        break;

                                    default:
                                        emit(transformIdentifier(node.name));
                                        break;
                                }
                            }
                            switch (state.asType) {
                                case 'property':
                                    emit('".into()');
                                    break;

                                case 'usize':
                                    if (varTypes[node.name] !== 'usize') {
                                        emit(".clone().into()");
                                    }
                                    break;

                                case 'bool':
                                    emit(".is_truthy()");
                                    break;

                                case 'rvalue':
                                case 'value':
                                    if (isValueType) {
                                        emit(")");
                                    } else {
                                        emit(".clone()");
                                    }
                                    break;

                                case 'member':
                                case undefined:
                                    break;

                                default:
                                    throw new Error(`Unsupported type ${state.asType}`);
                            }
                        }
                }
            },

            ReturnStatement(node, state, c) {
                emit("return ");
                if (node.argument) {
                    c(node.argument, asType(state, 'value'));
                } else {
                    emit("Value::Undefined");
                }
            },

            UpdateExpression(node, state, c) {
                c(node.argument, asType(state));
                switch (node.operator) {
                    case "++":
                        emit(" += 1");
                        break;
                    default:
                        throw new Error("Unsupported update operator: " + node.operator);
                }
            },

            ArrayExpression(node, state, c) {
                if (node.elements.length === 0) {
                    emit("Value::new_array()");
                    return;
                }

                emit("Value::Json(serde_json::Value::Array(vec![");
                for (let i = 0; i < node.elements.length; i++) {
                    const element = node.elements[i];
                    if (!element) {
                        emit("Value::Undefined");
                    } else {
                        c(element, asType(state, 'value'));
                        emit(".into()");
                    }
                    if (i < node.elements.length - 1) {
                        emit(", ");
                    }
                }
                emit("]))");
            },

            ForStatement(node, state, c) {
                c(node.init, asType({
                    ...state,
                    parent: node
                }));
                emit(";\n");
                indent(state);
                emit("while ");
                c(node.test, asType(state, 'bool'));
                emit(" ");

                const updateOutput = withNewOutput(node.update, state, c);
                c(node.body, asType({
                    ...state,
                    indentLevel: state.indentLevel + 1,
                    appendBlock: updateOutput + ";"
                }));
            },

            WhileStatement(node, state, c) {
                emit("while ");
                c(node.test, asType(state, 'bool'));
                c(node.body, asType({
                    ...state,
                    indentLevel: state.indentLevel + 1,
                }));
            },

            ContinueStatement(node, state, c) {
                emit("continue");
            },

            BreakStatement(node, state, c) {
                emit("break");
            },

            ObjectExpression(node, state, c) {
                if (node.properties.length === 0) {
                    emit("Value::new_object()");
                    return;
                }

                // if (node.end - node.start > 1000) {
                //     throw new 
                //     emit(`Value::Json(serde_json::Value::from_str(r###"`);
                //     emit(method.slice(node.start, node.end));
                //     emit(`"###).unwrap())`);
                //     return;
                // }

                emit("Value::Json(normalize(&Value::Json(json!({");
                emit("\n");
                const state1 = asType({
                    ...state,
                    indentLevel: state.indentLevel + 1
                });
                for (let i = 0; i < node.properties.length; i++) {
                    const node1 = node.properties[i];
                    switch (node1.type) {
                        case 'Property':
                            indent(state1);
                            emit(`"${node1.key.value}": `);
                            c(node1.value, asType(state1));
                            if (i < node.properties.length - 1) {
                                emit(`,\n`);
                            }
                            break;
                        default:
                            throw new Error('Unsupported object expression type: ' + node1.type);
                    }
                }
                emit("\n");
                indent(state);
                emit("}))).unwrap())");
            },

            Super(node, state, c) {
                if (!baseClassName) {
                    throw new Error("Super not allowed here");
                }
                emit(baseClassName);
            },

            TryStatement(node, state, c) {
                // TODO Not really done
                // const state1 = { ...state, indentLevel: state.indentLevel + 1 };
                // const state2 = { ...state, indentLevel: state.indentLevel + 2 };
                // indent(state);
                c(node.block, asType(state));
                if (node.finalizer) {
                    // emit("finally! {");

                    c(node.finalizer, asType(state));
                    // emit("}\n");
                }
            },

            Program(node, state, c) {
                for (const child of node.body) {
                    c(child, state);
                }
            },
        }, {});

        return currentOutput.value + "\n";
    },

    generateRustDispatchFunction(className, exchange) {
        const capitalizedClassName = className.charAt(0).toUpperCase() + className.slice(1);
        const apiMethods = enumerateApiMethodMapping(exchange.api);
        const bodyParts = [`
async fn dispatch(&mut self, method: Value, params: Value, context: Value) -> Value {
    match method {
        Value::Json(serde_json::Value::String(ref m)) => {
            match m.as_ref() {`];
        for (const [k, v] of Object.entries(apiMethods)) {
            bodyParts.push(`                "${k}" => ${capitalizedClassName}::request(self, "${v.path}".into(), "${v.apiName}".into(), "${v.method.toUpperCase()}".into(), params, Value::Undefined, Value::Undefined, Value::Undefined, context).await,`);
        }
        bodyParts.push(`                _ => unimplemented!(),
            }
        },
        _ => unimplemented!()
    }
}`);
        return bodyParts.map((part) => part.split("\n").map((l) => `    ${l}`).join("\n")).join("\n");
    }
}