"""Google Drive and Google OAuth2 Integration Service.

Handles user authentication via Google, token refreshing, folder creation,
and direct upload of processed shipping labels and picklists to the user's
personal Google Drive ("Bring Your Own Storage").
"""

import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.core.config import get_settings
from app.core.logging import logger
from app.db.mongodb import ObjectId, get_db

settings = get_settings()

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"
GOOGLE_DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink"

DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file"
USERINFO_EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email"
USERINFO_PROFILE_SCOPE = "https://www.googleapis.com/auth/userinfo.profile"
OPENID_SCOPE = "openid"


def _http_request(
    url: str,
    method: str = "GET",
    headers: Optional[Dict[str, str]] = None,
    data: Optional[bytes] = None,
    timeout: int = 30,
) -> Tuple[int, Dict[str, Any]]:
    """Synchronous / executor HTTP request helper using standard library urllib."""
    req_headers = headers.copy() if headers else {}
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status_code = resp.getcode()
            body = resp.read().decode("utf-8")
            try:
                parsed = json.loads(body)
            except Exception:
                parsed = {"raw": body}
            return status_code, parsed
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8") if e.fp else ""
        try:
            parsed = json.loads(err_body)
        except Exception:
            parsed = {"error": err_body or str(e)}
        return e.code, parsed
    except Exception as e:
        return 500, {"error": str(e)}


