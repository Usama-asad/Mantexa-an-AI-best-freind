"use client";

import { useEffect, useRef, useState, Suspense } from 'react';
import { doc, updateDoc, arrayUnion, getDoc } from "firebase/firestore";
import { db } from "../firebase";

// --- NEW 3D IMPORTS ---
// import { Canvas } from '@react-three/fiber';
import { useGLTF, OrbitControls, Environment, Float, Html } from '@react-three/drei';

import React from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';

import { AvaturnSDK } from '@avaturn/sdk';

function Model({ isSpeaking, avatarUrl = '/demo_avatar.glb' }) {
  const { scene } = useGLTF(avatarUrl); 
  
  // 1. A tiny "brain" to track when he should blink without breaking React
  const blinkState = useRef({ isBlinking: false, timer: 0 });

  useFrame((state, delta) => {
    // --- BLINKING TIMER MATH ---
    blinkState.current.timer += delta; // Add the milliseconds that passed since last frame
    
    // If 3 to 6 seconds have passed, trigger a blink!
    if (blinkState.current.timer > 3 + Math.random() * 3) {
      blinkState.current.isBlinking = true;
      blinkState.current.timer = 0; // Reset the stopwatch
    }

    // --- IDLE HEAD MOVEMENT ---
    // Search the 3D skeleton for the Head bone 
    const headBone = scene.getObjectByName('Head') || 
                     scene.getObjectByName('mixamorigHead') || 
                     scene.getObjectByName('Wolf3D_Head');
                     
    if (headBone) {
      // Use a super slow, smooth wave to make him gently look left/right and up/down
      headBone.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.15; // Look Left/Right
      headBone.rotation.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.05; // Look Up/Down
    }

    // --- APPLY FACIAL ANIMATIONS ---
    scene.traverse((child) => {
      if (child.isMesh && child.morphTargetDictionary) {
        
        // 1. THE MOUTH (Procedural Natural Speech)
        const mouthIdx = child.morphTargetDictionary['viseme_O'] ?? child.morphTargetDictionary['jawOpen'];
        
        if (mouthIdx !== undefined) {
          if (isSpeaking) {
            const t = state.clock.elapsedTime;
            
            // Mix 3 different speeds to fake human speech patterns
            const syllableWave = Math.sin(t * 35); // Fast lip movements
            const wordWave = Math.sin(t * 12);     // Slower pacing for whole words
            const breathPause = Math.sin(t * 3);   // Occasional dips to simulate pauses between sentences
            
            // If the breath wave is positive, he is "talking"
            if (breathPause > -0.3) {
              // Combine the waves so the mouth opens to random, natural-looking widths
              const fakeViseme = (syllableWave * 0.3 + 0.7) * (wordWave * 0.4 + 0.6);
              child.morphTargetInfluences[mouthIdx] = fakeViseme * 0.75; 
            } else {
              // Snap the mouth shut for a split second to simulate a pause/breath
              child.morphTargetInfluences[mouthIdx] = THREE.MathUtils.lerp(
                child.morphTargetInfluences[mouthIdx], 0, 0.4
              );
            }
          } else {
            // Smoothly close the mouth when completely silent
            child.morphTargetInfluences[mouthIdx] = THREE.MathUtils.lerp(
              child.morphTargetInfluences[mouthIdx], 0, 0.2
            );
          }
        }

        // 2. THE EYES (New Blinking Logic)
        // Find the specific eye shapes (Handles Oculus, ARKit, and Mixamo naming conventions)
        const blinkL = child.morphTargetDictionary['eyeBlinkLeft'] ?? child.morphTargetDictionary['eyeBlink_L'] ?? child.morphTargetDictionary['blink'];
        const blinkR = child.morphTargetDictionary['eyeBlinkRight'] ?? child.morphTargetDictionary['eyeBlink_R'] ?? child.morphTargetDictionary['blink'];

        const blinkTarget = blinkState.current.isBlinking ? 1 : 0; // 1 = Eyes Closed, 0 = Eyes Open

        // Smoothly close or open the eyelids
        if (blinkL !== undefined) {
          child.morphTargetInfluences[blinkL] = THREE.MathUtils.lerp(child.morphTargetInfluences[blinkL], blinkTarget, 0.4);
        }
        if (blinkR !== undefined) {
          child.morphTargetInfluences[blinkR] = THREE.MathUtils.lerp(child.morphTargetInfluences[blinkR], blinkTarget, 0.4);
        }

        // If the eyelids are almost fully closed, tell the brain to open them back up
        if (blinkState.current.isBlinking && child.morphTargetInfluences[blinkL] > 0.8) {
           blinkState.current.isBlinking = false;
        }
      }
    });
  });

  return <primitive object={scene} scale={2.2} position={[0, -2.2, 0]} />;
}

