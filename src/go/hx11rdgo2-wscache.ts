// @ts-nocheck
// RD-GO-2: the base ws caches (orderbooks / ohlcvs / trades / fundingRates / balance) are plain maps owned by the exchange's
// ws dispatch loop (go/v4/exchange_ws_cache.go). Handlers run on that loop and keep the plain map; code on its own goroutine
// (an async method, setBalanceCache, cleanWsData) hands the loop an operation. Folded in from ccxt build/hx10w3-G02.ts and
// build/hx10w4-OG01.ts. Every rule is keyed on the checker-resolved `this.<field>` declaration (a member of BaseExchange):
//   k in this.F                  -> this.WsCacheHas ("F", k)
//   this.F[k]                    -> this.WsCacheGet ("F", k)          (balance: WsCacheGetScalar)
//   this.F[k] = v                -> this.WsCacheSet ("F", k, v)       (balance: WsCacheSetScalar)
//   this.safeValue|safeDict (this.F, k)  -> this.WsCacheGet ("F", k) (not balance)
//   this.balance = v             -> this.WsCacheReplace ("Balance", v)
//   this.F = this.createSafeDictionary (..) -> this.WsCacheReset ("F")
//   this.F === undefined         -> (this.WsCacheSnapshot ("F") == nil)
//   any other read of this.F     -> this.WsCacheSnapshot ("F")        (a copy taken on the loop)
// A write key that is a provably non-nil `*string` local prints dereferenced, like the native map write it replaces.
import { ts } from './tsApi.js';

const OWNER_CLASS = 'BaseExchange';
// balance entries are boxed through derefScalar by the helpers the plain maps use, so its operations are the Scalar twins
const CACHES = {
    'orderbooks': { 'go': 'Orderbooks', 'get': 'WsCacheGet', 'set': 'WsCacheSet', 'scalar': false },
    'ohlcvs': { 'go': 'Ohlcvs', 'get': 'WsCacheGet', 'set': 'WsCacheSet', 'scalar': false },
    'trades': { 'go': 'Trades', 'get': 'WsCacheGet', 'set': 'WsCacheSet', 'scalar': false },
    'fundingRates': { 'go': 'FundingRates', 'get': 'WsCacheGet', 'set': 'WsCacheSet', 'scalar': false },
    'balance': { 'go': 'Balance', 'get': 'WsCacheGetScalar', 'set': 'WsCacheSetScalar', 'scalar': true },
};
// sync methods only async bodies (and the base cleanup) call
const SYNC_USER_PATH = [ 'setBalanceCache', 'cleanWsData' ];

function cacheField (go: any, node: any) {
    const SK = ts.SyntaxKind;
    const name = node?.name?.text;
    if ((node?.kind !== SK.PropertyAccessExpression) || (node.expression?.kind !== SK.ThisKeyword)
        || (typeof name !== 'string') || !Object.prototype.hasOwnProperty.call (CACHES, name)) {
        return undefined;
    }
    const decl = go.checkerOrUndefined ()?.getSymbolAtLocation (node.name)?.valueDeclaration?.resolve ();
    return ((decl?.kind === SK.PropertyDeclaration) && (decl.parent?.name?.text === OWNER_CLASS)) ? CACHES[name] : undefined;
}

// code that does not run on the dispatch loop: the nearest enclosing method is async, or one of the sync helpers they call
function userPath (node: any) {
    const SK = ts.SyntaxKind;
    for (let current = node?.parent; current; current = current.parent) {
        if ((current.kind === SK.MethodDeclaration) || (current.kind === SK.FunctionDeclaration)) {
            const isAsync = (current.modifiers ?? []).some ((m: any) => m.kind === SK.AsyncKeyword);
            return isAsync || SYNC_USER_PATH.includes (current.name?.text);
        }
    }
    return false;
}

function ownedField (go: any, node: any) {
    const field = cacheField (go, node);
    return ((field !== undefined) && userPath (node)) ? field : undefined;
}

function isAssignment (parent: any, child: any) {
    const SK = ts.SyntaxKind;
    return (parent?.kind === SK.BinaryExpression) && (parent.left === child)
        && (parent.operatorToken.kind >= SK.FirstAssignment) && (parent.operatorToken.kind <= SK.LastAssignment);
}

