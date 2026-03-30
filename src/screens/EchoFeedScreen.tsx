import React, { Suspense } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Canvas } from '@react-three/fiber/native';
import { OrbitControls } from '@react-three/drei/core/OrbitControls';
import { useTexture } from '@react-three/drei/core/Texture';
import { Inbox } from 'lucide-react-native';

type EchoFeedScreenProps = {
  onOpenInbox?: () => void;
  unreadCount?: number;
};

type EchoMessage = {
  id: string;
  content: string;
  senderId: string;
  auraColor: string;
};

const BOARD_WIDTH = 8.8;
const BOARD_HEIGHT = 5.8;
const NOTE_WIDTH = 1.28;
const NOTE_HEIGHT = 1.05;

const MOCK_MESSAGES: EchoMessage[] = [
  {
    id: 'echo-1',
    content: 'Today I chose stillness over noise and it changed everything about my mood.',
    senderId: 'LUME-H7N2',
    auraColor: '#fde68a',
  },
  {
    id: 'echo-2',
    content: 'Sharing this for whoever needs it: progress can be quiet and still be real.',
    senderId: 'LUME-C4L9',
    auraColor: '#93c5fd',
  },
  {
    id: 'echo-3',
    content: 'I am rebuilding my energy one gentle decision at a time.',
    senderId: 'LUME-X8M1',
    auraColor: '#f9a8d4',
  },
  {
    id: 'echo-4',
    content: 'Pause, breathe, unclench your shoulders. This is your reminder.',
    senderId: 'LUME-Q2P5',
    auraColor: '#86efac',
  },
  {
    id: 'echo-5',
    content: 'There is something powerful about small acts of kindness done consistently.',
    senderId: 'LUME-T5R7',
    auraColor: '#fdba74',
  },
  {
    id: 'echo-6',
    content: 'You are not behind. You are unfolding in your own timing.',
    senderId: 'LUME-B3K6',
    auraColor: '#a5b4fc',
  },
];

type PositionedNote = {
  message: EchoMessage;
  position: [number, number, number];
  rotationZ: number;
};

type SceneErrorBoundaryProps = {
  children: React.ReactNode;
  fallback: React.ReactNode;
};

type SceneErrorBoundaryState = {
  hasError: boolean;
};

class SceneErrorBoundary extends React.Component<SceneErrorBoundaryProps, SceneErrorBoundaryState> {
  state: SceneErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    // Keep Echoes screen alive even if the 3D scene throws at runtime.
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

function seededValue(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }

  const normalized = Math.sin(hash) * 10000;
  return normalized - Math.floor(normalized);
}

function BulletinBoard() {
  const corkTexture = useTexture('https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=1024');

  React.useMemo(() => {
    corkTexture.wrapS = 1000;
    corkTexture.wrapT = 1000;
    corkTexture.repeat.set(2.8, 2);
    corkTexture.anisotropy = 8;
  }, [corkTexture]);

  return (
    <mesh position={[0, 0, 0]}>
      <planeGeometry args={[BOARD_WIDTH, BOARD_HEIGHT]} />
      <meshStandardMaterial map={corkTexture} roughness={0.98} metalness={0.04} />
    </mesh>
  );
}

type PinnedNoteProps = {
  note: PositionedNote;
  onSelectMessage: (message: EchoMessage) => void;
};

function PinnedNote({ note, onSelectMessage }: PinnedNoteProps) {
  return (
    <group position={note.position} rotation={[0, 0, note.rotationZ]}>
      <mesh position={[0.03, -0.04, -0.02]}>
        <planeGeometry args={[NOTE_WIDTH, NOTE_HEIGHT]} />
        <meshStandardMaterial color="#020617" transparent opacity={0.28} roughness={1} />
      </mesh>

      <mesh
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelectMessage(note.message);
        }}
      >
        <planeGeometry args={[NOTE_WIDTH, NOTE_HEIGHT, 12, 12]} />
        <meshStandardMaterial color={note.message.auraColor} roughness={0.9} metalness={0.02} />
      </mesh>

      <mesh position={[0, NOTE_HEIGHT * 0.45, 0.01]}>
        <cylinderGeometry args={[0.045, 0.045, 0.03, 24]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.2} metalness={0.2} />
      </mesh>
    </group>
  );
}

type BoardSceneProps = {
  notes: PositionedNote[];
  onSelectMessage: (message: EchoMessage) => void;
};

