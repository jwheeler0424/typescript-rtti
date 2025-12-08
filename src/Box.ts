export class Box<T, U> {
  value: T;
  meta: U;
}

export function wrap<T>(val: T): Box<T, string> {
  return { value: val, meta: "meta" };
}
