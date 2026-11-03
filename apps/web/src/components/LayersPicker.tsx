import { BASE_LAYERS, type BaseLayerId } from "../lib/baseLayers";

export default function LayersPicker({
  baseLayerId,
  onSelect,
}: {
  baseLayerId: BaseLayerId;
  onSelect: (id: BaseLayerId) => void;
}) {
  return (
    <div className="absolute left-full ml-2 top-0 w-48 bg-white border border-slate-200 rounded-lg shadow-md p-1 z-30">
      {BASE_LAYERS.map((layer) => (
        <button
          key={layer.id}
          type="button"
          className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-sm text-left hover:bg-slate-100 ${
            layer.id === baseLayerId ? "text-teal-700 font-medium" : "text-slate-700"
          }`}
          onClick={() => onSelect(layer.id)}
        >
          <span>{layer.name}</span>
          {layer.id === baseLayerId && (
            <span className="material-symbols-outlined text-[16px]">check</span>
          )}
        </button>
      ))}
    </div>
  );
}
