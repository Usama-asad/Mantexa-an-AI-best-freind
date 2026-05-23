"use client";
import { useEffect, useState } from "react";
import { db, auth } from "../firebase";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";

export default function Sidebar({ user, setCurrentChatId, currentChatId }) {
  const [chats, setChats] = useState([]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "users", user.uid, "chats"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snapshot) => {
      setChats(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
  }, [user]);

  const createNewChat = async () => {
    const docRef = await addDoc(collection(db, "users", user.uid, "chats"), {
      createdAt: serverTimestamp(),
      title: "New Conversation",
      messages: []
    });
    setCurrentChatId(docRef.id);
  };

  return (
    <div style={{ width: '250px', background: '#0a0a0a', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', height: '100vh', padding: '10px' }}>
        <button 
            onClick={createNewChat} 
            style={{ padding: '10px', background: '#333', color: 'white', border: 'none', borderRadius: '5px', marginBottom: '20px', cursor: 'pointer' }}
        >
            + New Chat
        </button>

        <div style={{ flex: 1, overflowY: 'auto' }}>
            {chats.map(chat => (
                <div 
                    key={chat.id}
                    onClick={() => setCurrentChatId(chat.id)}
                    style={{ 
                        padding: '10px', 
                        marginBottom: '5px',
                        cursor: 'pointer',
                        borderRadius: '5px',
                        color: 'white',
                        background: currentChatId === chat.id ? '#0070f3' : 'transparent'
                    }}
                >
                    {chat.title || "Untitled Chat"}
                </div>
            ))}
        </div>

        <button 
            onClick={() => auth.signOut()} 
            style={{ padding: '10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '5px', marginTop: '10px', cursor: 'pointer' }}
        >
            Sign Out
        </button>
    </div>
  );
}