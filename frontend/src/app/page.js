"use client";

import { useEffect, useRef, useState } from 'react';

// --- SIMPLE AVATAR COMPONENT ---
// This SVG face changes based on the "isSpeaking" prop
const Avatar = ({ isSpeaking, emotion }) => {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#1a1a1a' }}>
      <svg width="200" height="200" viewBox="0 0 200 200">
        {/* Head */}
        <rect x="50" y="40" width="100" height="120" rx="20" fill="#0070f3" />
        
        {/* Eyes (Blink animation could be added here) */}
        <circle cx="75" cy="80" r="10" fill="white" />
        <circle cx="125" cy="80" r="10" fill="white" />
        
        {/* Mouth (The Lip Sync Magic) */}
        {isSpeaking ? (
          // Animated Mouth (Open/Close Loop)
          <g>
            <rect x="70" y="120" width="60" height="20" rx="5" fill="white">
              <animate attributeName="height" values="5;20;5" dur="0.2s" repeatCount="indefinite" />
              <animate attributeName="y" values="127;120;127" dur="0.2s" repeatCount="indefinite" />
            </rect>
          </g>
        ) : (
          // Static Smile
          <path d="M 70 120 Q 100 140 130 120" stroke="white" strokeWidth="5" fill="none" />
        )}
        
        {/* Antennas */}
        <line x1="100" y1="40" x2="100" y2="10" stroke="#0070f3" strokeWidth="5" />
        <circle cx="100" cy="10" r="5" fill="red" opacity={isSpeaking ? 1 : 0.5}>
             {isSpeaking && <animate attributeName="opacity" values="1;0.2;1" dur="0.5s" repeatCount="indefinite" />}
        </circle>
      </svg>
    </div>
  );
};

