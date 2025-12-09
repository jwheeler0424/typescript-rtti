type Keys = "a" | "b";
type Mapped = { [K in Keys]: number };
type Maybe<T> = T extends string ? string[] : never;
type Union = Mapped | Maybe<string>;
