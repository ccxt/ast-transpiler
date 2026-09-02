package main


import (
    "fmt"
)

type Second struct {
    MyClassProperty string `default:"classProp"`
    MyBoolProp bool `default:"false"`
}

func NewSecond() *Second {
    p := &Second{}
    setDefaults(p)
    return p
}

func  (this *Second) StringifyNumber(arg any) any  {
    return ToString(arg)
}
type Test struct {

}

func NewTest() *Test {
    p := &Test{}
    setDefaults(p)
    return p
}

func  (this *Test) BoolToString(x any) any  {
    if EvalTruthy(x) {
        return "true"
    } else {
        return "false"
    }
}
func  (this *Test) FunctionWithOptionals(a any, optionalArgs ...any)  {
    c := GetArg(optionalArgs, 0, nil)
    _ = c
    d := GetArg(optionalArgs, 1, 1)
    _ = d
    fmt.Println(a)
    if !IsEqual(c, nil) {
        fmt.Println(c)
    }
    if !IsEqual(d, nil) {
        fmt.Println(d)
    }
}
func  (this *Test) GetValue(x any) any  {
    return x
}
func  (this *Test) TestJavaScope()  {
    var newObject map[string]any = map[string]any {
        "a": this.GetValue(5),
        "b": this.GetValue(this.GetValue(this.GetValue(2))),
    }
    fmt.Println(GetValue(newObject, "a")) // should print 5
    fmt.Println(GetValue(newObject, "b")) // should print 2
}
func  (this *Test) Test()  {
    var a any = 1
    var b any = 2
    var c any = Add(a, b)
    fmt.Println(c) // should print 3
    var s1 string = "a"
    var s2 string = "b"
    var s3 any = Add(s1, s2)
    var stringVar any = nil
    stringVar = "hello"
    fmt.Println(stringVar) // should print "hello"
    fmt.Println(s3) // should print "ab"
    var x bool = false
    if x {
        fmt.Println("x is true")
    } else {
        fmt.Println("x is false") // should print "x is false"
    }
    instance := NewSecond()
    fmt.Println(instance.StringifyNumber(4)) // should print 4
    fmt.Println(instance.MyClassProperty) // should print "classProp"
    if (instance.MyBoolProp == false) {
        fmt.Println("myBoolProp is false") // should print "myBoolProp is false"
    }
    var arr []any = []any{1, 2, 3, 4}
    fmt.Println(GetArrayLength(arr)) // should print 4
    var first any = GetValue(arr, 0)
    fmt.Println(first) // should print 1
    var dict map[string]any = map[string]any {
        "a": "b",
    }
    fmt.Println(GetValue(dict, "a")) // should print "b"
    var i any = 0
    for w := 0; IsLessThan(w, 10); w++ {
        i = Add(i, 1)
    }
    fmt.Println(ToString(i)) // should print 10
    var list2 []any = []any{1, 2, 3, 4, 5}
    Reverse(list2)
    fmt.Println(GetValue(list2, 0)) // should print 5
    //should delete key from dict
    var dict2 map[string]any = map[string]any {
        "a": 1,
        "b": 2,
    }
    Remove(dict2, "a")
    var dictKeys []string = ObjectKeys(dict2)
    fmt.Println(GetArrayLength(dictKeys)) // should print 1
    fmt.Println(GetValue(dictKeys, 0)) // should print "b"
    var firstConcat []any = []any{"a", "b"}
    var secondConcat []any = []any{"c", "d"}
    var both any = Concat(firstConcat, secondConcat)
    fmt.Println(GetArrayLength(both)) // should print 4
    fmt.Println(GetValue(both, 2)) // should print "c"
    var baseString string = "aabba"
    var replacedAllString any = Replace(baseString, "a", "")
    fmt.Println(replacedAllString) // should print "bb"
    this.FunctionWithOptionals("hello")
    this.FunctionWithOptionals("hello", 5)
    this.FunctionWithOptionals("hello", 5, 1)
    var list3 []any = []any{"empty"}
    AddElementToObject(list3, 0, "first")
    fmt.Println(GetValue(list3, 0)) // should print "first"
    var dict3 map[string]any = map[string]any {}
    AddElementToObject(dict3, "key", "value")
    fmt.Println(GetValue(dict3, "key")) // should print "value"
    this.TestJavaScope()
    first1second1Variable := this.HandleOptionAndParamsTest();
    first1 := GetValue(first1second1Variable,0);
    second1 := GetValue(first1second1Variable,1)
    fmt.Println(first1) // should print 1
    fmt.Println(second1) // should print "a"
    var first2 any = nil
    var second2 any = nil
    first2second2Variable := this.HandleOptionAndParamsTest();
    first2 = GetValue(first2second2Variable,0);
    second2 = GetValue(first2second2Variable,1)
    fmt.Println(first2) // should print 1
    fmt.Println(second2) // should print "a"
    this.FuncWithParams([]any{1, 2, 3}, map[string]any {
        "a": "value of a",
    })
    this.TestStringMethods()
    var threwError bool = false
    
        {
             func(this *Test) (ret_ any) {
    		    defer func() {
                    if e := recover(); e != nil {
                        if e == "break" {
                            return
                        }
                        ret_ = func(this *Test) any {
                            // catch block:
                                    threwError = true
                            return nil
                        }(this)
                    }
                }()
    		    // try block:
                        this.FunctionThatThrows()
    		    return nil
    	    }(this)
        
            }
    fmt.Println(this.BoolToString(threwError)) // should print true
}
func  (this *Test) HandleOptionAndParamsTest() any  {
    return []any{1, "a"}
}
func  (this *Test) FuncWithParams(optionalArgs ...any)  {
    a := GetArg(optionalArgs, 0, nil)
    _ = a
    params := GetArg(optionalArgs, 1, map[string]any {})
    _ = params
    if IsArray(a) {
        fmt.Println(GetArrayLength(a))
    }
    if InOp(params, "a") {
        fmt.Println(GetValue(params, "a"))
    }
}
func  (this *Test) TestStringMethods()  {
    var str string = "hello world"
    // isEqual test
    if (str == "hello world") {
        fmt.Println("str is hello world") // should print "str is hello world"
    }
    fmt.Println(ToUpper(str))
    var startsWithHello bool = StartsWith(str, "hello")
    fmt.Println(this.BoolToString(startsWithHello)) // should print true
    var endsWithWorld bool = EndsWith(str, "world")
    fmt.Println(this.BoolToString(endsWithWorld)) // should print true
    var stringParts []string = Split(str, " ")
    fmt.Println(GetArrayLength(stringParts)) // should print 2
    fmt.Println(GetValue(stringParts, 0)) // should print "hello"
    fmt.Println(GetValue(stringParts, 1)) // should print "world"
    var indexOfResult int = GetIndexOf(str, "o")
    fmt.Println(indexOfResult) // should print 4
    var strReplaced any = Replace(str, "l", "x")
    fmt.Println(strReplaced) // should print "hexxo worxd"
    // concatenation test
    var a string = "a"
    var b string = "b"
    var c any = Add(a, b)
    fmt.Println(c) // should print "ab"
}
func  (this *Test) FunctionThatThrows()  {
    panic(Error("This is an error"))
}