const Avatar = ({ isSpeaking, avatarUrl = '/demo_avatar.glb' }) => {
  return (
    <div style={{ width: '100%', height: '100%', background: '#1a1a1a' }}>
      {/* // 1. Move the camera up (Y: 1.2) and closer (Z: 2.5), and tighten the lens (fov: 40) */}
      <Canvas camera={{ position: [0, 1.5, 2.5], fov: 40 }}>
        <Suspense fallback={<Html center><h3 style={{color: '#0070f3'}}>Loading Avatar...</h3></Html>}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1.5} color="#0070f3" />
          <directionalLight position={[-10, -10, -5]} intensity={0.5} color="#2f2e41" />
          
          <Environment preset="city" />
          
          <Float 
            speed={isSpeaking ? 5 : 2} 
            rotationIntensity={isSpeaking ? 0.5 : 0.1} 
            floatIntensity={isSpeaking ? 1 : 0.3}
          >
            <Model isSpeaking={isSpeaking} avatarUrl={avatarUrl} />
          </Float>
          
          {/* 2. Tell the OrbitControls to focus the rotation center on the face, not the feet */}
          <OrbitControls 
            enableZoom={false} 
            enablePan={false} 
            target={[0, 1.5, 0]} // <--- This points the camera directly at the head
          />
        </Suspense>
      </Canvas>
    </div>
  );
};

// export default Avatar;

