"""
Auth service — all business logic for registration, login, token management.
Keeps the route handlers thin and testable.
"""
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.user import UserInDB, UserRole
from app.schemas.auth import (
    DriverCreateRequest,
    LoginRequest,
    OwnerRegisterRequest,
)
from app.utils.hashing import hash_password, verify_password
from app.utils.jwt import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    get_refresh_token_expiry,
)


# ──────────────────────────────────────────────────────────────────────────────
# Owner Registration
# ──────────────────────────────────────────────────────────────────────────────

async def register_owner(data: OwnerRegisterRequest, db: AsyncIOMotorDatabase) -> UserInDB:
    """
    Create a new owner account.
    Raises 409 if email already exists.
    """
    existing = await db.users.find_one({
        "$or": [{"email": data.email}, {"phone": data.phone}]
    })
    if existing:
        if existing.get("email") == data.email:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists.",
            )
        if existing.get("phone") == data.phone:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this phone number already exists.",
            )

    user_doc = {
        "name": data.name,
        "email": data.email,
        "phone": data.phone,
        "password_hash": hash_password(data.password),
        "role": UserRole.OWNER,
        "is_active": True,
        "company_name": data.company_name,
        "gst_number": data.gst_number,
        # Driver-only fields — not set for owners
        "owner_id": None,
        "assigned_truck_id": None,
        "license_number": None,
        "license_expiry": None,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }

    result = await db.users.insert_one(user_doc)
    user_doc["_id"] = str(result.inserted_id)
    return UserInDB.from_mongo(user_doc)


# ──────────────────────────────────────────────────────────────────────────────
# Driver Creation (by Owner)
# ──────────────────────────────────────────────────────────────────────────────

async def create_driver(
    data: DriverCreateRequest,
    owner: UserInDB,
    db: AsyncIOMotorDatabase,
) -> UserInDB:
    """
    Create a driver account on behalf of an authenticated owner.
    The driver is linked to this owner's ID.
    Raises 403 if called by a non-owner.
    Raises 409 if email already exists.
    """
    if owner.role != UserRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owners can create driver accounts.",
        )

    existing = await db.users.find_one({
        "$or": [{"email": data.email}, {"phone": data.phone}]
    })
    if existing:
        if existing.get("email") == data.email:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A user with this email already exists.",
            )
        if existing.get("phone") == data.phone:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A user with this phone number already exists.",
            )

    driver_doc = {
        "name": data.name,
        "email": data.email,
        "phone": data.phone,
        "password_hash": hash_password(data.password),
        "role": UserRole.DRIVER,
        "is_active": True,
        # Owner-only fields — not set for drivers
        "company_name": None,
        "gst_number": None,
        # Driver-specific fields
        "owner_id": owner.id,           # Link driver to the creating owner
        "assigned_truck_id": None,      # No truck assigned yet
        "license_number": data.license_number,
        "license_image_url": data.license_image_url,
        "license_expiry": data.license_expiry,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }

    result = await db.users.insert_one(driver_doc)
    driver_doc["_id"] = str(result.inserted_id)
    return UserInDB.from_mongo(driver_doc)


# ──────────────────────────────────────────────────────────────────────────────
# Login (shared for both roles)
# ──────────────────────────────────────────────────────────────────────────────

async def login_user(data: LoginRequest, db: AsyncIOMotorDatabase) -> dict:
    """
    Authenticate a user (owner or driver) and return access + refresh tokens.
    Returns a dict with both tokens and the user's role.
    """
    user_doc = await db.users.find_one({"email": data.email})
    if not user_doc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    user = UserInDB.from_mongo(user_doc)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated. Contact your owner/admin.",
        )

    if not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    # Create tokens
    access_token = create_access_token(
        user_id=user.id,
        role=user.role,
        owner_id=user.owner_id if user.role == UserRole.DRIVER else None,
    )
    refresh_token = create_refresh_token(user_id=user.id)

    # Persist refresh token in DB (for revocation on logout)
    await db.refresh_tokens.insert_one({
        "user_id": user.id,
        "token": refresh_token,
        "expires_at": get_refresh_token_expiry(),
        "created_at": datetime.now(timezone.utc),
    })

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "role": user.role,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Token Refresh
# ──────────────────────────────────────────────────────────────────────────────

async def refresh_access_token(refresh_token: str, db: AsyncIOMotorDatabase) -> dict:
    """
    Issue a new access token given a valid refresh token.
    The refresh token must exist in the DB (not logged out).
    """
    from jose import JWTError

    try:
        payload = decode_refresh_token(refresh_token)
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        )

    # Check token exists in DB (wasn't revoked via logout)
    stored = await db.refresh_tokens.find_one({"token": refresh_token, "user_id": user_id})
    if not stored:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked. Please log in again.",
        )

    # Fetch user to get current role
    user_doc = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user_doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    user = UserInDB.from_mongo(user_doc)

    new_access_token = create_access_token(
        user_id=user.id,
        role=user.role,
        owner_id=user.owner_id if user.role == UserRole.DRIVER else None,
    )

    return {"access_token": new_access_token, "token_type": "bearer"}


# ──────────────────────────────────────────────────────────────────────────────
# Logout
# ──────────────────────────────────────────────────────────────────────────────

async def logout_user(refresh_token: str, user_id: str, db: AsyncIOMotorDatabase) -> None:
    """
    Revoke the given refresh token by removing it from the DB.
    This invalidates that specific session.
    """
    await db.refresh_tokens.delete_one({"token": refresh_token, "user_id": user_id})


# ──────────────────────────────────────────────────────────────────────────────
# Get current user (from access token payload)
# ──────────────────────────────────────────────────────────────────────────────

async def get_user_by_id(user_id: str, db: AsyncIOMotorDatabase) -> UserInDB:
    """Fetch a user document by their string ObjectId."""
    try:
        user_doc = await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user ID.")

    if not user_doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    return UserInDB.from_mongo(user_doc)
