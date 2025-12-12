export class Person {
  name: string;
  isActive: boolean;

  constructor(private id: number, name: string, isActive: boolean) {
    this.id = id;
    this.name = name;
    this.isActive = isActive;
  }
}

export function greet(name: string): string {
  return `Hello, ${name}!`;
}

function dec(...args: any[]) {}

class Demo {
  @dec methodA(@dec x: string, @dec y: number) {}
}
