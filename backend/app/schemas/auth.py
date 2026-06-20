"""
Pydantic schemas for authentication request/response bodies.
These are NOT the DB models — they define what the API accepts and returns.
"""
from datetime import datetime
from typing import Optional

import re
from pydantic import BaseModel, EmailStr, field_validator
from email_validator import validate_email, EmailNotValidError


# ──────────────────────────────────────────────────────────────────────────────
# OWNER Registration
# ──────────────────────────────────────────────────────────────────────────────

class OwnerRegisterRequest(BaseModel):
    """Body for POST /api/auth/register/owner"""
    name: str
    email: EmailStr
    phone: str
    password: str
    company_name: str
    gst_number: Optional[str] = None

    @field_validator("email")
    @classmethod
    def email_deliverability(cls, v: str) -> str:
        try:
            emailinfo = validate_email(v, check_deliverability=False)
            return emailinfo.normalized
        except EmailNotValidError as e:
            raise ValueError(str(e))

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one number")
        if not re.search(r"[@$!%*?&#^]", v):
            raise ValueError("Password must contain at least one special character")
        return v

    @field_validator("phone")
    @classmethod
    def phone_format(cls, v: str) -> str:
        digits = v.replace("+", "").replace("-", "").replace(" ", "")
        if not digits.isdigit() or len(digits) < 10:
            raise ValueError("Invalid phone number")
        return v


# ──────────────────────────────────────────────────────────────────────────────
# DRIVER Creation  (called by an authenticated Owner)
# ──────────────────────────────────────────────────────────────────────────────

class DriverCreateRequest(BaseModel):
    """
    Body for POST /api/auth/drivers  (owner-authenticated route).
    The owner creates a driver account — the driver does NOT self-register.
    """
    name: str
    email: EmailStr
    phone: str
    password: str                       # Initial password; driver should change it
    license_number: str
    license_image_url: Optional[str] = None
    license_expiry: Optional[datetime] = None

    @field_validator("email")
    @classmethod
    def email_deliverability(cls, v: str) -> str:
        try:
            emailinfo = validate_email(v, check_deliverability=False)
            return emailinfo.normalized
        except EmailNotValidError as e:
            raise ValueError(str(e))

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one number")
        if not re.search(r"[@$!%*?&#^]", v):
            raise ValueError("Password must contain at least one special character")
        return v


# ──────────────────────────────────────────────────────────────────────────────
# Login (shared for both roles)
# ──────────────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):

    email: EmailStr
    password: str
    
    """Body for POST /api/auth/login"""
    @field_validator("email")
    @classmethod
    def email_deliverability(cls, v: str) -> str:
        try:
            emailinfo = validate_email(v, check_deliverability=False)
            return emailinfo.normalized
        except EmailNotValidError as e:
            raise ValueError(str(e))
    password: str


# ──────────────────────────────────────────────────────────────────────────────
# Token schemas
# ──────────────────────────────────────────────────────────────────────────────

class TokenResponse(BaseModel):
    """Response returned after successful login or token refresh."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: str                           # "owner" or "driver" — tells frontend which dashboard to show


class RefreshRequest(BaseModel):
    """Body for POST /api/auth/refresh"""
    refresh_token: str


class AccessTokenResponse(BaseModel):
    """Response for token refresh — returns only a new access token."""
    access_token: str
    token_type: str = "bearer"


# ──────────────────────────────────────────────────────────────────────────────
# Driver OTP Login
# ──────────────────────────────────────────────────────────────────────────────

class OTPRequestRequest(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def phone_format(cls, v: str) -> str:
        digits = v.replace("+", "").replace("-", "").replace(" ", "")
        if not digits.isdigit() or len(digits) < 10:
            raise ValueError("Invalid phone number")
        return v

class OTPVerifyRequest(BaseModel):
    phone: str
    otp_code: str


# ──────────────────────────────────────────────────────────────────────────────
# Public user profile (safe to send to client — no password_hash)
# ──────────────────────────────────────────────────────────────────────────────

class UserProfileResponse(BaseModel):
    """Safe user representation returned from /api/auth/me."""
    id: str
    name: str
    email: str
    phone: str
    role: str
    is_active: bool
    created_at: datetime

    # Owner fields
    company_name: Optional[str] = None
    gst_number: Optional[str] = None

    # Driver fields
    owner_id: Optional[str] = None
    assigned_truck_id: Optional[str] = None
    license_number: Optional[str] = None
    license_image_url: Optional[str] = None
    license_expiry: Optional[datetime] = None
