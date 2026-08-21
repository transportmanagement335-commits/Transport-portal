from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    MONGO_URI: str = "mongodb://localhost:27017"
    MONGO_DB_NAME: str = "transport_portal"

    JWT_SECRET_KEY: str = "change-this-to-a-long-random-secret-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    N8N_WEBHOOK_URL: str = ""

    # ── Public server URL (used to build PDF download links) ──────────────────
    APP_BASE_URL: str = "http://localhost:8000"

    # ── WhatsApp Business API (Meta Graph API) ────────────────────────────────
    WHATSAPP_API_TOKEN: str = ""          # Bearer token from Meta Business
    WHATSAPP_PHONE_NUMBER_ID: str = ""   # Phone Number ID from WhatsApp dashboard

    # ── SMTP Email Server Config ──────────────────────────────────────────────
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = ""

    # ── Invoice defaults ──────────────────────────────────────────────────────
    DEFAULT_TAX_RATE: float = 0.0        # Default GST / tax rate (%)
    DEFAULT_PAYMENT_TERMS_DAYS: int = 30 # Default payment due days

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
