"""Master Sheet service for recording, deduplicating, and querying all cropped labels."""

import csv
import io
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.core.logging import logger
from app.db.mongodb import ObjectId, get_db
from app.schemas.master_sheet import (
    LabelAppearance,
    MasterLabelItem,
    MasterSheetResponse,
)
from app.services.pdf.waybill_extractor import extract_waybill_id


class MasterSheetService:
    """Manages the centralized Master Sheet catalog for all processed seller orders."""

    async def record_batch_labels(
        self,
        user_id: str,
        job_id: str,
        labels: List[Dict[str, Any]],
        marketplace: str = "Meesho",
        custom_pdf_name: Optional[str] = None,
    ) -> int:
        """Record and deduplicate a batch of cropped labels into user's Master Sheet.

        Deduplication Rule:
        - Master Sheet is strictly keyed by `order_id`.
        - If the user uploads the same label in 2 different PDFs, it does NOT create
          duplicate records. It records the new PDF filename and page position under
          the existing Order ID.
        """
        db = get_db()
        if db is None or not user_id:
            return 0

        now = datetime.now(timezone.utc)
        clean_mp = marketplace.capitalize() if marketplace else "Meesho"
        pdf_filename = custom_pdf_name or f"{clean_mp.lower()}_thermal_4x6_{job_id}.pdf"
        recorded_count = 0

        for idx, lbl in enumerate(labels):
            raw_text = lbl.get("raw_text", "")
            order_id = (lbl.get("order_id") or "").strip()

            # If order_id not in dictionary, try parsing from raw text
            if not order_id:
                m_order = re.search(r"\b(?:Order\s*No\.?|Sub\s*Order\s*No\.?)\s*[:\-#]?\s*([A-Za-z0-9_\-]+)", raw_text, re.I)
                if m_order:
                    order_id = m_order.group(1).strip()

            # Courier partner
            courier = lbl.get("courier_partner") or "Unassigned"

            # WBL / AWB tracking ID
            wbl_id = lbl.get("wbl_id") or extract_waybill_id(raw_text, courier)

            # Prioritize full real raw SKU (e.g. 'Rospack 80ml 074')
            raw_sku = lbl.get("raw_sku")
            sku_items = lbl.get("sku_items") or []
            sku_val = (raw_sku or "").strip()
            if not sku_val or sku_val == "UNMATCHED":
                if sku_items:
                    primary = sku_items[0]
                    sku_val = getattr(primary, "sku", None) or (primary.get("sku") if isinstance(primary, dict) else str(primary))
                    sku_val = (sku_val or "UNMATCHED").strip()
            if not sku_val:
                sku_val = "UNMATCHED"

            # Output page in thermal PDF (1-indexed)
            output_page = idx + 1
            input_file = lbl.get("filename")

            # Fallback if no order_id found: fallback to wbl_id or unique job tag
            if not order_id:
                if wbl_id:
                    order_id = f"AWB_{wbl_id}"
                else:
                    order_id = f"JOB_{job_id}_P{output_page}"

            appearance = {
                "job_id": job_id,
                "pdf_filename": pdf_filename,
                "input_filename": input_file,
                "page_number": output_page,
                "created_at": now,
            }

            try:
                existing = await db.master_labels.find_one({
                    "user_id": user_id,
                    "order_id": order_id,
                })

                if existing:
                    # Check if this exact job_id and page_number is already recorded
                    existing_apps = existing.get("appearances", [])
                    already_present = any(
                        a.get("job_id") == job_id and a.get("page_number") == output_page
                        for a in existing_apps
                    )

                    update_fields: Dict[str, Any] = {
                        "last_processed_at": now,
                    }

                    # Always upgrade to full real raw SKU if existing was short/truncated
                    if sku_val != "UNMATCHED" and (not existing.get("sku") or existing.get("sku") == "UNMATCHED" or len(sku_val) > len(existing.get("sku", ""))):
                        update_fields["sku"] = sku_val

                    # Upgrade WBL ID if missing
                    if not existing.get("wbl_id") and wbl_id:
                        update_fields["wbl_id"] = wbl_id

                    # Upgrade courier if previously Unassigned
                    if (not existing.get("courier_partner") or existing.get("courier_partner") == "Unassigned") and courier != "Unassigned":
                        update_fields["courier_partner"] = courier

                    update_query: Dict[str, Any] = {"$set": update_fields}
                    if not already_present:
                        update_query["$push"] = {"appearances": appearance}

                    await db.master_labels.update_one(
                        {"_id": existing["_id"]},
                        update_query,
                    )
                else:
                    await db.master_labels.insert_one({
                        "user_id": user_id,
                        "order_id": order_id,
                        "sku": sku_val,
                        "wbl_id": wbl_id or "",
                        "courier_partner": courier,
                        "marketplace": clean_mp,
                        "appearances": [appearance],
                        "first_processed_at": now,
                        "last_processed_at": now,
                    })

                recorded_count += 1
            except Exception as e:
                logger.warning("Error saving label %s to Master Sheet: %s", order_id, str(e))

        logger.info("Recorded %d labels to Master Sheet for user %s (job %s)", recorded_count, user_id, job_id)
        return recorded_count

    async def cleanup_orphaned_labels(self, user_id: str) -> int:
        """Clean up master labels whose jobs no longer exist in processing_jobs.
        
        Ensures that if a user deletes a batch from history, all labels belonging
        strictly to that batch are immediately purged from the Master Sheet.
        """
        db = get_db()
        if db is None or not user_id:
            return 0

        try:
            active_jobs = await db.processing_jobs.distinct("job_id", {"user_id": user_id})
            active_jobs_list = [j for j in active_jobs if j]

            # If user has zero processing jobs in history, wipe all master labels
            if not active_jobs_list:
                del_res = await db.master_labels.delete_many({"user_id": user_id})
                if del_res.deleted_count > 0:
                    logger.info("Purged %d orphaned labels for user %s (0 active jobs)", del_res.deleted_count, user_id)
                return del_res.deleted_count

            # 1. Pull appearances belonging to deleted jobs
            await db.master_labels.update_many(
                {"user_id": user_id},
                {"$pull": {"appearances": {"job_id": {"$nin": active_jobs_list}}}},
            )

            # 2. Delete any master labels that now have no remaining appearances
            del_res = await db.master_labels.delete_many({
                "user_id": user_id,
                "$or": [
                    {"appearances": {"$size": 0}},
                    {"appearances": {"$exists": False}},
                    {"appearances": None},
                ],
            })
            if del_res.deleted_count > 0:
                logger.info("Cleaned up %d orphaned Master Sheet records for user %s", del_res.deleted_count, user_id)
            return del_res.deleted_count
        except Exception as err:
            logger.warning("Failed to cleanup orphaned labels for user %s: %s", user_id, str(err))
            return 0

    async def delete_job_labels(self, user_id: str, job_id: str) -> int:
        """Remove labels or appearances associated with a specific deleted job from Master Sheet."""
        db = get_db()
        if db is None or not user_id or not job_id:
            return 0

        try:
            # 1. Pull this job_id from appearances
            await db.master_labels.update_many(
                {"user_id": user_id, "appearances.job_id": job_id},
                {"$pull": {"appearances": {"job_id": job_id}}},
            )

            # 2. Delete any master labels that now have no appearances
            del_res = await db.master_labels.delete_many({
                "user_id": user_id,
                "$or": [
                    {"appearances": {"$size": 0}},
                    {"appearances": {"$exists": False}},
                    {"appearances": None},
                ],
            })
            logger.info("Removed job %s from Master Sheet: deleted %d orders", job_id, del_res.deleted_count)
            return del_res.deleted_count
        except Exception as err:
            logger.warning("Failed to delete labels for job %s: %s", job_id, str(err))
            return 0

    async def delete_single_label(self, user_id: str, label_id: str) -> bool:
        """Delete an individual label row from Master Sheet by its database ID."""
        db = get_db()
        if db is None or not user_id or not label_id:
            return False

        try:
            res = await db.master_labels.delete_one({
                "_id": ObjectId(label_id),
                "user_id": user_id,
            })
            return res.deleted_count > 0
        except Exception as err:
            logger.warning("Failed to delete master label %s: %s", label_id, str(err))
            return False

    async def clear_master_sheet(self, user_id: str, marketplace: Optional[str] = None) -> int:
        """Clear all or platform-specific master sheet labels for a user."""
        db = get_db()
        if db is None or not user_id:
            return 0

        try:
            query: Dict[str, Any] = {"user_id": user_id}
            if marketplace and marketplace != "all":
                query["marketplace"] = {"$regex": f"^{re.escape(marketplace)}$", "$options": "i"}

            del_res = await db.master_labels.delete_many(query)
            return del_res.deleted_count
        except Exception as err:
            logger.warning("Failed to clear master sheet for user %s: %s", user_id, str(err))
            return 0

    async def get_master_sheet(
        self,
        user_id: str,
        search: Optional[str] = None,
        courier: Optional[str] = None,
        marketplace: Optional[str] = None,
        days: Optional[str] = "all",
        page: int = 1,
        size: int = 25,
    ) -> MasterSheetResponse:
        """Query Master Sheet with flexible search by Order ID, SKU, WBL tracking ID, marketplace, and days."""
        db = get_db()
        if db is None:
            return MasterSheetResponse(
                items=[],
                total=0,
                page=page,
                size=size,
                unique_orders_count=0,
                unique_skus_count=0,
                all_time_total=0,
                filtered_total=0,
                marketplace_counts={},
            )

        # Auto-sync with processing history: remove orphaned labels whose batches were deleted
        await self.cleanup_orphaned_labels(user_id)

        query: Dict[str, Any] = {"user_id": user_id}

        if courier and courier != "all":
            query["courier_partner"] = {"$regex": f"^{re.escape(courier)}$", "$options": "i"}

        if marketplace and marketplace != "all":
            query["marketplace"] = {"$regex": f"^{re.escape(marketplace)}$", "$options": "i"}

        # Date / Days filter
        now = datetime.now(timezone.utc)
        if days == "today":
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            query["last_processed_at"] = {"$gte": today_start}
        elif days == "yesterday":
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            yesterday_start = today_start - timedelta(days=1)
            query["last_processed_at"] = {"$gte": yesterday_start, "$lt": today_start}
        elif days == "7days":
            query["last_processed_at"] = {"$gte": now - timedelta(days=7)}
        elif days == "30days":
            query["last_processed_at"] = {"$gte": now - timedelta(days=30)}
        elif days == "this_month":
            month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            query["last_processed_at"] = {"$gte": month_start}

        if search and search.strip():
            clean_search = search.strip()
            escaped = re.escape(clean_search)
            query["$or"] = [
                {"order_id": {"$regex": escaped, "$options": "i"}},
                {"sku": {"$regex": escaped, "$options": "i"}},
                {"wbl_id": {"$regex": escaped, "$options": "i"}},
                {"courier_partner": {"$regex": escaped, "$options": "i"}},
            ]

        total = await db.master_labels.count_documents(query)
        skip = (page - 1) * size

        cursor = db.master_labels.find(query).sort("last_processed_at", -1).skip(skip).limit(size)

        items: List[MasterLabelItem] = []
        async for doc in cursor:
            appearances = [
                LabelAppearance(
                    job_id=a.get("job_id", ""),
                    pdf_filename=a.get("pdf_filename", ""),
                    input_filename=a.get("input_filename"),
                    page_number=a.get("page_number", 1),
                    created_at=a.get("created_at", doc.get("last_processed_at")),
                )
                for a in doc.get("appearances", [])
            ]

            items.append(
                MasterLabelItem(
                    id=str(doc["_id"]),
                    user_id=str(doc.get("user_id")),
                    order_id=doc.get("order_id", ""),
                    sku=doc.get("sku", "UNMATCHED"),
                    wbl_id=doc.get("wbl_id") or None,
                    courier_partner=doc.get("courier_partner", "Unassigned"),
                    marketplace=doc.get("marketplace", "Meesho"),
                    appearances=appearances,
                    first_processed_at=doc.get("first_processed_at", datetime.now(timezone.utc)),
                    last_processed_at=doc.get("last_processed_at", datetime.now(timezone.utc)),
                )
            )

        # Calculate per-marketplace counts
        mp_counts: Dict[str, int] = {}
        platforms = ("all", "Meesho", "Flipkart", "Amazon", "Myntra", "Snapdeal")
        for mp in platforms:
            if mp == "all":
                mp_counts["all"] = await db.master_labels.count_documents({"user_id": user_id})
            else:
                mp_counts[mp] = await db.master_labels.count_documents({
                    "user_id": user_id,
                    "marketplace": {"$regex": f"^{mp}$", "$options": "i"},
                })

        # Base filter for current subpage without search or date filter
        base_filter: Dict[str, Any] = {"user_id": user_id}
        if marketplace and marketplace != "all":
            base_filter["marketplace"] = {"$regex": f"^{re.escape(marketplace)}$", "$options": "i"}

        all_time_total = await db.master_labels.count_documents(base_filter)
        unique_skus = len(await db.master_labels.distinct("sku", base_filter))
        couriers = await db.master_labels.distinct("courier_partner", base_filter)
        couriers_list = sorted([c for c in couriers if c and c != "Unassigned"])

        return MasterSheetResponse(
            items=items,
            total=total,
            page=page,
            size=size,
            unique_orders_count=all_time_total,
            unique_skus_count=unique_skus,
            all_time_total=all_time_total,
            filtered_total=total,
            marketplace_counts=mp_counts,
            couriers_list=couriers_list,
        )

    async def export_master_sheet_csv(
        self,
        user_id: str,
        marketplace: Optional[str] = None,
        days: Optional[str] = None,
        search: Optional[str] = None,
        courier: Optional[str] = None,
    ) -> str:
        """Generate full CSV export of seller's Master Sheet with active filters."""
        db = get_db()
        if db is None:
            return ""

        # Auto-sync with processing history: remove orphaned labels whose batches were deleted
        await self.cleanup_orphaned_labels(user_id)

        query: Dict[str, Any] = {"user_id": user_id}

        if courier and courier != "all":
            query["courier_partner"] = {"$regex": f"^{re.escape(courier)}$", "$options": "i"}

        if marketplace and marketplace != "all":
            query["marketplace"] = {"$regex": f"^{re.escape(marketplace)}$", "$options": "i"}

        now = datetime.now(timezone.utc)
        if days == "today":
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            query["last_processed_at"] = {"$gte": today_start}
        elif days == "yesterday":
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            yesterday_start = today_start - timedelta(days=1)
            query["last_processed_at"] = {"$gte": yesterday_start, "$lt": today_start}
        elif days == "7days":
            query["last_processed_at"] = {"$gte": now - timedelta(days=7)}
        elif days == "30days":
            query["last_processed_at"] = {"$gte": now - timedelta(days=30)}
        elif days == "this_month":
            month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            query["last_processed_at"] = {"$gte": month_start}

        if search and search.strip():
            escaped = re.escape(search.strip())
            query["$or"] = [
                {"order_id": {"$regex": escaped, "$options": "i"}},
                {"sku": {"$regex": escaped, "$options": "i"}},
                {"wbl_id": {"$regex": escaped, "$options": "i"}},
                {"courier_partner": {"$regex": escaped, "$options": "i"}},
            ]

        cursor = db.master_labels.find(query).sort("last_processed_at", -1)

        output = io.StringIO()
        writer = csv.writer(output)

        # Header row with all required tracking details
        writer.writerow([
            "Order ID",
            "SKU",
            "WBL / Tracking ID",
            "Delivery Partner",
            "Marketplace",
            "Cropped PDF Locations (File & Page Number)",
            "Total Upload Occurrences",
            "First Processed Date",
            "Last Processed Date",
        ])

        async for doc in cursor:
            appearances = doc.get("appearances", [])
            loc_strings = [
                f"{a.get('pdf_filename', 'crop.pdf')} [Page {a.get('page_number', 1)}]"
                for a in appearances
            ]
            loc_combined = " ; ".join(loc_strings) if loc_strings else "N/A"

            first_dt = doc.get("first_processed_at")
            last_dt = doc.get("last_processed_at")
            first_str = first_dt.strftime("%Y-%m-%d %H:%M:%S") if hasattr(first_dt, "strftime") else str(first_dt or "")
            last_str = last_dt.strftime("%Y-%m-%d %H:%M:%S") if hasattr(last_dt, "strftime") else str(last_dt or "")

            writer.writerow([
                doc.get("order_id", ""),
                doc.get("sku", ""),
                doc.get("wbl_id", ""),
                doc.get("courier_partner", "Unassigned"),
                doc.get("marketplace", "Meesho"),
                loc_combined,
                len(appearances),
                first_str,
                last_str,
            ])

        return output.getvalue()


master_sheet_service = MasterSheetService()

