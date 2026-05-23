#!/usr/bin/env python3
"""Generate AI Social Media Manager product paper PDF."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether, PageBreak
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.pdfgen import canvas
from reportlab.platypus.doctemplate import PageTemplate, BaseDocTemplate
from reportlab.platypus.frames import Frame
import os

OUTPUT = "/home/user/Social-Media-Manager/AI_Social_Media_Manager_Product_Paper.pdf"

# ── Colours ───────────────────────────────────────────────────────────────────
INDIGO     = colors.HexColor("#4F46E5")
INDIGO_DARK= colors.HexColor("#3730A3")
SLATE_900  = colors.HexColor("#0F172A")
SLATE_700  = colors.HexColor("#334155")
SLATE_500  = colors.HexColor("#64748B")
SLATE_200  = colors.HexColor("#E2E8F0")
SLATE_50   = colors.HexColor("#F8FAFC")
AMBER      = colors.HexColor("#D97706")
GREEN      = colors.HexColor("#059669")
WHITE      = colors.white

# ── Page template with header/footer ─────────────────────────────────────────
class ProductPaperDoc(BaseDocTemplate):
    def __init__(self, filename, **kwargs):
        super().__init__(filename, **kwargs)
        frame = Frame(
            self.leftMargin, self.bottomMargin,
            self.width, self.height,
            id='main'
        )
        template = PageTemplate(id='main', frames=frame, onPage=self._draw_page)
        self.addPageTemplates([template])

    def _draw_page(self, canvas, doc):
        canvas.saveState()
        w, h = A4

        # Header bar (skip page 1 — it has its own cover)
        if doc.page > 1:
            canvas.setFillColor(INDIGO)
            canvas.rect(0, h - 1.1*cm, w, 1.1*cm, fill=1, stroke=0)
            canvas.setFillColor(WHITE)
            canvas.setFont("Helvetica-Bold", 8)
            canvas.drawString(2*cm, h - 0.72*cm, "AI Social Media Manager")
            canvas.setFont("Helvetica", 8)
            canvas.drawRightString(w - 2*cm, h - 0.72*cm, "Product Paper · v1.0 · May 2026")

        # Footer
        canvas.setFillColor(SLATE_500)
        canvas.setFont("Helvetica", 7.5)
        canvas.drawString(2*cm, 0.8*cm, "Confidential — AI Social Media Manager")
        canvas.drawRightString(w - 2*cm, 0.8*cm, f"Page {doc.page}")
        canvas.setStrokeColor(SLATE_200)
        canvas.setLineWidth(0.5)
        canvas.line(2*cm, 1.1*cm, w - 2*cm, 1.1*cm)

        canvas.restoreState()


# ── Styles ────────────────────────────────────────────────────────────────────
def make_styles():
    base = getSampleStyleSheet()

    def S(name, **kwargs):
        return ParagraphStyle(name, **kwargs)

    return {
        "cover_title": S("cover_title",
            fontName="Helvetica-Bold", fontSize=32,
            textColor=WHITE, leading=38, alignment=TA_LEFT),
        "cover_sub": S("cover_sub",
            fontName="Helvetica", fontSize=14,
            textColor=colors.HexColor("#C7D2FE"), leading=20, alignment=TA_LEFT),
        "cover_meta": S("cover_meta",
            fontName="Helvetica", fontSize=10,
            textColor=colors.HexColor("#A5B4FC"), leading=16, alignment=TA_LEFT),

        "h1": S("h1",
            fontName="Helvetica-Bold", fontSize=18,
            textColor=INDIGO_DARK, leading=24,
            spaceBefore=18, spaceAfter=6),
        "h2": S("h2",
            fontName="Helvetica-Bold", fontSize=13,
            textColor=SLATE_900, leading=18,
            spaceBefore=14, spaceAfter=4),
        "h3": S("h3",
            fontName="Helvetica-Bold", fontSize=11,
            textColor=INDIGO, leading=16,
            spaceBefore=10, spaceAfter=3),
        "body": S("body",
            fontName="Helvetica", fontSize=10,
            textColor=SLATE_700, leading=16,
            spaceAfter=6, alignment=TA_JUSTIFY),
        "body_left": S("body_left",
            fontName="Helvetica", fontSize=10,
            textColor=SLATE_700, leading=16, spaceAfter=4),
        "bullet": S("bullet",
            fontName="Helvetica", fontSize=10,
            textColor=SLATE_700, leading=16,
            leftIndent=14, firstLineIndent=0,
            spaceAfter=3),
        "sub_bullet": S("sub_bullet",
            fontName="Helvetica", fontSize=9.5,
            textColor=SLATE_700, leading=15,
            leftIndent=28, firstLineIndent=0,
            spaceAfter=2),
        "code": S("code",
            fontName="Courier", fontSize=8.5,
            textColor=SLATE_700, leading=13,
            backColor=SLATE_50, leftIndent=12,
            spaceAfter=6),
        "label": S("label",
            fontName="Helvetica-Bold", fontSize=8,
            textColor=INDIGO, leading=12,
            spaceBefore=6, spaceAfter=2),
        "caption": S("caption",
            fontName="Helvetica", fontSize=8,
            textColor=SLATE_500, leading=12,
            alignment=TA_CENTER, spaceAfter=8),
        "note": S("note",
            fontName="Helvetica-Oblique", fontSize=9,
            textColor=SLATE_500, leading=14,
            spaceAfter=6),
        "tag_stub": S("tag_stub",
            fontName="Helvetica-Bold", fontSize=8,
            textColor=AMBER, leading=12),
        "tag_live": S("tag_live",
            fontName="Helvetica-Bold", fontSize=8,
            textColor=GREEN, leading=12),
    }


def hr(styles):
    return HRFlowable(width="100%", thickness=0.5, color=SLATE_200, spaceAfter=10, spaceBefore=4)


def section_rule():
    return HRFlowable(width="100%", thickness=2, color=INDIGO, spaceAfter=8, spaceBefore=16)


def tbl(data, col_widths, header=True, zebra=True):
    """Build a styled table."""
    t = Table(data, colWidths=col_widths)
    style = [
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (-1, -1), SLATE_700),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.3, SLATE_200),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, SLATE_50] if zebra else [WHITE]),
    ]
    if header:
        style += [
            ("BACKGROUND", (0, 0), (-1, 0), INDIGO),
            ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
        ]
    t.setStyle(TableStyle(style))
    return t


def callout(text, style, color=SLATE_50, border=INDIGO):
    """Info box."""
    data = [[Paragraph(text, style)]]
    t = Table(data, colWidths=[14.5*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), color),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LINEBEFORE", (0, 0), (0, -1), 3, border),
        ("ROUNDEDCORNERS", [4]),
    ]))
    return t


# ── Cover page ────────────────────────────────────────────────────────────────
def cover_page(doc, styles):
    story = []
    w, h = A4

    # Full-bleed cover — drawn directly in canvas via a Spacer + onPage hook
    # We'll use a big coloured Table as a cover block
    cover_data = [[
        Paragraph("AI Social Media Manager", styles["cover_title"]),
    ]]
    cover_table = Table(cover_data, colWidths=[17*cm])
    cover_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), INDIGO),
        ("LEFTPADDING", (0, 0), (-1, -1), 28),
        ("RIGHTPADDING", (0, 0), (-1, -1), 28),
        ("TOPPADDING", (0, 0), (-1, -1), 48),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 48),
    ]))
    story.append(cover_table)
    story.append(Spacer(1, 0.4*cm))

    # Subtitle block
    sub_data = [[
        Paragraph(
            "Complete Product Paper · Bootstrap Release",
            styles["cover_sub"]
        ),
    ]]
    sub_table = Table(sub_data, colWidths=[17*cm])
    sub_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), INDIGO_DARK),
        ("LEFTPADDING", (0, 0), (-1, -1), 28),
        ("RIGHTPADDING", (0, 0), (-1, -1), 28),
        ("TOPPADDING", (0, 0), (-1, -1), 16),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 16),
    ]))
    story.append(sub_table)
    story.append(Spacer(1, 1*cm))

    # Meta block
    meta = [
        ["Version", "1.0"],
        ["Date", "May 2026"],
        ["Status", "Bootstrap — Live"],
        ["Classification", "Confidential"],
    ]
    meta_tbl = Table(meta, colWidths=[4*cm, 12.5*cm])
    meta_tbl.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (-1, -1), SLATE_700),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LINEBELOW", (0, 0), (-1, -2), 0.3, SLATE_200),
    ]))
    story.append(meta_tbl)
    story.append(Spacer(1, 1.5*cm))

    # Executive summary callout
    story.append(callout(
        "<b>What this document covers:</b> Complete feature specification, AI agent architecture, "
        "multi-tenant data model, integration catalogue, dashboard overview, pricing model, "
        "deployment requirements, and product roadmap for the AI Social Media Manager platform.",
        styles["body"],
        color=colors.HexColor("#EEF2FF"),
        border=INDIGO
    ))

    story.append(PageBreak())
    return story


# ── Content sections ──────────────────────────────────────────────────────────
def build_story(styles):
    story = []
    P = lambda text, sty="body": Paragraph(text, styles[sty])
    B = lambda text: Paragraph(f"• &nbsp; {text}", styles["bullet"])
    SB = lambda text: Paragraph(f"– &nbsp; {text}", styles["sub_bullet"])

    def H1(text):
        return [section_rule(), P(text, "h1")]
    def H2(text):
        return [P(text, "h2")]
    def H3(text):
        return [P(text, "h3")]

    # ── 1. Executive Summary ─────────────────────────────────────────────────
    story += H1("1. Executive Summary")
    story.append(P(
        "AI Social Media Manager is a multi-tenant SaaS platform that fully automates the marketing "
        "operations of a brand's digital presence. It replaces a marketing team's routine execution work — "
        "content creation, scheduling, customer service responses, email campaigns, and performance "
        "analysis — with a coordinated system of AI agents, each specialising in a single discipline."
    ))
    story.append(P(
        "The platform is not a content suggestion tool. It acts. It generates content, reviews it against "
        "the brand's own guidelines, schedules it, monitors engagement, handles customer inquiries, "
        "assembles weekly newsletters, optimises product listings, and flags the things that genuinely "
        "need a human decision. The human manager sees a dashboard of outcomes, not a queue of tasks."
    ))
    story.append(P(
        "The system is designed for agencies managing multiple brands and for individual businesses that "
        "want enterprise-grade marketing automation without an enterprise-sized team."
    ))

    # ── 2. The Problem ───────────────────────────────────────────────────────
    story += H1("2. The Problem It Solves")
    story.append(P("Running consistent, high-quality digital marketing for a brand requires:"))
    for item in [
        "Daily content creation across 2–5 platforms",
        "Brand voice consistency across every post, email, and customer reply",
        "Real-time response to customer inquiries (expected within hours)",
        "Weekly email newsletters and campaign planning",
        "Monthly performance analysis and strategy adjustment",
        "Constant A/B testing of subject lines, posting times, and content angles",
    ]:
        story.append(B(item))

    story.append(Spacer(1, 0.3*cm))
    story.append(callout(
        "A single marketing manager can do this for one brand, imperfectly, while burning out. "
        "An agency doing this for 10 clients needs 10 people. Neither scales.<br/><br/>"
        "AI Social Media Manager reduces this to: <b>review what needs a human, approve it or override "
        "it, and let the system handle the rest.</b>",
        styles["body"],
        color=colors.HexColor("#FFF7ED"),
        border=AMBER
    ))

    # ── 3. Architecture ──────────────────────────────────────────────────────
    story += H1("3. Core Architecture")
    story.append(P(
        "The platform is built on a multi-agent orchestration model. Seven specialised AI agents run "
        "concurrently, communicating through a priority-based job queue (BullMQ on Redis). Each agent "
        "has a single responsibility and cannot act outside its scope."
    ))

    arch = [
        ["Layer", "Technology", "Purpose"],
        ["API Server", "Node.js / Express", "HTTP endpoints, webhook handling, auth"],
        ["Job Queue", "BullMQ + Redis (Upstash)", "Async task routing with priority levels"],
        ["AI Engine", "Anthropic Claude API", "Sonnet 4.6 (complex) + Haiku 4.5 (fast)"],
        ["Relational DB", "Supabase (PostgreSQL)", "Metrics, schedules, escalations, tenants"],
        ["Document DB", "MongoDB Atlas", "Content, customers, decisions"],
        ["Dashboard", "Next.js 15 (Vercel)", "Management UI with Supabase Auth"],
    ]
    story.append(Spacer(1, 0.2*cm))
    story.append(tbl(arch, [3.5*cm, 4.5*cm, 7*cm]))
    story.append(Spacer(1, 0.3*cm))
    story.append(P(
        "<b>Prompt caching</b> is implemented throughout — cached system prompts (brand guidelines, "
        "skill instructions) reduce Anthropic API costs by 80–90% on repeated calls within the same "
        "tenant context."
    ))
    story += H2("Job Priority Levels")
    prio = [
        ["Priority", "Level", "Triggered by"],
        ["URGENT (1)", "Highest", "Angry customer detected, API failure, brand crisis"],
        ["HIGH (5)", "High", "Customer service, live engagement response"],
        ["NORMAL (10)", "Standard", "Content generation, email campaigns"],
        ["LOW (20)", "Background", "Analytics aggregation, reporting"],
    ]
    story.append(tbl(prio, [3*cm, 3*cm, 9*cm]))

    # ── 4. Seven AI Agents ───────────────────────────────────────────────────
    story += H1("4. The Seven AI Agents")

    # 4.1 Content Generator
    story += H2("4.1 Content Generator")
    story.append(P("Generates all written content for the brand, on schedule and on demand."))
    story += H3("Output types:")
    for item in [
        "Instagram and Facebook captions — 5 variations per brief, ranked by quality with engagement hooks",
        "Email campaign copy — complete body with 2–3 subject line A/B variants and preview text",
        "Blog posts — SEO-optimised, 500–700 words, HTML-ready with meta description and slug",
        "Product descriptions — benefit-focused, luxury-copy style, 150 words max",
        "30-day content calendars — platform-by-platform breakdowns with key dates and email recommendations",
    ]:
        story.append(B(item))

    story.append(Spacer(1, 0.2*cm))
    story.append(callout(
        "<b>How brand context works:</b> Every piece of content is generated using the tenant's brand "
        "guidelines as a cached system prompt. The model has no hardcoded assumptions — a fashion brand "
        "in Lagos and a fintech in London get entirely different output from the same system. After "
        "generation, the best variation is automatically routed to the Brand Guardian for review.",
        styles["body"],
        color=colors.HexColor("#EEF2FF"),
        border=INDIGO
    ))

    # 4.2 Brand Guardian
    story.append(Spacer(1, 0.2*cm))
    story += H2("4.2 Brand Guardian")
    story.append(P(
        "The quality gate. Reviews every piece of content before it leaves the system. "
        "Operates in two stages."
    ))
    story += H3("Stage 1 — Static checks (instant, zero cost):")
    for item in [
        "Character limit validation per platform (Instagram: 2,200 · Facebook: 63,206 · Twitter: 280)",
        "Banned phrase detection (configured per tenant)",
        "FTC compliance flags — #ad / #sponsored disclosure detection",
        "All-caps, excessive punctuation, and prohibited claims detection",
    ]:
        story.append(B(item))
    story += H3("Stage 2 — Claude deep review:")
    for item in [
        "Brand voice consistency score (0–100)",
        "Tone analysis against the tenant's personality traits",
        "Specific issue identification with actionable written feedback",
        "Revised content suggestion when score is below threshold",
    ]:
        story.append(B(item))

    story += H3("Decision outputs:")
    decisions = [
        ["Decision", "Meaning", "Next action"],
        ["approved", "Strong, on-brand", "Routed to Social Media Manager for scheduling"],
        ["approved_with_suggestions", "Good, minor polish noted", "Published, suggestions logged"],
        ["needs_revision", "Claude provides corrected version", "Re-queued for re-review"],
        ["rejected", "Cannot be published", "Escalated to human manager with reason"],
    ]
    story.append(tbl(decisions, [4*cm, 5*cm, 6*cm]))

    # 4.3 Social Media Manager
    story.append(Spacer(1, 0.2*cm))
    story += H2("4.3 Social Media Manager")
    story.append(P("Handles everything that happens after content is approved."))
    for item in [
        "Post scheduling via Buffer — Instagram, Facebook, Twitter, TikTok, Pinterest",
        "Optimal posting time calculation — analyses historical engagement, recommends best slots per platform",
        "Cross-platform adaptation — reformats one approved piece for each platform's character limits and best practices",
        "Hashtag strategy — rotates sets, avoids repetition, tracks performance per tag",
        "Engagement monitoring — detects high-engagement posts and surfaces them for amplification",
        "Sentiment analysis on incoming mentions and comments",
    ]:
        story.append(B(item))

    # 4.4 Email Strategist
    story.append(Spacer(1, 0.2*cm))
    story += H2("4.4 Email Strategist")
    story.append(P("Full email marketing automation from brief to send."))
    for item in [
        "Campaign creation from a brief (goal, segment, offer) to complete ready-to-send email",
        "Subject line A/B testing — 2–3 variants: curiosity, FOMO, benefit-driven, exclusivity angles",
        "Subscriber segmentation — new, engaged, repeat, VIP, at-risk, inactive",
        "Send time optimisation per segment based on historical open rates",
        "Weekly newsletter assembly every Sunday — curated from week's performance and product updates",
        "Campaign performance analysis — open rate, click rate, revenue attribution",
    ]:
        story.append(B(item))

    # 4.5 Customer Service Agent
    story.append(Spacer(1, 0.2*cm))
    story += H2("4.5 Customer Service Agent")
    story.append(P("Handles incoming customer inquiries across all connected channels."))
    story += H3("Channels:")
    story.append(B("Instagram DM, WhatsApp, Website chat (Tidio), Email"))
    story += H3("Capabilities:")
    for item in [
        "Intent classification — purchase inquiry, complaint, shipping question, product info, return request",
        "Sentiment detection — routes distressed customers to URGENT priority",
        "Brand-voiced responses — replies match the tenant's tone exactly",
        "FAQ integration — checks knowledge base before composing a response",
        "Escalation triggers — sentiment below threshold, VIP customers, order disputes",
    ]:
        story.append(B(item))
    story.append(P(
        "<b>Scope boundary:</b> The agent does not make refund decisions, does not promise delivery dates, "
        "and does not handle complaints requiring account access. Those escalate with full context attached."
    ))

    # 4.6 Analytics Monitor
    story.append(Spacer(1, 0.2*cm))
    story += H2("4.6 Analytics Monitor")
    story.append(P("Aggregates performance data from all connected channels and surfaces actionable insights. Runs at 18:00 daily per tenant timezone."))
    analytics_outputs = [
        ["Output", "Description"],
        ["Daily metrics rollup", "Reach, engagement rate, conversions, revenue — stored in Supabase"],
        ["Anomaly detection", "7-day rolling average; alerts when any metric moves ±25%"],
        ["30-day forecasts", "Predicted performance based on trend analysis"],
        ["Optimal posting times", "Recalculated weekly from engagement data"],
        ["Sales spike correlation", "Traces revenue spikes to the content or campaign that drove them"],
        ["Weekly performance report", "Plain-English summary: what worked, what didn't, what to do next"],
    ]
    story.append(tbl(analytics_outputs, [5*cm, 10*cm]))

    # 4.7 E-commerce Optimizer
    story.append(Spacer(1, 0.2*cm))
    story += H2("4.7 E-commerce Optimizer")
    story.append(P(
        "Improves product performance on the tenant's e-commerce platform. "
        "Supported: Shopify (full API), WooCommerce, BigCommerce, Wix (adapters ready)."
    ))
    for item in [
        "Product listing optimisation — rewrites titles, descriptions, and bullets for SEO and conversion",
        "Conversion funnel analysis — identifies drop-off points, suggests targeted fixes",
        "Demand forecasting — 90-day inventory predictions with stockout alerts",
        "Product recommendation engine — cross-sell and upsell suggestions from purchase history",
        "Pricing analysis — competitor-aware intelligence within configured guardrails",
    ]:
        story.append(B(item))

    # ── 5. Multi-Tenancy ─────────────────────────────────────────────────────
    story += H1("5. Multi-Tenant Architecture")
    story.append(P(
        "The platform is built for multiple independent brands from the ground up. Every record in every "
        "database is scoped to a tenant. No tenant can see another tenant's data — this is enforced at "
        "the database layer, not just the application layer."
    ))

    story += H2("Isolation Layers")
    isolation = [
        ["Layer", "Mechanism"],
        ["Supabase / PostgreSQL", "Row-Level Security on every table · tenant_id column · JWT app_metadata claim"],
        ["MongoDB", "tenantId field on all documents · all queries include { tenantId } filter"],
        ["Redis / BullMQ", "tenantId embedded in every job payload · skills extract before processing"],
        ["Brand Config", "Per-tenant JSONB in brand_configs · 5-min in-memory cache per tenant"],
        ["Credentials", "Per-tenant rows in tenant_credentials · never in environment variables"],
        ["Dashboard", "Supabase JWT with tenant_id in app_metadata · middleware enforces routing"],
    ]
    story.append(tbl(isolation, [5.5*cm, 9.5*cm]))

    story += H2("Authentication")
    for item in [
        "<b>Dashboard users:</b> Supabase JWT with app_metadata.tenant_id claim — issued on login, verified on every API request",
        "<b>Direct API access:</b> API_SECRET_KEY env var → DEFAULT_TENANT_ID (backwards-compatible for single-tenant setups and testing)",
    ]:
        story.append(B(item))

    story += H2("Brand Config Versioning")
    story.append(P(
        "Every change to a tenant's brand guidelines creates a new version record in brand_configs "
        "with is_active=true and all previous versions deactivated. This provides a full audit trail "
        "and one-step rollback capability. Claude's prompt cache automatically invalidates when the "
        "guidelines change (different content = different cache key)."
    ))

    # ── 6. Dashboard ─────────────────────────────────────────────────────────
    story += H1("6. Dashboard")
    story.append(P(
        "The management interface for human operators. Built in Next.js 15 (App Router) with Supabase Auth. "
        "Deployed to Vercel. Communicates with the Express API via Supabase JWT."
    ))

    screens = [
        ["Screen", "Purpose"],
        ["Login / Signup", "Email and password authentication via Supabase. Email confirmation on signup."],
        ["Onboarding Wizard", "5-step brand setup: company → brand voice → audience → integrations → launch"],
        ["Overview", "Live stats: open escalations, recent task activity, scheduled posts count"],
        ["Content", "Scheduled content calendar with platform, type, date, and status per post"],
        ["Escalations", "Full list of open and resolved escalations with context and human notes"],
        ["Brand Settings", "Live editor for brand config — identity, voice, audience. Saves to API."],
        ["Integrations", "Connect Buffer, Mailchimp, Shopify/WooCommerce/BigCommerce/Wix, Meta, GA4"],
    ]
    story.append(tbl(screens, [4.5*cm, 10.5*cm]))

    story += H2("Onboarding Wizard — New Tenant Flow")
    steps = [
        ["Step", "Fields collected"],
        ["1 · Company", "Brand name, tagline, industry, primary market, currency, website URL"],
        ["2 · Brand Voice", "Personality traits (multi-select), tone description, do list, don't list"],
        ["3 · Audience", "Primary audience description, secondary audience description"],
        ["4 · Integrations", "Platform connections (can be skipped and completed later in Settings)"],
        ["5 · Launch", "Review summary, activate tenant — automated operations begin immediately"],
    ]
    story.append(tbl(steps, [3.5*cm, 11.5*cm]))

    # ── 7. Integrations ──────────────────────────────────────────────────────
    story += H1("7. Integration Catalogue")

    integrations = [
        ["Service", "Category", "Status", "Function"],
        ["Buffer", "Social", "Live", "Posts to Instagram, Facebook, Twitter, TikTok, Pinterest"],
        ["Meta API", "Social Data", "Live", "Instagram DMs, mentions, page analytics"],
        ["Mailchimp", "Email", "Live", "Campaign creation, list management, analytics"],
        ["Shopify", "E-commerce", "Live", "Products, orders, inventory, analytics"],
        ["WooCommerce", "E-commerce", "Stub", "Adapter interface ready, credentials accepted"],
        ["BigCommerce", "E-commerce", "Stub", "Adapter interface ready, credentials accepted"],
        ["Wix", "E-commerce", "Stub", "Adapter interface ready, credentials accepted"],
        ["Google Analytics 4", "Analytics", "Stub", "Property ID accepted, aggregation pending"],
        ["Tidio", "Customer Service", "Stub", "Webhook handler live, response sending pending"],
        ["Supabase", "Database", "Live", "All structured data — metrics, schedules, escalations"],
        ["MongoDB Atlas", "Database", "Live", "Content history, customer profiles, decisions"],
        ["Upstash Redis", "Queue", "Live", "BullMQ job queues with priority routing"],
        ["Anthropic", "AI", "Live", "Claude Sonnet 4.6 + Haiku 4.5 for all AI tasks"],
    ]
    story.append(tbl(integrations, [3.5*cm, 3*cm, 1.8*cm, 6.7*cm]))
    story.append(Spacer(1, 0.2*cm))
    story.append(P(
        '<b>Stub status:</b> Credential storage is live (tenants connect via the dashboard and credentials '
        'are stored encrypted in Supabase). The adapter interface exists with the correct method signatures. '
        'The actual API call implementations are the next development step — no architectural changes required.'
    ))

    # ── 8. Automated Schedule ────────────────────────────────────────────────
    story += H1("8. Automated Schedule")
    story.append(P(
        "All times in the tenant's configured timezone (default: Africa/Lagos, WAT UTC+1). "
        "The scheduler queries all active tenants on each trigger and enqueues a separate job for each — "
        "every tenant gets their own isolated execution."
    ))
    schedule = [
        ["Time", "Task", "Output"],
        ["08:00 daily", "Generate daily content", "Instagram + Facebook captions → Brand Guardian → Buffer"],
        ["18:00 daily", "Aggregate metrics", "All channels → anomaly detection → daily_metrics table"],
        ["18:00 Sunday", "Weekly newsletter", "Assembled newsletter → A/B subject lines → Monday send"],
        ["00:00 daily", "Health check", "System status logged"],
        ["On demand", "Customer inquiry", "Webhook-triggered, response within minutes"],
        ["On demand", "Manual trigger", "Any job via dashboard or direct API call"],
    ]
    story.append(tbl(schedule, [3.5*cm, 4.5*cm, 7*cm]))

    # ── 9. Escalation System ─────────────────────────────────────────────────
    story += H1("9. Escalation System")
    story.append(P(
        "The system knows what it can and cannot handle. Anything requiring human judgment is escalated — "
        "not silently dropped. Every escalation includes full context so the human manager can act immediately."
    ))

    story += H2("Escalation Triggers")
    for item in [
        "Brand Guardian quality score below 50 (high-risk content)",
        "Content flagged as requiring mandatory human approval (sensitive topics, large campaigns)",
        "Customer sentiment below threshold — angry, distressed, or threatening language detected",
        "API failures on critical integrations (Buffer, Mailchimp) with retry exhausted",
        "Anomaly detection alert — metric moves beyond ±25% of 7-day rolling average",
        "Customer requests outside AI scope — refunds, account access, complex disputes",
    ]:
        story.append(B(item))

    story += H2("Escalation Data")
    story.append(P(
        "Every escalation record includes: type, reason, skill that raised it, original job ID, "
        "truncated content or context (first 200 characters), and timestamp. Resolved escalations "
        "show the human manager's notes."
    ))

    story += H2("Escalation Delivery")
    for item in [
        "<b>Dashboard</b> — Escalations page shows open items in real time (Supabase live query)",
        "<b>Webhook</b> — Configurable URL (Slack, WhatsApp, email) notified immediately on escalation via ESCALATION_WEBHOOK_URL",
    ]:
        story.append(B(item))

    # ── 10. Data Model ───────────────────────────────────────────────────────
    story += H1("10. Data Model")

    story += H2("Supabase (PostgreSQL) — Structured & Relational")
    supabase_tables = [
        ["Table", "Purpose"],
        ["tenants", "Tenant registry — name, slug, plan, status"],
        ["brand_configs", "Versioned brand guidelines per tenant (JSONB) — identity, voice, audience, compliance"],
        ["tenant_credentials", "API keys per service per tenant — stored as JSONB, cached 10 min"],
        ["platform_connections", "Connection status per platform per tenant with metadata"],
        ["onboarding_progress", "Wizard step completion state per tenant"],
        ["tenant_api_keys", "Hashed API keys for direct API access (alternative to Supabase JWT)"],
        ["task_log", "Every job that ran — skill, action, status, duration, tenant_id"],
        ["escalations", "Human review queue — type, reason, payload, resolved status, human notes"],
        ["content_schedule", "Scheduled posts — platform, type, scheduled_at, status, mongo reference"],
        ["email_campaigns", "Campaign records — Mailchimp ID, subject, segment, open/click rates, revenue"],
        ["faq", "Customer service knowledge base per tenant — question, answer, hit count"],
        ["daily_metrics", "Time-series performance — date, channel, metric_key, value per tenant"],
    ]
    story.append(tbl(supabase_tables, [4.5*cm, 10.5*cm]))

    story += H2("MongoDB (Document) — Flexible Schema")
    mongo_tables = [
        ["Collection", "Purpose"],
        ["Content", "Generated content with all variations, brand review results, performance metrics, jobId"],
        ["Customer", "Customer profiles — inquiry history, purchase history, segmentation, LTV, NPS"],
        ["Decision", "Full AI decision log — inputs, outputs, skill, duration, escalation flag"],
        ["Metrics", "Channel performance snapshots with mixed schema per channel type"],
    ]
    story.append(tbl(mongo_tables, [3*cm, 12*cm]))

    # ── 11. Pricing ──────────────────────────────────────────────────────────
    story += H1("11. Pricing Model")
    story.append(P(
        "Based on per-tenant Claude API cost analysis. The AI processing cost per tenant runs "
        "approximately $2–15 per month depending on usage intensity, enabling strong margins at "
        "modest subscription prices."
    ))

    pricing = [
        ["Tier", "Price/month", "Included", "Claude cost est."],
        ["Starter", "$79", "1 brand · 3 platforms · 2 email campaigns/month", "~$2–5"],
        ["Growth", "$149", "1 brand · all platforms · unlimited campaigns · analytics reports", "~$5–15"],
        ["Agency", "$499", "Up to 10 brands · all features · priority support", "~$20–100"],
        ["Enterprise", "Custom", "Unlimited brands · SLA · dedicated onboarding", "Variable"],
    ]
    story.append(tbl(pricing, [2.5*cm, 3*cm, 8*cm, 2.5*cm]))
    story.append(Spacer(1, 0.3*cm))
    story.append(callout(
        "<b>Unit economics at 50 tenants (Growth tier):</b><br/>"
        "Revenue: $7,450/month &nbsp;·&nbsp; Infrastructure: ~$450/month &nbsp;·&nbsp; "
        "Claude API: ~$375/month &nbsp;·&nbsp; <b>Gross margin: ~89%</b>",
        styles["body"],
        color=colors.HexColor("#ECFDF5"),
        border=GREEN
    ))

    # ── 12. Deployment ───────────────────────────────────────────────────────
    story += H1("12. Deployment")

    story += H2("Production Stack (Recommended)")
    deploy = [
        ["Component", "Service", "Cost/month"],
        ["API + Workers", "Railway (1 service)", "$5–12"],
        ["Dashboard", "Vercel (Hobby/Pro)", "$0–20"],
        ["Redis", "Upstash (free → paid)", "$0–15"],
        ["PostgreSQL + Auth", "Supabase (free → Pro)", "$0–25"],
        ["MongoDB", "Atlas M0 → Flex", "$0–20"],
        ["AI Processing", "Anthropic API", "Per usage (~$2–15/tenant)"],
        ["Total (bootstrap)", "Pre-revenue", "~$5–72 fixed"],
    ]
    story.append(tbl(deploy, [5*cm, 5*cm, 5*cm]))

    story += H2("Local Development")
    story.append(P("Two processes — no Docker required:"))
    story.append(callout(
        "# Terminal 1 — API server (port 3000)\nnpm run dev\n\n"
        "# Terminal 2 — Dashboard (port 3001)\ncd dashboard && npm install && npm run dev",
        styles["code"],
        color=SLATE_50
    ))
    story.append(P(
        "The only cloud dependency during local development is Supabase — the API connects "
        "to your Supabase project for auth and data. Redis (Upstash free tier) and MongoDB Atlas (M0 free) "
        "are also cloud-based."
    ))

    story += H2("Required Environment Variables")
    env_vars = [
        ["Variable", "Required", "Purpose"],
        ["ANTHROPIC_API_KEY", "Yes", "Claude API access — all AI capabilities"],
        ["SUPABASE_URL", "Yes", "Supabase project URL"],
        ["SUPABASE_SERVICE_KEY", "Yes", "Supabase service role key — bypasses RLS"],
        ["MONGODB_URI", "Yes", "MongoDB Atlas connection string"],
        ["REDIS_URL", "Yes", "Upstash Redis URL (rediss:// format)"],
        ["API_SECRET_KEY", "Recommended", "Bearer token for direct API access"],
        ["DEFAULT_TENANT_ID", "Recommended", "Tenant UUID for API_SECRET_KEY auth"],
        ["ESCALATION_WEBHOOK_URL", "Optional", "Slack/WhatsApp/email for escalation alerts"],
        ["ALLOWED_ORIGINS", "Production", "Comma-separated CORS origins (dashboard URL)"],
        ["NEXT_PUBLIC_SUPABASE_URL", "Dashboard", "Supabase URL for Next.js client"],
        ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "Dashboard", "Supabase anon key for auth"],
        ["NEXT_PUBLIC_API_URL", "Dashboard", "Express API base URL"],
    ]
    story.append(tbl(env_vars, [5.5*cm, 2.5*cm, 7*cm]))

    # ── 13. Scope Boundaries ─────────────────────────────────────────────────
    story += H1("13. What the System Does Not Do (v1.0)")
    story.append(P(
        "Being explicit about scope prevents misunderstandings and sets correct expectations "
        "for both operators and tenants."
    ))
    for item in [
        "<b>No financial decisions</b> — no refunds, no pricing changes, no budget allocation without human approval",
        "<b>No posting without connected integration</b> — content is queued; if Buffer is not connected, it waits",
        "<b>No model training on your data</b> — all Claude calls are stateless; no fine-tuning occurs",
        "<b>No voice or video content</b> — text and static image captions only in v1.0",
        "<b>No paid advertising</b> — organic content only; no Meta Ads or Google Ads integration",
        "<b>WooCommerce, BigCommerce, Wix</b> — credential storage live, API operations are stubs",
        "<b>GA4</b> — property ID is stored and accepted; data aggregation is a stub",
        "<b>Tidio</b> — webhook receiver is live; outbound response sending is a stub",
    ]:
        story.append(B(item))

    # ── 14. Roadmap ──────────────────────────────────────────────────────────
    story += H1("14. Product Roadmap")

    roadmap = [
        ["Phase", "Focus", "Key deliverables"],
        ["Phase 7", "Complete stubs", "WooCommerce, BigCommerce, Wix adapters · GA4 aggregation · Tidio sending"],
        ["Phase 8", "Billing", "Stripe integration · per-tenant subscriptions · usage metering · plan enforcement"],
        ["Phase 9", "Advanced analytics", "AI-generated reports · competitor benchmarking · content performance prediction · revenue attribution"],
        ["Phase 10", "Content expansion", "TikTok/Reels scripts · image briefs · multilingual (French, Swahili, Yoruba, Arabic) · WhatsApp Business"],
        ["Phase 11", "Agency tools", "Sub-account hierarchy · white-label dashboard · client PDF exports · approval workflows"],
        ["Phase 12", "Enterprise", "SSO · audit logs · dedicated infrastructure · SLA · custom model fine-tuning"],
    ]
    story.append(tbl(roadmap, [2.5*cm, 3.5*cm, 9*cm]))

    # ── 15. Design Principles ────────────────────────────────────────────────
    story += H1("15. Key Design Principles")

    principles = [
        ("The AI handles execution. Humans handle judgment.",
         "No content is published that hasn't passed automated brand review. No customer situation is "
         "resolved if it requires discretion. The system escalates generously rather than guessing."),
        ("Tenant isolation is absolute.",
         "A bug affecting one tenant cannot expose another tenant's data. Every query, job, and cached "
         "value is scoped. Isolation is enforced at the database layer (RLS + field filtering), not just the application layer."),
        ("Graceful degradation.",
         "If Supabase is unavailable, the system falls back to default brand config and logs a warning. "
         "If MongoDB is unavailable, content is generated but not persisted — the job completes without "
         "crashing. No single service failure takes down the whole system."),
        ("Cost efficiency by design.",
         "Prompt caching on every Claude call. Brand guidelines (the largest cached block) are reused "
         "across all calls for the same tenant. Heavy reasoning uses Sonnet; quick classification uses "
         "Haiku. Profitable at low per-tenant pricing."),
        ("Everything is auditable.",
         "Every AI decision is logged to MongoDB with inputs, outputs, skill, job ID, and duration. "
         "Every escalation is logged with context. Every credential change is timestamped. The human "
         "manager can always see what the AI did and why."),
    ]

    for title, body in principles:
        story.append(KeepTogether([
            P(f"<b>{title}</b>", "body"),
            P(body),
            Spacer(1, 0.2*cm),
        ]))

    # ── Footer note ──────────────────────────────────────────────────────────
    story.append(Spacer(1, 1*cm))
    story.append(hr(styles))
    story.append(P(
        "This document reflects the current state of the codebase as of Phase 6 (bootstrap release). "
        "The system is fully operational for single and multi-tenant deployments on Railway + Vercel "
        "with Supabase and MongoDB Atlas.",
        "note"
    ))

    return story


# ── Build PDF ─────────────────────────────────────────────────────────────────
def main():
    styles = make_styles()
    doc = ProductPaperDoc(
        OUTPUT,
        pagesize=A4,
        leftMargin=2*cm,
        rightMargin=2*cm,
        topMargin=1.8*cm,
        bottomMargin=1.8*cm,
        title="AI Social Media Manager — Product Paper",
        author="AI Social Media Manager",
        subject="Product Paper v1.0",
    )

    story = []
    story += cover_page(doc, styles)
    story += build_story(styles)

    doc.build(story)
    size_kb = os.path.getsize(OUTPUT) // 1024
    print(f"PDF generated: {OUTPUT} ({size_kb} KB)")


if __name__ == "__main__":
    main()
