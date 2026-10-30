"""High-performance in-memory MongoDB fallback store for resilient offline operation."""

import asyncio
import copy
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import secrets
from typing import Any, Dict, List, Optional, Union


class FallbackObjectId(str):
    """Fallback representation of a 24-hex-char MongoDB ObjectId."""

    def __new__(cls, val=None):
        if val is None:
            val = secrets.token_hex(12)
        elif isinstance(val, FallbackObjectId):
            val = str(val)
        elif isinstance(val, str) and not val.strip():
            val = secrets.token_hex(12)
        return super().__new__(cls, str(val))

    @classmethod
    def is_valid(cls, oid: Any) -> bool:
        if not oid:
            return False
        s = str(oid)
        return len(s) == 24 and all(c in "0123456789abcdefABCDEF" for c in s)


def matches_query(doc: dict, query: dict) -> bool:
    """Evaluate whether doc satisfies MongoDB-style query filters."""
    if not query:
        return True

    for k, v in query.items():
        if k == "$or":
            if not isinstance(v, list) or not any(matches_query(doc, subq) for subq in v):
                return False
            continue

        if k == "$and":
            if not isinstance(v, list) or not all(matches_query(doc, subq) for subq in v):
                return False
            continue

        # Support nested dot-notation like "appearances.job_id"
        if "." in k:
            parts = k.split(".", 1)
            root = doc.get(parts[0])
            if isinstance(root, list):
                if not any(isinstance(item, dict) and matches_query(item, {parts[1]: v}) for item in root):
                    return False
                continue
            elif isinstance(root, dict):
                if not matches_query(root, {parts[1]: v}):
                    return False
                continue
            else:
                return False

        doc_val = doc.get(k)

        if isinstance(v, dict):
            if "$regex" in v:
                pat = v["$regex"]
                flags = re.IGNORECASE if "i" in v.get("$options", "") else 0
                try:
                    compiled = re.compile(pat, flags)
                except Exception:
                    compiled = re.compile(re.escape(str(pat)), flags)

                if isinstance(doc_val, list):
                    if not any(compiled.search(str(item)) for item in doc_val):
                        return False
                else:
                    if not compiled.search(str(doc_val or "")):
                        return False
            elif "$in" in v:
                allowed = [str(x) for x in v["$in"]]
                if str(doc_val) not in allowed:
                    return False
            elif "$nin" in v:
                forbidden = [str(x) for x in v["$nin"]]
                if str(doc_val) in forbidden:
                    return False
            elif "$ne" in v:
                target_ne = v["$ne"]
                if doc_val == target_ne or (doc_val is not None and str(doc_val).strip().lower() == str(target_ne).strip().lower()):
                    return False
            elif "$not" in v:
                if matches_query({k: doc_val}, {k: v["$not"]}):
                    return False
            elif "$exists" in v:
                exists = k in doc
                if exists != bool(v["$exists"]):
                    return False
            elif "$size" in v:
                if not isinstance(doc_val, list) or len(doc_val) != v["$size"]:
                    return False
            elif "$gt" in v:
                if doc_val is None or doc_val <= v["$gt"]:
                    return False
            elif "$gte" in v:
                if doc_val is None or doc_val < v["$gte"]:
                    return False
            elif "$lt" in v:
                if doc_val is None or doc_val >= v["$lt"]:
                    return False
            elif "$lte" in v:
                if doc_val is None or doc_val > v["$lte"]:
                    return False
        else:
            # Direct value equality (string-coerced for ObjectIds)
            if doc_val is None and v is None:
                continue
            if k == "email" and isinstance(doc_val, str) and isinstance(v, str):
                if doc_val.strip().lower() != v.strip().lower():
                    return False
            elif str(doc_val) != str(v):
                return False

    return True


def apply_update(doc: dict, update: dict) -> bool:
    """Apply MongoDB-style $set, $inc, $push, $pull updates."""
    modified = False
    if "$set" in update:
        for k, v in update["$set"].items():
            doc[k] = v
            modified = True

    if "$unset" in update:
        for k in update["$unset"]:
            if k in doc:
                del doc[k]
                modified = True

    if "$inc" in update:
        for k, v in update["$inc"].items():
            doc[k] = doc.get(k, 0) + v
            modified = True

    if "$push" in update:
        for k, v in update["$push"].items():
            if k not in doc or not isinstance(doc[k], list):
                doc[k] = []
            doc[k].append(v)
            modified = True

    if "$pull" in update:
        for k, pull_filter in update["$pull"].items():
            if k in doc and isinstance(doc[k], list):
                if isinstance(pull_filter, dict):
                    orig_len = len(doc[k])
                    doc[k] = [
                        item for item in doc[k]
                        if not (isinstance(item, dict) and matches_query(item, pull_filter))
                    ]
                    if len(doc[k]) != orig_len:
                        modified = True
                else:
                    orig_len = len(doc[k])
                    doc[k] = [item for item in doc[k] if item != pull_filter]
                    if len(doc[k]) != orig_len:
                        modified = True

    return modified


