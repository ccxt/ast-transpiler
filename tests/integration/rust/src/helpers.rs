use std::collections::HashMap;
use std::fmt;

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Int(i64),
    Float(f64),
    Str(String),
    Bool(bool),
    List(Vec<Value>),
    Map(HashMap<String, Value>),
    Null,
}

impl fmt::Display for Value {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Value::Int(n) => write!(f, "{}", n),
            Value::Float(n) => {
                if n.fract() == 0.0 {
                    write!(f, "{}", *n as i64)
                } else {
                    write!(f, "{}", n)
                }
            }
            Value::Str(s) => write!(f, "{}", s),
            Value::Bool(b) => write!(f, "{}", b),
            Value::List(l) => {
                let items: Vec<String> = l.iter().map(|v| format!("{}", v)).collect();
                write!(f, "[{}]", items.join(", "))
            }
            Value::Map(m) => {
                let items: Vec<String> =
                    m.iter().map(|(k, v)| format!("{}: {}", k, v)).collect();
                write!(f, "{{{}}}", items.join(", "))
            }
            Value::Null => write!(f, "null"),
        }
    }
}

pub fn println_val(v: &Value) {
    println!("{}", v);
}

pub fn is_true(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Int(n) => *n != 0,
        Value::Float(n) => *n != 0.0,
        Value::Str(s) => !s.is_empty(),
        Value::List(l) => !l.is_empty(),
        Value::Map(m) => !m.is_empty(),
    }
}

pub fn is_equal(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Null, Value::Null) => true,
        (Value::Bool(x), Value::Bool(y)) => x == y,
        (Value::Int(x), Value::Int(y)) => x == y,
        (Value::Float(x), Value::Float(y)) => x == y,
        (Value::Int(x), Value::Float(y)) => (*x as f64) == *y,
        (Value::Float(x), Value::Int(y)) => *x == (*y as f64),
        (Value::Str(x), Value::Str(y)) => x == y,
        (Value::Bool(false), Value::Null) | (Value::Null, Value::Bool(false)) => false,
        _ => false,
    }
}

pub fn is_greater_than(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Int(x), Value::Int(y)) => x > y,
        (Value::Float(x), Value::Float(y)) => x > y,
        (Value::Int(x), Value::Float(y)) => (*x as f64) > *y,
        (Value::Float(x), Value::Int(y)) => *x > (*y as f64),
        (Value::Str(x), Value::Str(y)) => x > y,
        _ => false,
    }
}

pub fn is_less_than(a: &Value, b: &Value) -> bool {
    !is_greater_than(a, b) && !is_equal(a, b)
}

pub fn is_greater_than_or_equal(a: &Value, b: &Value) -> bool {
    is_greater_than(a, b) || is_equal(a, b)
}

pub fn is_less_than_or_equal(a: &Value, b: &Value) -> bool {
    is_less_than(a, b) || is_equal(a, b)
}

pub fn add(a: &Value, b: &Value) -> Value {
    match (a, b) {
        (Value::Int(x), Value::Int(y)) => Value::Int(x + y),
        (Value::Float(x), Value::Float(y)) => Value::Float(x + y),
        (Value::Int(x), Value::Float(y)) => Value::Float((*x as f64) + y),
        (Value::Float(x), Value::Int(y)) => Value::Float(x + (*y as f64)),
        (Value::Str(x), Value::Str(y)) => Value::Str(format!("{}{}", x, y)),
        (Value::Str(x), v) => Value::Str(format!("{}{}", x, v)),
        (v, Value::Str(y)) => Value::Str(format!("{}{}", v, y)),
        _ => Value::Null,
    }
}

pub fn subtract(a: &Value, b: &Value) -> Value {
    match (a, b) {
        (Value::Int(x), Value::Int(y)) => Value::Int(x - y),
        (Value::Float(x), Value::Float(y)) => Value::Float(x - y),
        (Value::Int(x), Value::Float(y)) => Value::Float((*x as f64) - y),
        (Value::Float(x), Value::Int(y)) => Value::Float(x - (*y as f64)),
        _ => Value::Null,
    }
}

