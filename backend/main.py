from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json # Needed for json.dumps later if we send complex objects

app = FastAPI()

# Configure CORS (Cross-Origin Resource Sharing)
# This is CRUCIAL to allow your Next.js frontend (running on a different port/origin)
# to communicate with your FastAPI backend.
origins = [
    "http://localhost:3000",  # Your Next.js app's default address
    "http://127.0.0.1:3000",
    # Add your deployed frontend URL here when you deploy
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],    # Allow all HTTP methods
    allow_headers=["*"],    # Allow all headers
)

@app.get("/")
async def read_root():
    return {"message": "Welcome to Mentexa Backend!"}

# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("WebSocket connected from client.")
    try:
        while True:
            # Receive text data from the WebSocket
            data = await websocket.receive_text()
            print(f"Received message from client: {data}")

            # Send a simple echo back to the client
            await websocket.send_text(f"Server received: {data}")

    except WebSocketDisconnect:
        print("WebSocket disconnected.")
    except Exception as e:
        print(f"WebSocket error: {e}")