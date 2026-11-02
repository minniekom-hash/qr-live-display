import os
import json
import uuid
import time
import socket
import asyncio
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, WebSocket, WebSocketDisconnect, HTTPException, Depends, Header
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import io
from PIL import Image as PILImage, ImageOps

from ai_slip_inspector import inspect_slip_image

app = FastAPI(title="VIP Live Screen & Top 3 Spenders")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
DATA_DIR = os.path.join(BASE_DIR, "data")
SLIPS_DIR = os.path.join(UPLOADS_DIR, "slips")
BANK_DIR = os.path.join(UPLOADS_DIR, "bank")

for d in [STATIC_DIR, UPLOADS_DIR, DATA_DIR, SLIPS_DIR, BANK_DIR]:
    os.makedirs(d, exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

CONFIG_FILE = os.path.join(DATA_DIR, "admin_config.json")
RANKING_FILE = os.path.join(DATA_DIR, "ranking.json")
SUBMISSIONS_FILE = os.path.join(DATA_DIR, "submissions.json")

DEFAULT_CONFIG = {
    "admin_password": "admin",
    "bank_name": "พร้อมเพย์ / ทุกธนาคาร",
    "account_name": "บัญชีรับเงินร้านค้า",
    "account_number": "081-XXX-XXXX",
    "bank_qr_url": "/static/default_bank_qr.png"
}

def load_json(filepath, default_val):
    if os.path.exists(filepath):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return default_val
    return default_val

def save_json(filepath, data):
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

admin_config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
top_ranking = load_json(RANKING_FILE, [])
all_submissions = load_json(SUBMISSIONS_FILE, [])

if not os.path.exists(CONFIG_FILE):
    save_json(CONFIG_FILE, admin_config)

def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return "127.0.0.1"

active_admin_tokens = set()

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, data: dict):
        dead = []
        for connection in self.active_connections:
            try:
                await connection.send_json(data)
            except Exception:
                dead.append(connection)
        for d in dead:
            if d in self.active_connections:
                self.active_connections.remove(d)

manager = ConnectionManager()

latest_data = {
    "status": "idle",
    "image_url": "",
    "message": "",
    "ig": "",
    "facebook": "",
    "amount": 0,
    "timestamp": None,
    "expires_at": None,
    "duration_seconds": 300
}

display_reset_timer: Optional[asyncio.Task] = None

async def schedule_reset_timer():
    global display_reset_timer
    if display_reset_timer and not display_reset_timer.done():
        display_reset_timer.cancel()
    
    async def timer_task():
        try:
            await asyncio.sleep(300) # 5 minutes
            latest_data.update({
                "status": "idle",
                "image_url": "",
                "message": "",
                "ig": "",
                "facebook": "",
                "amount": 0,
                "timestamp": None,
                "expires_at": None
            })
            await manager.broadcast({
                "type": "RESET",
                "data": latest_data,
                "ranking": get_top_3()
            })
        except asyncio.CancelledError:
            pass

    display_reset_timer = asyncio.create_task(timer_task())

def get_top_3():
    sorted_ranks = sorted(top_ranking, key=lambda x: (x.get("amount", 0), x.get("timestamp", 0)), reverse=True)
    return sorted_ranks[:3]

def recalculate_ranking():
    global top_ranking
    top_ranking = sorted(top_ranking, key=lambda x: (x.get("amount", 0), x.get("timestamp", 0)), reverse=True)[:3]
    for idx, item in enumerate(top_ranking):
        item["rank"] = idx + 1
    save_json(RANKING_FILE, top_ranking)
    return top_ranking

def update_ranking(entry: dict):
    global top_ranking
    # Check if id already exists in ranking
    existing = next((item for item in top_ranking if item["id"] == entry["id"]), None)
    if existing:
        existing.update(entry)
    else:
        top_ranking.append(entry)
    return recalculate_ranking()

def save_processed_image(content: bytes, destination_path: str):
    try:
        pil_img = PILImage.open(io.BytesIO(content))
        pil_img = ImageOps.exif_transpose(pil_img)
        if pil_img.mode in ("RGBA", "P"):
            rgb_img = PILImage.new("RGB", pil_img.size, (255, 255, 255))
            if pil_img.mode == "RGBA":
                rgb_img.paste(pil_img, mask=pil_img.split()[3])
            else:
                rgb_img.paste(pil_img)
            pil_img = rgb_img
        elif pil_img.mode != "RGB":
            pil_img = pil_img.convert("RGB")
        pil_img.save(destination_path, "JPEG", quality=90, optimize=True)
    except Exception as e:
        print(f"Pillow conversion error: {e}, saving raw file")
        with open(destination_path, "wb") as buffer:
            buffer.write(content)

