import os
import io
import json
import base64
import numpy as np
import cv2
import subprocess 

# --- CONFIGURATION ---
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from groq import Groq

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 1. MODEL LOADING ---
print("------------------------------------------------")
print("🚀 MENTEXA: HEADER FIX LOADED")
print("------------------------------------------------")

deepface_ready = False
audio_pipe = None

@app.on_event("startup")
async def startup_event():
    global deepface_ready, audio_pipe
    
    # VIDEO
    print(" [1/3] Loading DeepFace...")
    try:
        from deepface import DeepFace
        dummy = np.zeros((224, 224, 3), dtype=np.uint8)
        DeepFace.analyze(dummy, actions=['emotion'], detector_backend='opencv', enforce_detection=False, silent=True)
        deepface_ready = True
        print("   ✅ DeepFace Active.")
    except Exception as e:
        print(f"   ⚠️ Face Error: {e}")

    # AUDIO
    print(" [2/3] Loading Audio AI...")
    try:
        from transformers import pipeline
        audio_pipe = pipeline("audio-classification", model="superb/wav2vec2-base-superb-er")
        print("   ✅ Audio AI Active.")
    except Exception as e:
        print(f"   ⚠️ Audio Error: {e}")

    print(" [3/3] Groq Connected.")
    print("------------------------------------------------")
    print("✨ READY. Listening on http://localhost:8000")

# --- 2. HELPERS ---
def safe_base64_decode(data):
    try:
        if not data or len(data) < 20: return None
        if ',' in data: data = data.split(',')[1]
        data = data.replace('\n', '').replace('\r', '').replace(' ', '')
        missing = len(data) % 4
        if missing: data += '=' * (4 - missing)
        return base64.b64decode(data)
    except: return None

def convert_and_transcribe(header_bytes, body_bytes):
    """
    Glues the Header + Body together, converts to WAV, then Transcribes.
    """
    try:
        # 1. Paths
        current_dir = os.path.dirname(os.path.abspath(__file__))
        ffmpeg_path = os.path.join(current_dir, "ffmpeg.exe")
        input_file = os.path.join(current_dir, "raw_input.webm")
        output_file = os.path.join(current_dir, "clean_input.wav")

        if not os.path.exists(ffmpeg_path):
            print(f"   ❌ Critical: ffmpeg.exe missing at {ffmpeg_path}")
            return ""

        # 2. Stitch Header + Body
        # If we have a header, put it first. If not, pray FFmpeg figures it out.
        full_audio = (header_bytes + body_bytes) if header_bytes else body_bytes
        
        with open(input_file, "wb") as f:
            f.write(full_audio)
        
        # 3. Convert (Ignore timestamp errors caused by stitching)
        # -fflags +genpts +igndts tells FFmpeg to fix the messy timeline we just created
        subprocess.run([
            ffmpeg_path, "-y", 
            "-fflags", "+genpts+igndts", 
            "-i", input_file, 
            "-ar", "16000", 
            output_file
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # 4. Transcribe
        if not os.path.exists(output_file):
            print("   ❌ Conversion Failed (No WAV created).")
            return ""

        with open(output_file, "rb") as file:
            return client.audio.transcriptions.create(
                file=("clean_input.wav", file),
                model="whisper-large-v3-turbo", 
                response_format="json"
            ).text
            
    except Exception as e:
        print(f"   ❌ Transcript/Conversion Error: {e}")
        return ""

def get_groq_stream(history, user_text, face_em, voice_em):
    print(f"   🧠 Thinking about: '{user_text}'")
    sys_msg = f"User Face: {face_em}. User Voice: {voice_em}. You are Mentexa. Be concise."
    msgs = [{"role": "system", "content": sys_msg}] + history + [{"role": "user", "content": user_text}]
    
    return client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=msgs,
        temperature=1,
        max_completion_tokens=4096,
        top_p=1,
        stream=True
    )

# --- 3. WEBSOCKET ---
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    from deepface import DeepFace
    
    latest_face = "neutral"
    latest_voice = "neutral"
    
    # BUFFERS
    audio_buffer = io.BytesIO() # Current Chat Turn
    webm_header = None          # The Magic Header (First Chunk)
    chat_history = []
    
    print("🔵 CLIENT CONNECTED")
    
    try:
        while True:
            data = await websocket.receive_json()

            # --- VIDEO ---
            if data["type"] == "video_frame" and deepface_ready:
                img_bytes = safe_base64_decode(data["data"])
                if img_bytes:
                    try:
                        frame = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
                        res = DeepFace.analyze(frame, actions=['emotion'], detector_backend='opencv', enforce_detection=False, silent=True)
                        if res:
                            latest_face = res[0]['dominant_emotion']
                            conf = float(res[0]['emotion'][latest_face])
                            await websocket.send_json({"type": "emotion_update", "modality": "facial", "emotion": latest_face, "confidence": conf})
                    except: pass

            # --- AUDIO ---
            elif data["type"] == "audio_chunk":
                raw = safe_base64_decode(data["data"])
                if raw:
                    # A. CAPTURE HEADER (The first chunk ever received)
                    if webm_header is None:
                        webm_header = raw
                        print(f"   📥 Captured WebM Header ({len(raw)} bytes)")

                    # B. CHAT ACCUMULATION
                    if data.get("is_recording_turn"): 
                        audio_buffer.write(raw)
                    
                    # C. EMOTION ANALYSIS (Random sampling)
                    if audio_pipe and np.random.rand() > 0.3: 
                        try:
                            # We might need the header for emotion too, but raw chunks often work for simple classification
                            # If it fails, we can stitch header here too.
                            temp_emo = webm_header + raw if webm_header else raw
                            with open("temp_emo.webm", "wb") as f: f.write(temp_emo)
                            
                            preds = audio_pipe("temp_emo.webm")
                            top = preds[0]
                            latest_voice = top['label']
                            await websocket.send_json({"type": "emotion_update", "modality": "speech", "emotion": latest_voice, "confidence": float(top['score']*100)})
                        except: pass

            # --- CHAT FINALIZE ---
            elif data["type"] == "finalize_turn":
                print("🛑 Finalize Command Received.")
                
                audio_buffer.seek(0)
                body_bytes = audio_buffer.getvalue()
                audio_buffer = io.BytesIO() # Reset
                
                print(f"   📂 Processing Body: {len(body_bytes)} bytes + Header: {'Yes' if webm_header else 'No'}")
                
                if len(body_bytes) > 0:
                    # PASS BOTH HEADER AND BODY
                    text = convert_and_transcribe(webm_header, body_bytes)
                    
                    if text:
                        print(f"   📝 Transcript: {text}")
                        await websocket.send_json({"type": "transcript", "text": text})
                        
                        stream = get_groq_stream(chat_history, text, latest_face, latest_voice)
                        full_reply = ""
                        
                        for chunk in stream:
                            c = chunk.choices[0].delta.content or ""
                            if c:
                                full_reply += c
                                await websocket.send_json({"type": "chat_token", "text": c})
                        
                        await websocket.send_json({"type": "chat_end"})
                        chat_history.append({"role": "user", "content": text})
                        chat_history.append({"role": "assistant", "content": full_reply})
                    else:
                        print("   ⚠️ Transcript Failed.")

    except WebSocketDisconnect:
        print("🔴 Client Disconnected")