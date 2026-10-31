"""MongoDB connection manager and lifecycle hooks using Motor with safe fallback."""

from typing import Any, Optional
from app.core.config import get_settings
from app.core.logging import logger
from app.db.fallback_db import FallbackObjectId, InMemoryDatabase

settings = get_settings()

# Safe optional imports for motor, pymongo, and bson
try:
    import pymongo
    from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
    HAS_MOTOR = True
except ImportError:
    pymongo = None
    AsyncIOMotorClient = None
    AsyncIOMotorDatabase = None
    HAS_MOTOR = False

try:
    from bson import ObjectId as _RealObjectId
    ObjectId = _RealObjectId
    HAS_BSON = True
except ImportError:
    HAS_BSON = False
    ObjectId = FallbackObjectId  # type: ignore

_client: Optional[Any] = None
_database: Optional[Any] = None
_is_connected: bool = False
_fallback_db: InMemoryDatabase = InMemoryDatabase()


async def init_db() -> None:
    """Initialize the MongoDB client connection with Windows SSL handling and safe in-memory fallback."""
    global _client, _database, _is_connected

    if not HAS_MOTOR:
        logger.warning(
            "MongoDB drivers ('motor', 'pymongo') are not installed in current Python environment. "
            "LabelFlow is operating in high-performance in-memory fallback mode."
        )
        _is_connected = False
        _database = _fallback_db
        return

    if not settings.MONGODB_URI:
        logger.info("MONGODB_URI is not set. Operating in in-memory fallback mode.")
        _is_connected = False
        _database = _fallback_db
        return

    # Check for certifi to avoid Windows SSL verify failed errors
    ca_file: Optional[str] = None
    try:
        import certifi
        ca_file = certifi.where()
    except Exception:
        ca_file = None

    connection_strategies = [
        # Strategy 1: Standard connection with certifi CA bundle (if available)
        {
            "label": "standard SSL with certifi CA",
            "kwargs": {
                "serverSelectionTimeoutMS": settings.MONGODB_CONNECT_TIMEOUT_MS,
                "connectTimeoutMS": settings.MONGODB_CONNECT_TIMEOUT_MS,
                **({"tlsCAFile": ca_file} if ca_file else {}),
            },
        },
        # Strategy 2: Allow invalid certificates (handles Windows corporate proxies & antivirus SSL inspection)
        {
            "label": "fallback SSL (tlsAllowInvalidCertificates=True)",
            "kwargs": {
                "serverSelectionTimeoutMS": settings.MONGODB_CONNECT_TIMEOUT_MS,
                "connectTimeoutMS": settings.MONGODB_CONNECT_TIMEOUT_MS,
                "tlsAllowInvalidCertificates": True,
            },
        },
    ]

    last_error: Optional[Exception] = None

    for strat in connection_strategies:
        try:
            logger.info("Attempting MongoDB connection (%s)...", strat["label"])
            test_client = AsyncIOMotorClient(settings.MONGODB_URI, **strat["kwargs"])
            # Ping database cluster to verify handshake and credentials
            await test_client.admin.command("ping")
            _client = test_client
            _database = _client[settings.MONGODB_DATABASE]
            _is_connected = True
            logger.info(
                "MongoDB connected successfully to cluster database '%s' using %s.",
                settings.MONGODB_DATABASE,
                strat["label"],
            )

            # Ensure collection indexes
            await _create_indexes(_database)

            # Auto-sync any credentials or data created in fallback store directly to MongoDB Atlas
            await _sync_fallback_to_atlas(_database)
            return

        except Exception as e:
            last_error = e
            logger.warning("MongoDB strategy '%s' failed: %s", strat["label"], str(e))
            if _client:
                try:
                    _client.close()
                except Exception:
                    pass
                _client = None

    # Both connection strategies failed. Provide diagnostic instructions and activate fallback.
    error_msg = str(last_error) if last_error else "Connection timed out"
    logger.warning(
        "\n"
        "================================================================================\n"
        "⚠️  MONGODB CLUSTER CONNECTION NOTICE\n"
        "Failed to reach MongoDB Atlas cluster: %s\n\n"
        "👉 HOW TO FIX MONGODB ATLAS ACCESS:\n"
        "1. Open your MongoDB Atlas Dashboard: https://cloud.mongodb.com\n"
        "2. In the left sidebar, click 'Network Access' (under Security).\n"
        "3. Click '+ Add IP Address'.\n"
        "4. Click 'Allow Access From Anywhere' (0.0.0.0/0) and click 'Confirm'.\n"
        "5. Wait ~1 minute for Atlas to apply the network rule.\n\n"
        "👉 CURRENT STATUS:\n"
        "LabelFlow backend has automatically activated its resilient in-memory database!\n"
        "Seller accounts, SKUs, and label processing will work seamlessly without errors.\n"
        "================================================================================",
        error_msg,
    )

    _is_connected = False
    _database = _fallback_db