pub fn multiply(a: &Value, b: &Value) -> Value {
    match (a, b) {
        (Value::Int(x), Value::Int(y)) => Value::Int(x * y),
        (Value::Float(x), Value::Float(y)) => Value::Float(x * y),
        (Value::Int(x), Value::Float(y)) => Value::Float((*x as f64) * y),
        (Value::Float(x), Value::Int(y)) => Value::Float(x * (*y as f64)),
        _ => Value::Null,
    }
}

pub fn divide(a: &Value, b: &Value) -> Value {
    match (a, b) {
        (Value::Int(x), Value::Int(y)) if *y != 0 => Value::Int(x / y),
        (Value::Float(x), Value::Float(y)) if *y != 0.0 => Value::Float(x / y),
        (Value::Int(x), Value::Float(y)) if *y != 0.0 => Value::Float((*x as f64) / y),
        (Value::Float(x), Value::Int(y)) if *y != 0 => Value::Float(x / (*y as f64)),
        _ => Value::Null,
    }
}

pub fn mod_val(a: &Value, b: &Value) -> Value {
    match (a, b) {
        (Value::Int(x), Value::Int(y)) if *y != 0 => Value::Int(x % y),
        (Value::Float(x), Value::Float(y)) if *y != 0.0 => Value::Float(x % y),
        _ => Value::Null,
    }
}

pub fn negate(a: &Value) -> Value {
    match a {
        Value::Int(x) => Value::Int(-x),
        Value::Float(x) => Value::Float(-x),
        _ => Value::Null,
    }
}

pub fn get_value(container: &Value, key: &Value) -> Value {
    match (container, key) {
        (Value::List(l), Value::Int(i)) => {
            let idx = *i as usize;
            l.get(idx).cloned().unwrap_or(Value::Null)
        }
        (Value::Map(m), Value::Str(k)) => m.get(k).cloned().unwrap_or(Value::Null),
        (Value::Str(s), Value::Int(i)) => {
            let idx = *i as usize;
            s.chars().nth(idx).map(|c| Value::Str(c.to_string())).unwrap_or(Value::Null)
        }
        _ => Value::Null,
    }
}

pub fn add_element_to_object(container: &mut Value, key: &Value, val: Value) {
    match (container, key) {
        (Value::List(l), Value::Int(i)) => {
            let idx = *i as usize;
            if idx < l.len() {
                l[idx] = val;
            } else {
                while l.len() < idx {
                    l.push(Value::Null);
                }
                l.push(val);
            }
        }
        (Value::Map(m), Value::Str(k)) => {
            m.insert(k.clone(), val);
        }
        _ => {}
    }
}

pub fn get_array_length(v: &Value) -> Value {
    match v {
        Value::List(l) => Value::Int(l.len() as i64),
        Value::Str(s) => Value::Int(s.len() as i64),
        Value::Map(m) => Value::Int(m.len() as i64),
        _ => Value::Int(0),
    }
}

pub fn object_keys(v: &Value) -> Value {
    match v {
        Value::Map(m) => {
            let mut keys: Vec<String> = m.keys().cloned().collect();
            keys.sort(); // deterministic order
            Value::List(keys.into_iter().map(Value::Str).collect())
        }
        _ => Value::List(vec![]),
    }
}

pub fn object_values(v: &Value) -> Value {
    match v {
        Value::Map(m) => {
            let mut pairs: Vec<(String, Value)> = m.clone().into_iter().collect();
            pairs.sort_by_key(|(k, _)| k.clone());
            Value::List(pairs.into_iter().map(|(_, v)| v).collect())
        }
        _ => Value::List(vec![]),
    }
}

pub fn is_array(v: &Value) -> bool {
    matches!(v, Value::List(_))
}

pub fn is_string(v: &Value) -> bool {
    matches!(v, Value::Str(_))
}

pub fn is_number(v: &Value) -> bool {
    matches!(v, Value::Int(_) | Value::Float(_))
}