class AsyncCursor:
    """Async iterator compatible with Motor's cursor interface."""

    def __init__(self, docs: List[dict]):
        self._docs = list(docs)
        self._index = 0

    def sort(self, key_or_list: Any, direction: int = 1) -> "AsyncCursor":
        if isinstance(key_or_list, list):
            for k, d in reversed(key_or_list):
                rev = d == -1 or d == "desc"
                self._docs.sort(
                    key=lambda x: (x.get(k) is None, str(x.get(k, ""))),
                    reverse=rev,
                )
        elif isinstance(key_or_list, str):
            rev = direction == -1 or direction == "desc"
            self._docs.sort(
                key=lambda x: (x.get(key_or_list) is None, str(x.get(key_or_list, ""))),
                reverse=rev,
            )
        return self

    def skip(self, n: int) -> "AsyncCursor":
        self._docs = self._docs[max(0, n) :]
        return self

    def limit(self, n: int) -> "AsyncCursor":
        if n > 0:
            self._docs = self._docs[:n]
        return self

    def __aiter__(self) -> "AsyncCursor":
        self._index = 0
        return self

    async def __anext__(self) -> dict:
        if self._index < len(self._docs):
            doc = self._docs[self._index]
            self._index += 1
            return copy.deepcopy(doc)
        raise StopAsyncIteration

    async def to_list(self, length: Optional[int] = None) -> List[dict]:
        if length is not None:
            return [copy.deepcopy(d) for d in self._docs[:length]]
        return [copy.deepcopy(d) for d in self._docs]


class InsertOneResult:
    def __init__(self, inserted_id: Any):
        self.inserted_id = inserted_id


class InsertManyResult:
    def __init__(self, inserted_ids: List[Any]):
        self.inserted_ids = inserted_ids


class UpdateResult:
    def __init__(self, matched_count: int, modified_count: int, upserted_id: Any = None):
        self.matched_count = matched_count
        self.modified_count = modified_count
        self.upserted_id = upserted_id


class DeleteResult:
    def __init__(self, deleted_count: int):
        self.deleted_count = deleted_count


class InMemoryCollection:
    """Emulates a MongoDB / Motor collection in memory with persistent JSON storage."""

    def __init__(self, name: str, db: "InMemoryDatabase"):
        self.name = name
        self.db = db
        self._docs: List[dict] = []

    async def find_one(self, filter_query: Optional[dict] = None) -> Optional[dict]:
        q = filter_query or {}
        for doc in self._docs:
            if matches_query(doc, q):
                return copy.deepcopy(doc)
        return None

    def find(self, filter_query: Optional[dict] = None) -> AsyncCursor:
        q = filter_query or {}
        matched = [d for d in self._docs if matches_query(d, q)]
        return AsyncCursor(matched)

    async def count_documents(self, filter_query: Optional[dict] = None) -> int:
        q = filter_query or {}
        return sum(1 for d in self._docs if matches_query(d, q))

    async def insert_one(self, doc: dict) -> InsertOneResult:
        doc_copy = copy.deepcopy(doc)
        if "_id" not in doc_copy:
            doc_copy["_id"] = FallbackObjectId()
        self._docs.append(doc_copy)
        self.db.schedule_save()
        return InsertOneResult(doc_copy["_id"])

    async def insert_many(self, docs: List[dict]) -> InsertManyResult:
        ids = []
        for d in docs:
            dc = copy.deepcopy(d)
            if "_id" not in dc:
                dc["_id"] = FallbackObjectId()
            ids.append(dc["_id"])
            self._docs.append(dc)
        self.db.schedule_save()
        return InsertManyResult(ids)

    async def update_one(
        self,
        filter_query: dict,
        update: dict,
        upsert: bool = False,
    ) -> UpdateResult:
        for idx, doc in enumerate(self._docs):
            if matches_query(doc, filter_query):
                apply_update(doc, update)
                self.db.schedule_save()
                return UpdateResult(matched_count=1, modified_count=1)

        if upsert:
            new_doc = copy.deepcopy(filter_query)
            if "_id" not in new_doc:
                new_doc["_id"] = FallbackObjectId()
            apply_update(new_doc, update)
            self._docs.append(new_doc)
            self.db.schedule_save()
            return UpdateResult(matched_count=0, modified_count=1, upserted_id=new_doc["_id"])

        return UpdateResult(matched_count=0, modified_count=0)

    async def update_many(
        self,
        filter_query: dict,
        update: dict,
        upsert: bool = False,
    ) -> UpdateResult:
        matched = 0
        modified = 0
        for doc in self._docs:
            if matches_query(doc, filter_query):
                matched += 1
                if apply_update(doc, update):
                    modified += 1
        if modified > 0:
            self.db.schedule_save()
        return UpdateResult(matched_count=matched, modified_count=modified)

    async def distinct(self, key: str, filter_query: Optional[dict] = None) -> List[Any]:
        q = filter_query or {}
        seen = set()
        result = []
        for d in self._docs:
            if matches_query(d, q):
                val = d.get(key)
                if val is not None:
                    if isinstance(val, list):
                        for item in val:
                            item_key = str(item)
                            if item_key not in seen:
                                seen.add(item_key)
                                result.append(item)
                    else:
                        item_key = str(val)
                        if item_key not in seen:
                            seen.add(item_key)
                            result.append(val)
        return result

    async def delete_one(self, filter_query: dict) -> DeleteResult:
        for idx, doc in enumerate(self._docs):
            if matches_query(doc, filter_query):
                self._docs.pop(idx)
                self.db.schedule_save()
                return DeleteResult(deleted_count=1)
        return DeleteResult(deleted_count=0)

    async def delete_many(self, filter_query: dict) -> DeleteResult:
        initial = len(self._docs)
        self._docs = [d for d in self._docs if not matches_query(d, filter_query)]
        deleted = initial - len(self._docs)
        if deleted > 0:
            self.db.schedule_save()
        return DeleteResult(deleted_count=deleted)

    async def bulk_write(self, requests: list, ordered: bool = False) -> UpdateResult:
        """Execute a batch of insert and update operations in memory."""
        modified_count = 0
        inserted_count = 0
        for req in requests:
            try:
                # Handle pymongo.InsertOne or dict
                if hasattr(req, "_doc"):
                    await self.insert_one(req._doc)
                    inserted_count += 1
                elif isinstance(req, dict) and "insert" in req:
                    await self.insert_one(req["insert"])
                    inserted_count += 1
                # Handle pymongo.UpdateOne
                elif hasattr(req, "_filter") and hasattr(req, "_doc"):
                    res = await self.update_one(req._filter, req._doc, upsert=getattr(req, "_upsert", False))
                    modified_count += res.modified_count
                elif isinstance(req, dict) and "filter" in req and "update" in req:
                    res = await self.update_one(req["filter"], req["update"], upsert=req.get("upsert", False))
                    modified_count += res.modified_count
            except Exception:
                pass
        return UpdateResult(matched_count=modified_count, modified_count=modified_count)

    async def create_index(self, *args, **kwargs) -> str:
        return "in_memory_index"


