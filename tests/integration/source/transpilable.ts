
class Second {

    myClassProperty: string = "classProp";
    myBoolProp: boolean = false;
    public stringifyNumber(arg: number) {
        return arg.toString();
    }
}

class Test {

    strprop: string = "test";
    numprop: number = 1;
    boolprop: boolean = false;

    public test() {
        var a = 1;
        var b = 2;
        var c = a + b;
        console.log(c); // should print 3
        var s1 = "a";
        var s2 = "b";
        var s3 = s1 + s2;

        let stringVar: string;
        stringVar = "hello";
        console.log(stringVar); // should print "hello"
        console.log(s3); // should print "ab"
        let x = false;
        if (x) {
            console.log("x is true");
        } else {
            console.log("x is false"); // should print "x is false"
        }

        var instance = new Second();
        console.log(instance.stringifyNumber(4)); // should print 4

        console.log(instance.myClassProperty); // should print "classProp"

        if (instance.myBoolProp == false) {
            console.log("myBoolProp is false"); // should print "myBoolProp is false"
        }

        const arr = [1,2,3,4];

        console.log(arr.length); // should print 4

        const first = arr[0];
        console.log(first); // should print 1

        const dict = {"a": "b"};
        console.log(dict["a"]); // should print "b"

        let i = 0;
        for (let w = 0; w < 10; w++) {
            i = i + 1;
        }
        console.log(i.toString()); // should print 10

        const list2 = [1,2,3,4,5];
        list2.reverse();
        console.log(list2[0]); // should print 5
        
        //should delete key from dict
        const dict2 = {"a": 1, "b": 2};
        delete dict2["a"];
        const dictKeys = Object.keys(dict2);
        console.log(dictKeys.length); // should print 1
        console.log(dictKeys[0]); // should print "b"

        const firstConcat = ["a", "b"];
        const secondConcat = ["c", "d"];
        const both = firstConcat.concat(secondConcat);
        console.log(both.length); // should print 4
        console.log(both[2]); // should print "c"
    }

    someMethod(arg1: boolean, arg2: number) {
        const res = arg1;
        console.log(res);
    }
}

export {
    Test
}