// `this.F`, `this.F[k]` as an assignment target, or `delete this.F[k]`: these stay on the plain map
function isWriteTarget (node: any) {
    const SK = ts.SyntaxKind;
    const parent = node.parent;
    if (isAssignment (parent, node)) {
        return true;
    }
    return (parent?.kind === SK.ElementAccessExpression) && (parent.expression === node)
        && (isAssignment (parent.parent, parent) || (parent.parent?.kind === SK.DeleteExpression));
}

function unparen (node: any) {
    while (node?.kind === ts.SyntaxKind.ParenthesizedExpression) {
        node = node.expression;
    }
    return node;
}

// `this.safeValue (this.F, k)` / `this.safeDict (this.F, k)`, no default argument, resolved to the BaseExchange method
function safeRead (go: any, node: any) {
    const SK = ts.SyntaxKind;
    const callee = node?.expression;
    if ((node?.kind !== SK.CallExpression) || (callee?.kind !== SK.PropertyAccessExpression) || (callee.expression?.kind !== SK.ThisKeyword)
        || ((callee.name?.text !== 'safeValue') && (callee.name?.text !== 'safeDict')) || (node.arguments?.length !== 2)) {
        return undefined;
    }
    const field = ownedField (go, node.arguments[0]);
    if ((field === undefined) || field.scalar) {
        return undefined;
    }
    const decl = go.checkerOrUndefined ()?.getSymbolAtLocation (callee.name)?.valueDeclaration?.resolve ();
    return (decl?.parent?.name?.text === OWNER_CLASS) ? field : undefined;
}

// a write key that a nil test, a `as string` assertion or defaulted SafeString writes proves non-nil prints dereferenced
function keyText (go: any, key: any) {
    const text = go.printNode (key, 0).trim ();
    const proven = go.goAssertedStringDeref (key) || ((key?.kind === ts.SyntaxKind.Identifier) && (go.goDeclaredTypeOfIdentifier (key) === '*string')
        && (go.goHasEnclosingNilGuard (key) || go.goDefaultedSafeStringLocal (key)));
    return proven ? '*' + text : text;
}

function isNilLiteral (node: any) {
    return (node?.kind === ts.SyntaxKind.NullKeyword) || ((node?.kind === ts.SyntaxKind.Identifier) && (node.text === 'undefined'));
}

