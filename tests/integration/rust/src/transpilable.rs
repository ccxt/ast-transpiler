#![allow(non_snake_case, dead_code, unused_variables, unused_mut)]
use crate::helpers::*;
use std::collections::HashMap;
#[derive(Debug, Clone)]
pub struct Second {
    pub myClassProperty: Value,
    pub myBoolProp: Value,
}
impl Second {
    pub fn new() -> Self {
        Second {
        myClassProperty: Value::Str("classProp".into()),
        myBoolProp: Value::Bool(false),
        }
    }
}
impl Second {
    pub fn stringifyNumber(&self, arg: Value) -> Value {
        return Value::Str(format!("{}", arg).into());
}
}
#[derive(Debug, Clone)]
pub struct Test {

}
impl Test {
    pub fn new() -> Self {
        Test {

        }
    }
}
impl Test {
    pub fn boolToString(&self, x: bool) -> Value {
        if x {
            return Value::Str("true".into());
        }  else {
            return Value::Str("false".into());
        }
}

    pub fn functionWithOptionals(&self, a: Value, optional_args: &[Value]) {
        let c = get_arg(optional_args, 0, Value::Null);
        let d = get_arg(optional_args, 1, Value::Int(1));
        println_val(&a);
        if (c != Value::Null) {
            println_val(&c);
        }
        if (d != Value::Null) {
            println_val(&d);
        }
}

    pub fn getValue(&self, x: Value) -> Value {
        return x;
}

    pub fn testJavaScope(&self) {
        let mut newObject: indexmap::IndexMap<String, Value> = ({
            let mut m = indexmap::IndexMap::new();
                m.insert("a".to_string(), self.getValue(Value::Int(5)));
                m.insert("b".to_string(), self.getValue(self.getValue(self.getValue(Value::Int(2)))));
            m
        });
        println_val(&newObject.get("a").cloned().unwrap_or(Value::Null)); // should print 5
        println_val(&newObject.get("b").cloned().unwrap_or(Value::Null)); // should print 2
}

