'use strict';

const logger = require('../utils/logger');
const Decision = require('../models/decision.model');
const { isMongoAvailable } = require('../services/database/mongodb-client');
const { tenantStorage } = require('../services/billing/usage-meter');
const { getSupabaseClient } = require('../services/database/supabase-client');

class BaseSkill {
  constructor(skillName) {
    this.name = skillName;
    this.log = logger.forSkill(skillName);
  }

  async execute(job) {
    throw new Error(`${this.name}.execute() not implemented`);
  }

  async process(job) {
    const start = Date.now();
    this.log.info(`Processing job ${job.id}`, { jobName: job.name, jobId: job.id });

    const tenantId = job.data?.tenantId || null;
    if (!tenantId) {
      this.log.warn(`Job ${job.id} (${job.name}) has no tenantId — usage will not be metered`, { jobId: job.id });
    }

    return tenantStorage.run({ tenantId, skill: this.name }, async () => {
      try {
        const result = await this.execute(job);
        const durationMs = Date.now() - start;
        this.log.info(`Job ${job.id} completed in ${durationMs}ms`, { jobId: job.id });
        await Promise.all([
          this._logDecision({ job, result, durationMs }),
          this._logTaskLog({ job, tenantId, status: 'completed', durationMs, escalated: result?.escalate || false }),
        ]);
        return result;
      } catch (err) {
        const durationMs = Date.now() - start;
        this.log.error(`Job ${job.id} failed after ${durationMs}ms`, { jobId: job.id, error: err });
        await this._logTaskLog({ job, tenantId, status: 'failed', durationMs, escalated: false });
        throw err;
      }
    });
  }

  async _logTaskLog({ job, tenantId, status, durationMs, escalated }) {
    const supabase = getSupabaseClient();
    if (!supabase || !tenantId) return;
    try {
      await supabase.from('task_log').insert({
        job_id: String(job.id),
        skill: this.name,
        action: job.name,
        status,
        tenant_id: tenantId,
        priority: job.opts?.priority ?? 10,
        escalated: escalated || false,
        duration_ms: durationMs,
        completed_at: new Date().toISOString(),
      });
    } catch (err) {
      this.log.warn('Failed to write task_log to Supabase', { error: err.message });
    }
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

  escalate(reason, data = {}) {
    this.log.warn(`Escalating: ${reason}`, data);
    return { escalate: true, escalationReason: reason, ...data };
  }
}

module.exports = BaseSkill;
