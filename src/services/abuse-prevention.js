'use strict';

const crypto = require('crypto');
const { getRedisClient } = require('./database/redis-client');
const logger = require('../utils/logger');

// ── Disposable email domain blocklist ─────────────────────────────────────────
// Top ~300 known throwaway/temporary email providers.
// Extend freely — source: github.com/disposable-email-domains/disposable-email-domains
const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com','10minutemail.net','10minutemail.org','10minutemail.de',
  '10minutemail.co.uk','10minutemail.info','10minutemail.us','20minutemail.com',
  'guerrillamail.com','guerrillamail.net','guerrillamail.org','guerrillamail.biz',
  'guerrillamail.de','guerrillamail.info','guerrillamail.me','guerrillamailblock.com',
  'mailinator.com','mailinator.net','mailinator.org','mailinator2.com',
  'trashmail.com','trashmail.net','trashmail.org','trashmail.at',
  'trashmail.me','trashmail.io','trashmail.xyz','trashmail.de',
  'yopmail.com','yopmail.fr','yopmail.net','cool.fr.nf','jetable.fr.nf',
  'nospam.ze.tc','nomail.xl.cx','mega.zik.dj','speed.1s.fr',
  'courriel.fr.nf','moncourrier.fr.nf','monemail.fr.nf',
  'mailnull.com','spamgourmet.com','spamgourmet.net','spamgourmet.org',
  'spamtrap.ro','byom.de','get1mail.com','get2mail.fr',
  'getairmail.com','getairmail.cf','getairmail.ga','getairmail.gq',
  'fakeinbox.com','fakeinbox.info','fakeinbox.net','fakemailgenerator.com',
  'mailnesia.com','mailnull.com','spamfree24.org','spamfree24.de',
  'spamfree24.eu','spamfree24.info','spamfree24.net','spamfree24.com',
  'throwam.com','throwam.net','throwaway.email','throwam.co',
  'dispostable.com','dispostable.net','dispostable.org',
  'maildrop.cc','maildrop.com','mailsac.com','mailsac.xyz',
  'sharklasers.com','guerrillamailblock.com','grr.la','guerrillamail.info',
  'spam4.me','spamgob.com','spaml.de','spaml.com',
  'mytemp.email','mytemp.co','temp-mail.org','temp-mail.com','temp-mail.ru',
  'tempail.com','tempr.email','tempm.com','tempmail.us','tempmail2.com',
  'tempmailo.com','tempinbox.com','tempinbox.co.uk','inboxbear.com',
  'mailtemp.info','mailtemp.net','mailtemp.org','mailtemp.co',
  'nwytg.com','qqzy.us','qq.com', // qq.com is real but often abused; remove if needed
  'discard.email','discardmail.com','discardmail.de',
  'dodgit.com','dodgit.org','spamherelots.com','spamhereplease.com',
  'jetable.com','jetable.fr','jetable.net','jetable.org',
  'nospammail.net','kasmail.com','lol.ovpn.to','binkmail.com',
  'bobmail.info','chogmail.com','chammy.info','devnullmail.com',
  'dump-email.info','dumpandfuck.com','dumpmail.de','dumpyemail.com',
  'e4ward.com','email60.com','emailias.com','emailinfive.com',
  'emailtemporanea.com','emailtemporanea.net','emailtemporanea.org',
  'emailthe.net','emailto.de','emailwarden.com','emailx.at.hm',
  'emailxfer.com','emkei.cz','emkei.gq','ephemail.net','etranquil.com',
  'etranquil.net','etranquil.org','explodemail.com','express.net.ua',
  'fake-email.pp.ua','fakemailz.com','fammix.com','fansworldwide.de',
  'fastacura.com','fastchevy.com','fastchrysler.com','fastkawasaki.com',
  'fastmazda.com','fastmitsubishi.com','fastnissan.com','fastsubaru.com',
  'fastsuzuki.com','fasttoyota.com','fastyamaha.com','filzmail.com',
  'fivemail.de','fleckens.hu','frapmail.com','fudgerub.com',
  'fyii.de','garliclife.com','gehensiemirnichtaufdensack.de','gishpuppy.com',
  'goemailgo.com','gorillaswithdirtyarmpits.com','gsrv.co.uk','guerillamail.biz',
  'h.mintemail.com','haltospam.com','hatespam.org','herp.in',
  'hmamail.com','hopemail.biz','ieatspam.eu','ieatspam.info',
  'ieh-mail.de','imails.info','inboxclean.com','inboxclean.org',
  'insorg.org','instant-mail.de','ipoo.org','irish2me.com',
  'iwi.net','jetable.pp.ua','jnxjn.com','jourrapide.com',
  'jupimail.com','kasmail.com','klassmaster.com','klassmaster.net',
  'klassmaster.org','klzlk.com','kzsmail.com','lackmail.ru',
  'lags.us','letthemeatspam.com','lhsdv.com','litedrop.com',
  'lol.ovpn.to','lookugly.com','lortemail.dk','lroid.com',
  'lukop.dk','m21.cc','mail-filter.com','mail.mezimages.net',
  'mail2rss.org','mailbidon.com','mailbiz.biz','mailblocks.com',
  'mailbog.com','mailc.net','mailcat.biz','mailcatch.com',
  'mailde.de','mailde.info','maildrop.ga','mailexpire.com',
  'mailf5.com','mailfall.com','mailfreeonline.com','mailguard.me',
  'mailhazard.com','mailhazard.us','mailhero.io','mailimperator.net',
  'mailismagic.com','mailme.gq','mailme.ir','mailme.lv',
  'mailme24.com','mailmetrash.com','mailmoat.com','mailnew.com',
  'mailnowapp.com','mailnull.com','mailplug.info','mailpoof.com',
  'mailprotech.com','mailquack.com','mailrobot.de','mailscrap.com',
  'mailseal.de','mailshell.com','mailshuttle.com','mailslapping.com',
  'mailslite.com','mailspeed.de','mailtemporaire.com','mailtemporaire.fr',
  'mailtome.de','mailtothis.com','mailtrash.net','mailtv.net',
  'mailtv.tv','mailzilla.com','mailzilla.org','makemetheking.com',
  'manifestgenerator.com','manybrain.com','mbx.cc','mega.zik.dj',
  'meltmail.com','messagebeamer.de','mierdamail.com','mintemail.com',
  'misterpinball.de','mji.ro','mobi.web.id','moburl.com',
  'moncourrier.fr.nf','monemail.fr.nf','monmail.fr.nf','msa.minsmail.com',
  'mt2009.com','mt2014.com','mx0.wwwnew.eu','mycleaninbox.net',
  'mypartyclip.de','myphantomemail.com','myspamless.com','mytempemail.com',
  'mytempmail.com','mytrashmail.com','nabuma.com','neomailbox.com',
  'nepwk.com','nervmich.net','nervtmich.net','netmails.com',
  'netmails.net','neverbox.com','nice-4u.com','nobulk.com',
  'noclickemail.com','nogmailspam.info','nomail.pw','nomail.xl.cx',
  'nomail2me.com','nomorespamemails.com','nonspam.eu','nonspammer.de',
  'noref.in','nospam.ze.tc','nospamfor.us','nospammail.net',
  'nospamthanks.info','notmailinator.com','notsharingmy.info','nowmymail.com',
  'nwldx.com','objectmail.com','obobbo.com','odaymail.com',
  'omail.pro','one-time.email','oneoffemail.com','onewaymail.com',
  'onobox.com','opayq.com','ordinaryamerican.net','otherinbox.comuv.com',
  'ourklips.com','outlawspam.com','ovpn.to','owlpic.com',
]);

