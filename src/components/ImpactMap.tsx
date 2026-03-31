import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';

type ImpactMapProps = {
  encounters: number;
  messages: number;
  hearts: number;
  radianceScore: number;
  height?: number;
};

type MapNode = {
  id: string;
  x: number;
  y: number;
  radius: number;
  opacity: number;
};

type MapEdge = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  opacity: number;
  width: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createSeededRandom(seed: number) {
  let state = seed % 2147483647;
  if (state <= 0) {
    state += 2147483646;
  }

  return () => {
    state = (state * 48271) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

export function ImpactMap({
  encounters,
  messages,
  hearts,
  radianceScore,
  height = 220,
}: ImpactMapProps) {
  const viewBoxWidth = 320;
  const viewBoxHeight = height;

  const safeEncounters = Math.max(0, Math.floor(encounters));
  const safeMessages = Math.max(0, Math.floor(messages));
  const safeHearts = Math.max(0, Math.floor(hearts));
  const safeRadiance = Math.max(0, Math.floor(radianceScore));

  const centerX = viewBoxWidth / 2;
  const centerY = viewBoxHeight / 2;

  const { nodes, edges } = React.useMemo(() => {
    const seed =
      safeEncounters * 73856093 +
      safeMessages * 19349663 +
      safeHearts * 83492791 +
      safeRadiance * 2654435761;

    const random = createSeededRandom(Math.abs(seed));
    const nodeCount = clamp(6 + Math.floor(safeEncounters / 2), 6, 18);
    const ringRadius = 60 + Math.min(55, safeMessages * 2);
    const spread = 30 + Math.min(45, safeEncounters * 1.4);

    const nextNodes: MapNode[] = [];
    for (let index = 0; index < nodeCount; index += 1) {
      const angle = (index / nodeCount) * Math.PI * 2 + random() * 0.45;
      const drift = (random() - 0.5) * spread;
      const radialX = centerX + Math.cos(angle) * (ringRadius + drift);
      const radialY = centerY + Math.sin(angle) * (ringRadius * 0.62 + drift * 0.3);

      nextNodes.push({
        id: `node-${index}`,
        x: clamp(radialX, 18, viewBoxWidth - 18),
        y: clamp(radialY, 16, viewBoxHeight - 16),
        radius: 2.4 + random() * 2.4 + Math.min(1.8, safeHearts / 80),
        opacity: 0.32 + random() * 0.45 + Math.min(0.15, safeRadiance / 2000),
      });
    }

    const connectionOpacity = clamp(0.2 + safeEncounters / 130 + safeHearts / 250, 0.2, 0.78);
    const nextEdges: MapEdge[] = nextNodes.map((node, index) => ({
      id: `center-${node.id}`,
      x1: centerX,
      y1: centerY,
      x2: node.x,
      y2: node.y,
      opacity: clamp(connectionOpacity - index * 0.015, 0.18, 0.76),
      width: 0.8 + Math.min(1.8, safeRadiance / 1000),
    }));

    for (let index = 1; index < nextNodes.length; index += 2) {
      const previous = nextNodes[index - 1];
      const current = nextNodes[index];
      nextEdges.push({
        id: `arc-${index}`,
        x1: previous.x,
        y1: previous.y,
        x2: current.x,
        y2: current.y,
        opacity: clamp(0.14 + safeMessages / 120, 0.14, 0.4),
        width: 0.7,
      });
    }

    return {
      nodes: nextNodes,
      edges: nextEdges,
    };
  }, [
    centerX,
    centerY,
    safeEncounters,
    safeHearts,
    safeMessages,
    safeRadiance,
    viewBoxHeight,
    viewBoxWidth,
  ]);

  return (
    <View className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <View className="flex-row items-center justify-between">
        <Text className="text-lg font-semibold text-slate-900 dark:text-slate-50">Impact Map</Text>
        <Text className="text-xs uppercase tracking-wider text-emerald-300">Private Graph</Text>
      </View>

      <Text className="mt-2 text-slate-700 dark:text-slate-200">
        This constellation is generated from encounter counts only, never precise location traces.
      </Text>

      <View className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
        <Svg width="100%" height={viewBoxHeight} viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}>
          <Defs>
            <SvgLinearGradient id="impactMapCoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#6ee7b7" stopOpacity="0.95" />
              <Stop offset="100%" stopColor="#10b981" stopOpacity="0.95" />
            </SvgLinearGradient>
            <SvgLinearGradient id="impactMapNodeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#bbf7d0" stopOpacity="0.9" />
              <Stop offset="100%" stopColor="#34d399" stopOpacity="0.85" />
            </SvgLinearGradient>
          </Defs>

          <Circle cx={centerX} cy={centerY} r={78} fill="none" stroke="#334155" strokeOpacity={0.35} />
          <Circle cx={centerX} cy={centerY} r={52} fill="none" stroke="#334155" strokeOpacity={0.24} />

          {edges.map((edge) => (
            <Line
              key={edge.id}
              x1={edge.x1}
              y1={edge.y1}
              x2={edge.x2}
              y2={edge.y2}
              stroke="#6ee7b7"
              strokeOpacity={edge.opacity}
              strokeWidth={edge.width}
            />
          ))}

          {nodes.map((node) => (
            <Circle
              key={node.id}
              cx={node.x}
              cy={node.y}
              r={node.radius}
              fill="url(#impactMapNodeGradient)"
              fillOpacity={node.opacity}
            />
          ))}

          <Circle cx={centerX} cy={centerY} r={10} fill="url(#impactMapCoreGradient)" />
          <Circle
            cx={centerX}
            cy={centerY}
            r={18 + Math.min(18, safeRadiance / 60)}
            fill="none"
            stroke="#6ee7b7"
            strokeOpacity={0.24}
            strokeWidth={1.4}
          />
        </Svg>
      </View>

      <View className="mt-4 flex-row">
        <View className="mr-2 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-950">
          <Text className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-300">Nodes</Text>
          <Text className="mt-1 text-xl font-black text-slate-900 dark:text-slate-50">{nodes.length}</Text>
        </View>
        <View className="mx-2 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-950">
          <Text className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-300">Links</Text>
          <Text className="mt-1 text-xl font-black text-slate-900 dark:text-slate-50">{edges.length}</Text>
        </View>
        <View className="ml-2 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-950">
          <Text className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-300">Hearts</Text>
          <Text className="mt-1 text-xl font-black text-slate-900 dark:text-slate-50">{safeHearts}</Text>
        </View>
      </View>
    </View>
  );
}
