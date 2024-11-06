class Second:
    my_class_property = 'classProp'

    def stringify_number(self, arg):
        return str(arg)
class Test:
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