class InMemoryDatabase:
    """Full-featured async in-memory database with automatic file persistence."""

    def __init__(self, persistence_file: str = "storage/local_fallback_db.json"):
        p = Path(persistence_file)
        if not p.exists() and (Path("backend") / persistence_file).exists():
            p = Path("backend") / persistence_file
        elif not p.exists() and (Path("..") / persistence_file).exists():
            p = Path("..") / persistence_file
        self.file_path = p
        self._collections: Dict[str, InMemoryCollection] = {}
        self._save_timer: Optional[asyncio.Task] = None
        self._load_from_disk()

    def __getitem__(self, name: str) -> InMemoryCollection:
        if name not in self._collections:
            self._collections[name] = InMemoryCollection(name, self)
        return self._collections[name]

    def __getattr__(self, name: str) -> InMemoryCollection:
        return self[name]

    class _Admin:
        async def command(self, *args, **kwargs):
            return {"ok": 1}

    @property
    def admin(self) -> "_Admin":
        return self._Admin()

    def schedule_save(self):
        """Schedule atomic file sync to local JSON file."""
        try:
            self._save_to_disk()
        except Exception:
            pass

    def _save_to_disk(self):
        try:
            self.file_path.parent.mkdir(parents=True, exist_ok=True)
            data = {}
            for col_name, col in self._collections.items():
                col_docs = []
                for d in col._docs:
                    serialized = {}
                    for k, v in d.items():
                        if isinstance(v, (datetime,)):
                            serialized[k] = v.isoformat()
                        elif isinstance(v, FallbackObjectId):
                            serialized[k] = str(v)
                        else:
                            serialized[k] = v
                    col_docs.append(serialized)
                data[col_name] = col_docs

            temp_path = self.file_path.with_suffix(".tmp")
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            temp_path.replace(self.file_path)
        except Exception:
            pass

    def _load_from_disk(self):
        if not self.file_path.exists():
            return
        try:
            with open(self.file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            for col_name, docs in data.items():
                col = self[col_name]
                deserialized_docs = []
                for d in docs:
                    doc = dict(d)
                    if "_id" in doc:
                        doc["_id"] = FallbackObjectId(doc["_id"])
                    # Parse dates
                    for date_field in ("created_at", "updated_at", "last_login_at", "expiresAt"):
                        if date_field in doc and isinstance(doc[date_field], str):
                            try:
                                doc[date_field] = datetime.fromisoformat(doc[date_field])
                            except Exception:
                                pass
                    deserialized_docs.append(doc)
                col._docs = deserialized_docs
        except Exception:
            pass
