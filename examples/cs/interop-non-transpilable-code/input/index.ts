import { nonTranspilableFeature } from "./nonTranspilableHelper.js";

// dummy class just for demonstrating purposes
class MyClass {

    mainFeature(message) {
        const ar = [ 1, 2, 3 ];
        ar.reverse ();
        console.log (ar);
        console.log("Hello! I'm inside main class:" + message)
        nonTranspilableFeature(); // invoke non-transpilable code here normally
    }

    convertToInt(number: string) {
        const conversion = parseInt(number);
        return conversion;
    }
}

export {
    MyClass
}