// ----- SIMPLE PRIMITIVES -----
export type SimpleString = string;
export type SimpleNumber = number;
export type LiteralUnion = "A" | "B" | "C";
export type Point = { x: number; y: number };

// ----- ENUMS -----
export enum Role {
  Admin,
  User,
  Visitor = 5,
}
export enum Color {
  Red = "red",
  Green = "green",
  Blue = "blue",
}

// ----- TYPE ALIASES/ADVANCED -----
export type TupleType = [string, number, boolean?];
export type ReadonlyPoint = Readonly<Point>;
export type PartialPoint = Partial<Point>;
export type IntersectionType = Point & { z?: number };
export type MappedType<T> = { [K in keyof T]: T[K] | null };
export type Conditional<X> = X extends string ? "str" : number;
export type Keys = keyof Point;
export type WrappedPromise<T> = Promise<T[]>;

// ----- UNION/INTERSECTION ALIAS -----
export type U = { u: string } | { v: number } | Point;
export type I = { u: string } & { v: number };

// ----- INTERFACE (INHERITANCE, OVERLOADED METHODS, FLAGS) -----
export interface Shape {
  readonly id: string;
  area(): number;
  bbox?(): [number, number, number, number]; // optional method
}
export interface Named {
  name: string;
}
export interface LabeledBox extends Shape, Named {
  label: string;
  corners(): [Point, Point, Point, Point];
  // Overloaded method
  scale(factor: number): this;
  scale(x: number, y: number): this;
  scale(xy: [number, number]): this;
}
export interface OptionalProps {
  data?: string;
  readonly tag: string;
  readonly flag?: boolean;
  meta: unknown | null;
}

// ----- DECORATOR DECL STUBS -----
declare function entity(...a: any[]): ClassDecorator;
declare function log(target: any, prop?: string): any;
declare function field(meta: any): PropertyDecorator;
declare function dec(...args: any[]): MethodDecorator;

// ----- CLASS WITH GENERICS, BASES, CTOR PARAM DECORATORS, METHOD DECORATORS, OVERLOADS -----
@entity()
export class User implements Shape, Named {
  @log
  @field({ type: "id" })
  id: string;
  name: string;
  email?: string;

  constructor(
    @log @field({ type: "id" }) public id: string,
    name: string,
    email?: string
  ) {
    this.id = id;
    this.name = name;
    this.email = email;
  }

  @dec()
  area(): number {
    return 0;
  }
  bbox(): [number, number, number, number] {
    return [0, 0, 1, 1];
  }
}

export class Box<T, U = string> {
  value: T;
  meta: U;
}

// FUNCTOR, GENERIC MAP, MAPPED, CONDITIONAL TESTS
export function wrap<T>(a: T): T {
  return a;
}

export type MappedNumbers = MappedType<{ foo: number; bar: boolean }>;
export type TupleMapped = { [K in keyof TupleType]: TupleType[K] };

// FUNCTION TYPE AND FUNCTION WITH GENERICS/OVERLOADS
export type CompareFn<T> = (a: T, b: T) => number;
export function compare(a: string, b: string): number;
export function compare(a: number, b: number): number;
export function compare(a: any, b: any): number {
  return 0;
}

// ----- CONDITIONAL/LITERAL ALIAS -----
export type MaybeString<T> = T extends string ? string | null : never;

// ----- ACCESSOR/PROPERTY FLAGS -----
export class FlagsTest {
  private _value: number = 0;
  get value(): number {
    return this._value;
  }
  set value(v: number) {
    this._value = v;
  }
  static readonly flag: boolean = true;
}

// ----- COMPLEX GENERIC CLASS -----
export class Pair<A, B> {
  constructor(public first: A, public second: B) {}
  swap(): Pair<B, A> {
    return new Pair(this.second, this.first);
  }
}

// ----- DOUBLE-NESTED INTERFACE -----
export interface Outer {
  inner: {
    value: string;
    meta: { tag: "foo" | "bar" };
  };
}

// ----- LITERAL PROPERTY AND FUNCTION -----
export type Direction = "left" | "right";
export function move(dir: Direction): void {}

// ----- UNIONS & MAPPED OVER CONDITIONAL -----
export type Option<T> = T | null;
export type AllValues<T> = { [K in keyof T]: T[K] };
