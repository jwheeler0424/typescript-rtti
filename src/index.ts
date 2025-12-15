// Entrypoint for runtime usage demo (will use Hydrator/readers later)
console.log("TypeScript RTTI runtime system starting...");

/* CLASS DECORATORS */
{
  type Constructor<T = {}> = new (...args: any[]) => T;
  class InstanceCollector {
    instances = new Set();

    install = <Class extends Constructor>(
      Value: Class,
      context: ClassDecoratorContext<Class>
    ) => {
      const _this = this;
      return class extends Value {
        constructor(...args: any[]) {
          super(...args);
          _this.instances.add(this);
        }
      };
    };
  }

  const collector = new InstanceCollector();

  @collector.install
  class Calculator {
    add(a: number, b: number): number {
      return a + b;
    }
  }

  const calculator1 = new Calculator();
  const calculator2 = new Calculator();

  console.log("instances: ", collector.instances);
  console.log("calculator1.add(2, 3): ", calculator1.add(2, 3));
}

/* METHOD DECORATORS */
{
  type Constructor<T = {}> = new (...args: any[]) => T;

  class InstanceCollector {
    instances = new Set();

    install = <Class extends Constructor>(
      Value: Class,
      context: ClassDecoratorContext<Class>
    ) => {
      const _this = this;
      return class extends Value {
        constructor(...args: any[]) {
          super(...args);
          _this.instances.add(this);
        }
      };
    };
  }

  const collector = new InstanceCollector();

  @collector.install
  class Calculator {
    add(a: number, b: number): number {
      return a + b;
    }
  }

  const calculator1 = new Calculator();
  const calculator2 = new Calculator();

  console.log("instances: ", collector.instances);
}

/* GETTER & SETTER DECORATORS */
{
  function lazy<This, Return>(
    target: (this: This) => Return,
    context: ClassGetterDecoratorContext<This, Return>
  ) {
    return function (this: This): Return {
      const value = target.call(this);
      Object.defineProperty(this, context.name, { value, enumerable: true });
      return value;
    };
  }

  class MyClass {
    private _expensiveValue: number | null = null;

    @lazy
    get expensiveValue(): number {
      this._expensiveValue ??= computeExpensiveValue();
      return this._expensiveValue;
    }
  }

  function computeExpensiveValue(): number {
    // Expensive computation here…
    console.log("computing..."); // Only call once

    return 42;
  }

  const obj = new MyClass();

  console.log(obj.expensiveValue);
  console.log(obj.expensiveValue);
  console.log(obj.expensiveValue);
}

/* FIELD/PROPERTY DECORATORS */
{
  function addOne<T>(
    target: undefined,
    context: ClassFieldDecoratorContext<T, number>
  ) {
    return function (this: T, value: number) {
      console.log("addOne: ", value); // 3
      return value + 1;
    };
  }

  function addTwo<T>(
    target: undefined,
    context: ClassFieldDecoratorContext<T, number>
  ) {
    return function (this: T, value: number) {
      console.log("addTwo: ", value); // 1
      return value + 2;
    };
  }

  class MyClass {
    @addOne
    @addTwo
    x = 1;
  }

  console.log(new MyClass().x); // 4
}

/* AUTO-ACCESSOR DECORATORS */
{
  class C {
    accessor x = 1;
  }
}

{
  // Same
  class C {
    #x = 1;

    get x() {
      return this.#x;
    }

    set x(val) {
      this.#x = val;
    }
  }
}

{
  function readOnly<This, Return>(
    target: ClassAccessorDecoratorTarget<This, Return>,
    context: ClassAccessorDecoratorContext<This, Return>
  ) {
    const result: ClassAccessorDecoratorResult<This, Return> = {
      get(this: This) {
        return target.get.call(this);
      },
      set() {
        throw new Error(
          `Cannot assign to read-only property '${String(context.name)}'.`
        );
      },
    };

    return result;
  }

  class MyClass {
    @readOnly accessor myValue = 123;
  }

  const obj = new MyClass();

  console.log(obj.myValue);
  try {
    obj.myValue = 456; // Error: Cannot assign to read-only property 'myValue'.
  } catch (e) {
    console.error(e);
  }
  console.log(obj.myValue);
}
