"""
Auth routes — registration, login, token refresh, logout, and /me endpoint.

Route summary:
  POST /api/auth/register/owner   → Owner self-registration (public)
  POST /api/auth/login            → Login for both owners and drivers (public)
  POST /api/auth/drivers          → Owner creates a driver account (owner auth required)
  POST /api/auth/refresh          → Get new access token via refresh token
  POST /api/auth/logout           → Revoke refresh token (authenticated)
  GET  /api/auth/me               → Get current user's profile (authenticated)
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from app.database import get_database
from app.models.user import UserRole
from app.schemas.auth import (
    AccessTokenResponse,
    DriverCreateRequest,
    LoginRequest,
    OwnerRegisterRequest,
    RefreshRequest,
    TokenResponse,
    UserProfileResponse,
)
from app.services import auth_service
from app.utils.jwt import decode_access_token

router = APIRouter()
bearer_scheme = HTTPBearer()


# ──────────────────────────────────────────────────────────────────────────────
# Dependency: get current authenticated user from Bearer token
# ──────────────────────────────────────────────────────────────────────────────

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
):
    """
    FastAPI dependency — extracts and validates JWT from Authorization header.
    Injects the current UserInDB into any protected route.
    """
    token = credentials.credentials
    try:
        payload = decode_access_token(token)
        user_id: str = payload.get("sub")
        if not user_id:
            raise JWTError("No subject in token")
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    db = get_database()
    user = await auth_service.get_user_by_id(user_id, db)
    return user


async def require_owner(current_user=Depends(get_current_user)):
    """Dependency that ensures the caller is an Owner — raises 403 otherwise."""
    if current_user.role != UserRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This action is restricted to owners only.",
        )
    return current_user


# ──────────────────────────────────────────────────────────────────────────────
# Public routes
# ──────────────────────────────────────────────────────────────────────────────

@router.post(
    "/register/owner",
    response_model=UserProfileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new owner account",
)
async def register_owner(data: OwnerRegisterRequest):
    """
    Public endpoint — any visitor can create an Owner account.
    Owners manage trucks and drivers after registration.
    """
    db = get_database()
    user = await auth_service.register_owner(data, db)
    return _to_profile(user)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login for owners and drivers",
)
async def login(data: LoginRequest):
    """
    Shared login for both Owners and Drivers.
    Returns access_token, refresh_token, and role.
    The frontend should use `role` to redirect to the correct dashboard.
    """
    db = get_database()
    return await auth_service.login_user(data, db)


# ──────────────────────────────────────────────────────────────────────────────
# Driver OTP Login
# ──────────────────────────────────────────────────────────────────────────────
from app.schemas.auth import OTPRequestRequest, OTPVerifyRequest

@router.post(
    "/driver/request-otp",
    summary="Request an OTP for Driver login",
)
async def request_driver_otp(data: OTPRequestRequest):
    """
    Finds driver by phone and sends an OTP via WhatsApp.
    """
    db = get_database()
    return await auth_service.request_driver_otp(data.phone, db)

@router.post(
    "/driver/verify-otp",
    response_model=TokenResponse,
    summary="Verify OTP for Driver login",
)
async def verify_driver_otp(data: OTPVerifyRequest):
    """
    Verifies the OTP and returns tokens upon success.
    """
    db = get_database()
    return await auth_service.verify_driver_otp(data.phone, data.otp_code, db)


# ──────────────────────────────────────────────────────────────────────────────
# Owner-authenticated routes
# ──────────────────────────────────────────────────────────────────────────────

@router.post(
    "/drivers",
    response_model=UserProfileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Owner creates a driver account",
)
async def create_driver(
    data: DriverCreateRequest,
    current_owner=Depends(require_owner),
):
    """
    Owner-only: creates a driver account linked to the calling owner.
    The driver does NOT self-register — the owner provisions their account
    and shares the credentials (or the driver resets the password later).
    """
    db = get_database()
    driver = await auth_service.create_driver(data, current_owner, db)
    return _to_profile(driver)


@router.get(
    "/drivers-list",
    response_model=list[UserProfileResponse],
    summary="List all drivers belonging to this owner",
)
async def list_drivers(current_owner=Depends(require_owner)):
    """
    Owner-only: returns all driver accounts created by the calling owner.
    Used by the Admin Drivers management page.
    """
    db = get_database()
    cursor = db.users.find({"role": "driver", "owner_id": current_owner.id})
    drivers = []
    async for doc in cursor:
        from app.models.user import UserInDB
        drivers.append(_to_profile(UserInDB.from_mongo(doc)))
    return drivers


# ──────────────────────────────────────────────────────────────────────────────
# Token management (authenticated)
# ──────────────────────────────────────────────────────────────────────────────

@router.post(
    "/refresh",
    response_model=AccessTokenResponse,
    summary="Refresh access token",
)
async def refresh_token(data: RefreshRequest):
    """
    Exchange a valid refresh token for a new access token.
    Does NOT require the Authorization header — uses the body token.
    """
    db = get_database()
    return await auth_service.refresh_access_token(data.refresh_token, db)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Logout and revoke refresh token",
)
async def logout(data: RefreshRequest, current_user=Depends(get_current_user)):
    """
    Authenticated logout — removes the refresh token from DB.
    The access token will naturally expire (15 min).
    For full immediate invalidation, use short-lived access tokens.
    """
    db = get_database()
    await auth_service.logout_user(data.refresh_token, current_user.id, db)
    return None


# ──────────────────────────────────────────────────────────────────────────────
# Profile
# ──────────────────────────────────────────────────────────────────────────────

@router.get(
    "/me",
    response_model=UserProfileResponse,
    summary="Get current user profile",
)
async def get_me(current_user=Depends(get_current_user)):
    """
    Returns the authenticated user's profile.
    Safe — no password_hash or sensitive internals included.
    """
    return _to_profile(current_user)


# ──────────────────────────────────────────────────────────────────────────────
# Helper
# ──────────────────────────────────────────────────────────────────────────────

def _to_profile(user) -> UserProfileResponse:
    """Convert a UserInDB to a safe UserProfileResponse."""
    return UserProfileResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        phone=user.phone,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        company_name=user.company_name,
        gst_number=user.gst_number,
        owner_id=user.owner_id,
        assigned_truck_id=user.assigned_truck_id,
        license_number=user.license_number,
        license_image_url=user.license_image_url,
        license_expiry=user.license_expiry,
    )
