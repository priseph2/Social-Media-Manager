'use strict';

const logger = require('../../utils/logger');

const BASE_URL = 'https://api.tidio.co/api/v1';

/**
 * Tidio Public API client.
 *
 * Auth: Authorization: Token {apiKey}
 *
 * Required env:
 *   TIDIO_API_KEY — Tidio Public API key (Settings → Integrations → Public API)
 *
 * Docs: https://developer.tidio.com/
 */
class TidioAPI {
  constructor() {
    this.apiKey = process.env.TIDIO_API_KEY;
    this.available = Boolean(this.apiKey);
    if (!this.available) logger.warn('Tidio not configured — live chat integration disabled.');
  }

  get _headers() {
    return {
      Authorization: `Token ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  async _request(path, method = 'GET', body = null) {
    const { default: fetch } = await import('node-fetch').catch(() => ({ default: globalThis.fetch }));
    const opts = { method, headers: this._headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE_URL}${path}`, opts);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Tidio ${method} ${path} → ${res.status}: ${text}`);
    }
    // 204 No Content
    if (res.status === 204) return null;
    return res.json();
  }

  /**
   * Lists conversations, optionally filtered by status.
   * Returns normalised conversation objects.
   *
   * Tidio statuses: open, closed, waiting, on_hold
   */
  async getOpenConversations(status = 'open') {
    if (!this.available) return [];
    try {
      const params = new URLSearchParams({ status });
      const data = await this._request(`/conversations?${params}`);
      const list = data?.conversations ?? data ?? [];
      return (Array.isArray(list) ? list : []).map((c) => ({
        id: c.id,
        visitorId: c.visitor_id || c.visitorId,
        status: c.status,
        channel: c.channel || 'website',
        lastMessage: c.last_message?.message || c.lastMessage || '',
        createdAt: c.created_at || c.createdAt,
        updatedAt: c.updated_at || c.updatedAt,
      }));
    } catch (err) {
      logger.warn('Tidio getOpenConversations failed', { error: err.message });
      return [];
    }
  }

  /**
   * Sends an operator message into a conversation.
   * conversationId: Tidio conversation ID
   * message: plain text string
   */
  async sendMessage(conversationId, message) {
    if (!this.available) return { success: false, reason: 'Tidio not configured' };
    try {
      await this._request(`/conversations/${conversationId}/messages`, 'POST', {
        message,
        type: 'chat',
      });
      logger.info('Tidio message sent', { conversationId });
      return { success: true, conversationId };
    } catch (err) {
      logger.error('Tidio sendMessage failed', { conversationId, error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Closes a conversation (marks as resolved).
   */
  async closeConversation(conversationId) {
    if (!this.available) return { success: false };
    try {
      await this._request(`/conversations/${conversationId}`, 'PATCH', { status: 'closed' });
      return { success: true };
    } catch (err) {
      logger.warn('Tidio closeConversation failed', { conversationId, error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Fetches messages for a specific conversation (used to build context for AI response).
   */
  async getMessages(conversationId, limit = 20) {
    if (!this.available) return [];
    try {
      const data = await this._request(
        `/conversations/${conversationId}/messages?limit=${limit}`
      );
      const list = data?.messages ?? data ?? [];
      return (Array.isArray(list) ? list : []).map((m) => ({
        id: m.id,
        sender: m.sender_type || m.type,
        message: m.message,
        createdAt: m.created_at || m.createdAt,
      }));
    } catch (err) {
      logger.warn('Tidio getMessages failed', { conversationId, error: err.message });
      return [];
    }
  }
}

module.exports = new TidioAPI();
