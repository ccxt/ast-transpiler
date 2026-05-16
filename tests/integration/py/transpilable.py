class Second:
    my_class_property = 'classProp'
    my_bool_prop = False

    def stringify_number(self, arg):
        return str(arg)
class Test:
    def function_with_optionals(self, a, c=None, d=1):
        print(a)
        if c is not None:
            print(c)
        if d is not None:
            print(d)

    def get_value(self, x):
        return x

    def test_java_scope(self):
        new_object = {
            'a': self.get_value(5),
            'b': self.get_value(self.get_value(self.get_value(2))),
        }
        print(new_object['a'])  # should print 5
        print(new_object['b'])  # should print 2

    def test(self):
        a = 1
        b = 2
        c = a + b
        print(c)  # should print 3
        s1 = 'a'
        s2 = 'b'
        s3 = s1 + s2
        string_var = None
        string_var = 'hello'
        print(string_var)  # should print "hello"
        print(s3)  # should print "ab"
        x = False
        if x:
            print('x is true')
        else:
            print('x is false')  # should print "x is false"
        instance = Second()
        print(instance.stringify_number(4))  # should print 4
        print(instance.my_class_property)  # should print "classProp"
        if instance.my_bool_prop == False:
            print('myBoolProp is false')  # should print "myBoolProp is false"
        arr = [1, 2, 3, 4]
        print(len(arr))  # should print 4
        first = arr[0]
        print(first)  # should print 1
        dict = {
            'a': 'b',
        }
        print(dict['a'])  # should print "b"
        i = 0
        for w in range(0, 10):
            i = i + 1
        print(str(i))  # should print 10
        list2 = [1, 2, 3, 4, 5]
        list2.reverse()
        print(list2[0])  # should print 5
        #should delete key from dict
        dict2 = {
            'a': 1,
            'b': 2,
        }
        del dict2['a']
        dict_keys = list(dict2.keys())
        print(len(dict_keys))  # should print 1
        print(dict_keys[0])  # should print "b"
        first_concat = ['a', 'b']
        second_concat = ['c', 'd']
        both = first_concat + second_concat
        print(len(both))  # should print 4
        print(both[2])  # should print "c"
        base_string = 'aabba'
        replaced_all_string = base_string.replace('a', '')
        print(replaced_all_string)  # should print "bb"
        self.function_with_optionals('hello')
        self.function_with_optionals('hello', 5)
        self.function_with_optionals('hello', 5, 1)
        list3 = ['empty']
        list3[0] = 'first'
        print(list3[0])  # should print "first"
        dict3 = {}
        dict3['key'] = 'value'
        print(dict3['key'])  # should print "value"
        self.test_java_scope()
