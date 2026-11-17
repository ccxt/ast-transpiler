//! The printer emits fully-qualified `crate::value::get_value_k` for
//! literal element-access keys, mirroring the ccxt rust port's module layout.

use crate::helpers::{get_value, Value};

/// `get_value` for a `&str` key — avoids allocating a `Value::Str` for the
/// static-key read path.
#[allow(dead_code)]
pub fn get_value_k(obj: &Value, key: &str) -> Value {
    get_value(obj, &Value::Str(key.to_string()))
}

/// The shared list a list-typed local holds (ccxt-common `value::List`): the
/// printer types a never-reassigned list local as this alias.
#[allow(dead_code)]
pub type List = std::sync::Arc<Vec<Value>>;
