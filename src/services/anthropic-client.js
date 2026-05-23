'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { withRetry } = require('../utils/retry');
const logger = require('../utils/logger');
const { MODELS } = require('../config/constants');

let client = null;

function getAnthropicClient() {
  if (client) return client;
  client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/**
 * Core message creator with automatic retry, logging, and token tracking.
 *
 * @param {Object} params
 * @param {string} params.model
 * @param {number} params.maxTokens
 * @param {Array}  params.system     - array of content blocks (supports cache_control)
 * @param {Array}  params.messages
 * @param {Array}  [params.tools]
 * @param {string} [params.label]    - for logging
 */
async function createMessage({ model = MODELS.PRIMARY, maxTokens = 2048, system, messages, tools, label = 'AI call' }) {
  const anthropic = getAnthropicClient();

  const response = await withRetry(
    async () => {
      const params = { model, max_tokens: maxTokens, messages };
      if (system) params.system = system;
      if (tools?.length) {
        params.tools = tools;
        params.tool_choice = { type: 'auto' };
      }
      return anthropic.messages.create(params);
    },
    { maxAttempts: 3, baseDelayMs: 2000, label }
  );

  const usage = response.usage;
  logger.debug(`${label} completed`, {
    model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens,
    cacheCreationTokens: usage.cache_creation_input_tokens,
  });

  return response;
}

/**
 * Extracts text from a response that may contain text or tool_use blocks.
 */
function extractText(response) {
  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/**
 * Extracts the first tool_use block's input from a response.
 */
function extractToolInput(response) {
  const toolBlock = response.content.find((b) => b.type === 'tool_use');
  return toolBlock ? toolBlock.input : null;
}

/**
 * Builds a cached system prompt block (reuses the same prompt across calls).
 * Caching is applied to the last block so prefix content is also cached.
 */
function cachedSystemBlock(text) {
  return { type: 'text', text, cache_control: { type: 'ephemeral' } };
}

module.exports = {
  getAnthropicClient,
  createMessage,
  extractText,
  extractToolInput,
  cachedSystemBlock,
};
