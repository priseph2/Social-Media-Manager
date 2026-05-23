'use strict';

/**
 * Customer segmentation rules for Cascades Luxury email marketing.
 * Segments are evaluated against customer data to determine the best
 * email sequence and messaging for each subscriber.
 */

const SEGMENTS = {
  new: {
    id: 'new',
    label: 'New Subscribers',
    description: 'Subscribed < 30 days ago, no purchases yet',
    mailchimpTag: 'new-subscriber',
    sequence: 'welcome',
    messaging: 'Welcome and educate — introduce the brand, build trust',
    sendFrequency: '2x per week',
    incentive: '10% first-order discount',
  },
  engaged: {
    id: 'engaged',
    label: 'Engaged Browsers',
    description: 'Opens emails, browses website, no purchase in last 60 days',
    mailchimpTag: 'engaged-no-purchase',
    sequence: 'consideration',
    messaging: 'Nudge to purchase — social proof, bestsellers, limited availability',
    sendFrequency: '2x per week',
    incentive: 'Free fragrance sample with order',
  },
  repeat: {
    id: 'repeat',
    label: 'Repeat Customers',
    description: '2+ purchases, active in last 90 days',
    mailchimpTag: 'repeat-customer',
    sequence: 'loyalty',
    messaging: 'Reward loyalty — early access, complementary recommendations, exclusive previews',
    sendFrequency: '1-2x per week',
    incentive: 'Early access to new arrivals',
  },
  vip: {
    id: 'vip',
    label: 'VIP Customers',
    description: '5+ purchases OR total spend > ₦250,000',
    mailchimpTag: 'vip',
    sequence: 'vip-nurture',
    messaging: 'Exclusive experience — concierge service, private launches, personalised curation',
    sendFrequency: '1x per week (highly personalised)',
    incentive: 'Personal fragrance consultation',
  },
  inactive: {
    id: 'inactive',
    label: 'Inactive Subscribers',
    description: 'No opens or clicks in 90+ days',
    mailchimpTag: 'inactive',
    sequence: 'winback',
    messaging: 'Re-engage with irresistible offer — last chance tone',
    sendFrequency: '3-email winback sequence, then suppress',
    incentive: '15% re-engagement discount',
  },
  at_risk: {
    id: 'at_risk',
    label: 'At-Risk Customers',
    description: 'Previously engaged, no purchase in 45-90 days',
    mailchimpTag: 'at-risk',
    sequence: 'retention',
    messaging: 'Retain before they become inactive — personalised product recommendations',
    sendFrequency: '1x per week',
    incentive: 'Complimentary gift wrapping or sample',
  },
};

/**
 * Classifies a subscriber into a segment based on their behaviour data.
 * @param {Object} subscriber
 * @param {number} subscriber.daysSinceSubscribed
 * @param {number} subscriber.purchaseCount
 * @param {number} subscriber.totalSpendNGN
 * @param {number} subscriber.daysSinceLastPurchase
 * @param {number} subscriber.daysSinceLastOpen
 * @returns {string} segment ID
 */
function classifySubscriber({ daysSinceSubscribed, purchaseCount, totalSpendNGN, daysSinceLastPurchase, daysSinceLastOpen }) {
  if (purchaseCount >= 5 || totalSpendNGN >= 250000) return 'vip';
  // repeat = multiple purchases AND last purchase was recent (within 45 days)
  if (purchaseCount >= 2 && daysSinceLastPurchase <= 45) return 'repeat';
  if (daysSinceLastOpen >= 90) return 'inactive';
  // at_risk = has purchased but hasn't bought in 45-90 days (sliding towards inactive)
  if (purchaseCount > 0 && daysSinceLastPurchase > 45) return 'at_risk';
  // new must be checked before engaged so recent subscribers aren't misclassified
  if (daysSinceSubscribed <= 30) return 'new';
  if (daysSinceLastOpen < 60) return 'engaged';
  return 'engaged';
}

/**
 * Returns the segment config for a given segment ID.
 */
function getSegment(segmentId) {
  return SEGMENTS[segmentId] || SEGMENTS.engaged;
}

/**
 * Returns all segments (for setup/dashboard use).
 */
function getAllSegments() {
  return Object.values(SEGMENTS);
}

module.exports = { SEGMENTS, classifySubscriber, getSegment, getAllSegments };
