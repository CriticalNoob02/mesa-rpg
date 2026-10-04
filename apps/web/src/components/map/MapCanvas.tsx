"use client";

import type { CharacterView, EffectView, Me, SceneView, TokenView } from "@mesa/protocol";
import { type Cell, moveCost, squaresToMeters } from "@mesa/rules";
import type Konva from "konva";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  Group,
  Image as KImage,
  Label,
  Layer,
  Line,
  Rect,
  Shape,
  Stage,
  Tag,
  Text,
} from "react-konva";
import { useAsset } from "@/lib/assets";
import { brushCells, cellAt, initials, previewCost, reachBands, tokenMovement } from "./geometry";

export type MapTool = "move" | "ruler" | "reveal" | "hide";

type Props = {
  scene: SceneView;
  me: Me;
  characters: CharacterView[];
  effects: EffectView[];
  authToken: string;
  tool: MapTool;
  brush: number;
  selectedId: string | null;
  fitSignal: number;
  /** Zoom pelos botões (celular): `n` muda a cada clique. */
  zoom: { n: number; factor: number };
  /** Combatente da vez (anel dourado). */
  currentTokenId: string | null;
  /** Tokens com efeito ativo (marca roxa). */
  affected: Set<string>;
  onSelect: (id: string | null) => void;
  onMove: (id: string, to: Cell) => Promise<boolean>;
  onFog: (cells: number[], reveal: boolean) => void;
};

const BAND_FILL = {
  move: "rgba(134, 201, 143, 0.28)",
  double: "rgba(217, 164, 91, 0.22)",
  run: "rgba(228, 109, 97, 0.16)",
} as const;
const MIN_SCALE = 0.1;
const MAX_SCALE = 4;