export function installRdGo2WsCache (goTranspiler: any) {
    const flag = 'rdGo2WsCacheInstalled';
    if (goTranspiler[flag] === true) { return; }
    goTranspiler[flag] = true;
    const SK = ts.SyntaxKind;

    const printAccess = goTranspiler.printPropertyAccessExpression;
    goTranspiler.printPropertyAccessExpression = function (this: any, node: any, identation: number) {
        if ((ownedField (this, node) !== undefined) && !isWriteTarget (node)) {
            return 'this.WsCacheSnapshot("' + cacheField (this, node).go + '")';
        }
        return printAccess.call (this, node, identation);
    };

    const printElement = goTranspiler.printElementAccessExpression;
    goTranspiler.printElementAccessExpression = function (this: any, node: any, ...rest: any[]) {
        if (this.isGoElementAccessAssignmentTarget (node)) {
            return printElement.call (this, node, ...rest);
        }
        const keys: any[] = [];
        let root = node;
        while (root?.kind === SK.ElementAccessExpression) {
            keys.unshift (root.argumentExpression);
            root = root.expression;
        }
        const field = ownedField (this, root);
        if ((field === undefined) || isWriteTarget (root) || (node.parent?.kind === SK.DeleteExpression)) {
            return printElement.call (this, node, ...rest);
        }
        let acc = 'this.' + field.get + '("' + field.go + '", ' + this.printNode (keys[0], 0).trim () + ')';
        for (let i = 1; i < keys.length; i++) {
            acc = this.ELEMENT_ACCESS_WRAPPER_OPEN + acc + ', ' + this.printNode (keys[i], 0) + this.ELEMENT_ACCESS_WRAPPER_CLOSE;
        }
        return acc;
    };

    const printBinary = goTranspiler.printBinaryExpression;
    goTranspiler.printBinaryExpression = function (this: any, node: any, identation: number) {
        const op = node.operatorToken?.kind;
        if (op === SK.EqualsToken) {
            const left = node.left;
            if (left?.kind === SK.ElementAccessExpression) {
                const field = ownedField (this, left.expression);
                if ((field !== undefined) && (left.expression?.kind === SK.PropertyAccessExpression)) {
                    const value = this.goWithExprDepth (this.goExprDepth + 1, () => this.printNode (node.right, identation)).trimStart ();
                    return 'this.' + field.set + '("' + field.go + '", ' + keyText (this, left.argumentExpression) + ', ' + value + ')';
                }
            } else {
                const field = ownedField (this, left);
                if (field !== undefined) {
                    const right = unparen (node.right);
                    const callee = (right?.kind === SK.CallExpression) ? right.expression : undefined;
                    if ((callee?.kind === SK.PropertyAccessExpression) && (callee.expression?.kind === SK.ThisKeyword)
                        && (callee.name?.text === 'createSafeDictionary')) {
                        return 'this.WsCacheReset("' + field.go + '")';
                    }
                    if (field.scalar) {
                        const value = this.goWithExprDepth (this.goExprDepth + 1, () => this.printNode (node.right, identation)).trimStart ();
                        return 'this.WsCacheReplace("' + field.go + '", ' + value + ')';
                    }
                }
            }
        }
        return printBinary.call (this, node, identation);
    };

    // `k in this.F` asks the owner (the original resolves a membership test through here from both the condition and the operator)
    const printInlineInOp = goTranspiler.printInlineInOp;
    goTranspiler.printInlineInOp = function (this: any, dictNode: any, keyNode: any, dictText: string, keyText: string) {
        const field = ownedField (this, unparen (dictNode));
        if (field !== undefined) {
            return 'this.WsCacheHas("' + field.go + '", ' + keyText.trim () + ')';
        }
        return printInlineInOp.call (this, dictNode, keyNode, dictText, keyText);
    };

    // `if (!(k in this.F))`: the owner call is atomic, so a whole `if` condition drops the parentheses of the source operand
    const printPrefix = goTranspiler.printPrefixUnaryExpression;
    goTranspiler.printPrefixUnaryExpression = function (this: any, node: any, identation: number) {
        const inner = unparen (node.operand);
        if ((node.operator === SK.ExclamationToken) && (node.parent?.kind === SK.IfStatement) && (inner?.kind === SK.BinaryExpression)
            && (inner.operatorToken?.kind === SK.InKeyword) && (ownedField (this, unparen (inner.right))?.scalar === false)) {
            return this.getIden (identation) + '!' + this.printNode (inner, 0).trim ();
        }
        return printPrefix.call (this, node, identation);
    };

    // a whole-map nil test compares the copy natively, as the plain field did
    const printEquality = goTranspiler.printInlineEquality;
    goTranspiler.printInlineEquality = function (this: any, left: any, right: any, leftText: string, rightText: string, isEq: boolean) {
        const [ eq, ne ] = [ '==', '!=' ];
        if (isNilLiteral (right) && (ownedField (this, unparen (left)) !== undefined) && (leftText.indexOf ('WsCacheSnapshot') >= 0)) {
            return '(' + leftText + ' ' + (isEq ? eq : ne) + ' nil)';
        }
        if (isNilLiteral (left) && (ownedField (this, unparen (right)) !== undefined) && (rightText.indexOf ('WsCacheSnapshot') >= 0)) {
            return '(' + rightText + ' ' + (isEq ? eq : ne) + ' nil)';
        }
        return printEquality.call (this, left, right, leftText, rightText, isEq);
    };

    // the balance map keeps the printer's comma-ok init clause (over the owner's copy); the other caches ask the owner
    const dictMapType = goTranspiler.goInOpDictMapType;
    goTranspiler.goInOpDictMapType = function (this: any, dictNode: any, dictText?: string) {
        const field = ownedField (this, unparen (dictNode));
        if (field === undefined) {
            return dictMapType.call (this, dictNode, dictText);
        }
        return field.scalar ? dictMapType.call (this, unparen (dictNode), 'this.' + field.go) : undefined;
    };

    const printCall = goTranspiler.printCallExpression;
    goTranspiler.printCallExpression = function (this: any, node: any, identation: number) {
        const field = safeRead (this, node);
        if (field !== undefined) {
            return 'this.' + field.get + '("' + field.go + '", ' + this.printNode (node.arguments[1], 0).trim () + ')';
        }
        return printCall.call (this, node, identation);
    };

    // the owner's membership test is a Go bool
    const initType = goTranspiler.goTypeOfInitializer;
    goTranspiler.goTypeOfInitializer = function (this: any, node: any, printed: string) {
        const inner = unparen (node);
        if ((inner?.kind === SK.BinaryExpression) && (inner.operatorToken?.kind === SK.InKeyword)
            && (ownedField (this, unparen (inner.right)) !== undefined)) {
            return 'bool';
        }
        return initType.call (this, node, printed);
    };
}
