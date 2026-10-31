// @ts-nocheck
// FM-GO5 OG02: the per-instance request id / nonce counters and the last request/response fields are owned by one
// goroutine (go/v4/exchange_request_book.go). Folded in from ccxt build/hx10w6-OG02.ts; every rule is keyed on the
// checker-resolved declaration (a member of the base `Exchange` class), never on printed text:
//   this.lockId (); <read-modify-write of this.options[k]>; this.unlockId ()  -> var x int64 = this.NextRequestId("k")
//   BaseExchange.incrementingNonce (): the whole lock/compare/store body       -> this.nextNonce (currentNonce), int64
//   this.last_http_response = undefined (+ both header resets) in a block      -> this.handOffRequestBook (reset)
//   this.last_http_response (a read through `this`)                           -> this.GetLast_http_response ()
// A span whose shape is not proven prints as before, so the site keeps its lock call and fails to compile instead of
// silently losing the mutual exclusion.
import { ts } from './tsApi.js';

const OWNER_CLASS = 'BaseExchange';

function unparen (node: any) {
    while (node?.kind === ts.SyntaxKind.ParenthesizedExpression) {
        node = node.expression;
    }
    return node;
}

// the declaration of `<recv>.<name>` when `recv` is `this` and the member is declared by the base Exchange class
function baseMemberDecl (go: any, node: any, name: string) {
    const SK = ts.SyntaxKind;
    if ((node?.kind !== SK.PropertyAccessExpression) || (node.expression?.kind !== SK.ThisKeyword) || (node.name?.text !== name)) {
        return undefined;
    }
    const decl = go.checkerOrUndefined ()?.getSymbolAtLocation (node.name)?.valueDeclaration?.resolve ();
    if ((decl === undefined) || (decl.parent?.name?.text !== OWNER_CLASS)) {
        return undefined;
    }
    return decl;
}

// `this.<method> (<n args>)` resolved to a base Exchange method
function isBaseCall (go: any, node: any, name: string, args: number) {
    node = unparen (node);
    return (node?.kind === ts.SyntaxKind.CallExpression) && ((node.arguments?.length ?? 0) === args)
        && (baseMemberDecl (go, node.expression, name) !== undefined);
}

function callStatement (go: any, stmt: any, name: string) {
    return (stmt?.kind === ts.SyntaxKind.ExpressionStatement) && isBaseCall (go, stmt.expression, name, 0);
}

// `const x = <init>` (one declarator, plain identifier)
function constDecl (stmt: any) {
    const SK = ts.SyntaxKind;
    if (stmt?.kind !== SK.VariableStatement) {
        return undefined;
    }
    const declarations = stmt.declarationList?.declarations;
    if ((declarations?.length !== 1) || (declarations[0].name?.kind !== SK.Identifier) || (declarations[0].initializer === undefined)) {
        return undefined;
    }
    return declarations[0];
}

function stringLiteral (node: any) {
    return (node?.kind === ts.SyntaxKind.StringLiteral) ? node : undefined;
}

// `this.options['k'] = <ident>` -> [key literal, ident name]
function optionWrite (go: any, stmt: any) {
    const SK = ts.SyntaxKind;
    const e = (stmt?.kind === SK.ExpressionStatement) ? stmt.expression : undefined;
    if ((e?.kind !== SK.BinaryExpression) || (e.operatorToken?.kind !== SK.EqualsToken)) {
        return undefined;
    }
    const target = e.left;
    if ((target?.kind !== SK.ElementAccessExpression) || (baseMemberDecl (go, target.expression, 'options') === undefined)
        || (stringLiteral (target.argumentExpression) === undefined) || (e.right?.kind !== SK.Identifier)) {
        return undefined;
    }
    return [ target.argumentExpression, e.right.text ];
}

// `this.safeInteger (this.options, 'k', 0)` -> the key literal
function counterRead (go: any, node: any) {
    node = unparen (node);
    if (!isBaseCall (go, node, 'safeInteger', 3)) {
        return undefined;
    }
    const [ options, key, dflt ] = node.arguments;
    if ((baseMemberDecl (go, options, 'options') === undefined) || (stringLiteral (key) === undefined)
        || (dflt?.kind !== ts.SyntaxKind.NumericLiteral) || (dflt.text !== '0')) {
        return undefined;
    }
    return key;
}

function countIdentifier (root: any, name: string) {
    let n = 0;
    const visit = (node: any) => {
        if ((node.kind === ts.SyntaxKind.Identifier) && (node.text === name)) {
            n++;
        }
        node.forEachChild (visit);
    };
    visit (root);
    return n;
}