pub fn is_bool(v: &Value) -> bool {
    matches!(v, Value::Bool(_))
}

pub fn is_object(v: &Value) -> bool {
    matches!(v, Value::Map(_))
}

pub fn is_function(_v: &Value) -> bool {
    false
}

pub fn is_integer(v: &Value) -> bool {
    matches!(v, Value::Int(_))
}

pub fn in_op(container: &Value, key: &Value) -> bool {
    match (container, key) {
        (Value::Map(m), Value::Str(k)) => m.contains_key(k),
        (Value::List(l), _) => l.iter().any(|v| is_equal(v, key)),
        _ => false,
    }
}

pub fn to_string_val(v: &Value) -> Value {
    Value::Str(format!("{}", v))
}

pub fn to_upper(v: &Value) -> Value {
    match v {
        Value::Str(s) => Value::Str(s.to_uppercase()),
        _ => v.clone(),
    }
}

pub fn to_lower(v: &Value) -> Value {
    match v {
        Value::Str(s) => Value::Str(s.to_lowercase()),
        _ => v.clone(),
    }
}

pub fn reverse(v: Value) -> Value {
    match v {
        Value::List(mut l) => {
            l.reverse();
            Value::List(l)
        }
        Value::Str(s) => Value::Str(s.chars().rev().collect()),
        _ => v,
    }
}

pub fn remove(v: &mut Value, key: &Value) {
    match (v, key) {
        (Value::Map(m), Value::Str(k)) => {
            m.remove(k);
        }
        (Value::List(l), Value::Int(i)) => {
            let idx = *i as usize;
            if idx < l.len() {
                l.remove(idx);
            }
        }
        _ => {}
    }
}

pub fn concat(a: Value, b: Value) -> Value {
    match (a, b) {
        (Value::List(mut la), Value::List(lb)) => {
            la.extend(lb);
            Value::List(la)
        }
        (Value::Str(sa), Value::Str(sb)) => Value::Str(format!("{}{}", sa, sb)),
        _ => Value::Null,
    }
}

pub fn contains(v: &Value, target: &Value) -> bool {
    match (v, target) {
        (Value::List(l), _) => l.iter().any(|x| is_equal(x, target)),
        (Value::Str(s), Value::Str(sub)) => s.contains(sub.as_str()),
        _ => false,
    }
}

pub fn get_index_of(v: &Value, target: &Value) -> Value {
    match (v, target) {
        (Value::List(l), _) => {
            match l.iter().position(|x| is_equal(x, target)) {
                Some(i) => Value::Int(i as i64),
                None => Value::Int(-1),
            }
        }
        (Value::Str(s), Value::Str(sub)) => {
            match s.find(sub.as_str()) {
                Some(i) => Value::Int(i as i64),
                None => Value::Int(-1),
            }
        }
        _ => Value::Int(-1),
    }
}

pub fn starts_with(v: &Value, prefix: &Value) -> bool {
    match (v, prefix) {
        (Value::Str(s), Value::Str(p)) => s.starts_with(p.as_str()),
        _ => false,
    }
}

pub fn ends_with(v: &Value, suffix: &Value) -> bool {
    match (v, suffix) {
        (Value::Str(s), Value::Str(p)) => s.ends_with(p.as_str()),
        _ => false,
    }
}

pub fn trim(v: &Value) -> Value {
    match v {
        Value::Str(s) => Value::Str(s.trim().to_string()),
        _ => v.clone(),
    }
}

pub fn split(v: &Value, sep: &Value) -> Value {
    match (v, sep) {
        (Value::Str(s), Value::Str(sep_str)) => {
            Value::List(s.split(sep_str.as_str()).map(|p| Value::Str(p.to_string())).collect())
        }
        _ => Value::List(vec![]),
    }
}

pub fn join(v: &Value, sep: &Value) -> Value {
    let sep_str = match sep {
        Value::Str(s) => s.as_str().to_string(),
        _ => format!("{}", sep),
    };
    match v {
        Value::List(l) => {
            let parts: Vec<String> = l.iter().map(|x| format!("{}", x)).collect();
            Value::Str(parts.join(&sep_str))
        }
        _ => Value::Str(String::new()),
    }
}

