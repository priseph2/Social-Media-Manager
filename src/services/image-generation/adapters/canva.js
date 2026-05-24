'use strict';

const { ImageAdapter } = require('../base-adapter');
const { getCredentials } = require('../../credential-store');

const CANVA_API = 'https://api.canva.com/rest/v1';
const COST_PER_IMAGE = 0.05;
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60_000;

class CanvaAdapter extends ImageAdapter {
  constructor(tenantId) {
    super();
    this.tenantId = tenantId;
    this._tokenCache = null;
  }

  async generate(prompt, platform) {
    const creds = await getCredentials(this.tenantId, 'canva');
    if (!creds?.client_id || !creds?.client_secret || !creds?.brand_template_id) {
      throw new Error('Canva credentials incomplete — need client_id, client_secret, brand_template_id');
    }

    const token = await this._getAccessToken(creds.client_id, creds.client_secret);

    // Step 1: autofill brand template with caption text
    const autofillJobId = await this._createAutofill(token, creds.brand_template_id, prompt, platform);

    // Step 2: poll until design is ready
    const designId = await this._pollAutofill(token, autofillJobId);

    // Step 3: export design as PNG
    const exportJobId = await this._createExport(token, designId);

    // Step 4: poll until export is ready, get download URL
    const downloadUrl = await this._pollExport(token, exportJobId);

    // Step 5: download PNG bytes
    const imageBuffer = await this._downloadImage(downloadUrl);

    return {
      imageBuffer,
      model: 'canva',
      costUsd: COST_PER_IMAGE,
    };
  }

  async _getAccessToken(clientId, clientSecret) {
    if (this._tokenCache && this._tokenCache.expiresAt > Date.now() + 60_000) {
      return this._tokenCache.token;
    }

    const res = await fetch(`${CANVA_API}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'design:content:read design:content:write asset:read',
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Canva OAuth error ${res.status}: ${text}`);
    }

    const json = await res.json();
    this._tokenCache = {
      token: json.access_token,
      expiresAt: Date.now() + (json.expires_in || 3600) * 1000,
    };
    return this._tokenCache.token;
  }

  async _createAutofill(token, brandTemplateId, prompt, platform) {
    const res = await fetch(`${CANVA_API}/autofills`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        brand_template_id: brandTemplateId,
        data: {
          caption: { type: 'text', text: prompt.slice(0, 500) },
          platform: { type: 'text', text: platform || 'social' },
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Canva autofill error ${res.status}: ${text}`);
    }

    const json = await res.json();
    return json.job?.id;
  }

  async _pollAutofill(token, jobId) {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const res = await fetch(`${CANVA_API}/autofills/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Canva autofill poll error ${res.status}`);
      const json = await res.json();
      if (json.job?.status === 'success') return json.job?.result?.design?.id;
      if (json.job?.status === 'failed') throw new Error('Canva autofill job failed');
    }
    throw new Error('Canva autofill timed out');
  }

  async _createExport(token, designId) {
    const res = await fetch(`${CANVA_API}/exports`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        design_id: designId,
        format: { type: 'png', export_quality: 'regular' },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Canva export error ${res.status}: ${text}`);
    }

    const json = await res.json();
    return json.job?.id;
  }

  async _pollExport(token, exportId) {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const res = await fetch(`${CANVA_API}/exports/${exportId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Canva export poll error ${res.status}`);
      const json = await res.json();
      if (json.job?.status === 'success') {
        return json.job?.result?.urls?.[0];
      }
      if (json.job?.status === 'failed') throw new Error('Canva export job failed');
    }
    throw new Error('Canva export timed out');
  }

  async _downloadImage(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Canva image download error ${res.status}`);
    const buffer = await res.arrayBuffer();
    return Buffer.from(buffer);
  }
}

module.exports = CanvaAdapter;
