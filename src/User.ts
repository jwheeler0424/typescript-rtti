function entity<T extends { new (...args: any[]): {} }>(target: T) {}
function field(meta?: any) {
  return function (...args: any[]) {};
}
function log(...args: any[]) {}
function inject(key: string) {
  return function (...args: any[]) {};
}

@entity
class User {
  @log
  @field({ type: "id" })
  id: string;

  name: string;
  email?: string;

  constructor(id: string, name: string, email?: string) {
    this.id = id;
    this.name = name;
    this.email = email;
  }

  @log
  save(id: string) {
    // example method logic
  }
}

// Export (optional, for the test runner)
export { User };