// ── Personal / generic email providers (exempt from domain uniqueness limit) ──
const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','yahoo.fr',
  'yahoo.es','yahoo.de','yahoo.it','yahoo.com.br','yahoo.com.au',
  'yahoo.ca','yahoo.co.in','yahoo.com.ar','yahoo.com.mx',
  'hotmail.com','hotmail.co.uk','hotmail.fr','hotmail.de','hotmail.es',
  'hotmail.it','hotmail.com.br','hotmail.com.ar','hotmail.com.mx',
  'outlook.com','outlook.co.uk','outlook.fr','outlook.de','outlook.es',
  'live.com','live.co.uk','live.fr','live.de','live.com.au',
  'msn.com','icloud.com','me.com','mac.com','aol.com',
  'protonmail.com','protonmail.ch','proton.me','pm.me',
  'tutanota.com','tutanota.de','tuta.io',
  'zoho.com','zohomail.com',
  'mail.com','mail.ru','inbox.com','inbox.ru',
  'gmx.com','gmx.net','gmx.de','gmx.at','gmx.ch',
  'web.de','freenet.de','t-online.de','o2online.de',
  'rocketmail.com','att.net','sbcglobal.net','verizon.net',
  'comcast.net','cox.net','charter.net','earthlink.net',
]);

// ── Layer 1: Disposable email check ──────────────────────────────────────────

