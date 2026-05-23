'use strict';

const EventEmitter = require('events');
const logger = require('../../utils/logger');
const { EVENTS } = require('../../config/constants');

class CascadesEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(30); // one per skill + orchestrator
  }

  /**
   * Emit with logging so all system events are auditable.
   */
  publish(eventName, payload = {}) {
    logger.debug(`Event published: ${eventName}`, { payload });
    this.emit(eventName, { event: eventName, timestamp: new Date().toISOString(), ...payload });
  }

  /**
   * Subscribe a skill to an event. Returns an unsubscribe function.
   */
  subscribe(eventName, skillName, handler) {
    const wrappedHandler = (data) => {
      logger.debug(`Event received: ${eventName}`, { skill: skillName });
      handler(data).catch((err) =>
        logger.error(`Event handler error in ${skillName}`, { event: eventName, error: err })
      );
    };
    this.on(eventName, wrappedHandler);
    return () => this.off(eventName, wrappedHandler);
  }
}

// Singleton event bus shared across the application
const eventBus = new CascadesEventBus();

module.exports = { eventBus, EVENTS };
