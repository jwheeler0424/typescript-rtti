function wrap(a: string): number;
function wrap(a: number): string;
function wrap(a: any): any {
  return a;
}

class DemoOverload {
  foo(a: string): number;
  foo(a: number): string;
  foo(a: any): any {
    return a;
  }
}
