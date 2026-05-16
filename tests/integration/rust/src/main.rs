#![allow(non_snake_case, dead_code, unused_variables, unused_mut)]
mod helpers;
mod transpilable;
use transpilable::Test;

fn main() {
    let mut instance = Test::new();
    instance.test();
}
