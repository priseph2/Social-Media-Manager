'use strict';

const logger = require('../utils/logger');
const Decision = require('../models/decision.model');
const { isMongoAvailable } = require('../services/database/mongodb-client');
const { tenantStorage } = require('../services/billing/usage-meter');

/**
 * All skills extend BaseSkill. Provides:
 *  - Named logger
 *  - Decision logging to MongoDB
 *  - Standardised execute() contract
 */
class BaseSkill {
  constructor(skillName) {
    this.name = skillName;
    this.log = logger.forSkill(skillName);
  }

  /**
   * Subclasses implement this. Receives a BullMQ job payload.
   * Must return a result object.
   * @abstract
   */
  async execute(job) {
    throw new Error(`${this.name}.execute() not implemented`);
  }

  /**
   * Processes a BullMQ job — wraps execute() with timing, logging, and decision recording.
   */
  async process(job) {
    const start = Date.now();
    this.log.info(`Processing job ${job.id}`, { jobName: job.name, jobId: job.id });

    const tenantId = job.data?.tenantId || null;
    if (!tenantId) {
      this.log.warn(`Job ${job.id} (${job.name}) has no tenantId — usage will not be metered`, { jobId: job.id });
    }

    // Set tenant context so every Claude call within this job is attributed correctly
    return tenantStorage.run({ tenantId, skill: this.name }, async () => {
      try {
        const result = await this.execute(job);
        const durationMs = Date.now() - start;
        this.log.info(`Job ${job.id} completed in ${durationMs}ms`, { jobId: job.id });
        await this._logDecision({ job, result, durationMs });
        return result;
      } catch (err) {
        const durationMs = Date.now() - start;
        this.log.error(`Job ${job.id} failed after ${durationMs}ms`, { jobId: job.id, error: err });
        throw err;
      }
    });
  }

  async _logDecision({ job, result, durationMs }) {
    if (!isMongoAvailable()) return;
    try {
      await Decision.create({
        skill: this.name,
        action: job.name,
        input: job.data,
        output: result,
        escalated: result?.escalate || false,
        escalationReason: result?.escalationReason,
        jobId: String(job.id),
        durationMs,
      });
    } catch (err) {
      this.log.warn('Failed to log decision to MongoDB', { error: err });
    }
  }

  /**
   * Helper for skills to flag escalations without throwing.
   */
  escalate(reason, data = {}) {
    this.log.warn(`Escalating: ${reason}`, data);
    return { escalate: true, escalationReason: reason, ...data };
  }
}

module.exports = BaseSkill;