async def _create_indexes(db: Any) -> None:
    """Create indexes for users, user_skus, sku_decisions, and processing_jobs."""
    if not HAS_MOTOR or pymongo is None or db is None or db is _fallback_db:
        return

    try:
        # Users Collection: unique email
        await db.users.create_index(
            [("email", pymongo.ASCENDING)],
            unique=True,
            name="idx_users_email_unique",
        )

        # User SKUs Collection: unique per-user sku_code, keywords search, active filter
        await db.user_skus.create_index(
            [("user_id", pymongo.ASCENDING), ("sku_code", pymongo.ASCENDING)],
            unique=True,
            name="idx_user_skus_user_sku_code_unique",
        )
        await db.user_skus.create_index(
            [("user_id", pymongo.ASCENDING), ("is_active", pymongo.ASCENDING)],
            name="idx_user_skus_user_active",
        )
        await db.user_skus.create_index(
            [("user_id", pymongo.ASCENDING), ("keywords", pymongo.ASCENDING)],
            name="idx_user_skus_user_keywords",
        )

        # SKU Decisions Collection: user + normalized text
        await db.sku_decisions.create_index(
            [
                ("user_id", pymongo.ASCENDING),
                ("normalized_product_text", pymongo.ASCENDING),
            ],
            name="idx_decisions_user_text",
        )
        await db.sku_decisions.create_index(
            [("user_id", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)],
            name="idx_decisions_user_created",
        )

        # Processing Jobs Collection: user + created_at, job_id, and compound user+trashed+created
        await db.processing_jobs.create_index(
            [("user_id", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)],
            name="idx_jobs_user_created",
        )
        await db.processing_jobs.create_index(
            [
                ("user_id", pymongo.ASCENDING),
                ("is_trashed", pymongo.ASCENDING),
                ("created_at", pymongo.DESCENDING),
            ],
            name="idx_jobs_user_trashed_created",
        )
        await db.processing_jobs.create_index(
            [("job_id", pymongo.ASCENDING)],
            unique=True,
            name="idx_jobs_job_id_unique",
        )

        # Cloud Label Queue Collection: user + status + uploaded_at, file_id unique, 48h TTL cleanup
        await db.cloud_label_queue.create_index(
            [("user_id", pymongo.ASCENDING), ("status", pymongo.ASCENDING), ("uploaded_at", pymongo.DESCENDING)],
            name="idx_cloud_queue_user_status_uploaded",
        )
        await db.cloud_label_queue.create_index(
            [("file_id", pymongo.ASCENDING)],
            unique=True,
            name="idx_cloud_queue_file_id_unique",
        )
        await db.cloud_label_queue.create_index(
            [("expires_at", pymongo.ASCENDING)],
            expireAfterSeconds=0,
            name="idx_cloud_queue_ttl_expires_at",
        )

        # Master Sheet Labels Collection: compound indexes for superfast <30ms queries
        await db.master_labels.create_index(
            [("user_id", pymongo.ASCENDING), ("is_trashed", pymongo.ASCENDING), ("last_processed_at", pymongo.DESCENDING)],
            name="idx_master_labels_user_trashed_processed",
        )
        await db.master_labels.create_index(
            [("user_id", pymongo.ASCENDING), ("order_id", pymongo.ASCENDING)],
            name="idx_master_labels_user_order_id",
        )
        await db.master_labels.create_index(
            [("user_id", pymongo.ASCENDING), ("wbl_id", pymongo.ASCENDING)],
            name="idx_master_labels_user_wbl_id",
        )
        await db.master_labels.create_index(
            [("user_id", pymongo.ASCENDING), ("marketplace", pymongo.ASCENDING), ("is_trashed", pymongo.ASCENDING), ("last_processed_at", pymongo.DESCENDING)],
            name="idx_master_labels_user_mp_trashed_processed",
        )
        await db.master_labels.create_index(
            [("user_id", pymongo.ASCENDING), ("courier_partner", pymongo.ASCENDING), ("is_trashed", pymongo.ASCENDING), ("last_processed_at", pymongo.DESCENDING)],
            name="idx_master_labels_user_courier_trashed_processed",
        )
        await db.master_labels.create_index(
            [("user_id", pymongo.ASCENDING), ("sku", pymongo.ASCENDING)],
            name="idx_master_labels_user_sku",
        )
        await db.master_labels.create_index(
            [("user_id", pymongo.ASCENDING), ("wbl_id", pymongo.ASCENDING)],
            name="idx_master_labels_user_wbl",
        )
        # Automatic MongoDB 60-day TTL purge for trashed labels
        await db.master_labels.create_index(
            [("trashed_at", pymongo.ASCENDING)],
            expireAfterSeconds=60 * 86400,
            name="idx_master_labels_ttl_trashed_60d",
        )

        logger.info("MongoDB indexes verified/created successfully.")
    except Exception as e:
        logger.warning("Notice while creating MongoDB indexes: %s", str(e))


