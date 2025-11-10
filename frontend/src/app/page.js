"use client";

import { useEffect, useRef, useState } from 'react';

export default function HomePage() {
  const ws = useRef(null);
  const videoRef = useRef(null); // Reference for the video element
  const [message, setMessage] = useState('');
  const [chatLog, setChatLog] = useState([]);
  const [isCapturing, setIsCapturing] = useState(false); // State to manage capture status

  useEffect(() => {
    if (typeof window !== 'undefined') {
      ws.current = new WebSocket("ws://localhost:8000/ws");

      ws.current.onopen = () => {
        console.log("WebSocket connected!");
        setChatLog(prev => [...prev, { sender: "System", text: "Connected to Mentexa Backend!" }]);
      };

      ws.current.onmessage = (event) => {
        console.log("Message from server:", event.data);
        setChatLog(prev => [...prev, { sender: "Mentexa", text: event.data }]);
      };

      ws.current.onclose = () => {
        console.log("WebSocket disconnected.");
        setChatLog(prev => [...prev, { sender: "System", text: "Disconnected from Mentexa Backend." }]);
      };

      ws.current.onerror = (error) => {
        console.error("WebSocket error:", error);
        setChatLog(prev => [...prev, { sender: "System", text: `WebSocket error: ${error.message}` }]);
      };
    }

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []);

  // --- Media Capture Functions ---
  const startCapture = async () => {
    if (isCapturing) return; // Prevent starting multiple times

    try {
      // Request access to webcam and microphone
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      videoRef.current.srcObject = stream; // Display the stream in the video element
      setIsCapturing(true);
      setChatLog(prev => [...prev, { sender: "System", text: "Webcam and Mic started!" }]);

      // For MVP, we're just verifying capture. Actual streaming to backend comes in Week 2.
      // In Week 2, you'll add code here to send video frames and audio chunks via WS.

    } catch (err) {
      console.error("Error accessing media devices:", err);
      setChatLog(prev => [...prev, { sender: "System", text: `Failed to start media: ${err.message}` }]);
      setIsCapturing(false);
    }
  };

  const stopCapture = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      // Stop all tracks in the stream
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsCapturing(false);
      setChatLog(prev => [...prev, { sender: "System", text: "Webcam and Mic stopped." }]);
    }
  };

  const sendMessage = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && message.trim()) {
      ws.current.send(message);
      setChatLog(prev => [...prev, { sender: "You", text: message }]);
      setMessage('');
    } else {
      console.warn("WebSocket is not open or message is empty.");
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: 'auto', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ textAlign: 'center' }}>Mentexa AI Study Friend</h1>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted // Mute local video to prevent echo
          width="320"
          height="240"
          style={{ border: '1px solid #ccc', backgroundColor: 'black' }}
        ></video>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
        <button
          onClick={startCapture}
          disabled={isCapturing}
          style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', cursor: 'pointer' }}
        >
          Start Webcam & Mic
        </button>
        <button
          onClick={stopCapture}
          disabled={!isCapturing}
          style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', cursor: 'pointer' }}
        >
          Stop Webcam & Mic
        </button>
      </div>

      <div style={{ border: '1px solid #ccc', height: '300px', overflowY: 'scroll', padding: '10px', marginBottom: '10px', backgroundColor: '#f9f9f9' }}>
        {chatLog.map((entry, index) => (
          <p key={index} style={{ margin: '5px 0', textAlign: entry.sender === 'You' ? 'right' : 'left' }}>
            <strong style={{ color: entry.sender === 'You' ? 'blue' : (entry.sender === 'Mentexa' ? 'green' : 'gray') }}>{entry.sender}:</strong> {entry.text}
          </p>
        ))}
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder="Type your message..."
        rows="3"
        style={{ width: 'calc(100% - 22px)', padding: '10px', marginBottom: '10px', resize: 'vertical', border: '1px solid #ccc' }}
      />
      <button
        onClick={sendMessage}
        style={{ padding: '10px 20px', backgroundColor: '#0070f3', color: 'white', border: 'none', cursor: 'pointer' }}
      >
        Send Message
      </button>
    </div>
  );
}