function dec(...args: any[]) {}

class Demo {
  @dec foo(x: string, y: number) {}
  protected bar?: number;
  private static readonly baz: boolean;
}
