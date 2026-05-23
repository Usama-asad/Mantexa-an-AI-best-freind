import os
import warnings

# --- FIX 1: FORCE PROTOBUF COMPATIBILITY ---
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"
warnings.filterwarnings("ignore")

import io
import json
import base64
import numpy as np
import cv2
import subprocess 
import asyncio 
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import google.generativeai as genai

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"
load_dotenv()
genai.configure(api_key=os.environ["GOOGLE_API_KEY"])

MODEL_NAME = "gemini-2.5-flash" 

SYSTEM_INSTRUCTION = """
You are Mentexa, an advanced, highly intelligent conversational AI. 
You can see the user's facial emotions and hear the emotion in their voice.
Respond naturally to what the user says. Acknowledge their emotions ONLY IF it is highly relevant to the conversation.
IMPORTANT: You must ONLY speak in English. Do not repeat the emotion tags back to the user.
Be concise, helpful, and human-like.
"""

model = genai.GenerativeModel(
    model_name=MODEL_NAME,
    system_instruction=SYSTEM_INSTRUCTION
)

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

deepface_ready = False
audio_pipe = None

@app.on_event("startup")
async def startup_event():
    global deepface_ready, audio_pipe
    print(" [1/3] Loading DeepFace...")
    try:
        from deepface import DeepFace
        dummy = np.zeros((224, 224, 3), dtype=np.uint8)
        await asyncio.to_thread(DeepFace.analyze, dummy, actions=['emotion'], detector_backend='opencv', enforce_detection=False, silent=True)
        deepface_ready = True
        print("   ✅ DeepFace Active.")
    except Exception as e: print(f"   ⚠️ Face Error: {e}")

    print(" [2/3] Loading Audio Emotion AI...")
    try:
        from transformers import pipeline
        audio_pipe = await asyncio.to_thread(pipeline, "audio-classification", model="superb/wav2vec2-base-superb-er")
        print("   ✅ Audio AI Active.")
    except Exception as e: print(f"   ⚠️ Audio Error: {e}")
    print("✨ READY.")

def safe_base64_decode(data):
    try:
        if not data or len(data) < 20: return None
        if ',' in data: data = data.split(',')[1]
        data = data.replace('\n', '').replace('\r', '').replace(' ', '')
        missing = len(data) % 4
        if missing: data += '=' * (4 - missing)
        return base64.b64decode(data)
    except: return None

def predict_emotion_sync(audio_bytes):
    try:
        with open("temp_emo.webm", "wb") as f: f.write(audio_bytes)
        preds = audio_pipe("temp_emo.webm")
        return preds[0]['label'], float(preds[0]['score']*100)
    except: return None, 0

def analyze_face_sync(img_bytes):
    try:
        from deepface import DeepFace
        frame = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
        res = DeepFace.analyze(frame, actions=['emotion'], detector_backend='opencv', enforce_detection=False, silent=True)
        if res: return res[0]['dominant_emotion'], float(res[0]['emotion'][res[0]['dominant_emotion']])
    except: pass
    return None, 0

def transcribe_with_gemini_sync(header_bytes, body_bytes):
    try:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        ffmpeg_path = os.path.join(current_dir, "ffmpeg.exe")
        input_file = os.path.join(current_dir, "raw_input.webm")
        output_file = os.path.join(current_dir, "clean_input.wav")
        if not os.path.exists(ffmpeg_path): return ""
        full_audio = (header_bytes + body_bytes) if header_bytes else body_bytes
        if len(full_audio) < 4000: return "" 
        with open(input_file, "wb") as f: f.write(full_audio)
        subprocess.run([ffmpeg_path, "-y", "-fflags", "+genpts+igndts", "-i", input_file, "-ar", "16000", output_file], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if not os.path.exists(output_file): return ""
        sample_file = genai.upload_file(path=output_file, display_name="User Audio")
        transcribe_model = genai.GenerativeModel(MODEL_NAME)
        response = transcribe_model.generate_content([sample_file, "Transcribe this audio exactly in English."])
        return response.text.strip()
    except Exception as e: return ""

async def get_gemini_chat_stream(history, user_text, face_em, voice_em):
    # CHANGED: Cleanly separate instructions so it doesn't echo the emotions
    full_prompt = f"[User's current state -> Face: {face_em}, Voice: {voice_em}]\nUser says: \"{user_text}\""

    gemini_history = []
    for msg in history:
        # Gemini expects "model", not "assistant"
        role = "user" if msg["role"] == "user" else "model"
        gemini_history.append({"role": role, "parts": [msg["content"]]})

    chat_session = model.start_chat(history=gemini_history)
    return await asyncio.to_thread(chat_session.send_message, full_prompt, stream=True)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    latest_face = "neutral"
    latest_voice = "neutral"
    audio_buffer = io.BytesIO()
    webm_header = None
    chat_history = []
    processing_face = False
    processing_audio = False
    
    try:
        while True:
            try: data = await websocket.receive_json()
            except RuntimeError: break

            if data["type"] == "video_frame" and deepface_ready:
                if not processing_face:
                    img_bytes = safe_base64_decode(data["data"])
                    if img_bytes:
                        processing_face = True
                        async def run_face_analysis(ib):
                            nonlocal latest_face, processing_face
                            try:
                                label, conf = await asyncio.to_thread(analyze_face_sync, ib)
                                if label:
                                    latest_face = label
                                    try: await websocket.send_json({"type": "emotion_update", "modality": "facial", "emotion": label, "confidence": conf})
                                    except: pass
                            finally: processing_face = False
                        asyncio.create_task(run_face_analysis(img_bytes))

            elif data["type"] == "audio_chunk":
                raw = safe_base64_decode(data["data"])
                if raw:
                    if webm_header is None: webm_header = raw
                    if data.get("is_recording_turn"): audio_buffer.write(raw)
                    if audio_pipe and not processing_audio and np.random.rand() > 0.3:
                        processing_audio = True
                        sample = webm_header + raw if webm_header else raw
                        async def run_audio_analysis(s):
                            nonlocal latest_voice, processing_audio
                            try:
                                label, conf = await asyncio.to_thread(predict_emotion_sync, s)
                                if label:
                                    latest_voice = label
                                    try: await websocket.send_json({"type": "emotion_update", "modality": "speech", "emotion": label, "confidence": conf})
                                    except: pass
                            finally: processing_audio = False
                        asyncio.create_task(run_audio_analysis(sample))

            elif data["type"] == "finalize_turn":
                audio_buffer.seek(0)
                body_bytes = audio_buffer.getvalue()
                audio_buffer.close()
                audio_buffer = io.BytesIO()
                
                if len(body_bytes) > 0:
                    text = await asyncio.to_thread(transcribe_with_gemini_sync, webm_header, body_bytes)
                    if text:
                        await websocket.send_json({"type": "transcript", "text": text})
                        stream = await get_gemini_chat_stream(chat_history, text, latest_face, latest_voice)
                        full_reply = ""
                        for chunk in stream:
                            c = chunk.text
                            if c:
                                full_reply += c
                                await websocket.send_json({"type": "chat_token", "text": c})
                        await websocket.send_json({"type": "chat_end"})
                        chat_history.append({"role": "user", "content": text})
                        # CHANGED: Must save as "model", not "assistant"
                        chat_history.append({"role": "model", "content": full_reply})

    except WebSocketDisconnect: pass