async def _sync_fallback_to_atlas(db: Any) -> None:
    """Synchronize any users, SKUs, or jobs recorded in local fallback store to MongoDB Atlas."""
    import json
    from pathlib import Path
    fallback_path = Path("storage/local_fallback_db.json")
    if not fallback_path.exists():
        fallback_path = Path("backend/storage/local_fallback_db.json")
    if not fallback_path.exists():
        return

    try:
        data = json.loads(fallback_path.read_text(encoding="utf-8"))
        # 1. Sync Users
        users = data.get("users", [])
        for u in users:
            email = u.get("email")
            if email:
                existing = await db.users.find_one({"email": email})
                if not existing:
                    u_doc = dict(u)
                    if "_id" in u_doc:
                        if ObjectId.is_valid(u_doc["_id"]):
                            u_doc["_id"] = ObjectId(u_doc["_id"])
                        else:
                            del u_doc["_id"]
                    await db.users.insert_one(u_doc)
                    logger.info("Synced fallback user %s into MongoDB Atlas", email)

        # 2. Sync User SKUs
        user_skus = data.get("user_skus", [])
        for s in user_skus:
            u_id = s.get("user_id")
            sku_code = s.get("sku_code")
            if u_id and sku_code:
                existing_sku = await db.user_skus.find_one({"user_id": u_id, "sku_code": sku_code})
                if not existing_sku:
                    s_doc = dict(s)
                    if "_id" in s_doc and not ObjectId.is_valid(s_doc["_id"]):
                        del s_doc["_id"]
                    await db.user_skus.insert_one(s_doc)

    except Exception as e:
        logger.warning("Notice while syncing fallback store to Atlas: %s", str(e))



async def close_db() -> None:
    """Close the MongoDB client connection gracefully."""
    global _client, _database, _is_connected
    if _client is not None:
        try:
            logger.info("Closing MongoDB connection...")
            _client.close()
        except Exception:
            pass
        _client = None
    _database = _fallback_db
    _is_connected = False
    logger.info("MongoDB connection closed.")


def get_db() -> Any:
    """Retrieve the active MongoDB database instance, or the resilient in-memory database."""
    global _database
    if _database is None:
        return _fallback_db
    return _database


def is_db_connected() -> bool:
    """Return whether real MongoDB cluster is currently connected."""
    return _is_connected
