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
    pub fn functionWithOptionals(&self, a: Value, optional_args: &[Value]) {
        let c = get_arg(optional_args, 0, Value::Null);
        let d = get_arg(optional_args, 1, Value::Int(1));
        println_val(&a);
        if !is_equal(&c, &Value::Null) {
            println_val(&c);
        }
        if !is_equal(&d, &Value::Null) {
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
        println_val(&get_value(&newObject, &Value::Str("a".to_string()))); // should print 5
        println_val(&get_value(&newObject, &Value::Str("b".to_string()))); // should print 2
}

    pub fn test(&self) {
        let mut a: Value = Value::Int(1);
        let mut b: Value = Value::Int(2);
        let mut c: Value = add(&a, &b);
        println_val(&c); // should print 3
        let mut s1: Value = Value::Str("a".to_string());
        let mut s2: Value = Value::Str("b".to_string());
        let mut s3: Value = add(&s1, &s2);
        let mut stringVar: Value = Value::Null;
        stringVar = Value::Str("hello".to_string());
        println_val(&stringVar); // should print "hello"
        println_val(&s3); // should print "ab"
        let mut x: Value = Value::Bool(false);
        if is_true(&x) {
            println_val(&Value::Str("x is true".to_string()));
        }  else {
            println_val(&Value::Str("x is false".to_string())); // should print "x is false"
        }
        let mut instance = Second::new();
        println_val(&instance.stringifyNumber(Value::Int(4))); // should print 4
        println_val(&instance.myClassProperty); // should print "classProp"
        if is_equal(&instance.myBoolProp, &Value::Bool(false)) {
            println_val(&Value::Str("myBoolProp is false".to_string())); // should print "myBoolProp is false"
        }
        let mut arr: Value = Value::List(vec![Value::Int(1), Value::Int(2), Value::Int(3), Value::Int(4)]);
        println_val(&get_array_length(&arr)); // should print 4
        let mut first: Value = get_value(&arr, &Value::Int(0));
        println_val(&first); // should print 1
        let mut dict: Value = Value::Map({
            let mut m = std::collections::HashMap::new();
                m.insert("a".to_string(), Value::Str("b".to_string()));
            m
        });
        println_val(&get_value(&dict, &Value::Str("a".to_string()))); // should print "b"
        let mut i: Value = Value::Int(0);
        {
                        let mut w: Value = Value::Int(0);
            while is_less_than(&w, &Value::Int(10)) {
            i = add(&i, &Value::Int(1));
            w = add(&w, &Value::Int(1));
        }
        }
        println_val(&to_string_val(&i)); // should print 10
        let mut list2: Value = Value::List(vec![Value::Int(1), Value::Int(2), Value::Int(3), Value::Int(4), Value::Int(5)]);
        list2 = reverse(list2.clone());
        println_val(&get_value(&list2, &Value::Int(0))); // should print 5
        //should delete key from dict
        let mut dict2: Value = Value::Map({
            let mut m = std::collections::HashMap::new();
                m.insert("a".to_string(), Value::Int(1));
                m.insert("b".to_string(), Value::Int(2));
            m
        });
        remove(&mut dict2, &Value::Str("a".to_string()));
        let mut dictKeys: Value = object_keys(&dict2);
        println_val(&get_array_length(&dictKeys)); // should print 1
        println_val(&get_value(&dictKeys, &Value::Int(0))); // should print "b"
        let mut firstConcat: Value = Value::List(vec![Value::Str("a".to_string()), Value::Str("b".to_string())]);
        let mut secondConcat: Value = Value::List(vec![Value::Str("c".to_string()), Value::Str("d".to_string())]);
        let mut both: Value = concat(firstConcat.clone(), secondConcat.clone());
        println_val(&get_array_length(&both)); // should print 4
        println_val(&get_value(&both, &Value::Int(2))); // should print "c"
        let mut baseString: Value = Value::Str("aabba".to_string());
        let mut replacedAllString: Value = replace_all_str(&baseString, &Value::Str("a".to_string()), &Value::Str("".to_string()));
        println_val(&replacedAllString); // should print "bb"
        self.functionWithOptionals(Value::Str("hello".to_string()), &[]);
        self.functionWithOptionals(Value::Str("hello".to_string()), &[Value::Int(5)]);
        self.functionWithOptionals(Value::Str("hello".to_string()), &[Value::Int(5), Value::Int(1)]);
        let mut list3: Value = Value::List(vec![Value::Str("empty".to_string())]);
        add_element_to_object(&mut list3, &Value::Int(0), Value::Str("first".to_string()));
        println_val(&get_value(&list3, &Value::Int(0))); // should print "first"
        let mut dict3: Value = Value::Map({
            let mut m = std::collections::HashMap::new();
            m
        });
        add_element_to_object(&mut dict3, &Value::Str("key".to_string()), Value::Str("value".to_string()));
        println_val(&get_value(&dict3, &Value::Str("key".to_string()))); // should print "value"
        self.testJavaScope();
}
}
