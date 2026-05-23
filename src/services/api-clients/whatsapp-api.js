'use strict';

const logger = require('../../utils/logger');
const { getSupabaseClient } = require('../database/supabase-client');

const BASE_URL = 'https://graph.facebook.com/v19.0';

/**
 * Meta WhatsApp Cloud API client.
 *
 * Auth: Authorization: Bearer {token}
 *
 * Required env (used when no per-tenant credentials are found):
 *   WHATSAPP_TOKEN           — Meta system user access token
 *   WHATSAPP_PHONE_NUMBER_ID — WhatsApp Business phone number ID
 *
 * Per-tenant overrides are read from the Supabase `tenant_credentials` table
 * (service = 'whatsapp'), columns: token, phone_number_id.
 */
class WhatsAppAPI {
  constructor() {
    this.defaultToken = process.env.WHATSAPP_TOKEN;
    this.defaultPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!this.isConfigured()) {
      logger.warn('WhatsApp Cloud API not configured — messaging disabled.');
    }
  }

  /**
   * Resolves credentials for a given tenant.
   * Falls back to env vars if no tenant row exists or Supabase is unavailable.
   *
   * @param {string} [tenantId]
   * @returns {{ token: string, phoneNumberId: string }}
   */
  async getCredentials(tenantId) {
    if (tenantId) {
      try {
        const db = getSupabaseClient();
        if (db) {
          const { data, error } = await db
            .from('tenant_credentials')
            .select('token, phone_number_id')
            .eq('tenant_id', tenantId)
            .eq('service', 'whatsapp')
            .maybeSingle();

          if (!error && data?.token && data?.phone_number_id) {
            return { token: data.token, phoneNumberId: data.phone_number_id };
          }
        }
      } catch (err) {
        logger.warn('WhatsApp: failed to load tenant credentials from Supabase, falling back to env', {
          tenantId,
          error: err.message,
        });
      }
    }

    return { token: this.defaultToken, phoneNumberId: this.defaultPhoneNumberId };
  }

  /**
   * Returns true if the given (or default) credentials are present.
   *
   * @param {{ token?: string, phoneNumberId?: string }} [creds]
   * @returns {boolean}
   */
  isConfigured(creds) {
    const token = creds?.token ?? this.defaultToken;
    const phoneNumberId = creds?.phoneNumberId ?? this.defaultPhoneNumberId;
    return Boolean(token && phoneNumberId);
  }

  /**
   * Internal fetch wrapper. Uses native fetch (Node 18+).
   *
   * @param {string} path        - URL path relative to BASE_URL
   * @param {string} method      - HTTP method
   * @param {string} token       - Bearer token
   * @param {object} [body]      - Request body (JSON-serialised for POST/PUT)
   * @returns {Promise<object>}
   */
  async _request(path, method, token, body = null) {
    const url = `${BASE_URL}${path}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const opts = { method, headers };
    if (body !== null) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`WhatsApp ${method} ${path} → ${res.status}: ${text}`);
    }

    if (res.status === 204) return null;
    return res.json();
  }

  /**
   * Sends a plain-text WhatsApp message.
   *
   * @param {string} to          - Recipient phone number (E.164, no '+')
   * @param {string} text        - Message body
   * @param {string} [tenantId]
   * @returns {Promise<object>}  - WhatsApp API response
   */
  async sendTextMessage(to, text, tenantId) {
    const creds = await this.getCredentials(tenantId);
    if (!this.isConfigured(creds)) throw new Error('WhatsApp is not configured for this tenant.');

    logger.info('[WhatsApp] Sending text message', { to, tenantId });

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text },
    };

    return this._request(`/${creds.phoneNumberId}/messages`, 'POST', creds.token, payload);
  }

  /**
   * Sends a WhatsApp template message.
   *
   * @param {string} to            - Recipient phone number (E.164, no '+')
   * @param {string} templateName  - Approved template name
   * @param {string} languageCode  - e.g. 'en_US'
   * @param {Array}  components    - Template components (header/body/button params)
   * @param {string} [tenantId]
   * @returns {Promise<object>}
   */
  async sendTemplate(to, templateName, languageCode, components, tenantId) {
    const creds = await this.getCredentials(tenantId);
    if (!this.isConfigured(creds)) throw new Error('WhatsApp is not configured for this tenant.');

    logger.info('[WhatsApp] Sending template message', { to, templateName, languageCode, tenantId });

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: components || [],
      },
    };

    return this._request(`/${creds.phoneNumberId}/messages`, 'POST', creds.token, payload);
  }

  /**
   * Marks an incoming message as read (displays double blue ticks).
   *
   * @param {string} messageId  - WhatsApp message ID (wamid)
   * @param {string} [tenantId]
   * @returns {Promise<object>}
   */
  async markRead(messageId, tenantId) {
    const creds = await this.getCredentials(tenantId);
    if (!this.isConfigured(creds)) throw new Error('WhatsApp is not configured for this tenant.');

    const payload = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    };

    return this._request(`/${creds.phoneNumberId}/messages`, 'POST', creds.token, payload);
  }

  /**
   * Resolves a media object ID to a download URL.
   * The returned URL is short-lived (~5 minutes); download immediately.
   *
   * @param {string} mediaId    - Media object ID from an inbound webhook
   * @param {string} [tenantId]
   * @returns {Promise<object>} - Contains `url`, `mime_type`, `file_size`, etc.
   */
  async getMediaUrl(mediaId, tenantId) {
    const creds = await this.getCredentials(tenantId);
    if (!this.isConfigured(creds)) throw new Error('WhatsApp is not configured for this tenant.');

    logger.info('[WhatsApp] Fetching media URL', { mediaId, tenantId });

    return this._request(`/${mediaId}`, 'GET', creds.token);
  }
}

module.exports = new WhatsAppAPI();