    pub fn test(&self) {
        let mut a: Value = Value::Int(1);
        let mut b: Value = Value::Int(2);
        let mut c: Value = (match (&(a), &(b)) { (Value::Int(x), Value::Int(y)) => Value::Int(x + y), (Value::Int(x), Value::Float(y)) => Value::Float(*x as f64 + *y), (Value::Float(x), Value::Int(y)) => Value::Float(*x + *y as f64), (Value::Float(x), Value::Float(y)) => Value::Float(x + y), _ => Value::Null });
        println_val(&c); // should print 3
        let mut s1: Value = Value::Str("a".into());
        let mut s2: Value = Value::Str("b".into());
        let mut s3: Value = Value::Str(format!("{}{}", s1, s2).into());
        let mut stringVar: Value = Value::Null;
        stringVar = Value::Str("hello".into());
        println_val(&stringVar); // should print "hello"
        println_val(&s3); // should print "ab"
        let mut x: bool = false;
        if is_true(&x) {
            println_val(&Value::Str("x is true".into()));
        }  else {
            println_val(&Value::Str("x is false".into())); // should print "x is false"
        }
        let mut instance = Second::new();
        println_val(&instance.stringifyNumber(Value::Int(4))); // should print 4
        println_val(&instance.myClassProperty); // should print "classProp"
        if (instance.myBoolProp.as_bool() == Some(false)) {
            println_val(&Value::Str("myBoolProp is false".into())); // should print "myBoolProp is false"
        }
        let mut arr: Value = Value::from(vec![Value::Int(1), Value::Int(2), Value::Int(3), Value::Int(4)]);
        println_val(&Value::Int(arr.len() as i64)); // should print 4
        let mut first: Value = arr.as_array().and_then(|__arr| __arr.get(0)).cloned().unwrap_or(Value::Null);
        println_val(&first); // should print 1
        let mut dict: indexmap::IndexMap<String, Value> = ({
            let mut m = indexmap::IndexMap::new();
                m.insert("a".to_string(), Value::Str("b".into()));
            m
        });
        println_val(&dict.get("a").cloned().unwrap_or(Value::Null)); // should print "b"
        let mut i: Value = Value::Int(0);
        {
                        let mut w: Value = Value::Int(0);
            let mut __for_first_0: bool = true;
            while { if !__for_first_0 { if let Value::Int(n) = &mut w { *n += 1; } } __for_first_0 = false; w.as_f64().unwrap_or(f64::NAN) < Value::Int(10).as_f64().unwrap_or(f64::NAN) } {
            i = (match (&(i), &(Value::Int(1))) { (Value::Int(x), Value::Int(y)) => Value::Int(x + y), (Value::Int(x), Value::Float(y)) => Value::Float(*x as f64 + *y), (Value::Float(x), Value::Int(y)) => Value::Float(*x + *y as f64), (Value::Float(x), Value::Float(y)) => Value::Float(x + y), _ => Value::Null });
        }
        }
        println_val(&Value::Str(format!("{}", i).into())); // should print 10
        let mut list2: Value = Value::from(vec![Value::Int(1), Value::Int(2), Value::Int(3), Value::Int(4), Value::Int(5)]);
        list2 = reverse(list2.clone());
        println_val(&list2.as_array().and_then(|__arr| __arr.get(0)).cloned().unwrap_or(Value::Null)); // should print 5
        //should delete key from dict
        let mut dict2: Value = Value::Map({
            let mut m = indexmap::IndexMap::new();
                m.insert("a".to_string(), Value::Int(1));
                m.insert("b".to_string(), Value::Int(2));
            m
        });
        if let Value::Dict(__d) = &mut dict2 { std::sync::Arc::make_mut(__d).shift_remove("a"); };
        let mut dictKeys: Vec<Value> = object_keys(&dict2).as_array().cloned().unwrap_or_default();
        println_val(&Value::Int(dictKeys.len() as i64)); // should print 1
        println_val(&dictKeys.get(0).cloned().unwrap_or(Value::Null)); // should print "b"
        let mut firstConcat: Value = Value::from(vec![Value::Str("a".into()), Value::Str("b".into())]);
        let mut secondConcat: Value = Value::from(vec![Value::Str("c".into()), Value::Str("d".into())]);
        let mut both: Value = concat(firstConcat.clone(), secondConcat.clone());
        println_val(&Value::Int(both.len() as i64)); // should print 4
        println_val(&both.as_array().and_then(|__arr| __arr.get(2)).cloned().unwrap_or(Value::Null)); // should print "c"
        let mut baseString: Value = Value::Str("aabba".into());
        let mut replacedAllString: Value = baseString.as_str().map(|__s| Value::Str(__s.replace("a", "").into())).unwrap_or_else(|| baseString.clone());
        println_val(&replacedAllString); // should print "bb"
        self.functionWithOptionals(Value::Str("hello".into()), &[]);
        self.functionWithOptionals(Value::Str("hello".into()), &[Value::Int(5)]);
        self.functionWithOptionals(Value::Str("hello".into()), &[Value::Int(5), Value::Int(1)]);
        let mut list3: Value = Value::from(vec![Value::Str("empty".into())]);
        add_element_to_object(&mut list3, &Value::Int(0), Value::Str("first".into()));
        println_val(&list3.as_array().and_then(|__arr| __arr.get(0)).cloned().unwrap_or(Value::Null)); // should print "first"
        let mut dict3: indexmap::IndexMap<String, Value> = ({
            let mut m = indexmap::IndexMap::new();
            m
        });
        dict3.insert("key".into(), Value::Str("value".into()));
        println_val(&dict3.get("key").cloned().unwrap_or(Value::Null)); // should print "value"
        self.testJavaScope();
        let first1second1Variable: Vec<Value> = self.handleOptionAndParamsTest().as_array().cloned().unwrap_or_default();
        let mut first1: Value = first1second1Variable.get(0).cloned().unwrap_or(Value::Null);
        let mut second1: Value = first1second1Variable.get(1).cloned().unwrap_or(Value::Null);
        println_val(&first1); // should print 1
        println_val(&second1); // should print "a"
        let mut first2: Value = Value::Null;
        let mut second2: Value = Value::Null;
        { let __destr_tmp: Vec<Value> = self.handleOptionAndParamsTest().as_array().cloned().unwrap_or_default(); first2 = __destr_tmp.get(0).cloned().unwrap_or(Value::Null); second2 = __destr_tmp.get(1).cloned().unwrap_or(Value::Null); };
        println_val(&first2); // should print 1
        println_val(&second2); // should print "a"
        self.funcWithParams(&[Value::from(vec![Value::Int(1), Value::Int(2), Value::Int(3)]), Value::Map({
    let mut m = indexmap::IndexMap::new();
        m.insert("a".to_string(), Value::Str("value of a".into()));
    m
})]);
        self.testStringMethods();
        let mut threwError: Value = Value::Bool(false);
        let _try_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            self.functionThatThrows();
        }));
        if _try_result.is_err() {
            threwError = Value::Bool(true);
        }
        println_val(&self.boolToString(threwError.is_truthy())); // should print true
}

    pub fn handleOptionAndParamsTest(&self) -> Value {
        return Value::from(vec![Value::Int(1), Value::Str("a".into())]);
}

    pub fn funcWithParams(&self, optional_args: &[Value]) {
        let a = get_arg(optional_args, 0, Value::Null);
        let params = get_arg(optional_args, 1, Value::Map({
    let mut m = indexmap::IndexMap::new();
    m
}));
        if (matches!(&a, Value::Arr(_))) {
            println_val(&get_array_length(&a));
        }
        if (matches!(&params, Value::Dict(__d) if __d.contains_key("a"))) {
            println_val(&params.as_map().and_then(|__m| __m.get("a")).cloned().unwrap_or(Value::Null));
        }
}

    pub fn testStringMethods(&self) {
        let mut str_val: Value = Value::Str("hello world".into());
        // isEqual test
        if (str_val.as_str() == Some("hello world")) {
            println_val(&Value::Str("str is hello world".into())); // should print "str is hello world"
        }
        println_val(&(if let Some(__s) = str_val.as_str() { Value::Str(__s.to_uppercase().into()) } else { Value::Null }));
        let mut startsWithHello: bool = str_val.as_str().unwrap_or("").starts_with("hello");
        println_val(&self.boolToString(startsWithHello.is_truthy())); // should print true
        let mut endsWithWorld: bool = str_val.as_str().unwrap_or("").ends_with("world");
        println_val(&self.boolToString(endsWithWorld.is_truthy())); // should print true
        let mut stringParts: Vec<Value> = Value::Array(if let Some(__s) = str_val.as_str() { __s.split(" ").map(Value::from).collect() } else { Vec::new() }).as_array().cloned().unwrap_or_default();
        println_val(&Value::Int(stringParts.len() as i64)); // should print 2
        println_val(&stringParts.get(0).cloned().unwrap_or(Value::Null)); // should print "hello"
        println_val(&stringParts.get(1).cloned().unwrap_or(Value::Null)); // should print "world"
        let mut indexOfResult: Value = Value::Int(str_val.as_str().and_then(|__s| __s.find("o")).map(|__i| __i as i64).unwrap_or(-1));
        println_val(&indexOfResult); // should print 4
        let mut strReplaced: Value = str_val.as_str().map(|__s| Value::Str(__s.replace("l", "x").into())).unwrap_or_else(|| str_val.clone());
        println_val(&strReplaced); // should print "hexxo worxd"
        // concatenation test
        let mut a: Value = Value::Str("a".into());
        let mut b: Value = Value::Str("b".into());
        let mut c: Value = Value::Str(format!("{}{}", a, b).into());
        println_val(&c); // should print "ab"
}

    pub fn functionThatThrows(&self) {
        panic!("{}", Value::Str("This is an error".into()));
}
}