export default function MentexaPage() {
  const ws = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const videoInterval = useRef(null);
  const chatBoxRef = useRef(null);

  // State
  const [isActive, setIsActive] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [status, setStatus] = useState("Offline");
  const [mentexaSpeaking, setMentexaSpeaking] = useState(false); // Controls Avatar
  
  const [chat, setChat] = useState([{ role: "system", text: "Welcome to Mentexa." }]);
  const [emotions, setEmotions] = useState({ face: "...", voice: "..." });

  const talkingRef = useRef(false);
  const stoppingRef = useRef(false);

  // --- TTS FUNCTION ---
  const speakText = (text) => {
    if (!text) return;
    
    // Stop any previous speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Configure Voice (Optional: Select a specific voice if desired)
    // const voices = window.speechSynthesis.getVoices();
    // utterance.voice = voices[0]; // defaults to system voice

    utterance.rate = 1.0; // Speed
    utterance.pitch = 1.0; // Pitch

    // SYNC AVATAR TO VOICE
    utterance.onstart = () => setMentexaSpeaking(true);
    utterance.onend = () => setMentexaSpeaking(false);
    utterance.onerror = () => setMentexaSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  // 1. WebSocket Setup
  useEffect(() => {
    ws.current = new WebSocket("ws://localhost:8000/ws");
    
    ws.current.onopen = () => setStatus("Connected (Idle)");
    ws.current.onclose = () => setStatus("Disconnected");
    
    ws.current.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      
      if (msg.type === "emotion_update") {
        setEmotions(prev => ({
          ...prev, 
          [msg.modality === "facial" ? "face" : "voice"]: `${msg.emotion} (${msg.confidence.toFixed(0)}%)`
        }));
      }
      else if (msg.type === "transcript") {
        setChat(prev => [...prev, { role: "user", text: msg.text }]);
      }
      else if (msg.type === "chat_token") {
        // Stream text to UI
        setChat(prev => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg.role === "mentexa" && lastMsg.isStreaming) {
            const updatedChat = [...prev];
            updatedChat[updatedChat.length - 1] = {
              ...lastMsg,
              text: lastMsg.text + msg.text
            };
            return updatedChat;
          } else {
            return [...prev, { role: "mentexa", text: msg.text, isStreaming: true }];
          }
        });
      }
      else if (msg.type === "chat_end") {
        // 1. Finalize UI
        setChat(prev => {
           const updatedChat = [...prev];
           const lastMsg = updatedChat[updatedChat.length - 1];
           
           // 2. TRIGGER SPEECH HERE
           if (lastMsg && lastMsg.role === "mentexa") {
               lastMsg.isStreaming = false;
               speakText(lastMsg.text); // <--- MENTEXA SPEAKS!
           }
           return updatedChat;
        });
      }
    };

    return () => ws.current?.close();
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (chatBoxRef.current) {
        chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [chat]);

  // 2. Start / Stop Session
  const startSession = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
         videoRef.current.play();
         videoInterval.current = setInterval(sendVideoFrame, 200);
      };

      const recorder = new MediaRecorder(stream); 
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = async (e) => {
        const isRecording = talkingRef.current;
        const isStopping = stoppingRef.current;

        if (e.data && e.data.size > 0 && ws.current?.readyState === 1) {
            const buffer = await e.data.arrayBuffer();
            let binary = '';
            const bytes = new Uint8Array(buffer);
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            const base64 = window.btoa(binary);

            if (base64.length > 100) {
                ws.current.send(JSON.stringify({ 
                    type: "audio_chunk", 
                    data: base64, 
                    is_recording_turn: isRecording 
                }));

                if (isStopping) {
                    ws.current.send(JSON.stringify({ type: "finalize_turn" }));
                    stoppingRef.current = false;
                    talkingRef.current = false;
                }
            }
        }
      };

      recorder.start(1000); 
      setIsActive(true);
      setStatus("Session Active");
    } catch (err) { alert("Error: " + err.message); }
  };

  const stopSession = () => {
    if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
    }
    if (videoInterval.current) clearInterval(videoInterval.current);
    if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
    setIsActive(false);
    setStatus("Connected (Idle)");
    setEmotions({ face: "...", voice: "..." });
  };

  const sendVideoFrame = () => {
    if (!videoRef.current || !canvasRef.current || ws.current?.readyState !== 1) return;
    const ctx = canvasRef.current.getContext('2d');
    canvasRef.current.width = 160;
    canvasRef.current.height = 120;
    ctx.drawImage(videoRef.current, 0, 0, 160, 120);
    const data = canvasRef.current.toDataURL('image/jpeg', 0.6);
    ws.current.send(JSON.stringify({ type: "video_frame", data }));
  };

  const handleTalkStart = () => {
    // If Mentexa is speaking, interrupt her
    if (mentexaSpeaking) window.speechSynthesis.cancel();
    
    talkingRef.current = true;
    stoppingRef.current = false;
    setIsTalking(true);
  };
  
  const handleTalkEnd = () => {
    stoppingRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.requestData();
    }
    setIsTalking(false);
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={{margin: 0, color: 'white'}}>Mentexa AI</h1>
        <span style={styles.statusBadge}>{status}</span>
      </header>
      
      <div style={styles.grid}>
        {/* Left Panel: Camera + Avatar */}
        <div style={styles.leftPanel}>
          
          {/* 1. MENTEXA AVATAR */}
          <div style={{ ...styles.videoWrapper, height: '200px', border: mentexaSpeaking ? '2px solid #0070f3' : '1px solid #333' }}>
             <Avatar isSpeaking={mentexaSpeaking} />
          </div>

          {/* 2. USER CAMERA */}
          <div style={styles.videoWrapper}>
            <video ref={videoRef} autoPlay muted style={styles.video} />
            <div style={styles.overlay}>
               <p>🙂 {emotions.face}</p>
               <p>🗣️ {emotions.voice}</p>
            </div>
          </div>
          
          <div style={styles.controls}>
             {!isActive ? (
               <button onClick={startSession} style={styles.startBtn}>Start Session</button>
             ) : (
               <button onClick={stopSession} style={styles.stopBtn}>Stop Session</button>
             )}
          </div>
        </div>
        
        {/* Right Panel: Chat */}
        <div style={styles.rightPanel}>
            <div ref={chatBoxRef} style={styles.chatBox}>
                {chat.map((msg, i) => (
                    <div key={i} style={{
                        ...styles.bubble,
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        background: msg.role === 'user' ? '#0070f3' : '#ffffff',
                        color: msg.role === 'user' ? '#fff' : '#000',
                    }}>
                        <strong>{msg.role === 'user' ? 'You' : 'Mentexa'}:</strong> {msg.text}
                    </div>
                ))}
            </div>

            <div style={styles.inputArea}>
                <button 
                    disabled={!isActive}
                    onMouseDown={handleTalkStart} onMouseUp={handleTalkEnd}
                    onTouchStart={handleTalkStart} onTouchEnd={handleTalkEnd}
                    style={{
                        ...styles.talkBtn,
                        background: !isActive ? '#333' : (isTalking ? '#ff4d4f' : '#0070f3')
                    }}
                >
                    {isTalking ? "Release to Send" : (isActive ? "Hold to Talk" : "Start Session First")}
                </button>
            </div>
        </div>
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}

// Dark Mode Styles
const styles = {
    container: { maxWidth: '1000px', margin: '0 auto', fontFamily: 'system-ui, sans-serif', height: '100vh', display: 'flex', flexDirection: 'column', background: '#111', color: 'white' },
    header: { padding: '20px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    statusBadge: { fontSize: '12px', background: '#333', color: '#fff', padding: '5px 10px', borderRadius: '12px' },
    grid: { display: 'flex', flex: 1, overflow: 'hidden' },
    leftPanel: { width: '300px', padding: '20px', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', gap: '20px' },
    rightPanel: { flex: 1, display: 'flex', flexDirection: 'column', background: '#000' },
    videoWrapper: { width: '100%', height: '160px', background: '#000', borderRadius: '12px', overflow: 'hidden', position: 'relative', border: '1px solid #333' },
    video: { width: '100%', height: '100%', objectFit: 'cover' },
    overlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px', background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: '14px' },
    controls: { display: 'flex', flexDirection: 'column', gap: '10px' },
    startBtn: { padding: '15px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' },
    stopBtn: { padding: '15px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' },
    chatBox: { flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' },
    bubble: { maxWidth: '80%', padding: '12px 16px', borderRadius: '18px', lineHeight: '1.5', fontSize: '15px' },
    inputArea: { padding: '20px', borderTop: '1px solid #333' },
    talkBtn: { width: '100%', padding: '20px', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', transition: 'background 0.2s' }
};