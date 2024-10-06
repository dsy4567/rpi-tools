import EventEmitter from "events";

interface LoggerEmitterT extends EventEmitter {
    emit(event: "afterLog", data: {}): this;
    on(event: "afterLog", listener: (data: {}) => void): this;
}
