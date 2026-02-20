package main

import "fmt"

type A struct {
}

func (this *A) main(a any, b any) {
	// arr := []any{}
	// arr = appendToArray(arr, 1).([]any)
	// fmt.Println(arr)
	arr := []any{1}
	addElementToObject(arr, 0, 2)
	fmt.Println(arr)
}

func main() {
	a := A{}
	a.main(1, 2)
}
