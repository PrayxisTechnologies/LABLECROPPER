"""Endpoints for user confirmed SKU decisions and ambiguity resolution learning."""

from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user
from app.db.mongodb import ObjectId, get_db
from app.schemas.decision import DecisionResponse, SaveDecisionRequest
from app.services.sku_intelligence.engine import normalize_text

router = APIRouter()


@router.post(
    "/skus/decisions",
    response_model=DecisionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Save user confirmation decision",
    description="Stores a seller's choice for a product snippet so future labels match automatically.",
)
async def save_decision(
    payload: SaveDecisionRequest,
    current_user: dict = Depends(get_current_user),
) -> DecisionResponse:
    """Store or update user decision rule."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    user_id = str(current_user["_id"])
    norm_text = normalize_text(payload.raw_product_text)
    if not norm_text:
        raise HTTPException(status_code=400, detail="Product text cannot be empty.")

    now = datetime.now(timezone.utc)
    decision_doc = {
        "user_id": user_id,
        "raw_product_text": payload.raw_product_text.strip(),
        "normalized_product_text": norm_text,
        "chosen_sku": payload.chosen_sku.strip(),
        "created_at": now,
        "job_id": payload.job_id,
    }

    # Upsert by user_id and normalized_product_text
    res = await db.sku_decisions.update_one(
        {"user_id": user_id, "normalized_product_text": norm_text},
        {"$set": decision_doc},
        upsert=True,
    )

    doc_id = str(res.upserted_id) if res.upserted_id else "existing"
    if doc_id == "existing":
        existing = await db.sku_decisions.find_one({
            "user_id": user_id,
            "normalized_product_text": norm_text,
        })
        doc_id = str(existing["_id"]) if existing else "unknown"

    return DecisionResponse(
        id=doc_id,
        user_id=user_id,
        raw_product_text=payload.raw_product_text,
        normalized_product_text=norm_text,
        chosen_sku=payload.chosen_sku,
        created_at=now,
    )


@router.get(
    "/skus/decisions",
    response_model=List[DecisionResponse],
    summary="List saved user decisions",
)
async def list_decisions(
    current_user: dict = Depends(get_current_user),
) -> List[DecisionResponse]:
    """Retrieve all saved disambiguation decisions for current user."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    user_id = str(current_user["_id"])
    cursor = db.sku_decisions.find({"user_id": user_id}).sort("created_at", -1).limit(200)

    results: List[DecisionResponse] = []
    async for d in cursor:
        results.append(
            DecisionResponse(
                id=str(d["_id"]),
                user_id=d["user_id"],
                raw_product_text=d["raw_product_text"],
                normalized_product_text=d["normalized_product_text"],
                chosen_sku=d["chosen_sku"],
                created_at=d.get("created_at", datetime.now(timezone.utc)),
            )
        )
    return results


@router.delete(
    "/skus/decisions/{decision_id}",
    summary="Remove a saved decision rule",
)
async def delete_decision(
    decision_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a saved matching rule."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    user_id = str(current_user["_id"])
    try:
        obj_id = ObjectId(decision_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid decision ID.")

    res = await db.sku_decisions.delete_one({"_id": obj_id, "user_id": user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Decision not found.")

    return {"message": "Decision rule deleted successfully."}
