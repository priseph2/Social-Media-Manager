'use strict';

/**
 * Email automation sequence definitions for Cascades Luxury.
 * Each sequence is a series of emails triggered by customer behaviour.
 * These definitions are used to configure Mailchimp automations via API.
 */

const SEQUENCES = {
  welcome: {
    name: 'Welcome Series',
    trigger: 'list_subscribe',
    emails: [
      {
        delay: { value: 0, unit: 'immediate' },
        subject: 'Welcome to Cascades Luxury — Your Journey Begins Here',
        goal: 'Introduce brand values and story',
        contentAngle: 'Warm welcome, brand story, what makes Cascades special',
        cta: 'Discover Our Collection',
      },
      {
        delay: { value: 2, unit: 'days' },
        subject: 'The Art of Choosing Your Signature Scent',
        goal: 'Educate and build trust',
        contentAngle: 'Fragrance guide — education first, soft product mention',
        cta: 'Take the Fragrance Quiz',
      },
      {
        delay: { value: 5, unit: 'days' },
        subject: 'Our Most Loved Fragrances This Season',
        goal: 'Social proof — introduce bestsellers',
        contentAngle: 'Bestsellers with customer stories, reviews',
        cta: 'Shop Bestsellers',
      },
      {
        delay: { value: 9, unit: 'days' },
        subject: 'A Special Gift for You — Your First Order',
        goal: 'Convert with incentive',
        contentAngle: 'First-order discount offer with scarcity/urgency',
        cta: 'Claim Your 10% Off',
      },
      {
        delay: { value: 14, unit: 'days' },
        subject: 'Before You Go — One More Thing',
        goal: 'Final conversion attempt',
        contentAngle: 'Last chance on discount, different product angle',
        cta: 'Shop Before Offer Expires',
      },
    ],
  },

  cart_abandonment: {
    name: 'Cart Abandonment Recovery',
    trigger: 'cart_abandonment',
    emails: [
      {
        delay: { value: 1, unit: 'hours' },
        subject: 'You left something beautiful behind...',
        goal: 'Immediate reminder',
        contentAngle: 'Warm, non-pushy reminder. Product beauty angle.',
        cta: 'Complete Your Order',
      },
      {
        delay: { value: 24, unit: 'hours' },
        subject: 'Still thinking about it? Here\'s what others are saying...',
        goal: 'Social proof to overcome hesitation',
        contentAngle: 'Reviews + limited stock note',
        cta: 'See What Others Are Saying',
      },
      {
        delay: { value: 3, unit: 'days' },
        subject: 'Last chance — your cart expires tonight',
        goal: 'Final urgency push',
        contentAngle: 'Genuine scarcity + optional small incentive (free sample)',
        cta: 'Save My Cart',
      },
    ],
  },

  post_purchase: {
    name: 'Post-Purchase Journey',
    trigger: 'order_placed',
    emails: [
      {
        delay: { value: 0, unit: 'immediate' },
        subject: 'Your order is confirmed — thank you!',
        goal: 'Order confirmation + delight',
        contentAngle: 'Confirmation details + excitement build-up',
        cta: 'Track Your Order',
      },
      {
        delay: { value: 3, unit: 'days' },
        subject: 'Getting the most from your new fragrance',
        goal: 'Product education + relationship building',
        contentAngle: 'How to wear, layer, and store the fragrance. Expert tips.',
        cta: 'Read the Fragrance Guide',
      },
      {
        delay: { value: 10, unit: 'days' },
        subject: 'How is your fragrance experience?',
        goal: 'Review request + complementary recommendation',
        contentAngle: 'Satisfaction check + suggest 1 complementary product',
        cta: 'Leave a Review',
      },
      {
        delay: { value: 30, unit: 'days' },
        subject: 'The perfect companion for your [product name]',
        goal: 'Upsell complementary product',
        contentAngle: 'Personalised product pairing recommendation',
        cta: 'Complete the Collection',
      },
    ],
  },

  winback: {
    name: 'Win-Back Campaign',
    trigger: 'subscriber_inactive_90_days',
    emails: [
      {
        delay: { value: 0, unit: 'immediate' },
        subject: 'We miss you — here\'s something special',
        goal: 'Re-engagement with incentive',
        contentAngle: 'Warm, personal tone. 15% re-engagement discount.',
        cta: 'Come Back for 15% Off',
      },
      {
        delay: { value: 5, unit: 'days' },
        subject: 'What\'s new at Cascades Luxury since you were last here',
        goal: 'Show what they\'ve been missing',
        contentAngle: 'New arrivals, what\'s changed, exciting updates',
        cta: 'See What\'s New',
      },
      {
        delay: { value: 10, unit: 'days' },
        subject: 'This is our final message to you',
        goal: 'Last chance — maintain list hygiene',
        contentAngle: 'Transparent and honest — stay or go, their choice',
        cta: 'Keep Me on the List',
      },
    ],
  },

  vip_nurture: {
    name: 'VIP Customer Nurture',
    trigger: 'customer_tagged_vip',
    emails: [
      {
        delay: { value: 0, unit: 'immediate' },
        subject: 'You\'ve been invited to our Inner Circle',
        goal: 'VIP recognition and activation',
        contentAngle: 'Exclusive VIP welcome, what this membership means',
        cta: 'Explore VIP Benefits',
      },
    ],
  },
};

function getSequence(sequenceId) {
  return SEQUENCES[sequenceId] || null;
}

function getAllSequences() {
  return Object.values(SEQUENCES);
}

module.exports = { SEQUENCES, getSequence, getAllSequences };