@app.get("/", response_class=HTMLResponse)
async def serve_pc_index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

@app.get("/mobile", response_class=HTMLResponse)
async def serve_mobile_index():
    return FileResponse(os.path.join(STATIC_DIR, "mobile.html"))

@app.get("/admin", response_class=HTMLResponse)
async def serve_admin_index():
    return FileResponse(os.path.join(STATIC_DIR, "admin.html"))

@app.get("/api/info")
async def get_server_info():
    local_ip = get_local_ip()
    port = 8000
    mobile_url = f"http://{local_ip}:{port}/mobile"
    now_dt = datetime.now()
    return {
        "local_ip": local_ip,
        "port": port,
        "mobile_url": mobile_url,
        "latest_data": latest_data,
        "top_ranking": get_top_3(),
        "bank_config": {
            "bank_name": admin_config.get("bank_name", ""),
            "account_name": admin_config.get("account_name", ""),
            "account_number": admin_config.get("account_number", ""),
            "bank_qr_url": admin_config.get("bank_qr_url", "")
        },
        "server_time": now_dt.strftime("%H:%M:%S"),
        "server_timestamp": now_dt.timestamp()
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    await websocket.send_json({
        "type": "STATE_UPDATE",
        "data": latest_data,
        "ranking": get_top_3()
    })
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

@app.post("/api/admin/login")
async def admin_login(password: str = Form(...)):
    if password == admin_config.get("admin_password"):
        token = uuid.uuid4().hex
        active_admin_tokens.add(token)
        return {"success": True, "token": token}
    raise HTTPException(status_code=401, detail="รหัสผ่านไม่ถูกต้อง")

def verify_admin(authorization: Optional[str] = Header(None)):
    if not authorization or authorization.replace("Bearer ", "") not in active_admin_tokens:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return True

@app.get("/api/admin/data")
async def get_admin_data(auth: bool = Depends(verify_admin)):
    return {
        "config": admin_config,
        "ranking": get_top_3(),
        "submissions": all_submissions[-50:][::-1]
    }

@app.post("/api/admin/update-config")
async def update_admin_config(
    bank_name: str = Form(...),
    account_name: str = Form(...),
    account_number: str = Form(...),
    new_password: Optional[str] = Form(None),
    bank_qr: Optional[UploadFile] = File(None),
    auth: bool = Depends(verify_admin)
):
    admin_config["bank_name"] = bank_name.strip()
    admin_config["account_name"] = account_name.strip()
    admin_config["account_number"] = account_number.strip()
    
    if new_password and new_password.strip():
        admin_config["admin_password"] = new_password.strip()

    if bank_qr and bank_qr.filename:
        qr_ext = os.path.splitext(bank_qr.filename)[1] or ".jpg"
        qr_filename = f"bank_qr_{uuid.uuid4().hex[:8]}{qr_ext}"
        qr_path = os.path.join(BANK_DIR, qr_filename)
        content = await bank_qr.read()
        save_processed_image(content, qr_path)
        admin_config["bank_qr_url"] = f"/uploads/bank/{qr_filename}"

    save_json(CONFIG_FILE, admin_config)

    await manager.broadcast({
        "type": "CONFIG_UPDATE",
        "bank_config": {
            "bank_name": admin_config.get("bank_name", ""),
            "account_name": admin_config.get("account_name", ""),
            "account_number": admin_config.get("account_number", ""),
            "bank_qr_url": admin_config.get("bank_qr_url", "")
        }
    })

    return {"success": True, "config": admin_config}

@app.post("/api/admin/reset-ranking")
async def reset_ranking(auth: bool = Depends(verify_admin)):
    global top_ranking
    top_ranking = []
    save_json(RANKING_FILE, top_ranking)
    await manager.broadcast({
        "type": "RANKING_UPDATE",
        "ranking": []
    })
    return {"success": True, "message": "รีเซ็ต Top 3 เรียบร้อยแล้ว"}

@app.post("/api/admin/adjust-submission")
async def adjust_submission(
    submission_id: str = Form(...),
    amount: float = Form(...),
    auth: bool = Depends(verify_admin)
):
    # Adjust amount for specific submission and recalculate Top 3
    for sub in all_submissions:
        if sub["id"] == submission_id:
            sub["amount"] = round(amount, 2)
            # Update ranking if this submission is in ranking
            update_ranking({
                "id": sub["id"],
                "amount": round(amount, 2),
                "message": sub.get("message", ""),
                "ig": sub.get("ig", ""),
                "facebook": sub.get("facebook", ""),
                "image_url": sub.get("image_url", ""),
                "timestamp": sub.get("timestamp", 0)
            })
            save_json(SUBMISSIONS_FILE, all_submissions)

            # If currently displayed, update amount
            if latest_data.get("status") == "active":
                latest_data["amount"] = round(amount, 2)

            await manager.broadcast({
                "type": "RANKING_UPDATE",
                "ranking": get_top_3(),
                "latest_data": latest_data
            })
            return {"success": True, "message": "ปรับยอดเงินเรียบร้อยแล้ว", "ranking": get_top_3()}
    
    raise HTTPException(status_code=404, detail="Submission not found")

# User Submission Endpoint - Automatically Inspected by AI
@app.post("/api/submit")
async def submit_content(
    message: str = Form(...),
    ig: str = Form(""),
    facebook: str = Form(""),
    image: UploadFile = File(...),
    slip: UploadFile = File(...)
):
    now_dt = datetime.now()

    # Save Slip Image first for AI Inspection
    slip_filename = f"slip_{uuid.uuid4().hex}.jpg"
    slip_path = os.path.join(SLIPS_DIR, slip_filename)
    slip_content = await slip.read()
    save_processed_image(slip_content, slip_path)
    slip_url = f"/uploads/slips/{slip_filename}"

    # AI Slip Inspection Execution
    ai_report = inspect_slip_image(slip_path)

    if not ai_report["is_valid"]:
        # Remove rejected slip file if desired or keep for audit
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": "ไม่สามารถยืนยันสลิปโอนเงินได้ กรุณาตรวจสอบสลิปและเวลาที่โอนใหม่อีกครั้ง"
            }
        )

    # Save User Display Image
    user_img_filename = f"{uuid.uuid4().hex}.jpg"
    user_img_path = os.path.join(UPLOADS_DIR, user_img_filename)
    user_img_content = await image.read()
    save_processed_image(user_img_content, user_img_path)
    image_url = f"/uploads/{user_img_filename}"

    submission_id = uuid.uuid4().hex
    now_ts = now_dt.timestamp()

    detected_amount = ai_report.get("amount", 500.0)
    detected_slip_time = ai_report.get("slip_time", now_dt.strftime("%H:%M"))

    submission_entry = {
        "id": submission_id,
        "amount": round(detected_amount, 2),
        "message": message.strip(),
        "ig": ig.strip(),
        "facebook": facebook.strip(),
        "image_url": image_url,
        "slip_url": slip_url,
        "slip_time": detected_slip_time,
        "ai_report": ai_report,
        "created_at": now_dt.strftime("%Y-%m-%d %H:%M:%S"),
        "timestamp": now_ts
    }

    all_submissions.append(submission_entry)
    save_json(SUBMISSIONS_FILE, all_submissions)

    updated_top_3 = update_ranking({
        "id": submission_id,
        "amount": round(detected_amount, 2),
        "message": message.strip(),
        "ig": ig.strip(),
        "facebook": facebook.strip(),
        "image_url": image_url,
        "timestamp": now_ts
    })

    expires_at = now_ts + 300
    latest_data.update({
        "status": "active",
        "image_url": image_url,
        "message": message.strip(),
        "ig": ig.strip(),
        "facebook": facebook.strip(),
        "amount": round(detected_amount, 2),
        "timestamp": now_ts,
        "expires_at": expires_at,
        "duration_seconds": 300
    })

    await schedule_reset_timer()

    await manager.broadcast({
        "type": "NEW_SUBMISSION",
        "data": latest_data,
        "ranking": updated_top_3
    })

    return {
        "success": True,
        "message": "AI ตรวจสอบสลิปผ่านเรียบร้อยแล้ว",
        "data": latest_data,
        "ranking": updated_top_3,
        "ai_report": ai_report
    }

@app.post("/api/reset")
async def reset_display():
    global display_reset_timer
    if display_reset_timer and not display_reset_timer.done():
        display_reset_timer.cancel()

    latest_data.update({
        "status": "idle",
        "image_url": "",
        "message": "",
        "ig": "",
        "facebook": "",
        "amount": 0,
        "timestamp": None,
        "expires_at": None
    })
    await manager.broadcast({
        "type": "RESET",
        "data": latest_data,
        "ranking": get_top_3()
    })
    return {"success": True, "message": "รีเซ็ตหน้าจอหลักเรียบร้อยแล้ว"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)
