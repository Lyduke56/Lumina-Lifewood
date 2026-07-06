export function AuthVisual({ light = false }: { light?: boolean }) {
  const nodes = [
    { x: 60,  y: 80  }, { x: 220, y: 40  }, { x: 340, y: 140 },
    { x: 120, y: 220 }, { x: 300, y: 260 }, { x: 190, y: 340 },
    { x: 380, y: 60  }, { x: 40,  y: 300 }, { x: 260, y: 190 },
    { x: 150, y: 130 }, { x: 360, y: 320 },
  ];

  const edges = [
    [0, 1], [1, 2], [1, 3], [3, 4], [2, 4],
    [4, 5], [3, 5], [0, 3], [2, 6], [5, 7],
    [8, 2], [8, 4], [9, 0], [9, 3], [10, 4], [10, 5],
  ];

  const particles = [
    { x: 90,  delay: 0   }, { x: 200, delay: 3   }, { x: 310, delay: 6 },
    { x: 150, delay: 9   }, { x: 260, delay: 12  }, { x: 60,  delay: 15 },
  ];

  // On the light background, amber/cream read as low-contrast — switch to emerald tones
  const lineColor    = light ? "#046241" : "#FFB347";
  const nodeFill      = "#046241";
  const nodeStroke    = light ? "#A65A12" : "#FFB347";
  const packetColor   = light ? "#A65A12" : "#F5EEDB";
  const particleColor = light ? "#046241" : "#FFB347";
  const opacity        = light ? 0.45 : 0.9;

  return (
    <svg
      viewBox="0 0 420 400"
      style={{
        position: "absolute", inset: 0, width: "100%", height: "100%",
        opacity,
      }}
      preserveAspectRatio="xMidYMid slice"
    >
      {particles.map((p, i) => (
        <circle
          key={`p-${i}`}
          cx={p.x} cy={400} r={1.4}
          fill={particleColor}
          style={{
            animation: `llDrift ${14 + (i % 3) * 2}s linear infinite`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}

      <g style={{ animation: "llFloatSlow 7s ease-in-out infinite" }}>
        {edges.map(([a, b], i) => {
          const n1 = nodes[a];
          const n2 = nodes[b];
          const len = Math.hypot(n2.x - n1.x, n2.y - n1.y);
          return (
            <g key={i}>
              <line
                x1={n1.x} y1={n1.y} x2={n2.x} y2={n2.y}
                stroke={lineColor}
                strokeWidth={1}
                strokeDasharray={Math.max(len, 240)}
                strokeDashoffset={240}
                style={{
                  animation: `llLineDraw ${5 + (i % 4)}s ease-in-out infinite`,
                  animationDelay: `${i * 0.6}s`,
                }}
              />
              {i % 3 === 0 && (
                <circle r={2} fill={packetColor}>
                  <animateMotion
                    dur={`${4 + (i % 3)}s`}
                    repeatCount="indefinite"
                    begin={`${i * 0.5}s`}
                    path={`M${n1.x},${n1.y} L${n2.x},${n2.y}`}
                  />
                </circle>
              )}
            </g>
          );
        })}

        {nodes.map((n, i) => (
          <circle
            key={i}
            cx={n.x} cy={n.y} r={3}
            fill={nodeFill}
            stroke={nodeStroke}
            strokeWidth={0.75}
            style={{
              animation: `llNodePulse ${3 + (i % 3)}s ease-in-out infinite`,
              animationDelay: `${i * 0.4}s`,
            }}
          />
        ))}
      </g>
    </svg>
  );
}