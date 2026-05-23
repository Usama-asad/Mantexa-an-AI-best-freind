"use client";
import { useState } from "react";
import { auth, db } from "../../firebase"; // Import DB
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore"; // Import doc writing tools
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const router = useRouter();

  const handleAuth = async (e) => {
    e.preventDefault();
    try {
      if (isRegister) {
        // 1. Create Auth User
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 2. FORCE Create User Document in Database
        await setDoc(doc(db, "users", user.uid), {
            email: user.email,
            createdAt: new Date().toISOString()
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      router.push("/");
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div style={{ height: '100vh', background: '#000', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '300px' }}>
        <h1 style={{ textAlign: 'center' }}>Mentexa {isRegister ? "Register" : "Login"}</h1>
        <input 
            type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required 
            style={{ padding: '10px', borderRadius: '5px', border: '1px solid #333', background: '#111', color: 'white' }}
        />
        <input 
            type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required 
            style={{ padding: '10px', borderRadius: '5px', border: '1px solid #333', background: '#111', color: 'white' }}
        />
        <button type="submit" style={{ padding: '10px', background: '#0070f3', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
            {isRegister ? "Sign Up" : "Login"}
        </button>
        <p style={{ textAlign: 'center', cursor: 'pointer', color: '#888' }} onClick={() => setIsRegister(!isRegister)}>
            {isRegister ? "Already have an account? Login" : "No account? Create one"}
        </p>
      </form>
    </div>
  );
}