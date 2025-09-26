/**
 * @fileoverview Vector Clock implementation for distributed event ordering
 * @author Raul JM
 */

/**
 * Vector Clock for distributed event ordering
 * Ensures causal ordering of events across multiple nodes
 */
export class VectorClock {
  constructor(nodeId, initialClock = {}) {
    this.nodeId = nodeId;
    this.clock = { ...initialClock };

    // Initialize our own entry
    if (!this.clock[this.nodeId]) {
      this.clock[this.nodeId] = 0;
    }
  }

  /**
   * Increment local clock and return new value
   * @returns {number} New clock value for this node
   */
  tick() {
    this.clock[this.nodeId] = (this.clock[this.nodeId] || 0) + 1;
    return this.clock[this.nodeId];
  }

  /**
   * Update clock with another vector clock
   * @param {VectorClock} other - Other vector clock
   */
  update(other) {
    if (!(other instanceof VectorClock)) {
      throw new Error('Invalid vector clock');
    }

    // Take maximum of each entry
    Object.keys(other.clock).forEach(nodeId => {
      this.clock[nodeId] = Math.max(this.clock[nodeId] || 0, other.clock[nodeId] || 0);
    });

    // Increment our own entry
    this.tick();
  }

  /**
   * Compare this vector clock with another
   * @param {VectorClock} other - Other vector clock
   * @returns {number} -1 if this < other, 0 if equal, 1 if this > other, null if concurrent
   */
  compare(other) {
    if (!(other instanceof VectorClock)) {
      throw new Error('Invalid vector clock');
    }

    const allNodes = new Set([...Object.keys(this.clock), ...Object.keys(other.clock)]);

    let thisGreater = false;
    let otherGreater = false;

    for (const nodeId of allNodes) {
      const thisValue = this.clock[nodeId] || 0;
      const otherValue = other.clock[nodeId] || 0;

      if (thisValue > otherValue) {
        thisGreater = true;
      } else if (otherValue > thisValue) {
        otherGreater = true;
      }
    }

    if (thisGreater && !otherGreater) {
      return 1; // this > other
    } else if (otherGreater && !thisGreater) {
      return -1; // this < other
    } else if (!thisGreater && !otherGreater) {
      return 0; // equal
    } else {
      return null; // concurrent
    }
  }

  /**
   * Check if this clock happens before another
   * @param {VectorClock} other - Other vector clock
   * @returns {boolean} True if this happens before other
   */
  happensBefore(other) {
    return this.compare(other) === -1;
  }

  /**
   * Check if this clock happens after another
   * @param {VectorClock} other - Other vector clock
   * @returns {boolean} True if this happens after other
   */
  happensAfter(other) {
    return this.compare(other) === 1;
  }

  /**
   * Check if this clock is concurrent with another
   * @param {VectorClock} other - Other vector clock
   * @returns {boolean} True if concurrent
   */
  isConcurrent(other) {
    return this.compare(other) === null;
  }

  /**
   * Get clock as plain object
   * @returns {Object} Clock representation
   */
  toObject() {
    return { ...this.clock };
  }

  /**
   * Create vector clock from object
   * @param {string} nodeId - Node ID
   * @param {Object} clock - Clock object
   * @returns {VectorClock} New vector clock
   */
  static fromObject(nodeId, clock) {
    return new VectorClock(nodeId, clock);
  }

  /**
   * Clone this vector clock
   * @returns {VectorClock} Cloned vector clock
   */
  clone() {
    return new VectorClock(this.nodeId, this.clock);
  }

  /**
   * Get string representation
   * @returns {string} String representation
   */
  toString() {
    return `VectorClock(${this.nodeId}): ${JSON.stringify(this.clock)}`;
  }
}

/**
 * Event with vector clock for distributed ordering
 */
export class TimestampedEvent {
  constructor(event, vectorClock) {
    this.event = event;
    this.vectorClock = vectorClock;
    this.timestamp = Date.now();
    this.id = `${vectorClock.nodeId}-${vectorClock.clock[vectorClock.nodeId]}-${this.timestamp}`;
  }

  /**
   * Compare with another timestamped event
   * @param {TimestampedEvent} other - Other event
   * @returns {number} Comparison result
   */
  compare(other) {
    if (!(other instanceof TimestampedEvent)) {
      throw new Error('Invalid timestamped event');
    }

    // First try vector clock comparison
    const vectorCompare = this.vectorClock.compare(other.vectorClock);
    if (vectorCompare !== null) {
      return vectorCompare;
    }

    // If concurrent, use timestamp as tiebreaker
    if (this.timestamp < other.timestamp) {
      return -1;
    } else if (this.timestamp > other.timestamp) {
      return 1;
    }

    // If still equal, use ID as final tiebreaker
    return this.id.localeCompare(other.id);
  }

  /**
   * Check if this event happens before another
   * @param {TimestampedEvent} other - Other event
   * @returns {boolean} True if this happens before other
   */
  happensBefore(other) {
    return this.compare(other) === -1;
  }

  /**
   * Get event data
   * @returns {Object} Event data
   */
  getEvent() {
    return this.event;
  }

  /**
   * Get string representation
   * @returns {string} String representation
   */
  toString() {
    return `Event(${this.id}): ${JSON.stringify(this.event)}`;
  }
}