export default function MentexaInterface({ user, chatId }) {
  const ws = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const videoInterval = useRef(null);
  const chatBoxRef = useRef(null);

  // --- REFS FOR STATE (The Fix for "Bleeding" data) ---
  const chatIdRef = useRef(chatId);
  const processingIdRef = useRef(null); // Prevents double-saves

  const [isActive, setIsActive] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [status, setStatus] = useState("Offline");
  const [mentexaSpeaking, setMentexaSpeaking] = useState(false);
  
  const [chat, setChat] = useState([]);
  const [emotions, setEmotions] = useState({ face: "...", voice: "..." });

  const talkingRef = useRef(false);
  const stoppingRef = useRef(false);

  const [avatarUrl, setAvatarUrl] = useState('/demo_avatar.glb'); // Defaults to the dummy
  const [showAvaturn, setShowAvaturn] = useState(false);
  const avaturnContainerRef = useRef(null);
  const sdkRef = useRef(null);

  // --- AVATURN INITIALIZATION LOGIC ---
  useEffect(() => {
    if (showAvaturn && avaturnContainerRef.current) {
      const initAvaturn = async () => {
        // Initialize the SDK inside our div container
        sdkRef.current = new AvaturnSDK();
        
        // REPLACE 'demo' WITH YOUR ACTUAL AVATURN SUBDOMAIN
        const subdomain = "mentexa"; 
        
        await sdkRef.current.init(avaturnContainerRef.current, {
          url: `https://${subdomain}.avaturn.dev`,
        });

        // Listen for when the user clicks "Next/Export" in Avaturn
        sdkRef.current.on('export', (data) => {
          console.log("Avatar Exported successfully!", data);
          
          // Avaturn returns a temporary URL to the .glb file
          // If you used dataURL export it's data.dataURL, if http it's data.url. Usually data.url works for web.
          const newModelUrl = data.url || data.dataURL; 
          
          setAvatarUrl(newModelUrl); // Update the 3D scene!
          setShowAvaturn(false);     // Close the modal
        });
      };

      initAvaturn();
    }
  }, [showAvaturn]);

  // Update the Ref whenever the Prop changes
  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

  // --- 1. LOAD HISTORY ---
  useEffect(() => {
    const loadChatHistory = async () => {
        setChat([]); // Clear screen instantly
        
        if (!user || !chatId) return;

        try {
            const docRef = doc(db, "users", user.uid, "chats", chatId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.messages && Array.isArray(data.messages)) {
                    setChat(data.messages);
                } else {
                    setChat([{ role: "system", text: "Welcome to Mentexa." }]);
                }
            }
        } catch (error) {
            console.error("Error loading chat:", error);
        }
    };
    loadChatHistory();
  }, [chatId, user]);

  // --- FIREBASE SAVE ---
  const saveToFirebase = async (role, text) => {
    const currentId = chatIdRef.current;
    if (!user || !currentId) return;

    const messageId = `${currentId}-${text.length}-${Date.now()}`;
    if (processingIdRef.current === messageId) return; // Block double save
    processingIdRef.current = messageId;

    try {
        const chatRef = doc(db, "users", user.uid, "chats", currentId);
        await updateDoc(chatRef, {
            messages: arrayUnion({ role, text: text, timestamp: new Date().toISOString() })
        });
    } catch (e) { console.error("Save Error", e); }
  };

  const speakText = (text) => {
    if (!text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0; 
    utterance.pitch = 1.0; 
    utterance.onstart = () => setMentexaSpeaking(true);
    utterance.onend = () => setMentexaSpeaking(false);
    utterance.onerror = () => setMentexaSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  // --- WEBSOCKET CONNECTION ---
  useEffect(() => {
    if (ws.current) ws.current.close();

    ws.current = new WebSocket("ws://localhost:8000/ws");
    
    ws.current.onopen = () => setStatus("Connected (Ready)");
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
        saveToFirebase("user", msg.text);
      }
      else if (msg.type === "chat_token") {
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
        setChat(prev => {
           const updatedChat = [...prev];
           const lastMsg = updatedChat[updatedChat.length - 1];
           
           if (lastMsg && lastMsg.role === "mentexa") {
               lastMsg.isStreaming = false;
               speakText(lastMsg.text); 
               saveToFirebase("mentexa", lastMsg.text);
           }
           return updatedChat;
        });
      }
    };

    return () => {
        if(ws.current) ws.current.close();
    };
  }, [user]); 

  // Auto-scroll
  useEffect(() => {
    if (chatBoxRef.current) {
        chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [chat]);

  // --- MEDIA FUNCTIONS ---
  const startSession = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
         videoRef.current.play();
         videoInterval.current = setInterval(sendVideoFrame, 500); 
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
                ws.current.send(JSON.stringify({ type: "audio_chunk", data: base64, is_recording_turn: isRecording }));
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

  const styles = {
    container: { fontFamily: 'system-ui, sans-serif', height: '100vh', display: 'flex', flexDirection: 'column', background: '#111', color: 'white' },
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

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={{margin: 0, color: 'white'}}>Mentexa AI</h1>
        <span style={styles.statusBadge}>{status}</span>
      </header>
      <div style={styles.grid}>
        <div style={styles.leftPanel}>
          {/* AVATAR WRAPPER: Removed fixed height to let Canvas scale better, or keep it depending on layout */}
          <div style={{ ...styles.videoWrapper, height: '250px', border: mentexaSpeaking ? '2px solid #0070f3' : '1px solid #333' }}>
             <Avatar isSpeaking={mentexaSpeaking} avatarUrl={avatarUrl} />
          </div>
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
             <button 
                  onClick={() => setShowAvaturn(true)} 
                  style={{ padding: '10px', background: '#6c63ff', color: 'white', borderRadius: '8px', cursor: 'pointer', border: 'none', marginTop: '10px' }}
                >
                  Create Custom Persona
                </button>
          </div>
        </div>
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
      {/* --- AVATURN MODAL OVERLAY --- */}
      {showAvaturn && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ width: '90%', height: '90%', backgroundColor: 'white', borderRadius: '15px', overflow: 'hidden', position: 'relative' }}>

            {/* Close Button */}
            <button
              onClick={() => setShowAvaturn(false)}
              style={{ position: 'absolute', top: 10, right: 10, zIndex: 10000, padding: '10px 20px', background: 'red', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
            >
              Cancel
            </button>

            {/* Avaturn SDK injects the iframe exactly into this div! */}
            <div ref={avaturnContainerRef} style={{ width: '100%', height: '100%' }}></div>
          </div>
        </div>
      )}
    </div>
  );
}