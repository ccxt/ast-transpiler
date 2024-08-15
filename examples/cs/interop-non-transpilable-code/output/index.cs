using Helpers;

class MyClass
{
    public virtual void mainFeature(object message)
    {
        object ar = new List<object>() {1, 2, 3};
        ar = (ar as IList<object>).Reverse();
        Console.WriteLine(ar);
        Console.WriteLine(add("Hello! I\'m inside main class:", message));
        nonTranspilableFeature(); // invoke non-transpilable code here normally
    }

    public virtual object convertToInt(object number)
    {
        object conversion = parseInt(number);
        return conversion;
    }
}
