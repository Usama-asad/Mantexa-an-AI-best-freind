import React, { Suspense } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, OrbitControls, Environment, Float, Html } from '@react-three/drei';

function Model({ isSpeaking }) {
  // Pulls your exact file
  const { scene } = useGLTF('/demo_avatar.glb'); 
  
  // This loop runs 60 times a second to animate the mouth
  useFrame((state) => {
    scene.traverse((child) => {
      // Look for any 3D mesh that has facial animation keys (Head, Teeth, Beard)
      if (child.isMesh && child.morphTargetDictionary) {
        
        // Ready Player Me uses 'viseme_O' or 'jawOpen' for talking
        const mouthIdx = child.morphTargetDictionary['viseme_O'] ?? 
                         child.morphTargetDictionary['jawOpen'];

        if (mouthIdx !== undefined) {
          if (isSpeaking) {
            // Creates a fast up-and-down wave to mimic speech syllables
            const talk = (Math.sin(state.clock.elapsedTime * 25) + 1) / 2; 
            // Apply it to the mouth (0.8 is how wide it opens)
            child.morphTargetInfluences[mouthIdx] = talk * 0.8; 
          } else {
            // Smoothly snap the mouth shut when he stops talking
            child.morphTargetInfluences[mouthIdx] = THREE.MathUtils.lerp(
               child.morphTargetInfluences[mouthIdx], 0, 0.2
            );
          }
        }
      }
    });
  });

  return <primitive object={scene} scale={2.2} position={[0, -2.2, 0]} />;
}

const Avatar = ({ isSpeaking }) => {
  return (
    <div style={{ width: '100%', height: '100%', background: '#1a1a1a' }}>
      <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
        <Suspense fallback={<Html center><h3 style={{color: '#0070f3'}}>Loading Avatar...</h3></Html>}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1.5} color="#0070f3" />
          <directionalLight position={[-10, -10, -5]} intensity={0.5} color="#2f2e41" />
          
          <Environment preset="city" />
          
          {/* The speed changes based on the speaking state! */}
          <Float 
            speed={isSpeaking ? 5 : 2} 
            rotationIntensity={isSpeaking ? 0.5 : 0.1} 
            floatIntensity={isSpeaking ? 1 : 0.3}
          >
            <Model isSpeaking={isSpeaking} />
          </Float>
          
          <OrbitControls enableZoom={false} enablePan={false} />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default Avatar;