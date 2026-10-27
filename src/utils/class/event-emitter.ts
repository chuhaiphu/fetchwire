type Listener = () => void;

class EventEmitter {
  /**
   * @example
   * Map {
   *   "tag:users" => Set { [Function: refetchUsers], [Function: refetchProfile] },
   *   "tag:posts" => Set { [Function: refetchPosts] },
   *   "fetchKey:user-list" => Set { [Function: showRefreshedUsers] }
   * }
   */
  private readonly events = new Map<string, Set<Listener>>();

  addListener(event: string, listener: Listener) {
    // Retrieve the DIRECT MEMORY REFERENCE to the Set in the Map.
    let listeners = this.events.get(event);

    if (!listeners) {
      listeners = new Set<Listener>();
      this.events.set(event, listeners);
    }
    // Add listener to the Set via its reference.
    listeners.add(listener);

    // Return an object with a remove() method to unregister the listener when no longer needed.
    return {
      remove: () => {
        // Retrieve the DIRECT MEMORY REFERENCE to the Set in the Map.
        const currentListeners = this.events.get(event);
        if (!currentListeners) {
          return;
        }

        // Remove the listener function from the event's Set via its reference.
        // Before: Set { [Function: refetchUsers], [Function: refetchProfile] }
        // After:  Set { [Function: refetchProfile] }
        currentListeners.delete(listener);

        // If the event's Set is empty, remove the entire event entry (key and empty Set) from the Map.
        // Before: Map {
        //              "tag:users" => Set {},
        //              "tag:posts" => Set { [Function: refetchPosts] }
        //            }
        // After: Map {
        //              "tag:posts" => Set { [Function: refetchPosts] }
        //            }
        if (currentListeners.size === 0) {
          this.events.delete(event);
        }
      },
    };
  }

  emit(event: string): void {
    const listeners = this.events.get(event);
    if (!listeners) {
      return;
    }

    // Create a new static Array instance from the Set before iterating.
    //
    // Why this is required:
    // In JavaScript, if we iterate directly over a live `Set`,
    // JavaScript will track mutations made to that `Set` during the loop:
    //
    // - Case 1 (Infinite loop): If a running listener calls `remove()` (.delete)
    //   and immediately re-subscribes via `addListener()` (.add) synchronously,
    //   JavaScript's `Set` iterator will execute the re-added listener at the end of the Set,
    //   which calls `remove()` again, causing an endless loop.
    // - Case 2 (Unintended execution): If a running listener registers a new listener for the same event,
    //   the live `Set` iterator will also execute that newly added listener in the current cycle.
    //
    // `Array.from(listeners)` captures the exact list of listeners at the moment `emit()` was called.
    //
    // Target: listenersArraySnapshot (Listener[])
    // Shape:  [ [Function: refetchUsers], [Function: refetchProfile] ]
    const listenersArraySnapshot = Array.from(listeners);

    for (const listener of listenersArraySnapshot) {
      listener();
    }
  }
}

export const eventEmitter = new EventEmitter();
