
# AST-Transpiler
[![Build](https://github.com/ccxt/ast-transpiler/actions/workflows/node.js.yml/badge.svg)](https://github.com/ccxt/ast-transpiler/actions/workflows/node.js.yml)
![Jest coverage](./badges/coverage-jest%20coverage.svg)
![Functions](./badges/coverage-functions.svg)
![Lines](./badges/coverage-lines.svg)
![Statements](./badges/coverage-statements.svg)

**⚠️ WORK IN PROGRESS** 

`ast-transpiler` is a library that allows transpiling typescript code to different languages using typescript's abstract syntax tree (AST) and type checker in an easy way abstracting most of the complexity behind the process.

### [Install](#-installation) · [Usage](#-usage) · [Languages](#-languages) · [Options](#-options) · [Overrides](#-overrides) · [Examples](https://github.com/carlosmiei/ast-transpiler/tree/master/examples) 

As expected, it's not possible to transpile Typescript to Python or PHP in a 1:1 parity because they are different languages a lot of features are not interchangeable. Nonetheless, this library supports as many features as possible, doing some adaptions (more to come).

Although we transpile TS code directly to the other languages, this library does not touch import or exports statements because each language has its own module/namespace model. Instead, we return a unified list of imports and exports separately, allowing the user to adapt it to the target language easily and append it to the generated code (check `IFileImport` and `IFileExport`).

In order to facilitate the transpilation process, we should try to add as many types as possible otherwise, we might get invalid results.

**❌ Bad Example**
```Javascript
function importantFunction(argument) { // type of argumment is unknown
    const length = argument.length;
}
```

⬆️ In this case, we have no means to infer the argument's type, so for instance in PHP we don't know if `.length` should be transpiled to `str_len` or `count`.


**✅ Good Example**

```Javascript
function importantFunction(argument: string[]) {
    const length = argument.length;
}
```
⬆️ argument's type is known so all good, no ambiguities here.


**❌ Bad Example (C# only)**
```Javascript
class x {
    myMethod () {
        let i = 1;
        i = "string";
    }
}
```
Unlike other languages, C# does not allow changing the type of a variable/rebinding the same name to a different type (we don't use `dynamic` values because of the performance impact). So, if you intend to transpile to C# avoid this pattern.

#### What about javascript?
Obviously, all Javascript code is valid Typescript, so in theory, it should transpile Javascript seamlessly as well. This is in part true, but for the lacking of types, we might get some invalid results when the types are not clear (check bad example).

#### ESM or CJS?
This library works better with ESM because has dedicated `import/export` tokens in the AST whereas CJS `require/module.exports` are just regular properties and call expressions. **Nonetheless, both are supported**.

## 🎯 Languages
Currently the following languages are supported:
- Python
- PHP
- C# (WIP)

## 🔌 Installation

Use the package manager [npm](https://www.npmjs.com/) to install foobar.

```bash
npm install ast-transpiler
```

## 📌 Usage

`ast-transpiler` is a hybrid package, supporting ESM and CJS out of the box. Choose the one that fits you better.

### Transpiling Typescript to Python from string
```Javascript 
import Transpiler from 'ast-transpiler'

const transpiler = new Transpiler({
    python: {
        uncamelcaseIdentifiers: true, 
    }
});

const ts = "const myVar = 1;"
const transpiled = transpiler.transpilePython(ts);

console.log(transpiled.content) // prints my_var = 1
```

### Transpiling Typescript to PHP from file
(preferred way if needs to resolve imports)

```Javascript
const Transpiler = require(`ast-transpiler`);

const transpiler = new Transpiler();
const transpiled = transpiler.transpilePhpByPath("./my/path/file.ts");

console.log(transpiled.content) // prints transpiled php
console.log(transpiled.imports) // prints unified imports statements if any
console.log(transpiled.exports) // prints unified export statements if any
```

## ⚡ C# Notes
### Helpers
C# is very different from languages like Typescript, Python or PHP since it's statically typed and much more restricted than the others mentioned. Things like falsy values, empty default objects, dynamic properties, different type comparison, untyped arguments/return type, etc do not exist so I had to create a set of wrappers that will emulate these features in C#. So in order to make your code run you need to make all the **helper** methods available [here](https://github.com/carlosmiei/ast-transpiler/blob/c%23/helpers/c%23/helpers.cs) accessible from your code (wip).


### Mandatory return type/parameter type
As you probably know c# requires you to define the type for every parameter and method declaration whereas Typescript/Javascript does not, so this package will try to infer the type if not available or default to `object`, so it's preferable to declare them to avoid errors.

### Number ambiguity
Unfortunately Typescript/Javascript has only one type, `Number` which represents both integers and floating-point numbers. This is problematic because C# offers a variety of types (uint, int, Int64, double, float) to represent numeric values so it's very hard if not impossible to correctly transpile `Number`. For now we're converting it to `object` .

### Json Objects
Unlike Ts, Py, PHP, we don't have a direct way to represent a JSON object, so I try to represent it using either a `Dictionary<string, object>` or `List<object>` 

Warning: Under active development so can change at any time!

## ✅ Supported Features
- Identation
  - Does not rely on the original indentation but on the hierarchy of the statements, can be controlled by setting `DEFAULT_IDENTATION` (default value is four spaces)
- Variable declarations
- Class/function/methods declarations
- For/While loops
- Basic string manipulation 
  - `concat`, `length`, `includes`, `indexOf`
- Basic arrays manipulation
  - `includes`, `length`, `push`, `pop`, `reverse`, `shift`
- Basic object manipulation
  - `Object.keys`, `Object.values`
- Binary expressions
  - `+,-,*,/,mod` 
- Condition expressions
  - `&&, ||`
- Basic math functions
  - `Math.min, Math.max, Math.floor, Math.ceil, parseFloat, parseInt`
- Basic JSON methods
  - `JSON.stringify, JSON.parse` 
- Throw statements
- Conditional Expressions
- Break expressions
- Basic instanceof statements
- Comments
  - ⚠️ Some comments are not available in the AST, so those are lost
- Snake casing of variables/calls/functions/methods
- Import/Export statements parsing (ESM/CJS)
  - ⚠️ Avoid complex CJS exports
- Basic async support (async methods/functions, await, promise.all)
    - ⚠️ PHP: By default it uses the `ReactPHP` approach
- Scope Resolution Operator conversion (PHP only)
- etc

We will try to add more features/conversions in the future but this process is also customizable, check the Overrides section.

## 🔧 Options

As mentioned above, this library allows for some customization through the offered options and available overrides.

Currently there are two generic boolean transpiling options, `uncamelcaseIdentifiers` and `asyncTranspiling`. As the name suggests the former defines if all identifiers (variables, methods, functions, expression calls) should uncamelcased and the latter if we want our transpiled code to be async. 

You can also turn warn the warnings by setting the `verbose` option.

They can be set upon instantiating our transpiler, or using setter methods

```Javascript
const transpiler = new Transpiler({
        verbose: true
    python: {
        uncamelcaseIdentifiers: false, // default value
        asyncTranspiling: true // default value
    },
    php:  {
        uncamelcaseIdentifiers: false, // default value
        asyncTranspiling: true // default value
    }
});

// Alternatively
transpiler.setPhpUncamelCaseIdentifiers(true);
transpiler.setPythonAsyncTranspiling(false);
```

## 🔨 Overrides

There is no perfect recipe for transpiling one language in another completely different so we have to made some choices that you might not find the most correct or might want to change it slightly. For that reason this library exposes some objects and methods that you might load up with your own options.
### Parser

This object contains all tokens used to convert one language into another (if token, return token, while token, etc). Let's say that you prefer the `array()` notation instead of the default `[]` syntax. You can easily do that by overriding the  `ARRAY_OPENING_TOKEN` and `ARRAY_CLOSING_TOKEN`. You can check all available tokens [here](https://github.com/carlosmiei/ast-transpiler/blob/master/dist/transpiler.d.ts#L19)

Example:

```Javascript
const customParserConfig = {
    'ARRAY_OPENING_TOKEN': 'array(',
    'ARRAY_CLOSING_TOKEN': ')'
}

const config = {
    "php": {
        "parser": customParserConfig
    }
}
const transpiler = new Transpiler(config)
```

### FullPropertyAccessReplacements

By default this library will literally convert property access expressions, for instance `myVar.x`  will be converted to `myVar.x` in python but there are certain properties we want map to a different value in order to preserve functionality. In python we don't want to use `console.log` to print a message, so we need to convert this property to `print`. `FullPropertyAccessReplacements` contains all of those property conversions.  So if we want to convert `JSON.parse` to `json.loads` we just need to add it here (this particular conversion is done by default so you don't need to add it manually).

```Javascript

const customFullPropertyAccessReplacements = {
    'JSON.parse': 'json.loads',
}

const config = {
    "python": {
        "FullPropertyAccessReplacements": customParserConfig
    }
}
```

#### LeftPropertyAccessReplacements
- Same logic as for `FullPropertyAccessReplacements` but we should use this object when we want to replace the `left` side only. This is useful for mapping `this` to the correspondent value in the other language, but you might want to customize it as well.

```Javascript
const LeftPropertyAccessReplacements = {
    'this': 'self',
}

const config = {
    "python": {
        "LeftPropertyAccessReplacements": LeftPropertyAccessReplacements
    }
}
// this.x will be converted to self.x
```
#### RightPropertyAccessReplacements
- Same story as for `FullPropertyAccessReplacements` but only replaces the `right` side.

```Javascript
const customRightPropertyAccessReplacements = {
    'toUpperCase': 'upper',
}

const config = {
    "python": {
        "RightPropertyAccessReplacements": customRightPropertyAccessReplacements
    }
}
// x.toUpperCase() will be converted to x.upper()
```

#### CallExpressionReplacements
Similar to `FullPropertyAccessReplacements` but applies to expression calls only. 


```Javascript
const CallExpressionReplacements = {
    'parseInt': 'float',
}

const config = {
    "python": {
        "CallExpressionReplacements": CallExpressionReplacements
    }
}
// parseInt("1") will be converted to float("1")
```

#### StringLiteralReplacements
Similar to `FullPropertyAccessReplacements` but applies to string literals


```Javascript
const StringLiteralReplacements = {
    'sha256': 'hashlib.sha256',
}

const config = {
    "python": {
        "StringLiteralReplacements": StringLiteralReplacements
    }
}
// "sha256" will be converted to hashlib.sha256
```

#### ReservedKeywordsReplacements
Languages like C# have a lot of reserved words (string, object, params, base, internal, event, etc) so you can use this object to add your replacements.

#### ScopeResolutionProps (PHP only)
In PHP, there is the *Scope Resolution Operation* that allows access to *static/constant/overridden* properties, so in these cases, we must use a different property access token. Since this concept does not exist in typescript, we have to rely on a list of properties provided by the user where the `::` operator should be applied.


```Javascript
const ScopeResolutionProps = [
    'Precise'
]

const config = {
    "php": {
        "ScopeResolutionProps": ScopeResolutionProps
    }
}

// Precise.string() will be converted to Precise::string()
```

#### Methods

Due to the nature of this process, there are a lot of things that can't be transpiled by direct replacements so we need to add custom logic depending on the target language. For that reason, there are a lot of small atomic methods that can be overridden to add custom modifications.

##### Example 1: Removing all comments from PHP code

```Javascript

const transpiler = new Transpiler();

function myPrintFunctionComment (comment) {
    return "";
}

transpiler.phpTranspiler.transformLeadingComment = myPrintFunctionComment;
transpiler.phpTranspiler.transformTrailingComment = myPrintFunctionComment;
```

##### Example 2: Custom call expression modification in Python

```Javascript
const transpiler = new Transpiler();

function printOutOfOrderCallExpressionIfAny(node, identation) {
    const expressionText = node.expression.getText();
    const args = node.arguments;
    if (expressionText === "Array.isArray") {
        return "isinstance(" + this.printNode(args[0], 0) + ", list)"; // already done out of the box so no need to add it
    }

    return super.printOutOfOrderCallExpressionIfAny(node, identation); // avoid interfering with the builtn modifications
}

transpiler.pythonTranspiler.printOutOfOrderCallExpressionIfAny = printOutOfOrderCallExpressionIfAny;
```

## Contributing

Pull requests are welcome. For major changes, please open an issue first
to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License

[MIT](https://choosealicense.com/licenses/mit/)