function BoardScene({ notes, onSelectMessage }: BoardSceneProps) {
  return (
    <>
      <ambientLight intensity={0.78} />

      <spotLight
        position={[1.8, 2.7, 5.2]}
        intensity={1.25}
        angle={0.5}
        penumbra={0.6}
        distance={16}
        decay={1.2}
      />

      <pointLight position={[-2.4, -2.2, 4.5]} intensity={0.28} />

      <group position={[0, 0, -0.4]}>
        <BulletinBoard />

        {notes.map((note) => (
          <PinnedNote key={note.message.id} note={note} onSelectMessage={onSelectMessage} />
        ))}
      </group>

      <OrbitControls
        makeDefault
        enablePan
        enableRotate
        enableZoom
        target={[0, 0, -0.4]}
        minDistance={5.4}
        maxDistance={7.5}
        minPolarAngle={Math.PI / 2.2}
        maxPolarAngle={Math.PI / 1.7}
        minAzimuthAngle={-0.45}
        maxAzimuthAngle={0.45}
        rotateSpeed={0.55}
        zoomSpeed={0.65}
        panSpeed={0.6}
      />
    </>
  );
}

function BoardFallback() {
  return (
    <View className="flex-1 items-center justify-center bg-slate-950">
      <ActivityIndicator size="large" color="#34d399" />
      <Text className="mt-3 text-slate-300">Loading bulletin board...</Text>
    </View>
  );
}

export function EchoFeedScreen({ onOpenInbox, unreadCount = 0 }: EchoFeedScreenProps) {
  const [selectedMessage, setSelectedMessage] = React.useState<EchoMessage | null>(null);

  const positionedNotes = React.useMemo(() => {
    const halfWidth = BOARD_WIDTH / 2 - NOTE_WIDTH / 2 - 0.3;
    const halfHeight = BOARD_HEIGHT / 2 - NOTE_HEIGHT / 2 - 0.3;

    return MOCK_MESSAGES.map((message) => {
      const randomX = seededValue(`${message.id}-x`);
      const randomY = seededValue(`${message.id}-y`);
      const randomR = seededValue(`${message.id}-r`);

      const x = -halfWidth + randomX * (halfWidth * 2);
      const y = -halfHeight + randomY * (halfHeight * 2);
      const z = 0.05;
      const rotationZ = (randomR - 0.5) * 0.42;

      return {
        message,
        position: [x, y, z] as [number, number, number],
        rotationZ,
      };
    });
  }, []);

  const closeReader = React.useCallback(() => {
    setSelectedMessage(null);
  }, []);

  const sparkMessage = React.useCallback(() => {
    if (!selectedMessage) return;

    Alert.alert('Spark sent', `You sparked ${selectedMessage.senderId}.`);
    setSelectedMessage(null);
  }, [selectedMessage]);

  return (
    <View className="flex-1 bg-slate-950">
      <SceneErrorBoundary fallback={<BoardFallback />}>
        <Suspense fallback={<BoardFallback />}>
          <Canvas
            style={styles.canvas}
            camera={{
              position: [0, 0, 6.3],
              fov: 46,
              near: 0.1,
              far: 100,
            }}
          >
            <BoardScene notes={positionedNotes} onSelectMessage={setSelectedMessage} />
          </Canvas>
        </Suspense>
      </SceneErrorBoundary>

      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View className="px-4 pt-10">
          <View className="flex-row items-start justify-between">
            <View className="max-w-[72%]">
              <Text className="text-3xl font-black text-white">Echoes Board</Text>
              <Text className="mt-1 text-slate-300">Move around the board and tap a note to read the full echo.</Text>
            </View>

            {unreadCount > 0 ? (
              <Pressable
                onPress={onOpenInbox}
                className="rounded-full border border-emerald-300/30 bg-slate-900/90 px-3 py-1.5"
                style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
              >
                <View className="flex-row items-center">
                  <Inbox size={13} color="#a7f3d0" />
                  <Text className="ml-1 text-xs font-semibold text-emerald-100">{unreadCount}</Text>
                </View>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View pointerEvents="none" className="absolute bottom-5 left-4 right-4 rounded-2xl border border-slate-800 bg-slate-900/90 px-4 py-3">
          <Text className="text-xs text-slate-300">Drag to orbit, pinch to zoom slightly, and tap a note to open it.</Text>
        </View>
      </View>

      <Modal visible={Boolean(selectedMessage)} transparent animationType="fade" onRequestClose={closeReader}>
        <View className="flex-1 items-center justify-center bg-black/80 px-6">
          <View className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold uppercase tracking-widest text-slate-400">Echo Reader</Text>
              <Text className="text-xs font-semibold text-slate-500">{selectedMessage?.senderId}</Text>
            </View>

            <Text className="mt-4 text-lg leading-8 text-slate-200">{selectedMessage?.content}</Text>

            <View className="mt-6 flex-row">
              <Pressable
                className="mr-2 flex-1 rounded-xl bg-slate-800 py-3"
                onPress={closeReader}
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
              >
                <Text className="text-center font-semibold text-slate-200">Close</Text>
              </Pressable>

              <Pressable
                className="ml-2 flex-1 rounded-xl bg-emerald-400 py-3"
                onPress={sparkMessage}
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
              >
                <Text className="text-center font-bold text-slate-950">Spark ✦</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    ...StyleSheet.absoluteFillObject,
  },
});
