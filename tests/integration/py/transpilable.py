class Second:
    my_class_property = 'classProp'
    my_bool_prop = False

    def stringify_number(self, arg):
        return str(arg)
class Test:
    def bool_to_string(self, x):
        if x:
            return 'true'
        else:
            return 'false'

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
        [first1, second1] = self.handle_option_and_params_test()
        print(first1)  # should print 1
        print(second1)  # should print "a"
        first2 = None
        second2 = None
        [first2, second2] = self.handle_option_and_params_test()
        print(first2)  # should print 1
        print(second2)  # should print "a"
        self.func_with_params([1, 2, 3], {
            'a': 'value of a',
        })
        self.test_string_methods()
        threw_error = False
        try:
            self.function_that_throws()
        except Exception as e:
            threw_error = True
        print(self.bool_to_string(threw_error))  # should print true

    def handle_option_and_params_test(self):
        return [1, 'a']

    def func_with_params(self, a=None, params={}):
        if isinstance(a, list):
            print(len(a))
        if 'a' in params:
            print(params['a'])

    def test_string_methods(self):
        str = 'hello world'
        # isEqual test
        if str == 'hello world':
            print('str is hello world')  # should print "str is hello world"
        print(str.upper())
        starts_with_hello = str.startswith('hello')
        print(self.bool_to_string(starts_with_hello))  # should print true
        ends_with_world = str.endswith('world')
        print(self.bool_to_string(ends_with_world))  # should print true
        string_parts = str.split(' ')
        print(len(string_parts))  # should print 2
        print(string_parts[0])  # should print "hello"
        print(string_parts[1])  # should print "world"
        index_of_result = str.find('o')
        print(index_of_result)  # should print 4
        str_replaced = str.replace('l', 'x')
        print(str_replaced)  # should print "hexxo worxd"
        # concatenation test
        a = 'a'
        b = 'b'
        c = a + b
        print(c)  # should print "ab"

    def function_that_throws(self):
        raise Error('This is an error')
