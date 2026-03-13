type Listener = () => void;

class EventEmitter {
  private events: Record<string, Listener[]> = {};

  emit(event: string) {
    if (!this.events[event]) return;
    this.events[event].forEach((listener) => listener());
  }

  addListener(event: string, listener: Listener) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
    
    return {
      remove: () => {
        this.events[event] = this.events[event].filter((l) => l !== listener);
      },
    };
  }
}

export const eventEmitter = new EventEmitter();