function isDisposableEmail(email) {
  if (!email) return true;
  const domain = email.split('@')[1]?.toLowerCase().trim();
  if (!domain) return true;
  return DISPOSABLE_DOMAINS.has(domain);
}

// ── Layer 2: IP-based signup throttle (max 3 accounts / IP / 24 h) ───────────

const IP_MAX_SIGNUPS = 3;
const IP_WINDOW_SECONDS = 24 * 3600;

async function checkIpSignupRate(ip) {
  const redis = getRedisClient();
  if (!redis || !ip) return { allowed: true };

  // Hash the IP for privacy
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
  const key = `signup:ip:${ipHash}`;

  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, IP_WINDOW_SECONDS);

    if (count > IP_MAX_SIGNUPS) {
      logger.warn(`[AbusePrevention] IP signup throttle hit`, { ipHash, count });
      return { allowed: false, reason: 'Too many accounts created from this IP address. Try again tomorrow.' };
    }
    return { allowed: true };
  } catch (err) {
    logger.warn('[AbusePrevention] Redis error in IP check — failing open', { error: err.message });
    return { allowed: true };
  }
}

// ── Layer 3: Company domain uniqueness (max 2 free accounts per company domain) ─

const DOMAIN_MAX_FREE = 2;
const DOMAIN_WINDOW_SECONDS = 30 * 24 * 3600; // 30 days

async function checkEmailDomainAbuse(email) {
  const redis = getRedisClient();
  if (!redis || !email) return { allowed: true };

  const domain = email.split('@')[1]?.toLowerCase().trim();
  if (!domain) return { allowed: true };

  // Personal email providers are exempt — many legit users share @gmail.com
  if (PERSONAL_EMAIL_DOMAINS.has(domain)) return { allowed: true };

  const key = `signup:domain:${domain}`;

  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, DOMAIN_WINDOW_SECONDS);

    if (count > DOMAIN_MAX_FREE) {
      logger.warn(`[AbusePrevention] Domain signup limit hit`, { domain, count });
      return {
        allowed: false,
        reason: `Your organisation already has ${DOMAIN_MAX_FREE} free accounts. Upgrade an existing account or contact support.`,
      };
    }
    return { allowed: true };
  } catch (err) {
    logger.warn('[AbusePrevention] Redis error in domain check — failing open', { error: err.message });
    return { allowed: true };
  }
}

// ── Undo domain counter (call if Supabase signup fails after domain check) ────

async function decrementDomainCounter(email) {
  const redis = getRedisClient();
  if (!redis || !email) return;
  const domain = email.split('@')[1]?.toLowerCase().trim();
  if (!domain || PERSONAL_EMAIL_DOMAINS.has(domain)) return;
  try {
    await redis.decr(`signup:domain:${domain}`);
  } catch { /* best-effort */ }
}

/**
 * Run all three checks in order. Returns { allowed: true } or { allowed: false, reason }.
 */
async function validateSignup({ email, ip }) {
  if (isDisposableEmail(email)) {
    return { allowed: false, reason: 'Please use a real email address — disposable inboxes are not accepted.' };
  }

  const ipCheck = await checkIpSignupRate(ip);
  if (!ipCheck.allowed) return ipCheck;

  const domainCheck = await checkEmailDomainAbuse(email);
  if (!domainCheck.allowed) return domainCheck;

  return { allowed: true };
}

module.exports = { validateSignup, isDisposableEmail, checkIpSignupRate, checkEmailDomainAbuse, decrementDomainCounter };
