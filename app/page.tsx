"use client";

import {
  ArrowRight,
  Camera,
  ChevronRight,
  CircleDot,
  Crosshair,
  Download,
  FileJson,
  ImagePlus,
  MapPin,
  Move,
  Minus,
  Plus,
  Radio,
  Redo2,
  RotateCcw,
  Slash,
  Square,
  Circle,
  Trash2,
  Type,
  Upload,
  UserRound,
  Users,
  Undo2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";

type MarkerType = "point" | "member";
type ShapeType = "line" | "arrow" | "rect" | "ellipse";
type ToolType = MarkerType | ShapeType | "text" | "move";

type Marker = {
  id: string;
  type: MarkerType;
  x: number;
  y: number;
  name: string;
  notes: string;
  team: string;
  color: string;
  fontSize?: number;
};

type Shape = {
  id: string;
  type: ShapeType;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  strokeWidth: number;
};

type TextBox = {
  id: string;
  x: number;
  y: number;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  outlineColor: string;
  outlineWidth: number;
};

type SavedBoard = {
  version: 1;
  boardMode?: "image" | "blank";
  mapName: string;
  mapImage: string;
  markers: Marker[];
  shapes?: Shape[];
  texts?: TextBox[];
};

type SceneSnapshot = {
  markers: Marker[];
  shapes: Shape[];
  texts: TextBox[];
};

const STORAGE_KEY = "team-map-recorder-v1";
const COLORS = ["#4ade80", "#38bdf8", "#fbbf24", "#fb7185", "#c084fc", "#f8fafc"];
const TEXT_COLORS = ["#ffffff", "#4ade80", "#38bdf8", "#fbbf24", "#fb7185", "#c084fc", "#111827"];
const FONT_OPTIONS = [
  { label: "系統黑體", value: '"Microsoft JhengHei", system-ui, sans-serif' },
  { label: "明體", value: 'PMingLiU, "Noto Serif TC", serif' },
  { label: "圓體", value: '"Arial Rounded MT Bold", "Microsoft JhengHei", sans-serif' },
  { label: "等寬字", value: 'Consolas, "Courier New", monospace' },
  { label: "手寫風格", value: 'cursive' },
];
const SHAPE_LABELS: Record<ShapeType, string> = {
  line: "直線",
  arrow: "箭頭",
  rect: "矩形",
  ellipse: "圓形",
};
const TOOL_SHORTCUTS: Record<string, { tool: ToolType; label: string }> = {
  p: { tool: "point", label: "一般標點" },
  m: { tool: "member", label: "隊員位置" },
  t: { tool: "text", label: "文字方塊" },
  v: { tool: "move", label: "移動畫布" },
  l: { tool: "line", label: "直線" },
  a: { tool: "arrow", label: "箭頭" },
  r: { tool: "rect", label: "矩形" },
  o: { tool: "ellipse", label: "圓形" },
};

function ShapeTypeIcon({ type, className }: { type: ShapeType; className: string }) {
  if (type === "line") return <Slash className={className} />;
  if (type === "arrow") return <ArrowRight className={className} />;
  if (type === "rect") return <Square className={className} />;
  return <Circle className={className} />;
}

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function saveFile(content: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [mapImage, setMapImage] = useState("");
  const [boardMode, setBoardMode] = useState<"" | "image" | "blank">("");
  const [mapName, setMapName] = useState("");
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [texts, setTexts] = useState<TextBox[]>([]);
  const [draftShape, setDraftShape] = useState<Shape | null>(null);
  const [tool, setTool] = useState<ToolType>("point");
  const [selectedMarkerIds, setSelectedMarkerIds] = useState<string[]>([]);
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
  const [selectedTextIds, setSelectedTextIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [imageNatural, setImageNatural] = useState({ width: 0, height: 0 });
  const [baseSize, setBaseSize] = useState({ width: 0, height: 0 });
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState("所有資料只保存在這台裝置");
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });

  const imageInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const pointerRef = useRef({ x: 0, y: 0, moved: 0 });
  const historyPastRef = useRef<SceneSnapshot[]>([]);
  const historyFutureRef = useRef<SceneSnapshot[]>([]);
  const gestureRef = useRef<{
    mode: "idle" | "pan" | "draw" | "selection";
    markerIds?: string[];
    shapeIds?: string[];
    originalMarkers?: Marker[];
    originalShapes?: Shape[];
    textIds?: string[];
    originalTexts?: TextBox[];
    historySnapshot?: SceneSnapshot;
    startClientX?: number;
    startClientY?: number;
  }>({ mode: "idle" });

  const selectionCount = selectedMarkerIds.length + selectedShapeIds.length + selectedTextIds.length;
  const objectCount = markers.length + shapes.length + texts.length;
  const selectedMarker = selectionCount === 1
    ? markers.find((marker) => marker.id === selectedMarkerIds[0]) ?? null
    : null;
  const selectedShape = selectionCount === 1
    ? shapes.find((shape) => shape.id === selectedShapeIds[0]) ?? null
    : null;
  const selectedText = selectionCount === 1
    ? texts.find((textBox) => textBox.id === selectedTextIds[0]) ?? null
    : null;
  const isBoard = boardMode !== "";

  const snapshotScene = useCallback((): SceneSnapshot => ({
    markers: markers.map((marker) => ({ ...marker })),
    shapes: shapes.map((shape) => ({ ...shape })),
    texts: texts.map((textBox) => ({ ...textBox })),
  }), [markers, shapes, texts]);

  const syncHistoryState = useCallback(() => {
    setHistoryState({
      canUndo: historyPastRef.current.length > 0,
      canRedo: historyFutureRef.current.length > 0,
    });
  }, []);

  const recordHistory = useCallback((snapshot?: SceneSnapshot) => {
    historyPastRef.current.push(snapshot ?? snapshotScene());
    if (historyPastRef.current.length > 80) historyPastRef.current.shift();
    historyFutureRef.current = [];
    syncHistoryState();
  }, [snapshotScene, syncHistoryState]);

  const resetHistory = useCallback(() => {
    historyPastRef.current = [];
    historyFutureRef.current = [];
    syncHistoryState();
  }, [syncHistoryState]);

  const undo = useCallback(() => {
    const previous = historyPastRef.current.pop();
    if (!previous) return;
    historyFutureRef.current.push(snapshotScene());
    setMarkers(previous.markers.map((marker) => ({ ...marker })));
    setShapes(previous.shapes.map((shape) => ({ ...shape })));
    setTexts(previous.texts.map((textBox) => ({ ...textBox })));
    setSelectedMarkerIds([]);
    setSelectedShapeIds([]);
    setSelectedTextIds([]);
    setStatus("已回到上一步");
    syncHistoryState();
  }, [snapshotScene, syncHistoryState]);

  const redo = useCallback(() => {
    const next = historyFutureRef.current.pop();
    if (!next) return;
    historyPastRef.current.push(snapshotScene());
    setMarkers(next.markers.map((marker) => ({ ...marker })));
    setShapes(next.shapes.map((shape) => ({ ...shape })));
    setTexts(next.texts.map((textBox) => ({ ...textBox })));
    setSelectedMarkerIds([]);
    setSelectedShapeIds([]);
    setSelectedTextIds([]);
    setStatus("已前進到下一步");
    syncHistoryState();
  }, [snapshotScene, syncHistoryState]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const board = JSON.parse(stored) as SavedBoard;
        if (board.version === 1) {
          setMapImage(board.mapImage || "");
          setBoardMode(board.boardMode || (board.mapImage ? "image" : ""));
          setMapName(board.mapName || "");
          setMarkers(Array.isArray(board.markers) ? board.markers : []);
          setShapes(Array.isArray(board.shapes) ? board.shapes : []);
          setTexts(Array.isArray(board.texts) ? board.texts : []);
          if (board.boardMode === "blank") setImageNatural({ width: 1600, height: 1000 });
        }
      }
    } catch {
      setStatus("無法讀取先前的紀錄");
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const board: SavedBoard = { version: 1, boardMode: boardMode || undefined, mapName, mapImage, markers, shapes, texts };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
    } catch {
      setStatus("圖片太大，無法自動保存；請先匯出紀錄檔備份");
    }
  }, [hydrated, boardMode, mapImage, mapName, markers, shapes, texts]);

  const fitMap = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || !imageNatural.width || !imageNatural.height) return;
    const maxWidth = Math.max(260, viewport.clientWidth - 48);
    const maxHeight = Math.max(320, viewport.clientHeight - 48);
    const ratio = Math.min(maxWidth / imageNatural.width, maxHeight / imageNatural.height);
    setBaseSize({ width: imageNatural.width * ratio, height: imageNatural.height * ratio });
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [imageNatural]);

  useEffect(() => {
    fitMap();
    window.addEventListener("resize", fitMap);
    return () => window.removeEventListener("resize", fitMap);
  }, [fitMap]);

  const loadImageFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("請選擇 JPG 或 PNG 圖片");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setMapImage(String(reader.result));
      setBoardMode("image");
      setMapName(file.name);
      setMarkers([]);
      setShapes([]);
      setTexts([]);
      setSelectedMarkerIds([]);
      setSelectedShapeIds([]);
      setSelectedTextIds([]);
      resetHistory();
      setStatus(`已載入 ${file.name}`);
    };
    reader.onerror = () => setStatus("圖片讀取失敗，請再試一次");
    reader.readAsDataURL(file);
  };

  const createBlankBoard = () => {
    setBoardMode("blank");
    setMapImage("");
    setMapName("空白戰術版面");
    setImageNatural({ width: 1600, height: 1000 });
    setMarkers([]);
    setShapes([]);
    setTexts([]);
    setSelectedMarkerIds([]);
    setSelectedShapeIds([]);
    setSelectedTextIds([]);
    resetHistory();
    setStatus("已建立 1600 × 1000 空白版面");
  };

  const pointOnMap = (clientX: number, clientY: number) => {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
      inside: clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom,
    };
  };

  const selectMarker = (id: string, additive = false) => {
    if (!additive) {
      setSelectedMarkerIds([id]);
      setSelectedShapeIds([]);
      setSelectedTextIds([]);
      return;
    }
    setSelectedMarkerIds((current) => current.includes(id)
      ? current.filter((selected) => selected !== id)
      : [...current, id]);
  };

  const selectShape = (id: string, additive = false) => {
    if (!additive) {
      setSelectedShapeIds([id]);
      setSelectedMarkerIds([]);
      setSelectedTextIds([]);
      return;
    }
    setSelectedShapeIds((current) => current.includes(id)
      ? current.filter((selected) => selected !== id)
      : [...current, id]);
  };

  const selectText = (id: string, additive = false) => {
    if (!additive) {
      setSelectedTextIds([id]);
      setSelectedMarkerIds([]);
      setSelectedShapeIds([]);
      return;
    }
    setSelectedTextIds((current) => current.includes(id)
      ? current.filter((selected) => selected !== id)
      : [...current, id]);
  };

  const clearSelection = () => {
    setSelectedMarkerIds([]);
    setSelectedShapeIds([]);
    setSelectedTextIds([]);
  };

  const selectAllObjects = useCallback(() => {
    if (!markers.length && !shapes.length && !texts.length) return;
    setSelectedMarkerIds(markers.map((marker) => marker.id));
    setSelectedShapeIds(shapes.map((shape) => shape.id));
    setSelectedTextIds(texts.map((textBox) => textBox.id));
    setStatus(`已全選 ${markers.length + shapes.length + texts.length} 個物件`);
  }, [markers, shapes, texts]);

  const addMarker = (clientX: number, clientY: number) => {
    if (tool !== "point" && tool !== "member" && tool !== "text") return;
    const point = pointOnMap(clientX, clientY);
    if (!point?.inside) return;
    const { x, y } = point;
    if (tool === "text") {
      const textBox: TextBox = {
        id: makeId(),
        x,
        y,
        text: "文字",
        fontFamily: FONT_OPTIONS[0].value,
        fontSize: 28,
        fontWeight: 600,
        color: "#ffffff",
        outlineColor: "#07110d",
        outlineWidth: 2,
      };
      recordHistory();
      setTexts((current) => [...current, textBox]);
      setSelectedTextIds([textBox.id]);
      setSelectedMarkerIds([]);
      setSelectedShapeIds([]);
      setStatus("已新增文字方塊");
      return;
    }
    const typeCount = markers.filter((marker) => marker.type === tool).length + 1;
    const marker: Marker = {
      id: makeId(),
      type: tool,
      x,
      y,
      name: tool === "member" ? `隊員 ${typeCount}` : `標點 ${typeCount}`,
      notes: "",
      team: tool === "member" ? "A 隊" : "",
      color: tool === "member" ? COLORS[1] : COLORS[0],
      fontSize: 10,
    };
    recordHistory();
    setMarkers((current) => [...current, marker]);
    setSelectedMarkerIds([marker.id]);
    setSelectedShapeIds([]);
    setSelectedTextIds([]);
    setStatus(tool === "member" ? "已放置隊員位置" : "已新增一般標點");
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!isBoard || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = { x: event.clientX, y: event.clientY, moved: 0 };
    if (tool === "line" || tool === "arrow" || tool === "rect" || tool === "ellipse") {
      const point = pointOnMap(event.clientX, event.clientY);
      if (!point?.inside) return;
      const draft: Shape = { id: makeId(), type: tool, x1: point.x, y1: point.y, x2: point.x, y2: point.y, color: COLORS[0], strokeWidth: 4 };
      setDraftShape(draft);
      gestureRef.current = { mode: "draw" };
    } else {
      gestureRef.current = { mode: "pan" };
    }
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const dx = event.clientX - pointerRef.current.x;
    const dy = event.clientY - pointerRef.current.y;
    pointerRef.current.x = event.clientX;
    pointerRef.current.y = event.clientY;
    pointerRef.current.moved += Math.abs(dx) + Math.abs(dy);
    if (gestureRef.current.mode === "draw") {
      const point = pointOnMap(event.clientX, event.clientY);
      if (point) setDraftShape((current) => current ? { ...current, x2: point.x, y2: point.y } : null);
    } else if (gestureRef.current.mode === "selection") {
      const rect = mapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const gesture = gestureRef.current;
      const originalMarkers = gesture.originalMarkers ?? [];
      const originalShapes = gesture.originalShapes ?? [];
      const originalTexts = gesture.originalTexts ?? [];
      const allX = [
        ...originalMarkers.map((marker) => marker.x),
        ...originalShapes.flatMap((shape) => [shape.x1, shape.x2]),
        ...originalTexts.map((textBox) => textBox.x),
      ];
      const allY = [
        ...originalMarkers.map((marker) => marker.y),
        ...originalShapes.flatMap((shape) => [shape.y1, shape.y2]),
        ...originalTexts.map((textBox) => textBox.y),
      ];
      const rawDeltaX = (event.clientX - (gesture.startClientX ?? event.clientX)) / rect.width;
      const rawDeltaY = (event.clientY - (gesture.startClientY ?? event.clientY)) / rect.height;
      const deltaX = allX.length
        ? Math.min(1 - Math.max(...allX), Math.max(-Math.min(...allX), rawDeltaX))
        : 0;
      const deltaY = allY.length
        ? Math.min(1 - Math.max(...allY), Math.max(-Math.min(...allY), rawDeltaY))
        : 0;
      const markerIds = new Set(gesture.markerIds ?? []);
      const shapeIds = new Set(gesture.shapeIds ?? []);
      const textIds = new Set(gesture.textIds ?? []);
      const originalMarkerMap = new Map(originalMarkers.map((marker) => [marker.id, marker]));
      const originalShapeMap = new Map(originalShapes.map((shape) => [shape.id, shape]));
      const originalTextMap = new Map(originalTexts.map((textBox) => [textBox.id, textBox]));
      setMarkers((current) => current.map((marker) => {
        if (!markerIds.has(marker.id)) return marker;
        const original = originalMarkerMap.get(marker.id);
        return original ? { ...marker, x: original.x + deltaX, y: original.y + deltaY } : marker;
      }));
      setShapes((current) => current.map((shape) => {
        if (!shapeIds.has(shape.id)) return shape;
        const original = originalShapeMap.get(shape.id);
        return original ? {
          ...shape,
          x1: original.x1 + deltaX,
          y1: original.y1 + deltaY,
          x2: original.x2 + deltaX,
          y2: original.y2 + deltaY,
        } : shape;
      }));
      setTexts((current) => current.map((textBox) => {
        if (!textIds.has(textBox.id)) return textBox;
        const original = originalTextMap.get(textBox.id);
        return original ? { ...textBox, x: original.x + deltaX, y: original.y + deltaY } : textBox;
      }));
    } else if (gestureRef.current.mode === "pan" && pointerRef.current.moved > 5) {
      setPan((current) => ({ x: current.x + dx, y: current.y + dy }));
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    if (gestureRef.current.mode === "draw" && draftShape) {
      if (Math.abs(draftShape.x2 - draftShape.x1) + Math.abs(draftShape.y2 - draftShape.y1) > 0.015) {
        recordHistory();
        setShapes((current) => [...current, draftShape]);
        setSelectedShapeIds([draftShape.id]);
        setSelectedMarkerIds([]);
        setSelectedTextIds([]);
        setStatus("已新增圖形，可拖曳移動或調整顏色");
      }
      setDraftShape(null);
    } else if (gestureRef.current.mode === "pan" && pointerRef.current.moved <= 5) {
      addMarker(event.clientX, event.clientY);
    } else if (gestureRef.current.mode === "selection" && pointerRef.current.moved > 5) {
      if (gestureRef.current.historySnapshot) recordHistory(gestureRef.current.historySnapshot);
      setStatus(selectionCount > 1 ? `已移動 ${selectionCount} 個物件` : "已更新物件位置");
    }
    gestureRef.current = { mode: "idle" };
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!isBoard) return;
    event.preventDefault();
    setZoom((current) => Math.min(4, Math.max(0.4, current * (event.deltaY > 0 ? 0.9 : 1.1))));
  };

  const onShapePointerDown = (event: PointerEvent<SVGElement>, shape: Shape) => {
    event.stopPropagation();
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    if (additive) {
      selectShape(shape.id, true);
      setStatus("已更新多選項目；拖曳任一已選物件即可整組移動");
      return;
    }
    const shapeIds = selectedShapeIds.includes(shape.id) ? selectedShapeIds : [shape.id];
    const markerIds = selectedShapeIds.includes(shape.id) ? selectedMarkerIds : [];
    const textIds = selectedShapeIds.includes(shape.id) ? selectedTextIds : [];
    if (!selectedShapeIds.includes(shape.id)) selectShape(shape.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = { x: event.clientX, y: event.clientY, moved: 0 };
    gestureRef.current = {
      mode: "selection",
      markerIds,
      shapeIds,
      textIds,
      originalMarkers: markers.filter((marker) => markerIds.includes(marker.id)),
      originalShapes: shapes.filter((item) => shapeIds.includes(item.id)),
      originalTexts: texts.filter((textBox) => textIds.includes(textBox.id)),
      historySnapshot: snapshotScene(),
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
    setDragging(true);
  };

  const onMarkerPointerDown = (event: PointerEvent<HTMLButtonElement>, marker: Marker) => {
    event.stopPropagation();
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    if (additive) {
      selectMarker(marker.id, true);
      setStatus("已更新多選項目；拖曳任一已選物件即可整組移動");
      return;
    }
    const markerIds = selectedMarkerIds.includes(marker.id) ? selectedMarkerIds : [marker.id];
    const shapeIds = selectedMarkerIds.includes(marker.id) ? selectedShapeIds : [];
    const textIds = selectedMarkerIds.includes(marker.id) ? selectedTextIds : [];
    if (!selectedMarkerIds.includes(marker.id)) selectMarker(marker.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = { x: event.clientX, y: event.clientY, moved: 0 };
    gestureRef.current = {
      mode: "selection",
      markerIds,
      shapeIds,
      textIds,
      originalMarkers: markers.filter((item) => markerIds.includes(item.id)),
      originalShapes: shapes.filter((shape) => shapeIds.includes(shape.id)),
      originalTexts: texts.filter((textBox) => textIds.includes(textBox.id)),
      historySnapshot: snapshotScene(),
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
    setDragging(true);
  };

  const onTextPointerDown = (event: PointerEvent<HTMLButtonElement>, textBox: TextBox) => {
    event.stopPropagation();
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    if (additive) {
      selectText(textBox.id, true);
      setStatus("已更新多選項目；拖曳任一已選物件即可整組移動");
      return;
    }
    const textIds = selectedTextIds.includes(textBox.id) ? selectedTextIds : [textBox.id];
    const markerIds = selectedTextIds.includes(textBox.id) ? selectedMarkerIds : [];
    const shapeIds = selectedTextIds.includes(textBox.id) ? selectedShapeIds : [];
    if (!selectedTextIds.includes(textBox.id)) selectText(textBox.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = { x: event.clientX, y: event.clientY, moved: 0 };
    gestureRef.current = {
      mode: "selection",
      markerIds,
      shapeIds,
      textIds,
      originalMarkers: markers.filter((marker) => markerIds.includes(marker.id)),
      originalShapes: shapes.filter((shape) => shapeIds.includes(shape.id)),
      originalTexts: texts.filter((item) => textIds.includes(item.id)),
      historySnapshot: snapshotScene(),
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
    setDragging(true);
  };

  const updateSelectedShape = (patch: Partial<Shape>) => {
    if (!selectedShape) return;
    recordHistory();
    setShapes((current) => current.map((shape) => shape.id === selectedShape.id ? { ...shape, ...patch } : shape));
  };

  const removeShape = (id: string) => {
    recordHistory();
    setShapes((current) => current.filter((shape) => shape.id !== id));
    setSelectedShapeIds((current) => current.filter((selected) => selected !== id));
    setStatus("已刪除圖形");
  };

  const updateSelected = (patch: Partial<Marker>) => {
    if (!selectedMarker) return;
    recordHistory();
    setMarkers((current) => current.map((marker) => marker.id === selectedMarker.id ? { ...marker, ...patch } : marker));
  };

  const removeMarker = (id: string) => {
    recordHistory();
    setMarkers((current) => current.filter((marker) => marker.id !== id));
    setSelectedMarkerIds((current) => current.filter((selected) => selected !== id));
    setStatus("已刪除標記");
  };

  const updateSelectedText = (patch: Partial<TextBox>) => {
    if (!selectedText) return;
    recordHistory();
    setTexts((current) => current.map((textBox) => textBox.id === selectedText.id ? { ...textBox, ...patch } : textBox));
  };

  const removeText = (id: string) => {
    recordHistory();
    setTexts((current) => current.filter((textBox) => textBox.id !== id));
    setSelectedTextIds((current) => current.filter((selected) => selected !== id));
    setStatus("已刪除文字方塊");
  };

  const removeSelectedObjects = () => {
    if (!selectionCount) return;
    recordHistory();
    const markerIds = new Set(selectedMarkerIds);
    const shapeIds = new Set(selectedShapeIds);
    const textIds = new Set(selectedTextIds);
    setMarkers((current) => current.filter((marker) => !markerIds.has(marker.id)));
    setShapes((current) => current.filter((shape) => !shapeIds.has(shape.id)));
    setTexts((current) => current.filter((textBox) => !textIds.has(textBox.id)));
    clearSelection();
    setStatus(`已刪除 ${selectionCount} 個選取物件`);
  };

  const exportBoard = () => {
    const board: SavedBoard = { version: 1, boardMode: boardMode || undefined, mapName, mapImage, markers, shapes, texts };
    saveFile(JSON.stringify(board, null, 2), "application/json", `隊伍紀錄-${new Date().toISOString().slice(0, 10)}.json`);
    setStatus("紀錄檔已匯出");
  };

  const importBoard = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const board = JSON.parse(String(reader.result)) as SavedBoard;
        if (board.version !== 1 || typeof board.mapImage !== "string" || !Array.isArray(board.markers)) throw new Error();
        setMapImage(board.mapImage);
        const importedMode = board.boardMode || (board.mapImage ? "image" : "blank");
        setBoardMode(importedMode);
        setMapName(board.mapName || "已匯入的地圖");
        setMarkers(board.markers);
        setShapes(Array.isArray(board.shapes) ? board.shapes : []);
        setTexts(Array.isArray(board.texts) ? board.texts : []);
        if (importedMode === "blank") setImageNatural({ width: 1600, height: 1000 });
        clearSelection();
        resetHistory();
        setStatus("紀錄檔匯入完成");
      } catch {
        setStatus("這不是有效的隊伍紀錄檔");
      }
    };
    reader.readAsText(file);
  };

  const downloadSnapshot = async () => {
    const image = imageRef.current;
    if (!isBoard || !imageNatural.width) return;
    const canvas = document.createElement("canvas");
    canvas.width = imageNatural.width;
    canvas.height = imageNatural.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    if (boardMode === "image" && image) {
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    } else {
      context.fillStyle = "#0b1310";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = "rgba(74,222,128,.12)";
      context.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 64) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, canvas.height); context.stroke(); }
      for (let y = 0; y < canvas.height; y += 64) { context.beginPath(); context.moveTo(0, y); context.lineTo(canvas.width, y); context.stroke(); }
    }
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = 0;
    let maxY = 0;
    let hasObjects = false;
    const includeBounds = (left: number, top: number, right: number, bottom: number) => {
      minX = Math.min(minX, left);
      minY = Math.min(minY, top);
      maxX = Math.max(maxX, right);
      maxY = Math.max(maxY, bottom);
      hasObjects = true;
    };
    for (const shape of shapes) {
      const x1 = shape.x1 * canvas.width;
      const y1 = shape.y1 * canvas.height;
      const x2 = shape.x2 * canvas.width;
      const y2 = shape.y2 * canvas.height;
      context.save();
      context.strokeStyle = shape.color;
      context.lineWidth = shape.strokeWidth * Math.max(1, canvas.width / 1200);
      const arrowHeadLength = shape.type === "arrow"
        ? Math.max(context.lineWidth * 3.5, 16 * Math.max(1, canvas.width / 1200))
        : 0;
      const shapeMargin = Math.max(context.lineWidth / 2, arrowHeadLength);
      includeBounds(Math.min(x1, x2) - shapeMargin, Math.min(y1, y2) - shapeMargin, Math.max(x1, x2) + shapeMargin, Math.max(y1, y2) + shapeMargin);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      if (shape.type === "line" || shape.type === "arrow") {
        context.moveTo(x1, y1); context.lineTo(x2, y2);
      } else if (shape.type === "rect") {
        context.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      } else {
        context.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
      }
      context.stroke();
      if (shape.type === "arrow") {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const wingAngle = Math.PI / 7;
        context.fillStyle = shape.color;
        context.beginPath();
        context.moveTo(x2, y2);
        context.lineTo(x2 - arrowHeadLength * Math.cos(angle - wingAngle), y2 - arrowHeadLength * Math.sin(angle - wingAngle));
        context.lineTo(x2 - arrowHeadLength * Math.cos(angle + wingAngle), y2 - arrowHeadLength * Math.sin(angle + wingAngle));
        context.closePath();
        context.fill();
      }
      context.restore();
    }
    const textScale = Math.max(1, canvas.width / 1200);
    for (const textBox of texts) {
      const fontSize = textBox.fontSize * textScale;
      const outlineWidth = textBox.outlineWidth * textScale;
      const lines = (textBox.text || "文字").split(/\r?\n/);
      const lineHeight = fontSize * 1.22;
      const x = textBox.x * canvas.width;
      const y = textBox.y * canvas.height;
      context.save();
      context.font = `${textBox.fontWeight} ${fontSize}px ${textBox.fontFamily}`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.lineJoin = "round";
      const maxTextWidth = Math.max(...lines.map((line) => context.measureText(line || " ").width));
      const textHeight = Math.max(lineHeight, lines.length * lineHeight);
      const textMargin = outlineWidth + 4 * textScale;
      includeBounds(
        x - maxTextWidth / 2 - textMargin,
        y - textHeight / 2 - textMargin,
        x + maxTextWidth / 2 + textMargin,
        y + textHeight / 2 + textMargin,
      );
      lines.forEach((line, index) => {
        const lineY = y + (index - (lines.length - 1) / 2) * lineHeight;
        if (outlineWidth > 0) {
          context.strokeStyle = textBox.outlineColor;
          context.lineWidth = outlineWidth * 2;
          context.strokeText(line || " ", x, lineY);
        }
        context.fillStyle = textBox.color;
        context.fillText(line || " ", x, lineY);
      });
      context.restore();
    }
    const radius = Math.max(12, Math.min(canvas.width, canvas.height) * 0.018);
    const baseFontSize = Math.max(18, Math.min(canvas.width, canvas.height) * 0.025);
    for (const marker of markers) {
      const x = marker.x * canvas.width;
      const y = marker.y * canvas.height;
      context.save();
      context.shadowColor = "rgba(0,0,0,.7)";
      context.shadowBlur = radius * 0.65;
      context.fillStyle = marker.color;
      context.strokeStyle = "#07110d";
      context.lineWidth = Math.max(3, radius * 0.18);
      context.beginPath();
      const iconCenterY = marker.type === "member" ? y : y - radius * 1.35;
      if (marker.type === "member") {
        context.arc(x, y, radius, 0, Math.PI * 2);
      } else {
        context.moveTo(x, y);
        context.lineTo(x - radius * 0.78, iconCenterY + radius * 0.38);
        context.arc(x, iconCenterY, radius * 0.85, Math.PI * 0.85, Math.PI * 0.15);
        context.closePath();
      }
      context.fill();
      context.stroke();
      context.shadowBlur = 0;
      const fontSize = baseFontSize * ((marker.fontSize ?? 10) / 10);
      context.font = `600 ${fontSize}px system-ui, sans-serif`;
      const label = marker.name || (marker.type === "member" ? "隊員" : "標點");
      const labelWidth = context.measureText(label).width + fontSize;
      const labelX = Math.min(canvas.width - labelWidth - 4, Math.max(4, x - labelWidth / 2));
      const markerLeft = x - radius;
      const markerTop = marker.type === "member" ? y - radius : y - radius * 2.2;
      const markerRight = x + radius;
      const markerBottom = marker.type === "member" ? y + radius : y;
      const labelHeight = fontSize * 1.35;
      const labelGap = Math.max(6, fontSize * 0.35);
      const labelTop = Math.max(4, markerTop - labelGap - labelHeight);
      const labelY = labelTop + fontSize;
      includeBounds(
        Math.min(markerLeft, labelX),
        Math.min(markerTop, labelTop),
        Math.max(markerRight, labelX + labelWidth),
        Math.max(markerBottom, labelTop + labelHeight),
      );
      context.fillStyle = "rgba(7,17,13,.88)";
      context.fillRect(labelX, labelTop, labelWidth, labelHeight);
      context.fillStyle = "#f1f5f9";
      context.fillText(label, labelX + fontSize * 0.5, labelY);
      context.restore();
    }
    let outputCanvas = canvas;
    if (hasObjects) {
      const contentWidth = Math.max(1, maxX - minX);
      const contentHeight = Math.max(1, maxY - minY);
      const padding = Math.max(24, Math.max(contentWidth, contentHeight) * 0.08);
      const sourceX = Math.max(0, Math.floor(minX - padding));
      const sourceY = Math.max(0, Math.floor(minY - padding));
      const sourceRight = Math.min(canvas.width, Math.ceil(maxX + padding));
      const sourceBottom = Math.min(canvas.height, Math.ceil(maxY + padding));
      const sourceWidth = Math.max(1, sourceRight - sourceX);
      const sourceHeight = Math.max(1, sourceBottom - sourceY);
      const cropped = document.createElement("canvas");
      cropped.width = sourceWidth;
      cropped.height = sourceHeight;
      cropped.getContext("2d")?.drawImage(canvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
      outputCanvas = cropped;
    }
    outputCanvas.toBlob((blob) => {
      if (blob) saveFile(blob, "image/png", `戰術地圖-${new Date().toISOString().slice(0, 10)}.png`);
    }, "image/png");
    setStatus(hasObjects ? "已依物件範圍裁切並下載截圖" : "地圖截圖已下載");
  };

  const clearBoard = () => {
    if (!confirm("確定要移除目前地圖與所有標記嗎？此動作無法復原。")) return;
    setMapImage("");
    setBoardMode("");
    setMapName("");
    setMarkers([]);
    setShapes([]);
    setTexts([]);
    clearSelection();
    resetHistory();
    setImageNatural({ width: 0, height: 0 });
    setStatus("地圖已清除");
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    loadImageFile(event.dataTransfer.files?.[0]);
  };

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "a") {
        if (isBoard && objectCount) {
          event.preventDefault();
          selectAllObjects();
        }
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectionCount) {
          event.preventDefault();
          recordHistory();
          const markerIds = new Set(selectedMarkerIds);
          const shapeIds = new Set(selectedShapeIds);
          const textIds = new Set(selectedTextIds);
          setMarkers((current) => current.filter((marker) => !markerIds.has(marker.id)));
          setShapes((current) => current.filter((shape) => !shapeIds.has(shape.id)));
          setTexts((current) => current.filter((textBox) => !textIds.has(textBox.id)));
          clearSelection();
          setStatus(`已使用鍵盤刪除 ${selectionCount} 個物件`);
        }
        return;
      }

      if (event.key === "Escape") {
        if (selectionCount || draftShape) {
          event.preventDefault();
          clearSelection();
          setDraftShape(null);
          setStatus("已取消選取");
        }
        return;
      }

      if (!isBoard) return;
      const shortcut = TOOL_SHORTCUTS[event.key.toLowerCase()];
      if (shortcut) {
        event.preventDefault();
        setTool(shortcut.tool);
        setStatus(`已切換至${shortcut.label}工具`);
        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoom((value) => Math.min(4, value + .15));
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        setZoom((value) => Math.max(.4, value - .15));
      } else if (event.key === "0") {
        event.preventDefault();
        fitMap();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [draftShape, fitMap, isBoard, objectCount, recordHistory, redo, selectAllObjects, selectedMarkerIds, selectedShapeIds, selectedTextIds, selectionCount, undo]);

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <input ref={imageInputRef} className="hidden" type="file" accept="image/png,image/jpeg" onChange={(event) => loadImageFile(event.target.files?.[0])} />
      <input ref={importInputRef} className="hidden" type="file" accept="application/json,.json" onChange={importBoard} />

      <header className="z-20 flex h-16 shrink-0 items-center justify-between border-b border-border bg-card/95 px-3 backdrop-blur-xl md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary"><Crosshair className="size-5" /></div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-[0.14em]">隊伍紀錄器</h1>
            <p className="hidden text-[10px] text-muted-foreground sm:block">TACTICAL MAP BOARD</p>
          </div>
          {mapName && <span className="ml-2 hidden max-w-52 truncate rounded-md border border-border bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground md:block">{mapName}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={undo} disabled={!historyState.canUndo} title="上一步（Ctrl+Z）" aria-keyshortcuts="Control+Z Meta+Z"><Undo2 /><span className="hidden md:inline">上一步</span></Button>
          <Button variant="ghost" size="sm" onClick={redo} disabled={!historyState.canRedo} title="下一步（Ctrl+Y）" aria-keyshortcuts="Control+Y Meta+Shift+Z"><Redo2 /><span className="hidden md:inline">下一步</span></Button>
          <Button variant="ghost" size="sm" onClick={() => importInputRef.current?.click()} title="匯入紀錄檔"><Upload /><span className="hidden sm:inline">匯入</span></Button>
          <Button variant="ghost" size="sm" onClick={exportBoard} disabled={!isBoard} title="匯出紀錄檔"><Download /><span className="hidden sm:inline">匯出</span></Button>
          <Button variant="outline" size="sm" onClick={downloadSnapshot} disabled={!isBoard} title="下載標記後的地圖"><Camera /><span className="hidden sm:inline">截圖</span></Button>
        </div>
      </header>

      <section className="grid flex-1 grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)_300px]">
        <aside className="order-2 border-t border-border bg-card p-3 lg:order-1 lg:border-r lg:border-t-0 lg:p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">放置工具</p>
            <span className="text-[10px] text-muted-foreground">點擊地圖放置</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">
            <button onClick={() => setTool("point")} className={`tool-button ${tool === "point" ? "tool-button-active" : ""}`} aria-keyshortcuts="P" title="一般標點（P）"><MapPin /><span className="tool-copy"><b>一般標點</b><small>位置與備註</small></span><Kbd>P</Kbd></button>
            <button onClick={() => setTool("member")} className={`tool-button ${tool === "member" ? "tool-button-active" : ""}`} aria-keyshortcuts="M" title="隊員位置（M）"><Users /><span className="tool-copy"><b>隊員位置</b><small>姓名與隊伍</small></span><Kbd>M</Kbd></button>
            <button onClick={() => setTool("text")} className={`tool-button ${tool === "text" ? "tool-button-active" : ""}`} aria-keyshortcuts="T" title="文字方塊（T）"><Type /><span className="tool-copy"><b>文字方塊</b><small>字型與外框</small></span><Kbd>T</Kbd></button>
          </div>

          <p className="mb-2 mt-5 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">繪圖工具</p>
          <div className="grid grid-cols-5 gap-2 lg:grid-cols-2">
            <button onClick={() => setTool("move")} className={`drawing-tool ${tool === "move" ? "active" : ""}`} title="移動畫布（V）" aria-keyshortcuts="V"><Move /><span>移動</span></button>
            <button onClick={() => setTool("line")} className={`drawing-tool ${tool === "line" ? "active" : ""}`} title="繪製直線（L）" aria-keyshortcuts="L"><Slash /><span>直線</span></button>
            <button onClick={() => setTool("arrow")} className={`drawing-tool ${tool === "arrow" ? "active" : ""}`} title="繪製箭頭（A）" aria-keyshortcuts="A"><ArrowRight /><span>箭頭</span></button>
            <button onClick={() => setTool("rect")} className={`drawing-tool ${tool === "rect" ? "active" : ""}`} title="繪製矩形（R）" aria-keyshortcuts="R"><Square /><span>矩形</span></button>
            <button onClick={() => setTool("ellipse")} className={`drawing-tool ${tool === "ellipse" ? "active" : ""}`} title="繪製圓形（O）" aria-keyshortcuts="O"><Circle /><span>圓形</span></button>
          </div>

          <div className="mt-5 hidden rounded-xl border border-border bg-muted/35 p-3 text-xs leading-5 text-muted-foreground lg:block">
            <Radio className="mb-2 size-4 text-primary" />
            標記工具點擊放置；圖形工具拖拉繪製；按住 Shift 或 Ctrl 點選可多選，拖曳任一已選物件可整組移動。滾輪可縮放。
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 border-t border-border pt-3 text-[10px]">
              <span className="flex items-center gap-1.5"><Kbd>Del</Kbd>刪除</span>
              <span className="flex items-center gap-1.5"><Kbd>Esc</Kbd>取消選取</span>
              <span className="flex items-center gap-1.5"><Kbd>Ctrl</Kbd><Kbd>Z</Kbd>上一步</span>
              <span className="flex items-center gap-1.5"><Kbd>+</Kbd><Kbd>-</Kbd>縮放</span>
              <span className="flex items-center gap-1.5"><Kbd>0</Kbd>重設視角</span>
            </div>
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">地圖管理</p>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              <Button variant="outline" className="justify-start" onClick={() => imageInputRef.current?.click()}><ImagePlus />{boardMode === "image" ? "更換地圖" : "上傳地圖"}</Button>
              <Button variant="outline" className="justify-start" onClick={createBlankBoard}><Square />空白版面</Button>
              <Button variant="ghost" className="justify-start text-muted-foreground" onClick={clearBoard} disabled={!isBoard}><Trash2 />清除全部</Button>
            </div>
          </div>
        </aside>

        <div className="relative order-1 min-h-[58vh] overflow-hidden bg-[#080e0c] lg:order-2 lg:min-h-[calc(100vh-4rem)]">
          <div className="map-grid pointer-events-none absolute inset-0 opacity-25" />
          <div
            ref={viewportRef}
            className={`absolute inset-3 overflow-hidden rounded-2xl border border-border bg-[#0b1310] shadow-[0_24px_70px_rgba(0,0,0,.32)] md:inset-5 ${dragging ? "cursor-grabbing" : isBoard ? (tool === "move" ? "cursor-grab" : "cursor-crosshair") : ""}`}
            style={{ touchAction: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDragging(false)}
            onWheel={onWheel}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
          >
            {!isBoard ? (
              <div className="flex h-full min-h-[520px] items-center justify-center border border-dashed border-primary/25">
                <div className="max-w-sm px-6 text-center">
                  <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl border border-primary/25 bg-primary/10 text-primary shadow-[0_0_44px_rgba(74,222,128,.12)]"><ImagePlus className="size-7" /></div>
                  <h2 className="text-lg font-semibold">開始建立戰術地圖</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">上傳 JPG、PNG，或建立空白網格版面從頭繪製。所有紀錄只會留在你的瀏覽器。</p>
                  <div className="mt-5 flex justify-center gap-2"><Button className="h-10 px-4" onClick={() => imageInputRef.current?.click()}><ImagePlus />上傳地圖</Button><Button variant="outline" className="h-10 px-4" onClick={createBlankBoard}><Square />空白版面</Button></div>
                </div>
              </div>
            ) : (
              <div
                ref={mapRef}
                className="absolute left-1/2 top-1/2 select-none"
                style={{
                  width: baseSize.width || undefined,
                  height: baseSize.height || undefined,
                  transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: "center",
                }}
              >
                {boardMode === "image" ? <img
                  ref={imageRef}
                  src={mapImage}
                  alt="已上傳的地圖"
                  draggable={false}
                  className="block size-full object-fill"
                  onLoad={(event) => setImageNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                /> : <div className="blank-board map-grid absolute inset-0" />}
                <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="地圖圖形">
                  {[...shapes, ...(draftShape ? [draftShape] : [])].map((shape) => {
                    const selected = selectedShapeIds.includes(shape.id);
                    const common = {
                      stroke: shape.color,
                      strokeWidth: selected ? shape.strokeWidth + 1.5 : shape.strokeWidth,
                      fill: "transparent",
                      vectorEffect: "non-scaling-stroke" as const,
                      className: selected ? "shape selected" : "shape",
                      style: { pointerEvents: draftShape?.id === shape.id ? "none" : "stroke" } as React.CSSProperties,
                      onPointerDown: (event: React.PointerEvent<SVGElement>) => onShapePointerDown(event, shape),
                    };
                    if (shape.type === "line") return <line key={shape.id} x1={shape.x1 * 100} y1={shape.y1 * 100} x2={shape.x2 * 100} y2={shape.y2 * 100} {...common} />;
                    if (shape.type === "arrow") return <g key={shape.id}>
                      <defs>
                        <marker id={`arrow-${shape.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse" markerUnits="strokeWidth">
                          <path d="M 0 0 L 10 5 L 0 10 z" fill={shape.color} />
                        </marker>
                      </defs>
                      <line x1={shape.x1 * 100} y1={shape.y1 * 100} x2={shape.x2 * 100} y2={shape.y2 * 100} markerEnd={`url(#arrow-${shape.id})`} {...common} />
                    </g>;
                    if (shape.type === "rect") return <rect key={shape.id} x={Math.min(shape.x1, shape.x2) * 100} y={Math.min(shape.y1, shape.y2) * 100} width={Math.abs(shape.x2 - shape.x1) * 100} height={Math.abs(shape.y2 - shape.y1) * 100} {...common} />;
                    return <ellipse key={shape.id} cx={(shape.x1 + shape.x2) * 50} cy={(shape.y1 + shape.y2) * 50} rx={Math.abs(shape.x2 - shape.x1) * 50} ry={Math.abs(shape.y2 - shape.y1) * 50} {...common} />;
                  })}
                </svg>
                {markers.map((marker) => (
                  <button
                    key={marker.id}
                    className={`map-marker ${marker.type} ${selectedMarkerIds.includes(marker.id) ? "selected" : ""}`}
                    style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%`, "--marker-color": marker.color } as React.CSSProperties}
                    onPointerDown={(event) => onMarkerPointerDown(event, marker)}
                    aria-label={`編輯${marker.name}`}
                  >
                    <span className="marker-dot">{marker.type === "member" ? <UserRound /> : <CircleDot />}</span>
                    <span className="marker-label" style={{ fontSize: `${marker.fontSize ?? 10}px` }}>{marker.name}</span>
                  </button>
                ))}
                {texts.map((textBox) => (
                  <button
                    key={textBox.id}
                    className={`map-text ${selectedTextIds.includes(textBox.id) ? "selected" : ""}`}
                    style={{
                      left: `${textBox.x * 100}%`,
                      top: `${textBox.y * 100}%`,
                      color: textBox.color,
                      fontFamily: textBox.fontFamily,
                      fontSize: `${textBox.fontSize}px`,
                      fontWeight: textBox.fontWeight,
                      WebkitTextStroke: `${textBox.outlineWidth}px ${textBox.outlineColor}`,
                      paintOrder: "stroke fill",
                    }}
                    onPointerDown={(event) => onTextPointerDown(event, textBox)}
                    aria-label={`編輯文字 ${textBox.text || "文字"}`}
                  >{textBox.text || "文字"}</button>
                ))}
              </div>
            )}

            {isBoard && (
              <div className="absolute bottom-3 left-3 rounded-lg border border-border bg-card/90 px-3 py-2 font-mono text-[10px] text-muted-foreground backdrop-blur">{objectCount} ITEMS&nbsp;&nbsp;·&nbsp;&nbsp;{Math.round(zoom * 100)}%</div>
            )}
            {isBoard && (
              <div className="absolute bottom-3 right-3 flex gap-1 rounded-xl border border-border bg-card/90 p-1 shadow-lg backdrop-blur">
                <Button variant="ghost" size="icon-sm" aria-label="縮小" aria-keyshortcuts="-" title="縮小（-）" onClick={() => setZoom((value) => Math.max(.4, value - .15))}><Minus /></Button>
                <Button variant="ghost" size="icon-sm" aria-label="重設視角" aria-keyshortcuts="0" title="重設視角（0）" onClick={fitMap}><RotateCcw /></Button>
                <Button variant="ghost" size="icon-sm" aria-label="放大" aria-keyshortcuts="+" title="放大（+）" onClick={() => setZoom((value) => Math.min(4, value + .15))}><Plus /></Button>
              </div>
            )}
          </div>
        </div>

        <aside className="order-3 border-t border-border bg-card lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">地圖物件</p>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={selectAllObjects} disabled={!objectCount || selectionCount === objectCount} aria-keyshortcuts="Control+A Meta+A" title="全選所有物件（Ctrl+A）">全選</Button>
              <span className="rounded-full bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">{selectionCount ? `${selectionCount} SELECTED` : `${objectCount} ITEMS`}</span>
            </div>
          </div>

          {selectionCount > 1 ? (
            <div className="p-4">
              <div className="rounded-xl border border-primary/30 bg-primary/10 p-4">
                <Move className="mb-3 size-5 text-primary" />
                <p className="text-sm font-semibold">已選取 {selectionCount} 個物件</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">拖曳任一已選物件，即可保持相對位置並整組移動。按住 Shift 或 Ctrl 點擊可繼續加入或移除物件。</p>
              </div>
              <Button variant="destructive" className="mt-4 w-full" onClick={removeSelectedObjects} aria-keyshortcuts="Delete Backspace"><Trash2 />刪除選取物件 <Kbd>Del</Kbd></Button>
            </div>
          ) : selectedText ? (
            <div className="p-4">
              <div className="mb-5 flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary"><Type className="size-5" /></span>
                <div><p className="text-sm font-semibold">編輯文字方塊</p><p className="font-mono text-[10px] text-muted-foreground">X {Math.round(selectedText.x * 100)} · Y {Math.round(selectedText.y * 100)}</p></div>
              </div>
              <label className="field-label">文字內容</label>
              <Textarea value={selectedText.text} maxLength={200} onChange={(event) => updateSelectedText({ text: event.target.value })} placeholder="輸入文字" />
              <label className="field-label mt-4">字型</label>
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={selectedText.fontFamily} onChange={(event) => updateSelectedText({ fontFamily: event.target.value })}>
                {FONT_OPTIONS.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}
              </select>
              <label className="field-label mt-4">文字顏色</label>
              <div className="flex flex-wrap gap-2">
                {TEXT_COLORS.map((color) => <button key={color} className={`color-swatch ${selectedText.color === color ? "active" : ""}`} style={{ background: color }} onClick={() => updateSelectedText({ color })} aria-label={`選擇文字顏色 ${color}`} />)}
              </div>
              <label className="field-label mt-5">文字大小 <span className="float-right font-mono text-primary">{selectedText.fontSize}px</span></label>
              <input className="range-control" type="range" min="12" max="72" step="1" value={selectedText.fontSize} onChange={(event) => updateSelectedText({ fontSize: Number(event.target.value) })} />
              <label className="field-label mt-4">字體粗細 <span className="float-right font-mono text-primary">{selectedText.fontWeight}</span></label>
              <input className="range-control" type="range" min="300" max="900" step="100" value={selectedText.fontWeight} onChange={(event) => updateSelectedText({ fontWeight: Number(event.target.value) })} />
              <label className="field-label mt-4">外框粗細 <span className="float-right font-mono text-primary">{selectedText.outlineWidth}px</span></label>
              <input className="range-control" type="range" min="0" max="6" step="1" value={selectedText.outlineWidth} onChange={(event) => updateSelectedText({ outlineWidth: Number(event.target.value) })} />
              <label className="field-label mt-4">外框顏色</label>
              <div className="flex flex-wrap gap-2">
                {TEXT_COLORS.map((color) => <button key={color} className={`color-swatch ${selectedText.outlineColor === color ? "active" : ""}`} style={{ background: color }} onClick={() => updateSelectedText({ outlineColor: color })} aria-label={`選擇外框顏色 ${color}`} />)}
              </div>
              <Button variant="destructive" className="mt-6 w-full" onClick={() => removeText(selectedText.id)} aria-keyshortcuts="Delete Backspace"><Trash2 />刪除此文字 <Kbd>Del</Kbd></Button>
            </div>
          ) : selectedShape ? (
            <div className="p-4">
              <div className="mb-5 flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl border" style={{ color: selectedShape.color, borderColor: `${selectedShape.color}66`, background: `${selectedShape.color}18` }}><ShapeTypeIcon type={selectedShape.type} className="size-5" /></span>
                <div><p className="text-sm font-semibold">編輯{SHAPE_LABELS[selectedShape.type]}</p><p className="text-[10px] text-muted-foreground">可在地圖上直接拖曳移動</p></div>
              </div>
              <label className="field-label">顏色</label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((color) => <button key={color} className={`color-swatch ${selectedShape.color === color ? "active" : ""}`} style={{ background: color }} onClick={() => updateSelectedShape({ color })} aria-label={`選擇顏色 ${color}`} />)}
              </div>
              <label className="field-label mt-5">線條粗細 <span className="float-right font-mono text-primary">{selectedShape.strokeWidth}px</span></label>
              <input className="range-control" type="range" min="2" max="12" step="1" value={selectedShape.strokeWidth} onChange={(event) => updateSelectedShape({ strokeWidth: Number(event.target.value) })} />
              <Button variant="destructive" className="mt-6 w-full" onClick={() => removeShape(selectedShape.id)} aria-keyshortcuts="Delete Backspace"><Trash2 />刪除此圖形 <Kbd>Del</Kbd></Button>
            </div>
          ) : selectedMarker ? (
            <div className="p-4">
              <div className="mb-5 flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl border" style={{ color: selectedMarker.color, borderColor: `${selectedMarker.color}66`, background: `${selectedMarker.color}18` }}>{selectedMarker.type === "member" ? <UserRound className="size-5" /> : <MapPin className="size-5" />}</span>
                <div><p className="text-sm font-semibold">編輯{selectedMarker.type === "member" ? "隊員" : "標點"}</p><p className="font-mono text-[10px] text-muted-foreground">X {Math.round(selectedMarker.x * 100)} · Y {Math.round(selectedMarker.y * 100)}</p></div>
              </div>
              <label className="field-label">{selectedMarker.type === "member" ? "隊員姓名" : "標點名稱"}</label>
              <Input value={selectedMarker.name} maxLength={40} onChange={(event) => updateSelected({ name: event.target.value })} placeholder="輸入名稱" />
              {selectedMarker.type === "member" && <><label className="field-label mt-4">隊伍</label><Input value={selectedMarker.team} maxLength={24} onChange={(event) => updateSelected({ team: event.target.value })} placeholder="例如：A 隊" /></>}
              <label className="field-label mt-4">顏色</label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((color) => <button key={color} className={`color-swatch ${selectedMarker.color === color ? "active" : ""}`} style={{ background: color }} onClick={() => updateSelected({ color })} aria-label={`選擇顏色 ${color}`} />)}
              </div>
              <label className="field-label mt-5">文字大小 <span className="float-right font-mono text-primary">{selectedMarker.fontSize ?? 10}px</span></label>
              <input className="range-control" type="range" min="8" max="24" step="1" value={selectedMarker.fontSize ?? 10} onChange={(event) => updateSelected({ fontSize: Number(event.target.value) })} />
              <label className="field-label mt-4">備註</label>
              <Textarea value={selectedMarker.notes} maxLength={240} onChange={(event) => updateSelected({ notes: event.target.value })} placeholder="補給、任務或其他資訊…" />
              <Button variant="destructive" className="mt-5 w-full" onClick={() => removeMarker(selectedMarker.id)} aria-keyshortcuts="Delete Backspace"><Trash2 />刪除此標記 <Kbd>Del</Kbd></Button>
            </div>
          ) : markers.length || shapes.length || texts.length ? (
            <div className="max-h-[440px] overflow-y-auto p-2 lg:max-h-[calc(100vh-8.5rem)]">
              {texts.map((textBox) => (
                <button key={textBox.id} onClick={(event) => selectText(textBox.id, event.shiftKey || event.ctrlKey || event.metaKey)} className={`marker-list-item ${selectedTextIds.includes(textBox.id) ? "bg-muted" : ""}`}>
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted" style={{ color: textBox.color }}><Type className="size-4" /></span>
                  <span className="min-w-0 flex-1 text-left"><b>{textBox.text || "未命名文字"}</b><small>{FONT_OPTIONS.find((font) => font.value === textBox.fontFamily)?.label ?? "文字"} · {textBox.fontSize}px</small></span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              ))}
              {shapes.map((shape) => (
                <button key={shape.id} onClick={(event) => selectShape(shape.id, event.shiftKey || event.ctrlKey || event.metaKey)} className={`marker-list-item ${selectedShapeIds.includes(shape.id) ? "bg-muted" : ""}`}>
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted" style={{ color: shape.color }}><ShapeTypeIcon type={shape.type} className="size-4" /></span>
                  <span className="min-w-0 flex-1 text-left"><b>{SHAPE_LABELS[shape.type]}</b><small>{shape.strokeWidth}px 線條</small></span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              ))}
              {markers.map((marker) => (
                <button key={marker.id} onClick={(event) => selectMarker(marker.id, event.shiftKey || event.ctrlKey || event.metaKey)} className={`marker-list-item ${selectedMarkerIds.includes(marker.id) ? "bg-muted" : ""}`}>
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: marker.color, boxShadow: `0 0 12px ${marker.color}77` }} />
                  <span className="min-w-0 flex-1 text-left"><b>{marker.name || "未命名"}</b><small>{marker.type === "member" ? marker.team || "未分隊" : marker.notes || "一般標點"}</small></span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          ) : (
            <div className="px-6 py-14 text-center text-sm text-muted-foreground"><Crosshair className="mx-auto mb-3 size-7 opacity-35" /><p>尚未放置任何物件</p><p className="mt-1 text-xs opacity-70">上傳地圖或建立空白版面後即可開始</p></div>
          )}
        </aside>
      </section>

      <output className="pointer-events-none fixed bottom-3 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border bg-card/92 px-4 py-2 text-[11px] text-muted-foreground shadow-xl backdrop-blur" aria-live="polite"><FileJson className="mr-2 inline size-3.5 text-primary" />{status}</output>
    </main>
  );
}
