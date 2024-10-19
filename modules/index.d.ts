import EventEmitter from "events";

interface LoggerEmitterT extends EventEmitter {
    emit(event: "afterLog", data: {}): this;
    on(event: "afterLog", listener: (data: {}) => void): this;
}

type QuickMenu = Record<
    string,
    | string
    | (() => void)
    | (() => Promise<void>)
    | Record<
          string,
          | string
          | (() => void)
          | (() => Promise<void>)
          | Record<string, string | (() => void) | (() => Promise<void>)>
      >
>;