// the statements of a lock/unlock span as `var x int64 = this.NextRequestId (k)`: [name node, key literal] or undefined
function counterSpan (go: any, body: any[], fn: any) {
    const SK = ts.SyntaxKind;
    const sumOfOne = (call: any) => {
        call = unparen (call);
        return isBaseCall (go, call, 'sum', 2) && (call.arguments[1]?.kind === SK.NumericLiteral) && (call.arguments[1].text === '1') ? call : undefined;
    };
    if (body.length === 2) {
        const decl = constDecl (body[0]);
        const write = optionWrite (go, body[1]);
        const sum = (decl !== undefined) ? sumOfOne (decl.initializer) : undefined;
        const key = (sum !== undefined) ? counterRead (go, sum.arguments[0]) : undefined;
        if ((key !== undefined) && (write !== undefined) && (write[0].text === key.text) && (write[1] === decl.name.text)) {
            return [ decl.name, key ];
        }
        return undefined;
    }
    if (body.length === 3) {
        const seed = constDecl (body[0]);
        const next = constDecl (body[1]);
        const write = optionWrite (go, body[2]);
        const key = (seed !== undefined) ? counterRead (go, seed.initializer) : undefined;
        const sum = (next !== undefined) ? sumOfOne (next.initializer) : undefined;
        if ((key !== undefined) && (sum !== undefined) && (write !== undefined) && (sum.arguments[0]?.kind === SK.Identifier)
            && (sum.arguments[0].text === seed.name.text) && (write[0].text === key.text) && (write[1] === next.name.text)
            && (countIdentifier (fn, seed.name.text) === 2)) { // the seed local is read by nothing but the increment
            return [ next.name, key ];
        }
    }
    return undefined;
}

function bareStatement (go: any, stmt: any) {
    return (go.printLeadingComments (stmt, 0) === '') && (go.printTraillingComment (stmt, 0) === '');
}

// `incrementingNonce` of the base class: a lock, a compare of nonce () against the stored last nonce, a store, an unlock
function nonceShape (go: any, method: any) {
    const SK = ts.SyntaxKind;
    if ((method?.kind !== SK.MethodDeclaration) || (method.name?.text !== 'incrementingNonce') || (method.parent?.name?.text !== OWNER_CLASS)
        || (method.parameters?.length !== 0)) {
        return undefined;
    }
    const s = method.body?.statements;
    if ((s === undefined) || (s.length !== 7)) {
        return undefined;
    }
    const current = constDecl (s[0]);
    const last = constDecl (s[2]);
    const result = constDecl (s[3]);
    const write = optionWrite (go, s[4]);
    if ((current === undefined) || (last === undefined) || (result === undefined) || (write === undefined)
        || !isBaseCall (go, current.initializer, 'nonce', 0) || !callStatement (go, s[1], 'lockLastNonce') || !callStatement (go, s[5], 'unlockLastNonce')) {
        return undefined;
    }
    const key = counterRead (go, last.initializer);
    const cond = unparen (result.initializer);
    if ((key?.text !== 'lastNonce') || (write[0].text !== 'lastNonce') || (write[1] !== result.name.text)
        || (cond?.kind !== SK.ConditionalExpression)) {
        return undefined;
    }
    const compare = unparen (cond.condition);
    const plusOne = unparen (cond.whenFalse);
    const isId = (n: any, name: string) => (n?.kind === SK.Identifier) && (n.text === name);
    if ((compare?.kind !== SK.BinaryExpression) || (compare.operatorToken?.kind !== SK.GreaterThanToken) || !isId (compare.left, current.name.text)
        || !isId (compare.right, last.name.text) || !isId (cond.whenTrue, current.name.text)
        || (plusOne?.kind !== SK.BinaryExpression) || (plusOne.operatorToken?.kind !== SK.PlusToken) || !isId (plusOne.left, last.name.text)
        || (plusOne.right?.kind !== SK.NumericLiteral) || (plusOne.right.text !== '1')
        || (s[6].kind !== SK.ReturnStatement) || !isId (s[6].expression, result.name.text)) {
        return undefined;
    }
    for (let i = 0; i < 6; i++) {
        if (!bareStatement (go, s[i])) {
            return undefined;
        }
    }
    return { 'current': current, 'result': result };
}

// `this.<field> = undefined` where the field is declared by the base class
function resetOf (go: any, stmt: any, field: string) {
    const SK = ts.SyntaxKind;
    const e = (stmt?.kind === SK.ExpressionStatement) ? stmt.expression : undefined;
    return (e?.kind === SK.BinaryExpression) && (e.operatorToken?.kind === SK.EqualsToken)
        && (e.right?.kind === SK.Identifier) && (e.right.text === 'undefined')
        && (baseMemberDecl (go, e.left, field) !== undefined);
}

const HEADER_FIELDS = [ 'last_response_headers', 'last_request_headers' ];