export default function MapCanvas(props: Props) {
  const { scene, me, characters, tool, brush, selectedId, onSelect, onMove, onFog } = props;
  const gs = scene.gridSize;
  const worldW = scene.cols * gs;
  const worldH = scene.rows * gs;
  const isGm = me.role === "GM";

  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  // null até medir (o container pode nascer escondido, ex. aba Mapa no celular).
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const userMoved = useRef(false);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const { img, error: imgError } = useAsset(scene.assetId, props.authToken);

  // ---- tamanho do container
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e && e.contentRect.width > 0 && e.contentRect.height > 0) {
        setSize({ w: e.contentRect.width, h: e.contentRect.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- enquadrar a cena (troca de cena ou botão "centralizar")
  // Reserva o topo para a barra de ferramentas.
  const fitToScreen = useCallback(() => {
    if (!size) return;
    const top = 56;
    const h = size.h - top - 12;
    const scale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, Math.min((size.w - 24) / worldW, h / worldH)),
    );
    setView({ scale, x: (size.w - worldW * scale) / 2, y: top + (h - worldH * scale) / 2 });
  }, [size, worldW, worldH]);
  // Enquadra ao trocar de cena, no "centralizar" e ao redimensionar enquanto
  // a pessoa ainda não mexeu na visão.
  const fittedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!size) return;
    const key = `${scene.id}:${props.fitSignal}`;
    if (fittedFor.current !== key) {
      fittedFor.current = key;
      userMoved.current = false;
      fitToScreen();
    } else if (!userMoved.current) fitToScreen();
  }, [scene.id, props.fitSignal, fitToScreen, size]);

  // ---- zoom pelos botões, centrado na tela
  const lastZoom = useRef(props.zoom.n);
  useEffect(() => {
    if (!size || props.zoom.n === lastZoom.current) return;
    lastZoom.current = props.zoom.n;
    userMoved.current = true;
    setView((v) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * props.zoom.factor));
      const cx = size.w / 2;
      const cy = size.h / 2;
      return {
        scale,
        x: cx - ((cx - v.x) / v.scale) * scale,
        y: cy - ((cy - v.y) / v.scale) * scale,
      };
    });
  }, [props.zoom, size]);

  /** Ponto do ponteiro em coordenadas do mundo. */
  const pointerWorld = () => {
    const stage = stageRef.current;
    const p = stage?.getPointerPosition();
    if (!stage || !p) return null;
    return { x: (p.x - stage.x()) / stage.scaleX(), y: (p.y - stage.y()) / stage.scaleY() };
  };

  // ---- zoom na roda, centrado no ponteiro
  function onWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const p = stage?.getPointerPosition();
    if (!stage || !p) return;
    const old = stage.scaleX();
    const scale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, old * (e.evt.deltaY > 0 ? 1 / 1.1 : 1.1)),
    );
    const wx = (p.x - stage.x()) / old;
    const wy = (p.y - stage.y()) / old;
    userMoved.current = true;
    setView({ scale, x: p.x - wx * scale, y: p.y - wy * scale });
  }

  // ---- névoa: pinta localmente e envia ao soltar
  const [painting, setPainting] = useState<{ reveal: boolean; cells: Set<number> } | null>(null);
  const [hoverCell, setHoverCell] = useState<Cell | null>(null);
  const revealed = useMemo(() => {
    const set = new Set(scene.revealed);
    if (painting) for (const c of painting.cells) painting.reveal ? set.add(c) : set.delete(c);
    return set;
  }, [scene.revealed, painting]);

  // ---- régua
  const [ruler, setRuler] = useState<{ from: Cell; to: Cell } | null>(null);

  function onPointerDown(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const w = pointerWorld();
    if (!w) return;
    const cell = cellAt(w.x, w.y, scene);
    if (tool === "ruler") setRuler({ from: cell, to: cell });
    else if ((tool === "reveal" || tool === "hide") && isGm) {
      setPainting({ reveal: tool === "reveal", cells: new Set(brushCells(cell, brush, scene)) });
    } else if (tool === "move" && e.target === stageRef.current) onSelect(null);
  }

  function onPointerMove() {
    const w = pointerWorld();
    if (!w) return;
    const cell = cellAt(w.x, w.y, scene);
    setHoverCell((h) => (h && h.x === cell.x && h.y === cell.y ? h : cell));
    if (tool === "ruler" && ruler) setRuler({ ...ruler, to: cell });
    if (painting) {
      const add = brushCells(cell, brush, scene).filter((c) => !painting.cells.has(c));
      if (add.length) setPainting({ ...painting, cells: new Set([...painting.cells, ...add]) });
    }
  }

  function onPointerUp() {
    if (painting) {
      onFog([...painting.cells], painting.reveal);
      // Mantém a pintura até a cena atualizar, para não piscar.
      setTimeout(() => setPainting(null), 400);
    }
  }

  // ---- tokens
  const [drag, setDrag] = useState<{ id: string; cell: Cell } | null>(null);
  const dragging = drag ? scene.tokens.find((t) => t.id === drag.id) : undefined;
  const reach = useMemo(() => {
    const t = dragging ?? (selectedId ? scene.tokens.find((x) => x.id === selectedId) : undefined);
    if (!t || !(isGm || t.ownerId === me.id)) return [];
    const { speed, runMultiplier } = tokenMovement(t, characters, props.effects);
    return reachBands(t, speed, runMultiplier, scene);
  }, [dragging, selectedId, scene, characters, props.effects, isGm, me.id]);

  const canDrag = (t: TokenView) => tool === "move" && (isGm || t.ownerId === me.id);

  /** Célula mais próxima do canto superior esquerdo do token arrastado. */
  function cellOfNode(node: Konva.Node, t: TokenView): Cell {
    const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));
    return {
      x: clamp(Math.round(node.x() / gs), scene.cols - t.size),
      y: clamp(Math.round(node.y() / gs), scene.rows - t.size),
    };
  }

  async function onDragEnd(t: TokenView, node: Konva.Node) {
    const cell = cellOfNode(node, t);
    setDrag(null);
    node.position({ x: cell.x * gs, y: cell.y * gs });
    if (cell.x === t.x && cell.y === t.y) return;
    const ok = await onMove(t.id, cell);
    if (!ok) node.position({ x: t.x * gs, y: t.y * gs });
  }

  const showBrush = (tool === "reveal" || tool === "hide") && isGm && hoverCell;
  const brushRect = showBrush ? brushCells(hoverCell, brush, scene) : [];

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0"
      style={{ cursor: tool === "move" ? "grab" : "crosshair" }}
    >
      <Stage
        ref={stageRef}
        width={size?.w ?? 0}
        height={size?.h ?? 0}
        scaleX={view.scale}
        scaleY={view.scale}
        x={view.x}
        y={view.y}
        draggable={tool === "move"}
        onDragEnd={(e) => {
          if (e.target === stageRef.current) {
            userMoved.current = true;
            setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
          }
        }}
        onWheel={onWheel}
        onMouseDown={onPointerDown}
        onTouchStart={onPointerDown}
        onMouseMove={onPointerMove}
        onTouchMove={onPointerMove}
        onMouseUp={onPointerUp}
        onTouchEnd={onPointerUp}
        onMouseLeave={() => {
          setHoverCell(null);
          onPointerUp();
        }}
      >
        <Layer listening={false}>
          <Rect x={0} y={0} width={worldW} height={worldH} fill="#1b1814" />
          {img && (
            <Group clipX={0} clipY={0} clipWidth={worldW} clipHeight={worldH}>
              <KImage image={img} x={-scene.offsetX} y={-scene.offsetY} />
            </Group>
          )}
          <Shape
            sceneFunc={(ctx, shape) => {
              ctx.beginPath();
              for (let x = 0; x <= scene.cols; x++) {
                ctx.moveTo(x * gs, 0);
                ctx.lineTo(x * gs, worldH);
              }
              for (let y = 0; y <= scene.rows; y++) {
                ctx.moveTo(0, y * gs);
                ctx.lineTo(worldW, y * gs);
              }
              ctx.strokeShape(shape);
            }}
            stroke="rgba(255,255,255,0.14)"
            strokeWidth={1}
            strokeScaleEnabled={false}
          />
          {reach.length > 0 && (
            <Shape
              sceneFunc={(ctx) => {
                for (const c of reach) {
                  ctx.fillStyle = BAND_FILL[c.band];
                  ctx.fillRect(c.x * gs + 1, c.y * gs + 1, gs - 2, gs - 2);
                }
              }}
            />
          )}
          {scene.fogEnabled && (
            <Shape
              sceneFunc={(ctx) => {
                ctx.fillStyle = isGm ? "rgba(0,0,0,0.55)" : "#0b0a09";
                for (let y = 0; y < scene.rows; y++) {
                  for (let x = 0; x < scene.cols; x++) {
                    if (!revealed.has(y * scene.cols + x))
                      ctx.fillRect(x * gs, y * gs, gs + 0.5, gs + 0.5);
                  }
                }
              }}
            />
          )}
          {brushRect.length > 0 && (
            <Shape
              sceneFunc={(ctx) => {
                ctx.strokeStyle = tool === "reveal" ? "#86c98f" : "#e46d61";
                ctx.lineWidth = 2 / view.scale;
                for (const i of brushRect) {
                  ctx.strokeRect((i % scene.cols) * gs, Math.floor(i / scene.cols) * gs, gs, gs);
                }
              }}
            />
          )}
        </Layer>

        <Layer>
          {scene.tokens.map((t) => {
            const r = (t.size * gs) / 2;
            const selected = t.id === selectedId;
            return (
              <Group
                key={t.id}
                name="token"
                x={t.x * gs}
                y={t.y * gs}
                draggable={canDrag(t)}
                opacity={t.hidden ? 0.45 : 1}
                onMouseDown={(e) => {
                  if (tool === "move") {
                    e.cancelBubble = true;
                    onSelect(t.id);
                  }
                }}
                onTap={() => onSelect(t.id)}
                onDragStart={(e) => {
                  e.cancelBubble = true;
                  onSelect(t.id);
                  setDrag({ id: t.id, cell: { x: t.x, y: t.y } });
                }}
                onDragMove={(e) => {
                  e.cancelBubble = true;
                  const cell = cellOfNode(e.target, t);
                  setDrag((d) =>
                    d && (d.cell.x !== cell.x || d.cell.y !== cell.y) ? { id: t.id, cell } : d,
                  );
                }}
                onDragEnd={(e) => {
                  e.cancelBubble = true;
                  onDragEnd(t, e.target);
                }}
              >
                {t.id === props.currentTokenId && (
                  <Circle
                    x={r}
                    y={r}
                    radius={r * 0.98}
                    stroke="#d9a45b"
                    strokeWidth={4}
                    strokeScaleEnabled={false}
                    dash={[8, 5]}
                    listening={false}
                  />
                )}
                {props.affected.has(t.id) && (
                  <Circle
                    x={r * 1.62}
                    y={r * 0.38}
                    radius={Math.max(4, r * 0.16)}
                    fill="#bf9be6"
                    stroke="#15120f"
                    strokeWidth={1.5}
                    strokeScaleEnabled={false}
                    listening={false}
                  />
                )}
                <Circle
                  x={r}
                  y={r}
                  radius={r * 0.86}
                  fill={t.color}
                  stroke={selected ? "#f5e6c8" : "rgba(0,0,0,0.6)"}
                  strokeWidth={selected ? 4 : 2}
                  strokeScaleEnabled={false}
                  dash={t.hidden ? [6, 4] : undefined}
                  shadowColor="black"
                  shadowBlur={6}
                  shadowOpacity={0.5}
                />
                <Text
                  text={initials(t.name)}
                  width={r * 2}
                  height={r * 2}
                  align="center"
                  verticalAlign="middle"
                  fontSize={Math.max(10, r * 0.7)}
                  fontStyle="bold"
                  fill="#15120f"
                  listening={false}
                />
                <Text
                  text={t.name}
                  x={-gs}
                  y={r * 2 + 2}
                  width={r * 2 + gs * 2}
                  align="center"
                  fontSize={Math.max(9, gs * 0.2)}
                  fill="#ece3d3"
                  shadowColor="black"
                  shadowBlur={4}
                  shadowOpacity={0.9}
                  listening={false}
                />
              </Group>
            );
          })}
        </Layer>

        <Layer listening={false}>
          {dragging && drag && (
            <DragLabel
              gs={gs}
              cell={drag.cell}
              cost={previewCost(dragging, drag.cell)}
              spent={dragging.moveSpent}
            />
          )}
          {ruler && <Ruler gs={gs} from={ruler.from} to={ruler.to} scale={view.scale} />}
        </Layer>
      </Stage>
      {imgError && (
        <p className="absolute top-3 left-1/2 -translate-x-1/2 rounded bg-fumble/20 px-3 py-1 text-xs text-fumble">
          Não deu para carregar a imagem do mapa.
        </p>
      )}
    </div>
  );
}

