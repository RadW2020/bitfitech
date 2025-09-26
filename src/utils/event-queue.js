/**
 * @fileoverview Event queue with vector clock ordering for distributed systems
 * @author Raul JM
 */

import { VectorClock, TimestampedEvent } from './vector-clock.js';

/**
 * Event queue that maintains causal ordering using vector clocks
 */
export class EventQueue {
  constructor(nodeId) {
    this.nodeId = nodeId;
    this.vectorClock = new VectorClock(nodeId);
    this.pendingEvents = [];
    this.processedEvents = new Set();
    this.eventHandlers = new Map();
    this.processing = false;
  }

  /**
   * Add event handler for specific event type
   * @param {string} eventType - Event type
   * @param {Function} handler - Event handler function
   */
  on(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType).push(handler);
  }

  /**
   * Remove event handler
   * @param {string} eventType - Event type
   * @param {Function} handler - Event handler function
   */
  off(eventType, handler) {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Enqueue event with vector clock
   * @param {Object} event - Event data
   * @param {VectorClock} eventVectorClock - Event's vector clock
   * @returns {Promise<void>}
   */
  async enqueue(event, eventVectorClock = null) {
    // Use provided vector clock or create new one
    const clock = eventVectorClock || this.vectorClock.clone();

    // Update our vector clock
    if (eventVectorClock) {
      this.vectorClock.update(eventVectorClock);
    } else {
      this.vectorClock.tick();
    }

    // Create timestamped event
    const timestampedEvent = new TimestampedEvent(event, clock);

    // Check for duplicates
    if (this.processedEvents.has(timestampedEvent.id)) {
      return; // Already processed
    }

    // Add to pending events
    this.pendingEvents.push(timestampedEvent);

    // Sort by vector clock order
    this.pendingEvents.sort((a, b) => a.compare(b));

    // Process events if not already processing
    if (!this.processing) {
      await this.processEvents();
    }
  }

  /**
   * Process events in order
   * @private
   */
  async processEvents() {
    if (this.processing) {
      return;
    }

    this.processing = true;

    try {
      while (this.pendingEvents.length > 0) {
        const event = this.pendingEvents.shift();

        // Skip if already processed
        if (this.processedEvents.has(event.id)) {
          continue;
        }

        // Mark as processed
        this.processedEvents.add(event.id);

        // Process the event
        await this.processEvent(event);

        // Clean up old processed events (keep last 1000)
        if (this.processedEvents.size > 1000) {
          const eventsToRemove = Array.from(this.processedEvents).slice(0, 100);
          eventsToRemove.forEach(id => this.processedEvents.delete(id));
        }
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Process individual event
   * @param {TimestampedEvent} timestampedEvent - Timestamped event
   * @private
   */
  async processEvent(timestampedEvent) {
    const event = timestampedEvent.getEvent();
    const eventType = event.type || 'default';

    const handlers = this.eventHandlers.get(eventType) || [];

    // Execute all handlers for this event type
    for (const handler of handlers) {
      try {
        await handler(event, timestampedEvent.vectorClock);
      } catch (error) {
        console.error(`Error processing event ${eventType}:`, error);
      }
    }
  }

  /**
   * Get current vector clock
   * @returns {VectorClock} Current vector clock
   */
  getVectorClock() {
    return this.vectorClock.clone();
  }

  /**
   * Get pending events count
   * @returns {number} Number of pending events
   */
  getPendingCount() {
    return this.pendingEvents.length;
  }

  /**
   * Get processed events count
   * @returns {number} Number of processed events
   */
  getProcessedCount() {
    return this.processedEvents.size;
  }

  /**
   * Clear all events
   */
  clear() {
    this.pendingEvents = [];
    this.processedEvents.clear();
  }

  /**
   * Get queue status
   * @returns {Object} Queue status
   */
  getStatus() {
    return {
      nodeId: this.nodeId,
      vectorClock: this.vectorClock.toObject(),
      pendingCount: this.pendingEvents.length,
      processedCount: this.processedEvents.size,
      processing: this.processing,
    };
  }
}