// statement -> { 'text': replacement } | { 'drop': true }; undefined when the block has nothing to hand off
function blockPlan (go: any, block: any) {
    const stmts = block.statements;
    if ((stmts === undefined) || (stmts.length === 0)) {
        return undefined;
    }
    let plan: Map<any, any> | undefined;
    const set = (stmt: any, value: any) => { (plan ??= new Map ()).set (stmt, value); };
    const fn = block.parent;
    const nonce = nonceShape (go, fn);
    if (nonce !== undefined) {
        const s = stmts;
        set (s[0], { 'nonce': nonce });
        for (let i = 1; i < 6; i++) {
            set (s[i], { 'drop': true, 'silent': true });
        }
    }
    for (let i = 0; i < stmts.length; i++) {
        if (callStatement (go, stmts[i], 'lockId')) {
            let end = i + 1;
            while ((end < stmts.length) && !callStatement (go, stmts[end], 'unlockId')) {
                end++;
            }
            if (end >= stmts.length) {
                continue;
            }
            const body = Array.from (stmts).slice (i + 1, end);
            const found = counterSpan (go, body, fn);
            if ((found !== undefined) && body.every ((s: any) => bareStatement (go, s)) && bareStatement (go, stmts[end])) {
                set (stmts[i], { 'counter': found });
                for (let k = i + 1; k <= end; k++) {
                    set (stmts[k], { 'drop': true, 'silent': true });
                }
                i = end;
            }
        }
    }
    const reset = Array.from (stmts).find ((s: any) => resetOf (go, s, 'last_http_response'));
    if (reset !== undefined) {
        set (reset, { 'reset': true });
        for (const s of stmts) {
            if (HEADER_FIELDS.some ((field) => resetOf (go, s, field))) {
                set (s, { 'drop': true }); // the owner's reset clears both header fields; a leading comment stays
            }
        }
    }
    return plan;
}

export function installFmGo5OG02 (goTranspiler: any) {
    const flag = 'fmGo5OG02Installed';
    if (goTranspiler[flag] === true) { return; }
    goTranspiler[flag] = true;

    const printBlock = goTranspiler.printBlock;
    goTranspiler.printBlock = function (this: any, node: any, identation: number, chainBlock = false) {
        const plan = blockPlan (this, node);
        if (plan === undefined) {
            return printBlock.call (this, node, identation, chainBlock);
        }
        const iden = this.getIden (identation + 1);
        const parts: string[] = [];
        for (const stmt of node.statements) {
            const step = plan.get (stmt);
            if (step === undefined) {
                parts.push (this.printNode (stmt, identation + 1));
            } else if (step.counter !== undefined) {
                const [ name, key ] = step.counter;
                const line = iden + 'var ' + this.printNode (name, 0) + ' int64 = this.NextRequestId(' + this.printNode (key, 0) + ')';
                parts.push (this.printNodeCommentsIfAny (stmt, identation + 1, line));
            } else if (step.nonce !== undefined) {
                const { current, result } = step.nonce;
                const cn = this.printNode (current.name, 0);
                const line = iden + 'var ' + cn + ' int64 = ' + this.printNode (current.initializer, 0) + '\n'
                    + iden + 'var ' + this.printNode (result.name, 0) + ' int64 = this.nextNonce(' + cn + ')';
                parts.push (this.printNodeCommentsIfAny (stmt, identation + 1, line));
            } else if (step.reset === true) {
                parts.push (this.printNodeCommentsIfAny (stmt, identation + 1, iden + 'this.handOffRequestBook(requestBookOp{kind: requestBookReset})'));
            } else if (step.silent !== true) {
                const comments = this.printLeadingComments (stmt, identation + 1);
                if (comments !== '') {
                    parts.push (comments.replace (/\n$/, ''));
                }
            }
        }
        return this.getBlockOpen (identation) + parts.join ('\n') + this.getBlockClose (identation, chainBlock);
    };

    // the base incrementingNonce answers an int64 (Nonce () and the owner's counter are int64 end to end)
    const printFunctionType = goTranspiler.printFunctionType;
    goTranspiler.printFunctionType = function (this: any, node: any) {
        if (nonceShape (this, node) !== undefined) {
            return 'int64';
        }
        return printFunctionType.call (this, node);
    };

    // `this.last_http_response` is the book owner's field: a read through `this` is the owner's snapshot
    const printAccess = goTranspiler.printPropertyAccessExpression;
    goTranspiler.printPropertyAccessExpression = function (this: any, node: any, identation: number) {
        const SK = ts.SyntaxKind;
        if ((node?.name?.text === 'last_http_response') && (baseMemberDecl (this, node, 'last_http_response') !== undefined)) {
            const parent = node.parent;
            const written = (parent?.kind === SK.BinaryExpression) && (parent.left === node) && (parent.operatorToken?.kind === SK.EqualsToken);
            if (!written) {
                return 'this.GetLast_http_response()';
            }
        }
        return printAccess.call (this, node, identation);
    };
}
