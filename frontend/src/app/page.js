"use client";
import { useEffect, useState } from "react";
import { auth, db } from "../firebase"; // Ensure db is imported
import { useRouter } from "next/navigation";
import Sidebar from "../components/Sidebar"; // Keeping import for later
import MentexaInterface from "../components/MentexaInterface";
import { collection, query, orderBy, limit, getDocs, addDoc, serverTimestamp } from "firebase/firestore";

export default function MainPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentChatId, setCurrentChatId] = useState(null);
  const router = useRouter();

  // 1. Check Login Status
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (!u) {
        router.push("/login");
      } else {
        setUser(u);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  // 2. AUTO-SELECT CHAT (Replaces Sidebar Logic)
  useEffect(() => {
    const initChat = async () => {
        if (!user || currentChatId) return; // Stop if no user or already has chat

        try {
            // A. Try to find the most recent chat
            const chatsRef = collection(db, "users", user.uid, "chats");
            const q = query(chatsRef, orderBy("createdAt", "desc"), limit(1));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                // Found one! Open it.
                setCurrentChatId(querySnapshot.docs[0].id);
            } else {
                // No chats found? Create a brand new one automatically.
                const newChatRef = await addDoc(chatsRef, {
                    createdAt: serverTimestamp(),
                    title: "New Conversation",
                    messages: []
                });
                setCurrentChatId(newChatRef.id);
            }
        } catch (error) {
            console.error("Auto-chat error:", error);
        }
    };

    if (user) {
        initChat();
    }
  }, [user, currentChatId]);

  if (loading) return <div style={{ background: 'black', height: '100vh', color: 'white' }}>Loading...</div>;
  if (!user) return null;

  return (
    <div style={{ display: "flex", width: '100vw', height: '100vh', overflow: 'hidden' }}>
      
      {/* SIDEBAR COMMENTED OUT */}
      <Sidebar 
         user={user} 
         setCurrentChatId={setCurrentChatId} 
         currentChatId={currentChatId} 
      />
     
      
      {/* Main Interface takes full width now */}
      <div style={{ flex: 1, height: '100%' }}>
         {currentChatId ? (
            <MentexaInterface user={user} chatId={currentChatId} />
         ) : (
            <div style={{ height: '100%', background: '#111', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {/* Loading indicator while auto-select runs */}
                <h2>Initializing Mentexa...</h2> 
            </div>
         )}
      </div>
    </div>
  );
}