class GoogleDriveService:
    """Manages Google OAuth and Google Drive file operations."""

    def __init__(self) -> None:
        self.settings = get_settings()

    @property
    def client_id(self) -> Optional[str]:
        return self.settings.GOOGLE_CLIENT_ID or os.getenv("GOOGLE_CLIENT_ID") or None

    @property
    def client_secret(self) -> Optional[str]:
        return self.settings.GOOGLE_CLIENT_SECRET or os.getenv("GOOGLE_CLIENT_SECRET") or None

    @property
    def folder_name(self) -> str:
        return self.settings.GOOGLE_DRIVE_FOLDER_NAME or "LabelFlow - Meesho Labels"

    def is_configured(self) -> bool:
        """Check whether Google Client ID and Secret are provided in environment."""
        return bool(self.client_id and self.client_secret)

    def get_auth_url(self, redirect_uri: str, state: Optional[str] = None) -> str:
        """Construct Google OAuth2 consent URL with Drive and Profile scopes."""
        scopes = [
            OPENID_SCOPE,
            USERINFO_EMAIL_SCOPE,
            USERINFO_PROFILE_SCOPE,
            DRIVE_FILE_SCOPE,
        ]
        params = {
            "client_id": self.client_id or "",
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": " ".join(scopes),
            "access_type": "offline",
            "prompt": "consent",
            "include_granted_scopes": "true",
        }
        if state:
            params["state"] = state
        return f"{GOOGLE_AUTH_URL}?{urllib.parse.urlencode(params)}"

    def exchange_code(self, code: str, redirect_uri: str) -> Dict[str, Any]:
        """Exchange Google authorization code for access and refresh tokens."""
        if not self.is_configured():
            raise ValueError(
                "Google OAuth credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) are not configured."
            )

        post_data = urllib.parse.urlencode({
            "code": code,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }).encode("utf-8")

        status_code, resp = _http_request(
            GOOGLE_TOKEN_URL,
            method="POST",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data=post_data,
        )

        if status_code != 200 or "access_token" not in resp:
            err = resp.get("error_description") or resp.get("error") or "Failed to exchange authorization code"
            raise ValueError(f"Google OAuth token exchange failed: {err}")

        # Fetch profile info with access token
        access_token = resp["access_token"]
        _, userinfo = _http_request(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )

        resp["userinfo"] = userinfo
        return resp

    def verify_credential(self, id_token: str) -> Dict[str, Any]:
        """Verify Google Identity Services ID token via Google TokenInfo API."""
        url = f"{GOOGLE_TOKENINFO_URL}?id_token={urllib.parse.quote(id_token)}"
        status_code, resp = _http_request(url)

        if status_code != 200 or "sub" not in resp:
            err = resp.get("error_description") or resp.get("error") or "Invalid Google credential"
            raise ValueError(f"Google credential verification failed: {err}")

        return {
            "sub": resp.get("sub"),
            "email": resp.get("email"),
            "name": resp.get("name"),
            "picture": resp.get("picture"),
            "email_verified": resp.get("email_verified") == "true" or resp.get("email_verified") is True,
        }

    def refresh_access_token(self, refresh_token: str) -> Tuple[str, int]:
        """Use refresh token to obtain a fresh access token."""
        if not self.is_configured():
            raise ValueError("Google Client ID and Secret not configured.")

        post_data = urllib.parse.urlencode({
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }).encode("utf-8")

        status_code, resp = _http_request(
            GOOGLE_TOKEN_URL,
            method="POST",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data=post_data,
        )

        if status_code != 200 or "access_token" not in resp:
            err = resp.get("error_description") or resp.get("error") or "Failed to refresh token"
            raise ValueError(f"Google token refresh failed: {err}")

        expires_in = int(resp.get("expires_in", 3600))
        return resp["access_token"], expires_in

    async def get_valid_access_token_for_user(self, user_id: str) -> Optional[str]:
        """Retrieve and automatically refresh Google access token for user."""
        db = get_db()
        if db is None:
            return None

        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            return None

        g_data = user.get("google_drive")
        if not g_data or not g_data.get("connected"):
            return None

        access_token = g_data.get("access_token")
        refresh_token = g_data.get("refresh_token")
        expires_at = g_data.get("expires_at", 0)

        # If token is still valid (with 60-second buffer), return it
        if access_token and time.time() < (expires_at - 60):
            return access_token

        # Token expired: refresh if we have a refresh token
        if refresh_token:
            try:
                new_token, expires_in = self.refresh_access_token(refresh_token)
                new_expires_at = int(time.time() + expires_in)
                await db.users.update_one(
                    {"_id": ObjectId(user_id)},
                    {
                        "$set": {
                            "google_drive.access_token": new_token,
                            "google_drive.expires_at": new_expires_at,
                            "google_drive.updated_at": datetime.now(timezone.utc),
                        }
                    },
                )
                return new_token
            except Exception as e:
                logger.error("Failed to refresh Google token for user %s: %s", user_id, str(e))
                return None

        return access_token

    def ensure_drive_folder(
        self,
        access_token: str,
        folder_name: Optional[str] = None,
        parent_id: Optional[str] = None,
    ) -> Tuple[str, str]:
        """Find or create dedicated label storage folder on user's Google Drive.

        Returns (folder_id, folder_web_view_url).
        """
        name = folder_name or "LabelFlow"

        # Query existing non-trashed folder with this name (and parent if specified)
        if parent_id:
            q = f"name = '{name}' and '{parent_id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        else:
            q = f"name = '{name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"

        search_url = f"{GOOGLE_DRIVE_FILES_URL}?q={urllib.parse.quote(q)}&fields=files(id,name,webViewLink)"
        status_code, resp = _http_request(
            search_url,
            headers={"Authorization": f"Bearer {access_token}"},
        )

        files = resp.get("files", [])
        if files:
            folder = files[0]
            f_id = folder["id"]
            f_url = folder.get("webViewLink", f"https://drive.google.com/drive/folders/{f_id}")
            return f_id, f_url

        # Create new folder
        meta: Dict[str, Any] = {
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
        }
        if parent_id:
            meta["parents"] = [parent_id]

        payload = json.dumps(meta).encode("utf-8")

        status_code, created = _http_request(
            f"{GOOGLE_DRIVE_FILES_URL}?fields=id,name,webViewLink",
            method="POST",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            data=payload,
        )

        if status_code not in (200, 201) or "id" not in created:
            err = created.get("error", {}).get("message", "Failed to create folder on Google Drive")
            raise ValueError(f"Drive folder creation error: {err}")

        f_id = created["id"]
        f_url = created.get("webViewLink", f"https://drive.google.com/drive/folders/{f_id}")
        return f_id, f_url

    def ensure_marketplace_folder(
        self,
        access_token: str,
        marketplace: str = "Meesho",
    ) -> Tuple[str, str]:
        """Ensure 'LabelFlow' root folder exists, then ensure marketplace subfolder exists.

        e.g. LabelFlow/Meesho, LabelFlow/Flipkart, LabelFlow/Amazon
        Returns (marketplace_folder_id, marketplace_folder_url).
        """
        # 1. Root folder 'LabelFlow'
        root_id, _ = self.ensure_drive_folder(access_token, folder_name="LabelFlow")
        # 2. Marketplace subfolder inside 'LabelFlow'
        clean_mp = marketplace.capitalize() if marketplace else "Meesho"
        return self.ensure_drive_folder(access_token, folder_name=clean_mp, parent_id=root_id)

    def upload_file_to_drive(
        self,
        access_token: str,
        file_bytes: bytes,
        filename: str,
        mime_type: str,
        folder_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Upload binary file content to user's Google Drive using multipart upload."""
        metadata = {
            "name": filename,
            "mimeType": mime_type,
        }
        if folder_id:
            metadata["parents"] = [folder_id]

        boundary = f"=======LabelFlowBoundary{int(time.time())}======="
        meta_json = json.dumps(metadata)

        body_parts = [
            f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{meta_json}\r\n".encode("utf-8"),
            f"--{boundary}\r\nContent-Type: {mime_type}\r\n\r\n".encode("utf-8"),
            file_bytes,
            f"\r\n--{boundary}--\r\n".encode("utf-8"),
        ]
        body = b"".join(body_parts)

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": f"multipart/related; boundary={boundary}",
            "Content-Length": str(len(body)),
        }

        status_code, resp = _http_request(
            GOOGLE_DRIVE_UPLOAD_URL,
            method="POST",
            headers=headers,
            data=body,
            timeout=60,
        )

        if status_code not in (200, 201) or "id" not in resp:
            err = resp.get("error", {}).get("message", "Drive file upload failed")
            raise ValueError(f"Failed to upload {filename} to Google Drive: {err}")

        return {
            "id": resp.get("id"),
            "name": resp.get("name"),
            "web_view_link": resp.get("webViewLink") or f"https://drive.google.com/file/d/{resp.get('id')}/view",
            "web_content_link": resp.get("webContentLink") or f"https://drive.google.com/uc?id={resp.get('id')}&export=download",
        }

    async def backup_job_to_drive(
        self,
        user_id: str,
        job_id: str,
        marketplace: str = "Meesho",
        custom_pdf_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Upload all generated artifacts of a processing job to the user's Google Drive inside marketplace folder."""
        access_token = await self.get_valid_access_token_for_user(user_id)
        if not access_token:
            return {
                "success": False,
                "job_id": job_id,
                "message": "Google Drive is not connected or token expired.",
            }

        job_dir = Path(self.settings.STORAGE_DIR) / "jobs" / job_id
        if not job_dir.exists() or not job_dir.is_dir():
            return {
                "success": False,
                "job_id": job_id,
                "message": f"Job artifacts not found for {job_id}.",
            }

        clean_mp = marketplace.capitalize() if marketplace else "Meesho"
        mp_slug = clean_mp.lower()

        try:
            # 1. Ensure marketplace folder exists in user's Drive (e.g. LabelFlow/Meesho)
            folder_id, folder_url = self.ensure_marketplace_folder(access_token, marketplace=clean_mp)

            uploaded_artifacts = {}
            pdf_path = job_dir / "labels_thermal_4x6.pdf"
            picklist_path = job_dir / "sku_picklist.csv"
            report_path = job_dir / "processing_report.json"

            # 2. Upload Thermal 4x6 PDF
            pdf_drive_url = None
            if pdf_path.exists():
                with open(pdf_path, "rb") as f:
                    pdf_bytes = f.read()
                pdf_res = self.upload_file_to_drive(
                    access_token=access_token,
                    file_bytes=pdf_bytes,
                    filename=custom_pdf_name or f"{mp_slug}_thermal_4x6_{job_id}.pdf",
                    mime_type="application/pdf",
                    folder_id=folder_id,
                )
                pdf_drive_url = pdf_res["web_view_link"]
                uploaded_artifacts["pdf"] = pdf_res

            # 3. Upload Picklist CSV
            picklist_drive_url = None
            if picklist_path.exists():
                with open(picklist_path, "rb") as f:
                    csv_bytes = f.read()
                csv_res = self.upload_file_to_drive(
                    access_token=access_token,
                    file_bytes=csv_bytes,
                    filename=f"{mp_slug}_picklist_{job_id}.csv",
                    mime_type="text/csv",
                    folder_id=folder_id,
                )
                picklist_drive_url = csv_res["web_view_link"]
                uploaded_artifacts["picklist"] = csv_res

            # 4. Upload JSON Audit Report
            if report_path.exists():
                with open(report_path, "rb") as f:
                    report_bytes = f.read()
                report_res = self.upload_file_to_drive(
                    access_token=access_token,
                    file_bytes=report_bytes,
                    filename=f"{mp_slug}_report_{job_id}.json",
                    mime_type="application/json",
                    folder_id=folder_id,
                )
                uploaded_artifacts["report"] = report_res

            # 5. Persist the Drive references in MongoDB job document (Lightweight calling metadata)
            db = get_db()
            drive_metadata = {
                "saved": True,
                "folder_id": folder_id,
                "folder_url": folder_url,
                "pdf_drive_url": pdf_drive_url,
                "picklist_drive_url": picklist_drive_url,
                "artifacts": uploaded_artifacts,
                "synced_at": datetime.now(timezone.utc),
            }

            if db is not None:
                await db.processing_jobs.update_one(
                    {"job_id": job_id, "user_id": user_id},
                    {
                        "$set": {
                            "google_drive": drive_metadata,
                            "downloads.google_drive_folder": folder_url,
                            "downloads.google_drive_pdf": pdf_drive_url,
                            "downloads.google_drive_picklist": picklist_drive_url,
                        }
                    },
                )

            logger.info("Successfully backed up job %s to Google Drive of user %s", job_id, user_id)

            return {
                "success": True,
                "job_id": job_id,
                "folder_url": folder_url,
                "pdf_drive_url": pdf_drive_url,
                "picklist_drive_url": picklist_drive_url,
                "message": "Job successfully saved to your Google Drive!",
            }

        except Exception as exc:
            logger.error("Error backing up job %s to Google Drive: %s", job_id, str(exc), exc_info=True)
            return {
                "success": False,
                "job_id": job_id,
                "message": f"Google Drive backup failed: {str(exc)}",
            }


google_drive_service = GoogleDriveService()
