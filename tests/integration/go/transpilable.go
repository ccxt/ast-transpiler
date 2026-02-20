package main


import (
    "fmt"
)

type Second struct {
    MyClassProperty string `default:"classProp"`
}

func NewSecond() Second {
   p := Second{}
   setDefaults(&p)
   return p
}

func  (this *Second) StringifyNumber(arg any) any  {
    return ToString(arg)
}
type Test struct {

}

func NewTest() Test {
   p := Test{}
   setDefaults(&p)
   return p
}

func  (this *Test) Test()  {
    var a any = 1
    var b any = 2
    var c any = Add(a, b)
    fmt.Println(c) // should print 3
    var s1 any = "a"
    var s2 any = "b"
    var s3 any = Add(s1, s2)
    var stringVar any = nil
    stringVar = "hello"
    fmt.Println(stringVar) // should print "hello"
    fmt.Println(s3) // should print "ab"
    var x any = false
    if IsTrue(x) {
        fmt.Println("x is true")
    } else {
        fmt.Println("x is false") // should print "x is false"
    }
    instance := NewSecond()
    fmt.Println(instance.StringifyNumber(4)) // should print 4
    fmt.Println(instance.MyClassProperty) // should print "classProp"
    var arr any = []any{1, 2, 3, 4}
    fmt.Println(GetArrayLength(arr)) // should print 4
    var first any = GetValue(arr, 0)
    fmt.Println(first) // should print 1
    var dict any = map[string]any {
        "a": "b",
    }
    fmt.Println(GetValue(dict, "a")) // should print "b"
    var i any = 0
    for w := 0; IsLessThan(w, 10); w++ {
        i = Add(i, 1)
    }
    fmt.Println(ToString(i)) // should print 10
    var list2 any = []any{1, 2, 3, 4, 5}
    Reverse(list2)
    fmt.Println(GetValue(list2, 0)) // should print 5
    //should delete key from dict
    var dict2 any = map[string]any {
        "a": 1,
        "b": 2,
    }
    Remove(dict2, "a")
    var dictKeys any = ObjectKeys(dict2)
    fmt.Println(GetArrayLength(dictKeys)) // should print 1
    fmt.Println(GetValue(dictKeys, 0)) // should print "b"
    var firstConcat any = []any{"a", "b"}
    var secondConcat any = []any{"c", "d"}
    var both any = Concat(firstConcat, secondConcat)
    fmt.Println(GetArrayLength(both)) // should print 4
    fmt.Println(GetValue(both, 2)) // should print "c"
}
