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
        myClassProperty: Value::Str("classProp".to_string()),
        myBoolProp: Value::Bool(false),
        }
    }
}
impl Second {
    pub fn stringifyNumber(&self, arg: Value) -> Value {
        return to_string_val(&arg);
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
    pub fn boolToString(&self, x: Value) -> Value {
        if is_true(&x) {
            return Value::Str("true".to_string());
        }  else {
            return Value::Str("false".to_string());
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
        let mut newObject: Value = Value::Map({
            let mut m = std::collections::HashMap::new();
                m.insert("a".to_string(), self.getValue(Value::Int(5)));
                m.insert("b".to_string(), self.getValue(self.getValue(self.getValue(Value::Int(2)))));
            m
        });
        println_val(&newObject.as_map().and_then(|__m| __m.get("a")).cloned().unwrap_or(Value::Null)); // should print 5
        println_val(&newObject.as_map().and_then(|__m| __m.get("b")).cloned().unwrap_or(Value::Null)); // should print 2
}

    pub fn test(&self) {
        let mut a: Value = Value::Int(1);
        let mut b: Value = Value::Int(2);
        let mut c: Value = (match (&(a), &(b)) { (Value::Int(x), Value::Int(y)) => Value::Int(x + y), (Value::Int(x), Value::Float(y)) => Value::Float(*x as f64 + *y), (Value::Float(x), Value::Int(y)) => Value::Float(*x + *y as f64), (Value::Float(x), Value::Float(y)) => Value::Float(x + y), _ => Value::Null });
        println_val(&c); // should print 3
        let mut s1: Value = Value::Str("a".to_string());
        let mut s2: Value = Value::Str("b".to_string());
        let mut s3: Value = Value::Str(format!("{}{}", s1, s2));
        let mut stringVar: Value = Value::Null;
        stringVar = Value::Str("hello".to_string());
        println_val(&stringVar); // should print "hello"
        println_val(&s3); // should print "ab"
        let mut x: bool = false;
        if is_true(&x) {
            println_val(&Value::Str("x is true".to_string()));
        }  else {
            println_val(&Value::Str("x is false".to_string())); // should print "x is false"
        }
        let mut instance = Second::new();
        println_val(&instance.stringifyNumber(Value::Int(4))); // should print 4
        println_val(&instance.myClassProperty); // should print "classProp"
        if (instance.myBoolProp.as_bool() == Some(false)) {
            println_val(&Value::Str("myBoolProp is false".to_string())); // should print "myBoolProp is false"
        }
        let mut arr: Value = Value::List(vec![Value::Int(1), Value::Int(2), Value::Int(3), Value::Int(4)]);
        println_val(&Value::Int(arr.len() as i64)); // should print 4
        let mut first: Value = arr.as_array().and_then(|__arr| __arr.get(0)).cloned().unwrap_or(Value::Null);
        println_val(&first); // should print 1
        let mut dict: Value = Value::Map({
            let mut m = std::collections::HashMap::new();
                m.insert("a".to_string(), Value::Str("b".to_string()));
            m
        });
        println_val(&dict.as_map().and_then(|__m| __m.get("a")).cloned().unwrap_or(Value::Null)); // should print "b"
        let mut i: Value = Value::Int(0);
        {
                        let mut w: Value = Value::Int(0);
            let mut __for_first_0: bool = true;
            while { if !__for_first_0 { w = (match (&(w), &(Value::Int(1))) { (Value::Int(x), Value::Int(y)) => Value::Int(x + y), (Value::Int(x), Value::Float(y)) => Value::Float(*x as f64 + *y), (Value::Float(x), Value::Int(y)) => Value::Float(*x + *y as f64), (Value::Float(x), Value::Float(y)) => Value::Float(x + y), _ => Value::Null }); } __for_first_0 = false; w.as_f64().unwrap_or(f64::NAN) < Value::Int(10).as_f64().unwrap_or(f64::NAN) } {
            i = (match (&(i), &(Value::Int(1))) { (Value::Int(x), Value::Int(y)) => Value::Int(x + y), (Value::Int(x), Value::Float(y)) => Value::Float(*x as f64 + *y), (Value::Float(x), Value::Int(y)) => Value::Float(*x + *y as f64), (Value::Float(x), Value::Float(y)) => Value::Float(x + y), _ => Value::Null });
        }
        }
        println_val(&to_string_val(&i)); // should print 10
        let mut list2: Value = Value::List(vec![Value::Int(1), Value::Int(2), Value::Int(3), Value::Int(4), Value::Int(5)]);
        list2 = reverse(list2.clone());
        println_val(&list2.as_array().and_then(|__arr| __arr.get(0)).cloned().unwrap_or(Value::Null)); // should print 5
        //should delete key from dict
        let mut dict2: Value = Value::Map({
            let mut m = std::collections::HashMap::new();
                m.insert("a".to_string(), Value::Int(1));
                m.insert("b".to_string(), Value::Int(2));
            m
        });
        remove(&mut dict2, &Value::Str("a".to_string()));
        let mut dictKeys: Value = object_keys(&dict2);
        println_val(&Value::Int(dictKeys.len() as i64)); // should print 1
        println_val(&dictKeys.as_array().and_then(|__arr| __arr.get(0)).cloned().unwrap_or(Value::Null)); // should print "b"
        let mut firstConcat: Value = Value::List(vec![Value::Str("a".to_string()), Value::Str("b".to_string())]);
        let mut secondConcat: Value = Value::List(vec![Value::Str("c".to_string()), Value::Str("d".to_string())]);
        let mut both: Value = concat(firstConcat.clone(), secondConcat.clone());
        println_val(&Value::Int(both.len() as i64)); // should print 4
        println_val(&both.as_array().and_then(|__arr| __arr.get(2)).cloned().unwrap_or(Value::Null)); // should print "c"
        let mut baseString: Value = Value::Str("aabba".to_string());
        let mut replacedAllString: Value = replace_all_str(&baseString, &Value::Str("a".to_string()), &Value::Str("".to_string()));
        println_val(&replacedAllString); // should print "bb"
        self.functionWithOptionals(Value::Str("hello".to_string()), &[]);
        self.functionWithOptionals(Value::Str("hello".to_string()), &[Value::Int(5)]);
        self.functionWithOptionals(Value::Str("hello".to_string()), &[Value::Int(5), Value::Int(1)]);
        let mut list3: Value = Value::List(vec![Value::Str("empty".to_string())]);
        add_element_to_object(&mut list3, &Value::Int(0), Value::Str("first".to_string()));
        println_val(&list3.as_array().and_then(|__arr| __arr.get(0)).cloned().unwrap_or(Value::Null)); // should print "first"
        let mut dict3: Value = Value::Map({
            let mut m = std::collections::HashMap::new();
            m
        });
        add_element_to_object(&mut dict3, &Value::Str("key".to_string()), Value::Str("value".to_string()));
        println_val(&dict3.as_map().and_then(|__m| __m.get("key")).cloned().unwrap_or(Value::Null)); // should print "value"
        self.testJavaScope();
        let mut first1second1Variable = self.handleOptionAndParamsTest();
        let mut first1: Value = first1second1Variable.as_array().and_then(|__arr| __arr.get(0)).cloned().unwrap_or(Value::Null);
        let mut second1: Value = first1second1Variable.as_array().and_then(|__arr| __arr.get(1)).cloned().unwrap_or(Value::Null);
        println_val(&first1); // should print 1
        println_val(&second1); // should print "a"
        let mut first2: Value = Value::Null;
        let mut second2: Value = Value::Null;
        { let __destr_tmp = self.handleOptionAndParamsTest(); first2 = __destr_tmp.as_array().and_then(|__arr| __arr.get(0)).cloned().unwrap_or(Value::Null); second2 = __destr_tmp.as_array().and_then(|__arr| __arr.get(1)).cloned().unwrap_or(Value::Null); };
        println_val(&first2); // should print 1
        println_val(&second2); // should print "a"
        self.funcWithParams(&[Value::List(vec![Value::Int(1), Value::Int(2), Value::Int(3)]), Value::Map({
    let mut m = std::collections::HashMap::new();
        m.insert("a".to_string(), Value::Str("value of a".to_string()));
    m
})]);
        self.testStringMethods();
        let mut threwError: Value = Value::Bool(false);
        let _try_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            self.functionThatThrows();
        }));
        if let Err(_e) = _try_result {
            threwError = Value::Bool(true);
        }
        println_val(&self.boolToString(threwError)); // should print true
}

    pub fn handleOptionAndParamsTest(&self) -> Value {
        return Value::List(vec![Value::Int(1), Value::Str("a".to_string())]);
}

    pub fn funcWithParams(&self, optional_args: &[Value]) {
        let a = get_arg(optional_args, 0, Value::Null);
        let params = get_arg(optional_args, 1, Value::Map({
    let mut m = std::collections::HashMap::new();
    m
}));
        if is_true(&Value::Bool(is_array(&a))) {
            println_val(&get_array_length(&a));
        }
        if is_true(&Value::Bool(matches!(&params, Value::Dict(__d) if __d.contains_key("a")))) {
            println_val(&crate::value::get_value_k(&params, "a"));
        }
}

    pub fn testStringMethods(&self) {
        let mut str_val: Value = Value::Str("hello world".to_string());
        // isEqual test
        if (str_val.as_str() == Some("hello world")) {
            println_val(&Value::Str("str is hello world".to_string())); // should print "str is hello world"
        }
        println_val(&to_upper(&str_val));
        let mut startsWithHello: Value = Value::Bool(starts_with(&str_val, &Value::Str("hello".to_string())));
        println_val(&self.boolToString(startsWithHello)); // should print true
        let mut endsWithWorld: Value = Value::Bool(ends_with(&str_val, &Value::Str("world".to_string())));
        println_val(&self.boolToString(endsWithWorld)); // should print true
        let mut stringParts: Value = split(&str_val, &Value::Str(" ".to_string()));
        println_val(&Value::Int(stringParts.len() as i64)); // should print 2
        println_val(&stringParts.as_array().and_then(|__arr| __arr.get(0)).cloned().unwrap_or(Value::Null)); // should print "hello"
        println_val(&stringParts.as_array().and_then(|__arr| __arr.get(1)).cloned().unwrap_or(Value::Null)); // should print "world"
        let mut indexOfResult: Value = get_index_of(&str_val, &Value::Str("o".to_string()));
        println_val(&indexOfResult); // should print 4
        let mut strReplaced: Value = replace_all_str(&str_val, &Value::Str("l".to_string()), &Value::Str("x".to_string()));
        println_val(&strReplaced); // should print "hexxo worxd"
        // concatenation test
        let mut a: Value = Value::Str("a".to_string());
        let mut b: Value = Value::Str("b".to_string());
        let mut c: Value = Value::Str(format!("{}{}", a, b));
        println_val(&c); // should print "ab"
}

    pub fn functionThatThrows(&self) {
        panic!("{}", Value::Str("This is an error".to_string()));
}
}
