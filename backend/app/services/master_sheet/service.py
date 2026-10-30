"""Master Sheet service for recording, deduplicating, and querying all cropped labels."""

import csv
import io
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import fitz

from app.core.config import get_settings
from app.core.logging import logger
from app.db.mongodb import ObjectId, get_db
from app.schemas.master_sheet import (
    LabelAppearance,
    MasterLabelItem,
    MasterSheetResponse,
)
from app.services.pdf.waybill_extractor import extract_waybill_id


def _get_user_clauses(user_id: str) -> List[Dict[str, Any]]:
    """Generate resilient query clauses matching both string and ObjectId user_id representations."""
    clauses = [{"user_id": str(user_id)}]
    try:
        clauses.append({"user_id": ObjectId(user_id)})
    except Exception:
        pass
    return clauses


class MasterSheetService:
    """Manages the centralized Master Sheet catalog for all processed seller orders."""

    async def record_batch_labels(
        self,
        user_id: str,
        job_id: str,
        labels: List[Dict[str, Any]],
        marketplace: str = "Meesho",
        custom_pdf_name: Optional[str] = None,
        job_created_at: Optional[Any] = None,
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

        now = job_created_at or datetime.now(timezone.utc)
        if isinstance(now, str):
            try:
                now = datetime.fromisoformat(now.replace("Z", "+00:00"))
            except Exception:
                now = datetime.now(timezone.utc)
        elif not isinstance(now, datetime):
            now = datetime.now(timezone.utc)

        clean_mp = marketplace.capitalize() if marketplace else "Meesho"
        pdf_filename = custom_pdf_name or f"{clean_mp.lower()}_thermal_4x6_{job_id}.pdf"
        recorded_count = 0
        user_clauses = _get_user_clauses(user_id)

        # Safe optional imports for bulk write operations
        try:
            from pymongo import InsertOne, UpdateOne
        except ImportError:
            InsertOne = None
            UpdateOne = None

        # 1. Parse and normalize all labels in high-speed memory pass
        prepared_items: List[Dict[str, Any]] = []
        all_order_ids: Set[str] = set()

        for idx, lbl in enumerate(labels):
            raw_text = lbl.get("raw_text", "")
            order_id = (lbl.get("order_id") or "").strip()

            # Courier partner
            courier = lbl.get("courier_partner") or "Unassigned"

            # WBL / AWB tracking ID
            wbl_id = lbl.get("wbl_id") or extract_waybill_id(raw_text, courier)

            # If order_id missing, equals wbl_id, or is a courier tracking number (e.g. 13409...):
            # Extract genuine order ID from raw label text
            if not order_id or order_id == wbl_id or (order_id.startswith("13409") and len(order_id) <= 15 and "_" not in order_id):
                m_sub = re.search(r"\b(\d{16,22}_\d+)\b", raw_text)
                if m_sub:
                    order_id = m_sub.group(1).strip()
                else:
                    m_fk = re.search(r"\b(OD\d{16,22})\b", raw_text, re.I)
                    if m_fk:
                        order_id = m_fk.group(1).strip()
                    else:
                        m_col = re.search(r"\bOrder\s*No\.?[\s\r\n]+(?:[^\n\r]*[\r\n]+){0,6}?(\d{15,22}(?:_\d+)?)\b", raw_text, re.I)
                        if m_col and m_col.group(1).strip() != wbl_id:
                            order_id = m_col.group(1).strip()
                        else:
                            m_order = re.search(r"\b(?:Order\s*No\.?|Sub\s*Order\s*No\.?)\s*[:\-#]?\s*([A-Za-z0-9_\-]+)", raw_text, re.I)
                            if m_order and m_order.group(1).strip() != wbl_id:
                                order_id = m_order.group(1).strip()

            # Prioritize full real raw SKU (e.g. 'Rospack 80ml 074')
            raw_sku = lbl.get("raw_sku")
            sku_items = lbl.get("sku_items") or []
            sku_val = (raw_sku or "").strip()
            matched_sku = ""

            if sku_items:
                primary = sku_items[0]
                m_sku = getattr(primary, "sku", None) or (primary.get("sku") if isinstance(primary, dict) else str(primary))
                matched_sku = (m_sku or "").strip()

            if not sku_val or sku_val == "UNMATCHED":
                if matched_sku:
                    sku_val = matched_sku

            if not sku_val:
                sku_val = "UNMATCHED"

            # Output page in thermal PDF (1-indexed)
            output_page = lbl.get("output_page_index") or (idx + 1)
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

            prepared_items.append({
                "order_id": order_id,
                "sku_val": sku_val,
                "matched_sku": matched_sku,
                "wbl_id": wbl_id,
                "courier": courier,
                "appearance": appearance,
                "output_page": output_page,
            })
            all_order_ids.add(order_id)

        # 2. Single fast batch lookup for all existing orders in this upload
        existing_map: Dict[str, Dict[str, Any]] = {}
        if all_order_ids:
            try:
                existing_cursor = db.master_labels.find({
                    "$or": user_clauses,
                    "order_id": {"$in": list(all_order_ids)},
                })
                async for doc in existing_cursor:
                    existing_map[doc["order_id"]] = doc
            except Exception as e:
                logger.warning("Batch lookup error for master_labels: %s", str(e))

        # 3. Build bulk write operations (1 network trip instead of 210 sequential queries)
        bulk_ops: List[Any] = []
        can_bulk = (UpdateOne is not None and InsertOne is not None and hasattr(db.master_labels, "bulk_write"))
        seen_batch_orders: Set[str] = set()

        for item in prepared_items:
            order_id = item["order_id"]
            sku_val = item["sku_val"]
            matched_sku = item["matched_sku"]
            wbl_id = item["wbl_id"]
            courier = item["courier"]
            appearance = item["appearance"]
            output_page = item["output_page"]

            if order_id in existing_map:
                existing = existing_map[order_id]
                existing_apps = existing.get("appearances", [])
                already_present = any(
                    a.get("job_id") == job_id and a.get("page_number") == output_page
                    for a in existing_apps
                )

                update_fields: Dict[str, Any] = {
                    "last_processed_at": now,
                }

                # Keep earliest first_processed_at
                if not existing.get("first_processed_at") or now < existing.get("first_processed_at", now):
                    update_fields["first_processed_at"] = now

                # Always upgrade to full real raw SKU if existing was short/truncated
                if sku_val != "UNMATCHED" and (not existing.get("sku") or existing.get("sku") == "UNMATCHED" or len(sku_val) > len(existing.get("sku", ""))):
                    update_fields["sku"] = sku_val

                # Save matched SKU if available
                if matched_sku and (not existing.get("matched_sku") or existing.get("matched_sku") == "UNMATCHED"):
                    update_fields["matched_sku"] = matched_sku

                # Upgrade WBL ID if missing
                if not existing.get("wbl_id") and wbl_id:
                    update_fields["wbl_id"] = wbl_id

                # Upgrade courier if previously Unassigned
                if (not existing.get("courier_partner") or existing.get("courier_partner") == "Unassigned") and courier != "Unassigned":
                    update_fields["courier_partner"] = courier

                update_query: Dict[str, Any] = {"$set": update_fields}
                if not already_present:
                    update_query["$push"] = {"appearances": appearance}

                if can_bulk:
                    bulk_ops.append(UpdateOne({"_id": existing["_id"]}, update_query))
                else:
                    try:
                        await db.master_labels.update_one(
                            {"_id": existing["_id"]},
                            update_query,
                        )
                    except Exception:
                        pass

                recorded_count += 1
            else:
                if order_id in seen_batch_orders:
                    continue
                seen_batch_orders.add(order_id)

                new_doc = {
                    "user_id": str(user_id),
                    "order_id": order_id,
                    "sku": sku_val,
                    "matched_sku": matched_sku or None,
                    "wbl_id": wbl_id or "",
                    "courier_partner": courier,
                    "marketplace": clean_mp,
                    "appearances": [appearance],
                    "first_processed_at": now,
                    "last_processed_at": now,
                }

                if can_bulk:
                    bulk_ops.append(InsertOne(new_doc))
                else:
                    try:
                        await db.master_labels.insert_one(new_doc)
                    except Exception:
                        pass

                recorded_count += 1

        if can_bulk and bulk_ops:
            try:
                await db.master_labels.bulk_write(bulk_ops, ordered=False)
            except Exception as e_bulk:
                logger.warning("Bulk write error on master_labels: %s", str(e_bulk))

        logger.info("Recorded %d labels to Master Sheet for user %s (job %s)", recorded_count, user_id, job_id)
        return recorded_count

    async def cleanup_orphaned_labels(self, user_id: str) -> int:
        """Clean up master labels whose jobs no longer exist in processing_jobs.
        
        Ensures that if a user deletes a batch from history, all appearances belonging
        strictly to that batch are purged from the Master Sheet.
        """
        db = get_db()
        if db is None or not user_id:
            return 0

        user_clauses = _get_user_clauses(user_id)

        try:
            user_jobs = await db.processing_jobs.find({"$or": user_clauses}).to_list(length=5000)
            active_jobs_list = [j.get("job_id") for j in user_jobs if j.get("job_id")]

            # SAFETY: Only clean up if user has active processing jobs!
            # Never wipe master labels when active_jobs_list is empty.
            if not active_jobs_list:
                return 0

            # 1. Pull appearances belonging to deleted jobs
            await db.master_labels.update_many(
                {"$or": user_clauses},
                {"$pull": {"appearances": {"job_id": {"$nin": active_jobs_list}}}},
            )

            # 2. Delete any master labels that now have no remaining appearances
            del_res = await db.master_labels.delete_many({
                "$and": [
                    {"$or": user_clauses},
                    {
                        "$or": [
                            {"appearances": {"$size": 0}},
                            {"appearances": {"$exists": False}},
                            {"appearances": None},
                        ]
                    },
                ]
            })
            if del_res.deleted_count > 0:
                logger.info("Cleaned up %d orphaned Master Sheet records for user %s", del_res.deleted_count, user_id)
            return del_res.deleted_count
        except Exception as err:
            logger.warning("Failed to cleanup orphaned labels for user %s: %s", user_id, str(err))
            return 0

    async def backfill_missing_waybills(self, user_id: str) -> int:
        """Scan and heal missing Waybill (WBL) / AWB tracking IDs for existing master sheet records.

        Uses the upgraded extraction regex on thermal PDF or candidate metadata on disk
        to restore accurate tracking IDs (e.g. Shadowfax 'SF4361758012FPL').
        """
        db = get_db()
        if db is None or not user_id:
            return 0

        user_clauses = _get_user_clauses(user_id)
        settings = get_settings()
        updated_count = 0

        try:
            missing_query = {
                "$and": [
                    {"$or": user_clauses},
                    {
                        "$or": [
                            {"wbl_id": None},
                            {"wbl_id": ""},
                            {"wbl_id": {"$exists": False}},
                            {"wbl_id": {"$regex": r"^\s*$"}},
                        ]
                    },
                ]
            }

            cursor = db.master_labels.find(missing_query).limit(500)
            missing_docs = await cursor.to_list(length=500)
            if not missing_docs:
                return 0

            for doc in missing_docs:
                courier = doc.get("courier_partner") or "Unassigned"
                order_id = doc.get("order_id", "")
                appearances = doc.get("appearances") or []
                found_wbl: Optional[str] = None

                for app in appearances:
                    job_id = app.get("job_id")
                    page_num = app.get("page_number", 1)
                    if not job_id:
                        continue

                    job_dir = Path(settings.STORAGE_DIR) / "jobs" / job_id

                    # 1. Inspect cropped thermal PDF on disk (exact 4x6 page with barcode)
                    thermal_pdf = job_dir / "labels_thermal_4x6.pdf"
                    if thermal_pdf.exists():
                        try:
                            tdoc = fitz.open(str(thermal_pdf))
                            p_idx = page_num - 1
                            if 0 <= p_idx < len(tdoc):
                                page_text = tdoc[p_idx].get_text()
                                found_wbl = extract_waybill_id(page_text, courier)
                            tdoc.close()
                        except Exception as e:
                            logger.debug("Failed reading thermal PDF for WBL backfill: %s", str(e))

                    # 2. Inspect candidate_labels.json
                    if not found_wbl:
                        candidate_file = job_dir / "candidate_labels.json"
                        if candidate_file.exists():
                            try:
                                with open(candidate_file, "r", encoding="utf-8") as cf:
                                    c_labels = json.load(cf)
                                    for cl in c_labels:
                                        if cl.get("order_id") == order_id:
                                            raw_t = cl.get("raw_text", "")
                                            found_wbl = cl.get("wbl_id") or extract_waybill_id(raw_t, courier)
                                            if found_wbl:
                                                break
                            except Exception:
                                pass

                    # 3. Inspect src_*.pdf files
                    if not found_wbl and job_dir.exists():
                        try:
                            for src_f in job_dir.glob("src_*.pdf"):
                                sdoc = fitz.open(str(src_f))
                                for spno in range(len(sdoc)):
                                    sp_text = sdoc[spno].get_text()
                                    if order_id and order_id in sp_text:
                                        found_wbl = extract_waybill_id(sp_text, courier)
                                        if found_wbl:
                                            break
                                sdoc.close()
                                if found_wbl:
                                    break
                        except Exception:
                            pass

                    if found_wbl:
                        break

                if found_wbl:
                    await db.master_labels.update_one(
                        {"_id": doc["_id"]},
                        {"$set": {"wbl_id": found_wbl}},
                    )
                    doc["wbl_id"] = found_wbl
                    updated_count += 1
                    logger.info("Backfilled WBL ID for order %s -> %s", order_id, found_wbl)

            return updated_count
        except Exception as exc:
            logger.warning("Error backfilling missing waybills for user %s: %s", user_id, str(exc))
            return 0

    async def heal_all_missing_waybills(self) -> int:
        """Global healer scanning all master labels in MongoDB missing WBL ID and populating them from disk."""
        db = get_db()
        if db is None:
            return 0

        settings = get_settings()
        updated = 0
        try:
            missing_query = {
                "$or": [
                    {"wbl_id": None},
                    {"wbl_id": ""},
                    {"wbl_id": {"$exists": False}},
                    {"wbl_id": {"$regex": r"^\s*$"}},
                ]
            }

            cursor = db.master_labels.find(missing_query).limit(1000)
            missing_docs = await cursor.to_list(length=1000)
            if not missing_docs:
                return 0

            for doc in missing_docs:
                courier = doc.get("courier_partner") or "Unassigned"
                order_id = doc.get("order_id", "")
                appearances = doc.get("appearances") or []
                found_wbl: Optional[str] = None

                for app in appearances:
                    job_id = app.get("job_id")
                    page_num = app.get("page_number", 1)
                    if not job_id:
                        continue

                    job_dir = Path(settings.STORAGE_DIR) / "jobs" / job_id

                    # 1. Inspect cropped thermal PDF on disk
                    thermal_pdf = job_dir / "labels_thermal_4x6.pdf"
                    if thermal_pdf.exists():
                        try:
                            tdoc = fitz.open(str(thermal_pdf))
                            p_idx = page_num - 1
                            if 0 <= p_idx < len(tdoc):
                                page_text = tdoc[p_idx].get_text()
                                found_wbl = extract_waybill_id(page_text, courier)
                            tdoc.close()
                        except Exception:
                            pass

                    # 2. Inspect candidate_labels.json
                    if not found_wbl:
                        candidate_file = job_dir / "candidate_labels.json"
                        if candidate_file.exists():
                            try:
                                with open(candidate_file, "r", encoding="utf-8") as cf:
                                    c_labels = json.load(cf)
                                    for cl in c_labels:
                                        if cl.get("order_id") == order_id:
                                            raw_t = cl.get("raw_text", "")
                                            found_wbl = cl.get("wbl_id") or extract_waybill_id(raw_t, courier)
                                            if found_wbl:
                                                break
                            except Exception:
                                pass

                    # 3. Inspect src_*.pdf files
                    if not found_wbl and job_dir.exists():
                        try:
                            for src_f in job_dir.glob("src_*.pdf"):
                                sdoc = fitz.open(str(src_f))
                                for spno in range(len(sdoc)):
                                    sp_text = sdoc[spno].get_text()
                                    if order_id and order_id in sp_text:
                                        found_wbl = extract_waybill_id(sp_text, courier)
                                        if found_wbl:
                                            break
                                sdoc.close()
                                if found_wbl:
                                    break
                        except Exception:
                            pass

                    if found_wbl:
                        break

                if found_wbl:
                    await db.master_labels.update_one(
                        {"_id": doc["_id"]},
                        {"$set": {"wbl_id": found_wbl}},
                    )
                    updated += 1
                    logger.info("Global healer restored WBL ID %s for order %s", found_wbl, order_id)

            if updated > 0:
                logger.info("Global healer restored %d missing WBL IDs in Master Sheet", updated)
            return updated
        except Exception as e:
            logger.warning("Global healer error: %s", str(e))
            return 0

    async def heal_wrong_order_ids(self, user_id: str) -> int:
        """Scan and heal master labels where order_id was mistakenly set to tracking barcode (e.g. 134096...).

        Finds genuine Meesho sub-order IDs like 345571562743113728_1 from candidate_labels.json or raw label text.
        """
        db = get_db()
        if db is None or not user_id:
            return 0

        user_clauses = _get_user_clauses(user_id)
        settings = get_settings()
        updated_count = 0

        try:
            # Find candidate master labels for this user
            cursor = db.master_labels.find({"$or": user_clauses}).limit(500)
            docs = await cursor.to_list(length=500)
            if not docs:
                return 0

            for doc in docs:
                curr_order = str(doc.get("order_id", "")).strip()
                wbl = str(doc.get("wbl_id", "")).strip()
                appearances = doc.get("appearances") or []

                # Suspect if order_id equals waybill tracking or is 15-digit barcode without underscore
                is_suspect = (
                    curr_order == wbl
                    or (curr_order.startswith("13409") and len(curr_order) <= 15 and "_" not in curr_order)
                    or curr_order.startswith("AWB_")
                )

                if not is_suspect:
                    continue

                real_order_id: Optional[str] = None

                for app in appearances:
                    job_id = app.get("job_id")
                    page_num = app.get("page_number", 1)
                    if not job_id:
                        continue

                    job_dir = Path(settings.STORAGE_DIR) / "jobs" / job_id
                    candidate_file = job_dir / "candidate_labels.json"

                    if candidate_file.exists():
                        try:
                            with open(candidate_file, "r", encoding="utf-8") as cf:
                                c_labels = json.load(cf)
                                p_idx = page_num - 1
                                if 0 <= p_idx < len(c_labels):
                                    raw_t = c_labels[p_idx].get("raw_text", "")
                                    m_sub = re.search(r"\b(\d{16,22}_\d+)\b", raw_t)
                                    if m_sub:
                                        real_order_id = m_sub.group(1).strip()
                                        c_labels[p_idx]["order_id"] = real_order_id
                                        try:
                                            with open(candidate_file, "w", encoding="utf-8") as wf:
                                                json.dump(c_labels, wf)
                                        except Exception:
                                            pass
                                        break
                                    m_col = re.search(r"\bOrder\s*No\.?[\s\r\n]+(?:[^\n\r]*[\r\n]+){0,6}?(\d{15,22}(?:_\d+)?)\b", raw_t, re.I)
                                    if m_col and m_col.group(1).strip() != wbl:
                                        real_order_id = m_col.group(1).strip()
                                        c_labels[p_idx]["order_id"] = real_order_id
                                        try:
                                            with open(candidate_file, "w", encoding="utf-8") as wf:
                                                json.dump(c_labels, wf)
                                        except Exception:
                                            pass
                                        break
                                    m_order = re.search(r"\b(?:Order\s*No\.?|Sub\s*Order\s*No\.?)\s*[:\-#]?\s*([A-Za-z0-9_\-]+)", raw_t, re.I)
                                    if m_order and m_order.group(1).strip() != wbl:
                                        real_order_id = m_order.group(1).strip()
                                        break
                        except Exception:
                            pass

                    # Also inspect thermal PDF text on disk if candidate_labels was not available
                    if not real_order_id:
                        thermal_pdf = job_dir / "labels_thermal_4x6.pdf"
                        if thermal_pdf.exists():
                            try:
                                tdoc = fitz.open(str(thermal_pdf))
                                p_idx = page_num - 1
                                if 0 <= p_idx < len(tdoc):
                                    raw_t = tdoc[p_idx].get_text()
                                    m_sub = re.search(r"\b(\d{16,22}_\d+)\b", raw_t)
                                    if m_sub:
                                        real_order_id = m_sub.group(1).strip()
                                tdoc.close()
                            except Exception:
                                pass

                    if real_order_id:
                        break

                if real_order_id and real_order_id != curr_order:
                    await db.master_labels.update_one(
                        {"_id": doc["_id"]},
                        {"$set": {"order_id": real_order_id}}
                    )
                    updated_count += 1
                    logger.info("Healed order %s -> %s for user %s", curr_order, real_order_id, user_id)

            if updated_count > 0:
                logger.info("Healed %d wrongly identified Order IDs in Master Sheet for user %s", updated_count, user_id)
            return updated_count
        except Exception as err:
            logger.warning("Failed to heal wrong order IDs for user %s: %s", user_id, str(err))
            return 0

    async def heal_all_wrong_order_ids(self) -> int:
        """Global background task to repair tracking numbers mistakenly saved as Order IDs."""
        db = get_db()
        if db is None:
            return 0
        settings = get_settings()
        updated_count = 0
        try:
            cursor = db.master_labels.find({}).limit(1000)
            docs = await cursor.to_list(length=1000)
            for doc in docs:
                curr_order = str(doc.get("order_id", "")).strip()
                wbl = str(doc.get("wbl_id", "")).strip()
                appearances = doc.get("appearances") or []
                is_suspect = (
                    curr_order == wbl
                    or (curr_order.startswith("13409") and len(curr_order) <= 15 and "_" not in curr_order)
                    or curr_order.startswith("AWB_")
                )
                if not is_suspect:
                    continue

                real_order_id: Optional[str] = None
                for app in appearances:
                    job_id = app.get("job_id")
                    page_num = app.get("page_number", 1)
                    if not job_id:
                        continue
                    job_dir = Path(settings.STORAGE_DIR) / "jobs" / job_id
                    candidate_file = job_dir / "candidate_labels.json"
                    if candidate_file.exists():
                        try:
                            with open(candidate_file, "r", encoding="utf-8") as cf:
                                c_labels = json.load(cf)
                                p_idx = page_num - 1
                                if 0 <= p_idx < len(c_labels):
                                    raw_t = c_labels[p_idx].get("raw_text", "")
                                    m_sub = re.search(r"\b(\d{16,22}_\d+)\b", raw_t)
                                    if m_sub:
                                        real_order_id = m_sub.group(1).strip()
                                        c_labels[p_idx]["order_id"] = real_order_id
                                        try:
                                            with open(candidate_file, "w", encoding="utf-8") as wf:
                                                json.dump(c_labels, wf)
                                        except Exception:
                                            pass
                                        break
                                    m_col = re.search(r"\bOrder\s*No\.?[\s\r\n]+(?:[^\n\r]*[\r\n]+){0,6}?(\d{15,22}(?:_\d+)?)\b", raw_t, re.I)
                                    if m_col and m_col.group(1).strip() != wbl:
                                        real_order_id = m_col.group(1).strip()
                                        c_labels[p_idx]["order_id"] = real_order_id
                                        try:
                                            with open(candidate_file, "w", encoding="utf-8") as wf:
                                                json.dump(c_labels, wf)
                                        except Exception:
                                            pass
                                        break
                        except Exception:
                            pass
                    if real_order_id:
                        break

                if real_order_id and real_order_id != curr_order:
                    await db.master_labels.update_one(
                        {"_id": doc["_id"]},
                        {"$set": {"order_id": real_order_id}}
                    )
                    updated_count += 1

            if updated_count > 0:
                logger.info("Global background healer repaired %d Order IDs across Master Sheet", updated_count)
            return updated_count
        except Exception as err:
            logger.warning("Global wrong order healer notice: %s", str(err))
            return 0

    async def sync_master_sheet_from_history(self, user_id: str, force: bool = False) -> int:
        """Scan seller's past processing jobs from history and auto-populate Master Sheet if missing.

        Ensures 100% data integrity so that any batch visible in History is also fully
        represented in the Master Sheet.
        """
        db = get_db()
        if db is None or not user_id:
            return 0

        user_clauses = _get_user_clauses(user_id)
        settings = get_settings()
        synced_count = 0

        try:
            # Check if user explicitly cleared their master sheet in settings
            master_sheet_cleared_at = None
            try:
                user_doc = await db.users.find_one({"_id": ObjectId(user_id)})
                if user_doc:
                    if force:
                        # Clear timestamp on explicit force sync
                        await db.users.update_one(
                            {"_id": ObjectId(user_id)},
                            {"$unset": {"settings.master_sheet_cleared_at": ""}},
                        )
                    else:
                        master_sheet_cleared_at = user_doc.get("settings", {}).get("master_sheet_cleared_at")
            except Exception:
                pass

            user_jobs = await db.processing_jobs.find({
                "$and": [
                    {"$or": user_clauses},
                    {"is_trashed": {"$ne": True}},
                ]
            }).sort("created_at", 1).to_list(length=1000)
            if not user_jobs:
                return 0

            for job in user_jobs:
                job_id = job.get("job_id")
                if not job_id:
                    continue

                if job.get("is_trashed") is True:
                    continue

                job_dir = Path(settings.STORAGE_DIR) / "jobs" / job_id
                if (job_dir / "trashed.txt").exists():
                    continue

                job_created_at = job.get("created_at")
                if not force and master_sheet_cleared_at and job_created_at:
                    try:
                        c_at = job_created_at
                        if isinstance(c_at, str):
                            c_at = datetime.fromisoformat(c_at.replace("Z", "+00:00"))
                        clr_at = master_sheet_cleared_at
                        if isinstance(clr_at, str):
                            clr_at = datetime.fromisoformat(clr_at.replace("Z", "+00:00"))
                        if c_at <= clr_at:
                            continue
                    except Exception:
                        pass

                # Check if this job is already recorded in master_labels
                has_job = await db.master_labels.find_one({
                    "$or": user_clauses,
                    "appearances.job_id": job_id,
                })
                if has_job:
                    continue  # Already recorded!

                # Load labels for this job
                labels_to_record: List[Dict[str, Any]] = []
                job_dir = Path(settings.STORAGE_DIR) / "jobs" / job_id
                labels_file = job_dir / "candidate_labels.json"
                report_file = job_dir / "processing_report.json"

                if labels_file.exists():
                    try:
                        with open(labels_file, "r", encoding="utf-8") as lf:
                            labels_to_record = json.load(lf)
                    except Exception as err:
                        logger.warning("Failed to load candidate_labels.json for job %s: %s", job_id, str(err))

                if not labels_to_record and report_file.exists():
                    try:
                        with open(report_file, "r", encoding="utf-8") as rf:
                            rep = json.load(rf)
                            for p in rep.get("pages", []):
                                if p.get("is_label_extracted"):
                                    sku_items = p.get("sku_items", [])
                                    ord_id = sku_items[0].get("order_id") if sku_items else None
                                    labels_to_record.append({
                                        "filename": p.get("input_filename"),
                                        "pno": (p.get("page_number", 1) - 1),
                                        "courier_partner": p.get("courier_partner"),
                                        "wbl_id": None,
                                        "order_id": ord_id,
                                        "sku_items": sku_items,
                                        "raw_sku": sku_items[0].get("sku") if sku_items else "UNMATCHED",
                                        "output_page_index": p.get("output_page_index"),
                                        "raw_text": "",
                                    })
                    except Exception as err:
                        logger.warning("Failed to extract labels from report for job %s: %s", job_id, str(err))

                if labels_to_record:
                    # Map output_page_index from processing_report.json if available
                    if report_file.exists():
                        try:
                            with open(report_file, "r", encoding="utf-8") as rf:
                                rep = json.load(rf)
                                page_map = {
                                    (p.get("input_filename"), p.get("page_number")): p.get("output_page_index")
                                    for p in rep.get("pages", [])
                                    if p.get("output_page_index")
                                }
                                for lbl in labels_to_record:
                                    fn = lbl.get("filename")
                                    pno = (lbl.get("pno", 0) + 1)
                                    if (fn, pno) in page_map:
                                        lbl["output_page_index"] = page_map[(fn, pno)]
                        except Exception:
                            pass

                    marketplace = job.get("marketplace") or "Meesho"
                    custom_pdf_name = job.get("formatted_filename")

                    rec = await self.record_batch_labels(
                        user_id=user_id,
                        job_id=job_id,
                        labels=labels_to_record,
                        marketplace=marketplace,
                        custom_pdf_name=custom_pdf_name,
                        job_created_at=job_created_at,
                    )
                    synced_count += rec
                    logger.info("Auto-synced %d labels for job %s into Master Sheet", rec, job_id)

            # Heal / backfill any missing waybills after history scan
            await self.backfill_missing_waybills(user_id)

        except Exception as exc:
            logger.warning("Error auto-syncing Master Sheet from history for user %s: %s", user_id, str(exc))

        return synced_count

    async def delete_job_labels(self, user_id: str, job_id: str) -> int:
        """Remove labels or appearances associated with a specific deleted job from Master Sheet."""
        db = get_db()
        if db is None or not user_id or not job_id:
            return 0

        user_clauses = _get_user_clauses(user_id)

        try:
            # 1. Pull this job_id from appearances
            await db.master_labels.update_many(
                {"$or": user_clauses, "appearances.job_id": job_id},
                {"$pull": {"appearances": {"job_id": job_id}}},
            )

            # 2. Delete any master labels that now have no appearances
            del_res = await db.master_labels.delete_many({
                "$and": [
                    {"$or": user_clauses},
                    {
                        "$or": [
                            {"appearances": {"$size": 0}},
                            {"appearances": {"$exists": False}},
                            {"appearances": None},
                        ]
                    },
                ]
            })
            logger.info("Removed job %s from Master Sheet: deleted %d orders", job_id, del_res.deleted_count)
            return del_res.deleted_count
        except Exception as err:
            logger.warning("Failed to delete labels for job %s: %s", job_id, str(err))
            return 0

    async def trash_job_labels(self, user_id: str, job_id: str) -> int:
        """Mark all appearances and master labels associated with a trashed job as trashed."""
        db = get_db()
        if db is None or not user_id or not job_id:
            return 0

        user_clauses = _get_user_clauses(user_id)
        now_str = datetime.now(timezone.utc).isoformat()
        affected = 0

        try:
            cursor = db.master_labels.find({"$or": user_clauses, "appearances.job_id": job_id})
            docs = await cursor.to_list(length=10000)
            for doc in docs:
                appearances = doc.get("appearances") or []
                for app in appearances:
                    if app.get("job_id") == job_id:
                        app["is_trashed"] = True
                        app["trashed_at"] = now_str

                all_trashed = len(appearances) > 0 and all(a.get("is_trashed") is True for a in appearances)
                update_fields: Dict[str, Any] = {
                    "appearances": appearances,
                }
                if all_trashed:
                    update_fields["is_trashed"] = True
                    update_fields["trashed_at"] = now_str

                await db.master_labels.update_one(
                    {"_id": doc["_id"]},
                    {"$set": update_fields}
                )
                affected += 1

            logger.info("Trashed %d Master Sheet labels/appearances for job %s (user %s)", affected, job_id, user_id)
            return affected
        except Exception as e:
            logger.warning("Error trashing Master Sheet labels for job %s: %s", job_id, str(e))
            return 0

    async def restore_job_labels(self, user_id: str, job_id: str) -> int:
        """Restore appearances and master labels associated with a recovered job."""
        db = get_db()
        if db is None or not user_id or not job_id:
            return 0

        user_clauses = _get_user_clauses(user_id)
        affected = 0

        try:
            cursor = db.master_labels.find({"$or": user_clauses, "appearances.job_id": job_id})
            docs = await cursor.to_list(length=10000)
            for doc in docs:
                appearances = doc.get("appearances") or []
                for app in appearances:
                    if app.get("job_id") == job_id:
                        app["is_trashed"] = False
                        app.pop("trashed_at", None)

                update_fields: Dict[str, Any] = {
                    "appearances": appearances,
                    "is_trashed": False,
                }
                await db.master_labels.update_one(
                    {"_id": doc["_id"]},
                    {"$set": update_fields, "$unset": {"trashed_at": ""}}
                )
                affected += 1

            logger.info("Restored %d Master Sheet labels/appearances for job %s (user %s)", affected, job_id, user_id)
            return affected
        except Exception as e:
            logger.warning("Error restoring Master Sheet labels for job %s: %s", job_id, str(e))
            return 0

    async def trash_all_user_labels(self, user_id: str) -> int:
        """Mark all master labels and appearances for a user as trashed."""
        db = get_db()
        if db is None or not user_id:
            return 0

        user_clauses = _get_user_clauses(user_id)
        now_str = datetime.now(timezone.utc).isoformat()
        affected = 0

        try:
            cursor = db.master_labels.find({"$or": user_clauses})
            docs = await cursor.to_list(length=20000)
            for doc in docs:
                appearances = doc.get("appearances") or []
                for app in appearances:
                    app["is_trashed"] = True
                    app["trashed_at"] = now_str

                await db.master_labels.update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"is_trashed": True, "trashed_at": now_str, "appearances": appearances}}
                )
                affected += 1

            logger.info("Trashed all %d Master Sheet labels for user %s", affected, user_id)
            return affected
        except Exception as e:
            logger.warning("Error trashing all Master Sheet labels for user %s: %s", user_id, str(e))
            return 0

    async def hide_all_trashed_job_labels(self, user_id: str) -> None:
        """Auto-heals and hides all master label records corresponding to trashed jobs."""
        db = get_db()
        if db is None or not user_id:
            return

        user_clauses = _get_user_clauses(user_id)
        settings = get_settings()

        try:
            # 1. Collect all trashed job IDs from db.processing_jobs
            trashed_job_ids = set()
            t_jobs = await db.processing_jobs.find({
                "$and": [
                    {"$or": user_clauses},
                    {"is_trashed": True}
                ]
            }).to_list(length=5000)
            for tj in t_jobs:
                jid = tj.get("job_id")
                if jid:
                    trashed_job_ids.add(jid)

            # 2. Check disk for any jobs marked with trashed.txt
            storage_jobs = Path(settings.STORAGE_DIR) / "jobs"
            if storage_jobs.exists():
                for jdir in storage_jobs.iterdir():
                    if jdir.is_dir() and (jdir / "trashed.txt").exists():
                        trashed_job_ids.add(jdir.name)

            if not trashed_job_ids:
                return

            cursor = db.master_labels.find({"$or": user_clauses})
            docs = await cursor.to_list(length=10000)
            for doc in docs:
                appearances = doc.get("appearances") or []
                doc_modified = False
                for app in appearances:
                    if app.get("job_id") in trashed_job_ids and not app.get("is_trashed"):
                        app["is_trashed"] = True
                        doc_modified = True

                all_trashed = (len(appearances) > 0 and all(a.get("is_trashed") is True for a in appearances)) or (len(appearances) == 0)
                if all_trashed and not doc.get("is_trashed"):
                    doc_modified = True

                if doc_modified:
                    u_fields: Dict[str, Any] = {"appearances": appearances}
                    if all_trashed:
                        u_fields["is_trashed"] = True
                    await db.master_labels.update_one(
                        {"_id": doc["_id"]},
                        {"$set": u_fields}
                    )
        except Exception as err:
            logger.warning("Error in hide_all_trashed_job_labels for user %s: %s", user_id, str(err))

    async def delete_single_label(self, user_id: str, label_id: str) -> bool:
        """Delete an individual label row from Master Sheet by its database ID."""
        db = get_db()
        if db is None or not user_id or not label_id:
            return False

        user_clauses = _get_user_clauses(user_id)

        try:
            res = await db.master_labels.delete_one({
                "_id": ObjectId(label_id),
                "$or": user_clauses,
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
            user_clauses = _get_user_clauses(user_id)
            and_clauses: List[Dict[str, Any]] = [{"$or": user_clauses}]

            if marketplace and marketplace != "all":
                and_clauses.append({"marketplace": {"$regex": f"^{re.escape(marketplace)}$", "$options": "i"}})

            query = {"$and": and_clauses} if len(and_clauses) > 1 else and_clauses[0]
            del_res = await db.master_labels.delete_many(query)

            # Record clear timestamp in user settings to avoid immediate auto-sync of cleared batches
            if not marketplace or marketplace == "all":
                try:
                    await db.users.update_one(
                        {"_id": ObjectId(user_id)},
                        {"$set": {"settings.master_sheet_cleared_at": datetime.now(timezone.utc)}},
                    )
                except Exception:
                    pass

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

        # Auto-heal: Ensure any trashed batch labels are marked as trashed
        await self.hide_all_trashed_job_labels(user_id)

        # Non-blocking background sync: Never stall the user's GET query!
        try:
            import asyncio
            asyncio.create_task(self.sync_master_sheet_from_history(user_id))
        except Exception:
            pass

        user_clauses = _get_user_clauses(user_id)
        and_clauses: List[Dict[str, Any]] = [
            {"$or": user_clauses},
            {"is_trashed": {"$ne": True}},
        ]

        if courier and courier != "all":
            and_clauses.append({"courier_partner": {"$regex": f"^{re.escape(courier)}$", "$options": "i"}})

        if marketplace and marketplace != "all":
            and_clauses.append({"marketplace": {"$regex": f"^{re.escape(marketplace)}$", "$options": "i"}})

        # Date / Days filter
        now = datetime.now(timezone.utc)
        if days == "today":
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            and_clauses.append({"last_processed_at": {"$gte": today_start}})
        elif days == "yesterday":
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            yesterday_start = today_start - timedelta(days=1)
            and_clauses.append({"last_processed_at": {"$gte": yesterday_start, "$lt": today_start}})
        elif days == "7days":
            and_clauses.append({"last_processed_at": {"$gte": now - timedelta(days=7)}})
        elif days == "30days":
            and_clauses.append({"last_processed_at": {"$gte": now - timedelta(days=30)}})
        elif days == "this_month":
            month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            and_clauses.append({"last_processed_at": {"$gte": month_start}})

        if search and search.strip():
            clean_search = search.strip()
            escaped = re.escape(clean_search)
            and_clauses.append({
                "$or": [
                    {"order_id": {"$regex": escaped, "$options": "i"}},
                    {"sku": {"$regex": escaped, "$options": "i"}},
                    {"matched_sku": {"$regex": escaped, "$options": "i"}},
                    {"wbl_id": {"$regex": escaped, "$options": "i"}},
                    {"courier_partner": {"$regex": escaped, "$options": "i"}},
                ]
            })

        query: Dict[str, Any] = {"$and": and_clauses} if len(and_clauses) > 1 else and_clauses[0]

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
                if not a.get("is_trashed")
            ]

            items.append(
                MasterLabelItem(
                    id=str(doc["_id"]),
                    user_id=str(doc.get("user_id")),
                    order_id=doc.get("order_id", ""),
                    sku=doc.get("sku", "UNMATCHED"),
                    matched_sku=doc.get("matched_sku"),
                    wbl_id=doc.get("wbl_id") or None,
                    courier_partner=doc.get("courier_partner", "Unassigned"),
                    marketplace=doc.get("marketplace", "Meesho"),
                    appearances=appearances,
                    first_processed_at=doc.get("first_processed_at", datetime.now(timezone.utc)),
                    last_processed_at=doc.get("last_processed_at", datetime.now(timezone.utc)),
                )
            )

        # Calculate per-marketplace counts (strictly active records)
        mp_counts: Dict[str, int] = {}
        platforms = ("all", "Meesho", "Flipkart", "Amazon", "Myntra", "Snapdeal")
        for mp in platforms:
            if mp == "all":
                mp_counts["all"] = await db.master_labels.count_documents({
                    "$and": [
                        {"$or": user_clauses},
                        {"is_trashed": {"$ne": True}},
                    ]
                })
            else:
                mp_counts[mp] = await db.master_labels.count_documents({
                    "$and": [
                        {"$or": user_clauses},
                        {"marketplace": {"$regex": f"^{mp}$", "$options": "i"}},
                        {"is_trashed": {"$ne": True}},
                    ]
                })

        # Base filter for current subpage without search or date filter (strictly active records)
        base_and: List[Dict[str, Any]] = [
            {"$or": user_clauses},
            {"is_trashed": {"$ne": True}},
        ]
        if marketplace and marketplace != "all":
            base_and.append({"marketplace": {"$regex": f"^{re.escape(marketplace)}$", "$options": "i"}})

        base_filter: Dict[str, Any] = {"$and": base_and} if len(base_and) > 1 else base_and[0]

        all_time_total = await db.master_labels.count_documents(base_filter)
        unique_skus = 0
        couriers_list = []
        try:
            skus_dist = await db.master_labels.distinct("sku", base_filter)
            unique_skus = len([s for s in skus_dist if s and s != "UNMATCHED"])
            couriers = await db.master_labels.distinct("courier_partner", base_filter)
            couriers_list = sorted([c for c in couriers if c and c != "Unassigned"])
        except Exception:
            all_records = await db.master_labels.find(base_filter).to_list(length=10000)
            unique_skus = len(set(d.get("sku") for d in all_records if d.get("sku") and d.get("sku") != "UNMATCHED"))
            couriers_set = set(d.get("courier_partner") for d in all_records if d.get("courier_partner") and d.get("courier_partner") != "Unassigned")
            couriers_list = sorted(list(couriers_set))

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

        # Auto-heal: Ensure any trashed batch labels are marked as trashed
        await self.hide_all_trashed_job_labels(user_id)
        # Auto-sync with processing history first
        await self.sync_master_sheet_from_history(user_id)
        await self.backfill_missing_waybills(user_id)
        await self.cleanup_orphaned_labels(user_id)

        user_clauses = _get_user_clauses(user_id)
        and_clauses: List[Dict[str, Any]] = [
            {"$or": user_clauses},
            {"is_trashed": {"$ne": True}},
        ]

        if courier and courier != "all":
            and_clauses.append({"courier_partner": {"$regex": f"^{re.escape(courier)}$", "$options": "i"}})

        if marketplace and marketplace != "all":
            and_clauses.append({"marketplace": {"$regex": f"^{re.escape(marketplace)}$", "$options": "i"}})

        now = datetime.now(timezone.utc)
        if days == "today":
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            and_clauses.append({"last_processed_at": {"$gte": today_start}})
        elif days == "yesterday":
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            yesterday_start = today_start - timedelta(days=1)
            and_clauses.append({"last_processed_at": {"$gte": yesterday_start, "$lt": today_start}})
        elif days == "7days":
            and_clauses.append({"last_processed_at": {"$gte": now - timedelta(days=7)}})
        elif days == "30days":
            and_clauses.append({"last_processed_at": {"$gte": now - timedelta(days=30)}})
        elif days == "this_month":
            month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            and_clauses.append({"last_processed_at": {"$gte": month_start}})

        if search and search.strip():
            escaped = re.escape(search.strip())
            and_clauses.append({
                "$or": [
                    {"order_id": {"$regex": escaped, "$options": "i"}},
                    {"sku": {"$regex": escaped, "$options": "i"}},
                    {"matched_sku": {"$regex": escaped, "$options": "i"}},
                    {"wbl_id": {"$regex": escaped, "$options": "i"}},
                    {"courier_partner": {"$regex": escaped, "$options": "i"}},
                ]
            })

        query = {"$and": and_clauses} if len(and_clauses) > 1 else and_clauses[0]
        cursor = db.master_labels.find(query).sort("last_processed_at", -1)

        output = io.StringIO()
        writer = csv.writer(output)

        # Header row with all required tracking details
        writer.writerow([
            "Order ID",
            "SKU",
            "Matched / Group SKU",
            "WBL / Tracking ID",
            "Delivery Partner",
            "Marketplace",
            "Cropped PDF Locations (File & Page Number)",
            "Total Upload Occurrences",
            "First Processed Date",
            "Last Processed Date",
        ])

        async for doc in cursor:
            appearances = [a for a in doc.get("appearances", []) if not a.get("is_trashed")]
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
                doc.get("matched_sku", "") or "",
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
