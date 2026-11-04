"""Demo seed: one tenant, the admin user, and exactly three demo agents.

Run manually with:  python -m app.seed
Also invoked from the app lifespan when SEED_DEMO=true and no agents exist.
"""
import asyncio
import logging

from sqlalchemy import select

from app.config import settings
from app.db import async_session, init_db
from app.models import Agent, Tenant, User
from app.security import hash_password

logger = logging.getLogger(__name__)

DEMO_AGENTS = [
    dict(
        name="Admission & Career Counselor",
        purpose="Guide students and parents on degree admissions, courses and enrollment steps.",
        company_name="Demo Academy",
        company_description="A demo institute offering courses in AI, Data Science and Engineering.",
        greeting_message="नमस्कार जी! मैं Demo Academy से बात कर रहा हूँ। क्या आप नए कोर्स और एडमिशन के बारे में जानकारी चाहते हैं?",
        instructions=(
            "You are an admission counselor. Speak naturally in polite conversational Hindi.\n"
            "Answer questions about admissions, fees and eligibility in 1-2 short sentences.\n"
            "Ask exactly one question at a time to understand their educational interests.\n"
            "If they decline or are busy, politely thank them and end the call."
        ),
        voice_id="shubh",
    ),
    dict(
        name="Priya — Real Estate Advisor",
        purpose="Qualify prospective property buyers and schedule site-visit appointments.",
        company_name="Demo Realty",
        company_description="A demo real-estate firm offering verified residential projects.",
        greeting_message="नमस्ते! मैं Demo Realty से प्रिया बोल रही हूँ। क्या आप नए 2 और 3 BHK रेसिडेंशियल प्रोजेक्ट्स देख रहे हैं?",
        instructions=(
            "You are a property advisor. Speak in warm, professional Hindi/Hinglish.\n"
            "Highlight key property features (connectivity, amenities) in 1-2 concise sentences.\n"
            "Check their budget and schedule a free site visit if they are interested.\n"
            "If not interested, politely wish them a great day and wrap up immediately."
        ),
        voice_id="ritu",
    ),
    dict(
        name="Raj — Broadband Support",
        purpose="Help customers troubleshoot broadband problems and dispatch engineers when needed.",
        company_name="Demo Fiber Net",
        company_description="A demo broadband provider offering fibre internet plans.",
        greeting_message="नमस्ते! मैं Demo Fiber Net से राज बात कर रहा हूँ। क्या आपके ब्रॉडबैंड कनेक्शन में कोई समस्या आ रही है?",
        instructions=(
            "You are a broadband support executive. Speak in friendly, clear Hindi/Hinglish.\n"
            "Ask one diagnostic question at a time (router lights, restart, cable) in 1-2 short sentences.\n"
            "Offer simple fixes first; if unresolved, offer to book an engineer visit.\n"
            "If they decline or are busy, politely thank them and end the call."
        ),
        voice_id="aditya",
    ),
]


async def seed_if_empty() -> None:
    async with async_session() as db:
        tenant = (await db.execute(select(Tenant).where(Tenant.slug == "demo"))).scalar_one_or_none()
        if tenant is None:
            tenant = Tenant(name="Demo Workspace", slug="demo")
            db.add(tenant)
            await db.flush()
            logger.info("[seed] Created tenant 'Demo Workspace'")

        admin = (
            await db.execute(select(User).where(User.email == settings.ADMIN_EMAIL))
        ).scalar_one_or_none()
        if admin is None:
            if settings.ADMIN_PASSWORD:
                db.add(
                    User(
                        tenant_id=tenant.id,
                        email=settings.ADMIN_EMAIL,
                        password_hash=hash_password(settings.ADMIN_PASSWORD),
                        name="Admin",
                        role="admin",
                    )
                )
                logger.info("[seed] Created admin user %s", settings.ADMIN_EMAIL)
            else:
                logger.warning(
                    "[seed] ADMIN_PASSWORD is not set — skipping admin user creation. "
                    "Set ADMIN_PASSWORD in backend/.env to create the login."
                )

        existing = (
            await db.execute(select(Agent).where(Agent.tenant_id == tenant.id).limit(1))
        ).scalar_one_or_none()
        if existing is None:
            for spec in DEMO_AGENTS:
                db.add(Agent(tenant_id=tenant.id, language="hi", enabled=True, concurrency=5, **spec))
            logger.info("[seed] Seeded %d demo agents", len(DEMO_AGENTS))
        await db.commit()


async def _main() -> None:
    logging.basicConfig(level=logging.INFO)
    await init_db()
    await seed_if_empty()


if __name__ == "__main__":
    asyncio.run(_main())