function DragLabel({
  gs,
  cell,
  cost,
  spent,
}: {
  gs: number;
  cell: Cell;
  cost: number;
  spent: number;
}) {
  const text = `${cost} □ · ${squaresToMeters(cost).toLocaleString("pt-BR")} m${spent ? `  (rodada ${spent + cost} □)` : ""}`;
  return (
    <Label x={cell.x * gs + gs / 2} y={cell.y * gs - 4}>
      <Tag
        fill="#15120f"
        stroke="#d9a45b"
        cornerRadius={4}
        pointerDirection="down"
        pointerWidth={8}
        pointerHeight={6}
      />
      <Text text={text} fontSize={Math.max(11, gs * 0.22)} fill="#ece3d3" padding={5} />
    </Label>
  );
}

function Ruler({ gs, from, to, scale }: { gs: number; from: Cell; to: Cell; scale: number }) {
  const c = (v: number) => v * gs + gs / 2;
  const { squares } = moveCost(from, to);
  return (
    <>
      <Line
        points={[c(from.x), c(from.y), c(to.x), c(to.y)]}
        stroke="#d9a45b"
        strokeWidth={3 / scale}
        dash={[10 / scale, 6 / scale]}
      />
      <Circle x={c(from.x)} y={c(from.y)} radius={5 / scale} fill="#d9a45b" />
      <Label x={c(to.x)} y={c(to.y) - 8 / scale}>
        <Tag
          fill="#15120f"
          stroke="#d9a45b"
          cornerRadius={4}
          pointerDirection="down"
          pointerWidth={8 / scale}
          pointerHeight={6 / scale}
        />
        <Text
          text={`${squaresToMeters(squares).toLocaleString("pt-BR")} m · ${squares} □`}
          fontSize={13 / scale}
          fill="#ece3d3"
          padding={5 / scale}
        />
      </Label>
    </>
  );
}