pub fn replace_str(v: &Value, from: &Value, to: &Value) -> Value {
    match (v, from, to) {
        (Value::Str(s), Value::Str(f), Value::Str(t)) => {
            Value::Str(s.replacen(f.as_str(), t.as_str(), 1))
        }
        _ => v.clone(),
    }
}

pub fn replace_all_str(v: &Value, from: &Value, to: &Value) -> Value {
    match (v, from, to) {
        (Value::Str(s), Value::Str(f), Value::Str(t)) => {
            Value::Str(s.replace(f.as_str(), t.as_str()))
        }
        _ => v.clone(),
    }
}

pub fn slice(v: &Value, start: &Value, end: &Value) -> Value {
    match v {
        Value::Str(s) => {
            let len = s.len();
            let start_idx = match start {
                Value::Int(i) => {
                    if *i < 0 { (len as i64 + i).max(0) as usize } else { (*i as usize).min(len) }
                }
                _ => 0,
            };
            let end_idx = match end {
                Value::Null => len,
                Value::Int(i) => {
                    if *i < 0 { (len as i64 + i).max(0) as usize } else { (*i as usize).min(len) }
                }
                _ => len,
            };
            Value::Str(s[start_idx..end_idx].to_string())
        }
        Value::List(l) => {
            let len = l.len();
            let start_idx = match start {
                Value::Int(i) => {
                    if *i < 0 { (len as i64 + i).max(0) as usize } else { (*i as usize).min(len) }
                }
                _ => 0,
            };
            let end_idx = match end {
                Value::Null => len,
                Value::Int(i) => {
                    if *i < 0 { (len as i64 + i).max(0) as usize } else { (*i as usize).min(len) }
                }
                _ => len,
            };
            Value::List(l[start_idx..end_idx].to_vec())
        }
        _ => v.clone(),
    }
}

pub fn append_to_array(v: &mut Value, elem: Value) {
    if let Value::List(l) = v {
        l.push(elem);
    }
}

pub fn shift(v: Value) -> Value {
    match v {
        Value::List(mut l) if !l.is_empty() => {
            l.remove(0);
            Value::List(l)
        }
        _ => v,
    }
}

pub fn pop(v: Value) -> Value {
    match v {
        Value::List(mut l) if !l.is_empty() => {
            l.pop();
            Value::List(l)
        }
        _ => v,
    }
}

pub fn get_arg(args: &[Value], idx: usize, default: Value) -> Value {
    args.get(idx).cloned().unwrap_or(default)
}

pub fn ternary(cond: bool, when_true: Value, when_false: Value) -> Value {
    if cond { when_true } else { when_false }
}

pub fn math_floor(v: &Value) -> Value {
    match v {
        Value::Float(f) => Value::Int(f.floor() as i64),
        Value::Int(i) => Value::Int(*i),
        _ => Value::Null,
    }
}

pub fn math_ceil(v: &Value) -> Value {
    match v {
        Value::Float(f) => Value::Int(f.ceil() as i64),
        Value::Int(i) => Value::Int(*i),
        _ => Value::Null,
    }
}

pub fn math_round(v: &Value) -> Value {
    match v {
        Value::Float(f) => Value::Int(f.round() as i64),
        Value::Int(i) => Value::Int(*i),
        _ => Value::Null,
    }
}

pub fn json_parse(_v: &Value) -> Value {
    Value::Null
}

pub fn json_stringify(v: &Value) -> Value {
    Value::Str(format!("{}", v))
}

pub fn to_fixed(v: &Value, decimals: &Value) -> Value {
    let n = match v {
        Value::Float(f) => *f,
        Value::Int(i) => *i as f64,
        _ => return Value::Null,
    };
    let d = match decimals {
        Value::Int(i) => *i as usize,
        _ => 0,
    };
    Value::Str(format!("{:.prec$}", n, prec = d))
}

pub fn is_instance(_v: &Value, _t: &Value) -> bool {
    false
}
